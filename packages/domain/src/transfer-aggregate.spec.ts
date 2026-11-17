import { CreateTransferRequest, TransferState } from '@bp/contracts';
import { TransferAggregate } from './transfer-aggregate';
import { InvalidStateTransitionError, InvalidTransferError } from './errors';

const baseReq: CreateTransferRequest = {
  sourceAccountId: 'acc-001',
  destinationAccountId: 'acc-999',
  amount: { amountMinor: 1500, currency: 'USD' },
  kind: 'INTERBANK',
};

describe('TransferAggregate - state machine', () => {
  it('is created in PENDING', () => {
    const t = TransferAggregate.create({ transferId: 't1', request: baseReq });
    expect(t.state).toBe(TransferState.PENDING);
    expect(t.isTerminal).toBe(false);
  });

  it('PENDING -> SUBMITTED -> CONFIRMED with coreReference', () => {
    const t = TransferAggregate.create({ transferId: 't1', request: baseReq });
    t.markSubmitted();
    expect(t.state).toBe(TransferState.SUBMITTED);
    t.applyCoreOutcome({ status: 'CONFIRMED', coreReference: 'CORE-123' });
    expect(t.state).toBe(TransferState.CONFIRMED);
    expect(t.coreReference).toBe('CORE-123');
    expect(t.isTerminal).toBe(true);
  });

  it('SUBMITTED -> REJECTED', () => {
    const t = TransferAggregate.create({ transferId: 't1', request: baseReq });
    t.markSubmitted();
    t.applyCoreOutcome({ status: 'REJECTED', reason: 'insufficient funds' });
    expect(t.state).toBe(TransferState.REJECTED);
    expect(t.isTerminal).toBe(true);
  });

  it('SUBMITTED -> UNKNOWN then reconciliation UNKNOWN -> CONFIRMED', () => {
    const t = TransferAggregate.create({ transferId: 't1', request: baseReq });
    t.markSubmitted();
    t.applyCoreOutcome({ status: 'UNKNOWN' });
    expect(t.state).toBe(TransferState.UNKNOWN);
    expect(t.isTerminal).toBe(false);
    // Reconciliation resolves the real state:
    t.applyCoreOutcome({ status: 'CONFIRMED', coreReference: 'CORE-777' });
    expect(t.state).toBe(TransferState.CONFIRMED);
  });

  it('rejects an invalid transition PENDING -> CONFIRMED (without passing through SUBMITTED)', () => {
    const t = TransferAggregate.create({ transferId: 't1', request: baseReq });
    expect(() => t.applyCoreOutcome({ status: 'CONFIRMED', coreReference: 'X' })).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('does not allow re-confirming a terminal order', () => {
    const t = TransferAggregate.create({ transferId: 't1', request: baseReq });
    t.markSubmitted();
    t.applyCoreOutcome({ status: 'CONFIRMED', coreReference: 'X' });
    expect(() => t.applyCoreOutcome({ status: 'CONFIRMED', coreReference: 'Y' })).toThrow(
      InvalidStateTransitionError,
    );
  });

  it('validates amount > 0 and distinct accounts', () => {
    expect(() =>
      TransferAggregate.create({
        transferId: 't',
        request: { ...baseReq, amount: { amountMinor: 0, currency: 'USD' } },
      }),
    ).toThrow(InvalidTransferError);
    expect(() =>
      TransferAggregate.create({
        transferId: 't',
        request: { ...baseReq, destinationAccountId: baseReq.sourceAccountId },
      }),
    ).toThrow(InvalidTransferError);
  });
});
