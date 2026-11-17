import { CoreTransferOutcome, EventEnvelope, Paged } from '@bp/contracts';
import { TransferAggregate, TransferProps } from './transfer-aggregate';

/** Outbound port to the Core (implemented by the ACL / core-integration adapter). */
export interface CorePort {
  getAccounts(userId: string): Promise<CoreAccount[]>;
  getMovements(accountId: string, cursor: string | null, limit: number): Promise<Paged<CoreMovement>>;
  /** Executes the transfer; propagates the Idempotency-Key. May return UNKNOWN. */
  postTransfer(input: CorePostTransferInput): Promise<CoreTransferOutcome>;
  /** Operation-status lookup by reference (reconciliation; ADR-0022). */
  getOperationStatus(idempotencyKey: string): Promise<CoreTransferOutcome>;
}

export interface CoreAccount {
  accountId: string;
  ownerUserId: string;
  product: string;
  balanceMinor: number;
  currency: string;
}

export interface CoreMovement {
  movementId: string;
  accountId: string;
  date: string;
  amountMinor: number;
  currency: string;
  description: string;
}

export interface CorePostTransferInput {
  idempotencyKey: string;
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  currency: string;
}

/** Transactional persistence port for the order + idempotency + outbox. */
export interface TransferRepositoryPort {
  /**
   * Atomically (same TX) inserts: PENDING order + idempotency row (UNIQUE) + Outbox event.
   * If the Idempotency-Key already exists, returns the previous record without re-executing.
   */
  createWithIdempotency(input: {
    aggregate: TransferAggregate;
    idempotencyKey: string;
    fingerprint: string;
    event: EventEnvelope;
  }): Promise<CreateTransferOutcome>;
  update(aggregate: TransferAggregate, event?: EventEnvelope): Promise<void>;
  findById(transferId: string): Promise<TransferProps | null>;
  findByIdempotencyKey(key: string): Promise<{ transferId: string; fingerprint: string } | null>;
  /** Orders in UNKNOWN/PENDING state for reconciliation (includes the Idempotency-Key). */
  findForReconciliation(limit: number): Promise<ReconciliationCandidate[]>;
}

export interface ReconciliationCandidate {
  props: TransferProps;
  idempotencyKey: string;
}

export type CreateTransferOutcome =
  | { kind: 'CREATED'; aggregate: TransferAggregate }
  | { kind: 'REPLAYED'; existing: TransferProps };

/** Consumer-side idempotency port (events). */
export interface ProcessedStorePort {
  /** @returns true if already processed (duplicate). */
  isProcessed(eventId: string): Promise<boolean>;
  markProcessed(eventId: string): Promise<void>;
}

/** Event-bus port. */
export interface EventBusPort {
  publish(event: EventEnvelope): Promise<void>;
}

/** Append-only audit port. */
export interface AuditPort {
  append(input: {
    action: string;
    result: 'SUCCESS' | 'FAILURE' | 'REJECTED' | 'SECURITY';
    userId: string | null;
    correlationId: string;
    metadata?: Record<string, unknown>;
  }): Promise<void>;
}
