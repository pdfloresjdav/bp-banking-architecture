import { AuditRecordInput, computeAuditHash, verifyAuditChain } from './audit-hash';

function rec(action: string, prevHash: string | null): AuditRecordInput & { hash: string; prevHash: string | null } {
  const base: AuditRecordInput = {
    action,
    result: 'SUCCESS',
    userId: 'user-1',
    correlationId: 'corr-1',
    occurredAt: '2026-11-17T00:00:00.000Z',
  };
  return { ...base, prevHash, hash: computeAuditHash(prevHash, base) };
}

describe('Audit - hash chaining', () => {
  it('builds and verifies a valid chain', () => {
    const r1 = rec('LOGIN', null);
    const r2 = rec('TRANSFER_CREATED', r1.hash);
    const r3 = rec('TRANSFER_CONFIRMED', r2.hash);
    const res = verifyAuditChain([r1, r2, r3]);
    expect(res.valid).toBe(true);
    expect(res.brokenAtIndex).toBeNull();
  });

  it('detects tampering (broken chain)', () => {
    const r1 = rec('LOGIN', null);
    const r2 = rec('TRANSFER_CREATED', r1.hash);
    // Tamper with record 2 without recomputing its hash:
    (r2 as { action: string }).action = 'TRANSFER_TAMPERED';
    const res = verifyAuditChain([r1, r2]);
    expect(res.valid).toBe(false);
    expect(res.brokenAtIndex).toBe(1);
  });
});
