import { createHash } from 'node:crypto';

export interface AuditRecordInput {
  action: string;
  result: 'SUCCESS' | 'FAILURE' | 'REJECTED' | 'SECURITY';
  userId: string | null;
  correlationId: string;
  occurredAt: string;
  metadata?: Record<string, unknown>;
}

/**
 * Hash chaining for append-only log integrity (seq-05).
 * hash_n = SHA256(prevHash + canonical_record). Enables tamper detection.
 */
export function computeAuditHash(prevHash: string | null, record: AuditRecordInput): string {
  const canonical = JSON.stringify({
    p: prevHash ?? 'GENESIS',
    a: record.action,
    r: record.result,
    u: record.userId,
    c: record.correlationId,
    t: record.occurredAt,
    m: record.metadata ?? {},
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/** Verifies the integrity of an audit hash chain. */
export function verifyAuditChain(
  records: Array<AuditRecordInput & { hash: string; prevHash: string | null }>,
): { valid: boolean; brokenAtIndex: number | null } {
  for (let i = 0; i < records.length; i++) {
    const expected = computeAuditHash(records[i].prevHash, records[i]);
    if (expected !== records[i].hash) {
      return { valid: false, brokenAtIndex: i };
    }
  }
  return { valid: true, brokenAtIndex: null };
}
