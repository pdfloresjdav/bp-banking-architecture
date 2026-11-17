import {
  CoreTransferOutcome,
  CreateTransferRequest,
  EventEnvelope,
  EventName,
  EventNameType,
  TransferResponse,
  TransferState,
} from '@bp/contracts';
import {
  AccountAuthorizationError,
  assertIdempotencyConsistent,
  AuditPort,
  CorePort,
  fingerprintTransfer,
  TransferAggregate,
  TransferProps,
  TransferRepositoryPort,
} from '@bp/domain';
import { newId, StructuredLogger } from '@bp/shared';

/** Source-account authorization port. */
export interface AccountAuthorizationPort {
  /** true if the user can DEBIT the source account (ownership/permission). */
  canDebit(userId: string, accountId: string): Promise<boolean>;
}

export interface CreateTransferParams {
  userId: string;
  correlationId: string;
  idempotencyKey: string;
  request: CreateTransferRequest;
}

/**
 * Transfer use case (framework-agnostic, testable with fakes).
 * Implements idempotency, explicit states, Outbox (via the transactional repository),
 * UNKNOWN result without re-execution, and source-account authorization.
 */
export class TransferService {
  constructor(
    private readonly repo: TransferRepositoryPort,
    private readonly core: CorePort,
    private readonly accounts: AccountAuthorizationPort,
    private readonly audit: AuditPort,
    private readonly logger: StructuredLogger = new StructuredLogger('TransferService'),
    private readonly now: () => Date = () => new Date(),
  ) {}

  async create(params: CreateTransferParams): Promise<TransferResponse> {
    const { userId, correlationId, idempotencyKey, request } = params;
    const fingerprint = fingerprintTransfer(request);

    // 1) Idempotency: if the key exists, validate the fingerprint and return the previous result (no re-execution).
    const existingKey = await this.repo.findByIdempotencyKey(idempotencyKey);
    if (existingKey) {
      assertIdempotencyConsistent(existingKey.fingerprint, fingerprint); // throws 409 if payload differs
      const existing = await this.repo.findById(existingKey.transferId);
      if (existing) {
        this.logger.info('Idempotent replay', { correlationId, transferId: existing.transferId });
        return toResponse(existing);
      }
    }

    // 2) Source-account authorization (interbank: destination ownership is NOT validated).
    const canDebit = await this.accounts.canDebit(userId, request.sourceAccountId);
    if (!canDebit) {
      await this.audit.append({
        action: 'TRANSFER_CREATE',
        result: 'REJECTED',
        userId,
        correlationId,
        metadata: { reason: 'account_forbidden', sourceAccountId: request.sourceAccountId },
      });
      throw new AccountAuthorizationError(request.sourceAccountId);
    }

    // 3) Create a PENDING aggregate and persist it atomically (order + idempotency UNIQUE + Outbox).
    const aggregate = TransferAggregate.create({ transferId: newId('tr'), request, now: this.now() });
    const requestedEvent = this.buildEvent(EventName.TransferRequested, correlationId, idempotencyKey, aggregate);

    const outcome = await this.repo.createWithIdempotency({
      aggregate,
      idempotencyKey,
      fingerprint,
      event: requestedEvent,
    });
    if (outcome.kind === 'REPLAYED') {
      // Race: another request with the same key won the UNIQUE insert.
      return toResponse(outcome.existing);
    }
    const order = outcome.aggregate;
    await this.audit.append({
      action: 'TRANSFER_CREATE',
      result: 'SUCCESS',
      userId,
      correlationId,
      metadata: { transferId: order.id, kind: request.kind },
    });

    // 4) Execute the command against the Core (via the ACL). Timeout/failure → UNKNOWN (no unsafe retry).
    order.markSubmitted(this.now());
    let coreOutcome: CoreTransferOutcome;
    try {
      coreOutcome = await this.core.postTransfer({
        idempotencyKey,
        transferId: order.id,
        sourceAccountId: request.sourceAccountId,
        destinationAccountId: request.destinationAccountId,
        amountMinor: request.amount.amountMinor,
        currency: request.amount.currency,
      });
    } catch (err) {
      this.logger.warn('Core did not respond → UNKNOWN', { correlationId, transferId: order.id });
      coreOutcome = { status: 'UNKNOWN' };
    }
    order.applyCoreOutcome(coreOutcome, this.now());

    // 5) Persist the final state + informational event (Outbox).
    const stateEventName = this.stateEventName(order.state);
    const stateEvent = this.buildEvent(stateEventName, correlationId, idempotencyKey, order);
    await this.repo.update(order, stateEvent);

    await this.audit.append({
      action: 'TRANSFER_RESULT',
      result: order.state === TransferState.REJECTED ? 'REJECTED' : 'SUCCESS',
      userId,
      correlationId,
      metadata: { transferId: order.id, state: order.state },
    });

    return toResponse(order.snapshot());
  }

  async getById(transferId: string): Promise<TransferResponse | null> {
    const found = await this.repo.findById(transferId);
    return found ? toResponse(found) : null;
  }

  /**
   * Reconciliation: resolves UNKNOWN orders by querying the real status from the Core.
   * Does NOT re-execute the command; it only queries and updates (ADR-0017/0022).
   * @returns the number of resolved orders.
   */
  async reconcile(limit = 50): Promise<number> {
    const candidates = await this.repo.findForReconciliation(limit);
    let resolved = 0;
    for (const c of candidates) {
      if (c.props.state !== TransferState.UNKNOWN) continue;
      let status: CoreTransferOutcome;
      try {
        status = await this.core.getOperationStatus(c.idempotencyKey);
      } catch {
        continue; // stays UNKNOWN; retried in the next cycle
      }
      if (status.status === 'UNKNOWN') continue;
      const agg = TransferAggregate.rehydrate(c.props);
      agg.applyCoreOutcome(status, this.now());
      const evName = this.stateEventName(agg.state);
      const ev = this.buildEvent(evName, newId('corr'), c.idempotencyKey, agg);
      await this.repo.update(agg, ev);
      resolved++;
    }
    return resolved;
  }

  private stateEventName(state: TransferState): EventNameType {
    if (state === TransferState.CONFIRMED) return EventName.TransferConfirmed;
    if (state === TransferState.REJECTED) return EventName.TransferFailed;
    return EventName.TransferUnknown;
  }

  private buildEvent(
    name: EventNameType,
    correlationId: string,
    idempotencyKey: string,
    agg: TransferAggregate,
  ): EventEnvelope {
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

export function toResponse(p: TransferProps): TransferResponse {
  return {
    transferId: p.transferId,
    state: p.state,
    sourceAccountId: p.sourceAccountId,
    destinationAccountId: p.destinationAccountId,
    amount: p.amount,
    kind: p.kind,
    coreReference: p.coreReference,
    createdAt: p.createdAt.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}
