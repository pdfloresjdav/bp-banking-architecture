import { CoreTransferOutcome, EventEnvelope, EventName, EventNameType, TransferState } from '@bp/contracts';
import { AuditPort, CorePort, TransferAggregate, TransferRepositoryPort } from '@bp/domain';
import { newId, StructuredLogger } from '@bp/shared';
import { DataSource } from 'typeorm';

/** Global advisory-lock key ensuring only one reconciliation run executes at a time. */
const RECONCILE_LOCK_KEY = 42;

export interface ReconciliationResult {
  skipped: boolean;
  reason?: string;
  candidates: number;
  attempts: number;
  resolved: number;
  coreUnavailable: number;
}

/**
 * Operational reconciliation of UNKNOWN transfers.
 * - Acquires a Postgres advisory lock so concurrent runs cannot reconcile the same operations.
 * - Queries the Core operation status by reference (never re-executes the transfer).
 * - Keeps state-transition integrity, records every attempt, emits events, and writes audit records.
 * - Handles Core unavailability safely (the order stays UNKNOWN).
 */
export class ReconciliationService {
  private readonly logger = new StructuredLogger('ReconciliationService');

  constructor(
    private readonly ds: DataSource,
    private readonly repo: TransferRepositoryPort,
    private readonly core: CorePort,
    private readonly audit: AuditPort,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async run(limit = 50): Promise<ReconciliationResult> {
    const correlationId = newId('reconcile');
    const runner = this.ds.createQueryRunner();
    await runner.connect();
    const [{ locked }] = await runner.query('SELECT pg_try_advisory_lock($1) AS locked', [RECONCILE_LOCK_KEY]);
    if (!locked) {
      await runner.release();
      this.logger.warn('Reconciliation already running; skipping', { correlationId });
      return { skipped: true, reason: 'already_running', candidates: 0, attempts: 0, resolved: 0, coreUnavailable: 0 };
    }

    let attempts = 0;
    let resolved = 0;
    let coreUnavailable = 0;
    let candidatesCount = 0;
    try {
      const candidates = await this.repo.findForReconciliation(limit);
      candidatesCount = candidates.length;
      for (const c of candidates) {
        if (c.props.state !== TransferState.UNKNOWN) continue;
        attempts++;

        let status: CoreTransferOutcome;
        try {
          status = await this.core.getOperationStatus(c.idempotencyKey);
        } catch {
          await this.recordAttempt(c.props.transferId, c.idempotencyKey, 'CORE_UNAVAILABLE', correlationId);
          coreUnavailable++;
          continue; // stays UNKNOWN; retried in a later run
        }

        if (status.status === 'UNKNOWN') {
          await this.recordAttempt(c.props.transferId, c.idempotencyKey, 'STILL_UNKNOWN', correlationId);
          continue;
        }

        const aggregate = TransferAggregate.rehydrate(c.props);
        aggregate.applyCoreOutcome(status, this.now());
        const event = this.buildEvent(this.stateEventName(aggregate.state), correlationId, c.idempotencyKey, aggregate);
        await this.repo.update(aggregate, event);
        await this.recordAttempt(c.props.transferId, c.idempotencyKey, `RESOLVED_${aggregate.state}`, correlationId);
        await this.audit.append({
          action: 'TRANSFER_RECONCILED',
          result: aggregate.state === TransferState.REJECTED ? 'REJECTED' : 'SUCCESS',
          userId: null,
          correlationId,
          metadata: { transferId: c.props.transferId, state: aggregate.state },
        });
        resolved++;
      }
    } finally {
      await runner.query('SELECT pg_advisory_unlock($1)', [RECONCILE_LOCK_KEY]);
      await runner.release();
    }

    this.logger.info('Reconciliation run complete', { correlationId, candidates: candidatesCount, attempts, resolved, coreUnavailable });
    return { skipped: false, candidates: candidatesCount, attempts, resolved, coreUnavailable };
  }

  private async recordAttempt(transferId: string, idempotencyKey: string, outcome: string, correlationId: string): Promise<void> {
    await this.ds.query(
      `INSERT INTO reconciliation_attempts (transfer_id, idempotency_key, outcome, correlation_id) VALUES ($1,$2,$3,$4)`,
      [transferId, idempotencyKey, outcome, correlationId],
    );
  }

  private stateEventName(state: TransferState): EventNameType {
    if (state === TransferState.CONFIRMED) return EventName.TransferConfirmed;
    if (state === TransferState.REJECTED) return EventName.TransferFailed;
    return EventName.TransferUnknown;
  }

  private buildEvent(name: EventNameType, correlationId: string, idempotencyKey: string, agg: TransferAggregate): EventEnvelope {
    const s = agg.snapshot();
    return {
      eventId: newId('evt'),
      name,
      occurredAt: this.now().toISOString(),
      correlationId,
      idempotencyKey,
      producer: 'bp-transfer-service',
      schemaVersion: 1,
      payload: {
        transferId: s.transferId,
        sourceAccountId: s.sourceAccountId,
        destinationAccountId: s.destinationAccountId,
        amountMinor: s.amount.amountMinor,
        currency: s.amount.currency,
        state: s.state,
        coreReference: s.coreReference,
      },
    };
  }
}
