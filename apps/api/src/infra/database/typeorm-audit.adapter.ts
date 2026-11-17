import { AuditPort, computeAuditHash } from '@bp/domain';
import { DataSource } from 'typeorm';

/** Append-only audit with hash chaining (seq-05). */
export class TypeOrmAuditAdapter implements AuditPort {
  constructor(private readonly ds: DataSource) {}

  async append(input: {
    action: string;
    result: 'SUCCESS' | 'FAILURE' | 'REJECTED' | 'SECURITY';
    userId: string | null;
    correlationId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void> {
    const occurredAt = new Date().toISOString();
    // Chaining: take the last hash and compute the new one (in a per-row serialized TX).
    await this.ds.transaction(async (m) => {
      const prev: Array<{ hash: string }> = await m.query(
        `SELECT hash FROM audit_log ORDER BY seq DESC LIMIT 1`,
      );
      const prevHash = prev[0]?.hash ?? null;
      const hash = computeAuditHash(prevHash, {
        action: input.action,
        result: input.result,
        userId: input.userId,
        correlationId: input.correlationId,
        occurredAt,
        metadata: input.metadata,
      });
      await m.query(
        `INSERT INTO audit_log (action, result, user_id, correlation_id, occurred_at, metadata, prev_hash, hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [input.action, input.result, input.userId, input.correlationId, occurredAt, JSON.stringify(input.metadata ?? {}), prevHash, hash],
      );
    });
  }

  async query(limit = 100): Promise<unknown[]> {
    return this.ds.query(`SELECT * FROM audit_log ORDER BY seq DESC LIMIT $1`, [limit]);
  }
}
