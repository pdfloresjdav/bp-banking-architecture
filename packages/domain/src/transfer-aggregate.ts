import { CoreTransferOutcome, CreateTransferRequest, Money, TransferKind, TransferState } from '@bp/contracts';
import { InvalidStateTransitionError, InvalidTransferError } from './errors';

/** Valid state-machine transitions (seq-03). */
const ALLOWED: Record<TransferState, TransferState[]> = {
  [TransferState.PENDING]: [TransferState.SUBMITTED],
  [TransferState.SUBMITTED]: [TransferState.CONFIRMED, TransferState.REJECTED, TransferState.UNKNOWN],
  // UNKNOWN can be resolved by reconciliation to CONFIRMED/REJECTED.
  [TransferState.UNKNOWN]: [TransferState.CONFIRMED, TransferState.REJECTED],
  [TransferState.CONFIRMED]: [],
  [TransferState.REJECTED]: [],
};

export interface TransferProps {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Money;
  kind: TransferKind;
  description?: string;
  state: TransferState;
  coreReference: string | null;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Transfer-order domain aggregate.
 * Encapsulates invariants and the state machine. No infrastructure dependencies.
 */
export class TransferAggregate {
  private constructor(private props: TransferProps) {}

  static create(input: {
    transferId: string;
    request: CreateTransferRequest;
    now?: Date;
  }): TransferAggregate {
    const { request } = input;
    if (request.amount.amountMinor <= 0) {
      throw new InvalidTransferError('Amount must be greater than zero');
    }
    if (request.sourceAccountId === request.destinationAccountId) {
      throw new InvalidTransferError('Source and destination accounts must differ');
    }
    if (request.kind === 'OWN' && !request.destinationAccountId) {
      throw new InvalidTransferError('Destination is required');
    }
    const now = input.now ?? new Date();
    return new TransferAggregate({
      transferId: input.transferId,
      sourceAccountId: request.sourceAccountId,
      destinationAccountId: request.destinationAccountId,
      amount: request.amount,
      kind: request.kind,
      description: request.description,
      state: TransferState.PENDING,
      coreReference: null,
      createdAt: now,
      updatedAt: now,
    });
  }

  static rehydrate(props: TransferProps): TransferAggregate {
    return new TransferAggregate({ ...props });
  }

  private transition(to: TransferState, now = new Date()): void {
    const allowed = ALLOWED[this.props.state] ?? [];
    if (!allowed.includes(to)) {
      throw new InvalidStateTransitionError(this.props.state, to);
    }
    this.props.state = to;
    this.props.updatedAt = now;
  }

  /** Marks the order as submitted to the Core. */
  markSubmitted(now = new Date()): void {
    this.transition(TransferState.SUBMITTED, now);
  }

  /** Applies the outcome returned by the Core (via the ACL). */
  applyCoreOutcome(outcome: CoreTransferOutcome, now = new Date()): void {
    switch (outcome.status) {
      case 'CONFIRMED':
        this.transition(TransferState.CONFIRMED, now);
        this.props.coreReference = outcome.coreReference;
        break;
      case 'REJECTED':
        this.transition(TransferState.REJECTED, now);
        break;
      case 'UNKNOWN':
        this.transition(TransferState.UNKNOWN, now);
        break;
    }
  }

  get id(): string {
    return this.props.transferId;
  }
  get state(): TransferState {
    return this.props.state;
  }
  get isTerminal(): boolean {
    return this.props.state === TransferState.CONFIRMED || this.props.state === TransferState.REJECTED;
  }
  get coreReference(): string | null {
    return this.props.coreReference;
  }
  snapshot(): TransferProps {
    return { ...this.props };
  }
}
