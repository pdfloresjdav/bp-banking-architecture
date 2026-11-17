/** Domain errors with a stable code for standardized error handling. */
export class DomainError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly httpStatus = 400,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The source account does not belong to / is not authorized for the user. */
export class AccountAuthorizationError extends DomainError {
  constructor(accountId: string) {
    super('ACCOUNT_FORBIDDEN', `Not authorized over source account ${accountId}`, 403);
  }
}

/** Same Idempotency-Key used with a different payload. */
export class IdempotencyConflictError extends DomainError {
  constructor() {
    super('IDEMPOTENCY_KEY_CONFLICT', 'The Idempotency-Key was used with a different payload', 409);
  }
}

/** Invalid transfer data. */
export class InvalidTransferError extends DomainError {
  constructor(message: string) {
    super('INVALID_TRANSFER', message, 422);
  }
}

/** State transition not allowed by the state machine. */
export class InvalidStateTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super('INVALID_STATE_TRANSITION', `Invalid transition ${from} -> ${to}`, 409);
  }
}
