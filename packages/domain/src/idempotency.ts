import { createHash } from 'node:crypto';
import { CreateTransferRequest } from '@bp/contracts';
import { IdempotencyConflictError } from './errors';

/**
 * Deterministic payload fingerprint used to detect reuse of the same Idempotency-Key
 * with a different payload (PHASE 6, rules 10/11).
 */
export function fingerprintTransfer(req: CreateTransferRequest): string {
  const canonical = JSON.stringify({
    s: req.sourceAccountId,
    d: req.destinationAccountId,
    a: req.amount.amountMinor,
    c: req.amount.currency,
    k: req.kind,
  });
  return createHash('sha256').update(canonical).digest('hex');
}

/**
 * Verifies Idempotency-Key consistency.
 * @throws IdempotencyConflictError if the key exists with a different fingerprint.
 */
export function assertIdempotencyConsistent(
  existingFingerprint: string | null,
  incomingFingerprint: string,
): void {
  if (existingFingerprint !== null && existingFingerprint !== incomingFingerprint) {
    throw new IdempotencyConflictError();
  }
}
