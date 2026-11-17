/** Common types shared across layers. */

export interface Money {
  /** Amount in the minor unit (cents) to avoid floating-point errors. */
  amountMinor: number;
  /** ISO-4217 code, e.g. "USD". */
  currency: string;
}

export interface AccountRef {
  /** Account identifier (IBAN/internal number). Fictitious data in the PoC. */
  accountId: string;
}

export interface Paged<T> {
  items: T[];
  nextCursor: string | null;
  pageSize: number;
}

/** Standardized API error envelope. */
export interface ApiError {
  code: string;
  message: string;
  correlationId?: string;
  details?: Record<string, unknown>;
}
