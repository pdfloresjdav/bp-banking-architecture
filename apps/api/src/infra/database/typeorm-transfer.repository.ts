import { EventEnvelope } from '@bp/contracts';
import {
  CreateTransferOutcome,
  ReconciliationCandidate,
  TransferAggregate,
  TransferProps,
  TransferRepositoryPort,
} from '@bp/domain';
import { DataSource } from 'typeorm';

interface TransferRow {
  transfer_id: string;
  source_account_id: string;
  destination_account_id: string;
  amount_minor: string;
  currency: string;
  kind: string;
  state: string;
  core_reference: string | null;
  created_at: Date;
  updated_at: Date;
}

function rowToProps(r: TransferRow): TransferProps {
  return {
    transferId: r.transfer_id,
    sourceAccountId: r.source_account_id,
    destinationAccountId: r.destination_account_id,
    amount: { amountMinor: Number(r.amount_minor), currency: r.currency },
    kind: r.kind as TransferProps['kind'],
    state: r.state as TransferProps['state'],
    coreReference: r.core_reference,
    createdAt: new Date(r.created_at),
    updatedAt: new Date(r.updated_at),
  };
}

const UNIQUE_VIOLATION = '23505';

export class TypeOrmTransferRepository implements TransferRepositoryPort {
  constructor(private readonly ds: DataSource) {}

  async createWithIdempotency(input: {
    aggregate: TransferAggregate;
    idempotencyKey: string;
    fingerprint: string;
    event: EventEnvelope;
  }): Promise<CreateTransferOutcome> {
    const s = input.aggregate.snapshot();
    try {
      await this.ds.transaction(async (m) => {
        await m.query(
          `INSERT INTO transfers (transfer_id, source_account_id, destination_account_id, amount_minor, currency, kind, state, core_reference, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
          [
            s.transferId,
            s.sourceAccountId,
            s.destinationAccountId,
            s.amount.amountMinor,
            s.amount.currency,
            s.kind,
            s.state,
            s.coreReference,
            s.createdAt,
            s.updatedAt,
          ],
        );
        await m.query(
          `INSERT INTO idempotency_keys (idempotency_key, fingerprint, transfer_id) VALUES ($1,$2,$3)`,
          [input.idempotencyKey, input.fingerprint, s.transferId],
        );
        await this.insertOutbox(m, input.event);
      });
      return { kind: 'CREATED', aggregate: input.aggregate };
    } catch (err) {
      if ((err as { code?: string }).code === UNIQUE_VIOLATION) {
        const key = await this.findByIdempotencyKey(input.idempotencyKey);
        if (key) {
          const existing = await this.findById(key.transferId);
          if (existing) return { kind: 'REPLAYED', existing };
        }
      }
      throw err;
    }
  }

  async update(aggregate: TransferAggregate, event?: EventEnvelope): Promise<void> {
    const s = aggregate.snapshot();
    await this.ds.transaction(async (m) => {
      await m.query(
        `UPDATE transfers SET state=$2, core_reference=$3, updated_at=$4 WHERE transfer_id=$1`,
        [s.transferId, s.state, s.coreReference, s.updatedAt],
      );
      if (event) await this.insertOutbox(m, event);
    });
  }

  async findById(transferId: string): Promise<TransferProps | null> {
    const rows: TransferRow[] = await this.ds.query(`SELECT * FROM transfers WHERE transfer_id=$1`, [transferId]);
    return rows[0] ? rowToProps(rows[0]) : null;
  }

  async findByIdempotencyKey(key: string): Promise<{ transferId: string; fingerprint: string } | null> {
    const rows: Array<{ transfer_id: string; fingerprint: string }> = await this.ds.query(
      `SELECT transfer_id, fingerprint FROM idempotency_keys WHERE idempotency_key=$1`,
      [key],
    );
    return rows[0] ? { transferId: rows[0].transfer_id, fingerprint: rows[0].fingerprint } : null;
  }

  async findForReconciliation(limit: number): Promise<ReconciliationCandidate[]> {
    const rows: Array<TransferRow & { idempotency_key: string }> = await this.ds.query(
      `SELECT t.*, k.idempotency_key FROM transfers t
       JOIN idempotency_keys k ON k.transfer_id = t.transfer_id
       WHERE t.state = 'UNKNOWN' ORDER BY t.updated_at ASC LIMIT $1`,
      [limit],
    );
    return rows.map((r) => ({ props: rowToProps(r), idempotencyKey: r.idempotency_key }));
  }

  private async insertOutbox(m: { query: (q: string, p?: unknown[]) => Promise<unknown> }, event: EventEnvelope): Promise<void> {
    await m.query(
      `INSERT INTO outbox_events (event_id, name, payload, correlation_id, idempotency_key, status)
       VALUES ($1,$2,$3,$4,$5,'PENDING')`,
      [event.eventId, event.name, JSON.stringify(event.payload), event.correlationId, event.idempotencyKey],
    );
  }
}
