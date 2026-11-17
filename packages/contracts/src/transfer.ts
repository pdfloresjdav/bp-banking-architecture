import { Money } from './common';

/**
 * Explicit states of a transfer order.
 * Matches the state machine in the seq-03 diagram.
 */
export enum TransferState {
  PENDING = 'PENDING',
  SUBMITTED = 'SUBMITTED',
  CONFIRMED = 'CONFIRMED',
  REJECTED = 'REJECTED',
  UNKNOWN = 'UNKNOWN',
}

export type TransferKind = 'OWN' | 'INTERBANK';

/** Transfer creation payload (API). */
export interface CreateTransferRequest {
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Money;
  kind: TransferKind;
  description?: string;
}

/** API response for a transfer order. */
export interface TransferResponse {
  transferId: string;
  state: TransferState;
  sourceAccountId: string;
  destinationAccountId: string;
  amount: Money;
  kind: TransferKind;
  coreReference: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Result of execution against the Core (via the ACL). */
export type CoreTransferOutcome =
  | { status: 'CONFIRMED'; coreReference: string }
  | { status: 'REJECTED'; reason: string }
  | { status: 'UNKNOWN' };
