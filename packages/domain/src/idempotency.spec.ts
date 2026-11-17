import { CreateTransferRequest } from '@bp/contracts';
import { assertIdempotencyConsistent, fingerprintTransfer } from './idempotency';
import { IdempotencyConflictError } from './errors';

const req: CreateTransferRequest = {
  sourceAccountId: 'acc-001',
  destinationAccountId: 'acc-999',
  amount: { amountMinor: 1500, currency: 'USD' },
  kind: 'INTERBANK',
};

describe('Idempotency', () => {
  it('same request produces the same fingerprint', () => {
    expect(fingerprintTransfer(req)).toBe(fingerprintTransfer({ ...req }));
  });

  it('different payload produces a different fingerprint', () => {
    const other = { ...req, amount: { amountMinor: 9999, currency: 'USD' } };
    expect(fingerprintTransfer(req)).not.toBe(fingerprintTransfer(other));
  });

  it('a new key (no previous fingerprint) is consistent', () => {
    expect(() => assertIdempotencyConsistent(null, fingerprintTransfer(req))).not.toThrow();
  });

  it('same key + same fingerprint is consistent (safe replay)', () => {
    const fp = fingerprintTransfer(req);
    expect(() => assertIdempotencyConsistent(fp, fp)).not.toThrow();
  });

  it('same key + different fingerprint throws a conflict', () => {
    const fp = fingerprintTransfer(req);
    const other = fingerprintTransfer({ ...req, amount: { amountMinor: 1, currency: 'USD' } });
    expect(() => assertIdempotencyConsistent(fp, other)).toThrow(IdempotencyConflictError);
  });
});
