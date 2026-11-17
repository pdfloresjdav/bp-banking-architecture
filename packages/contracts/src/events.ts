/**
 * Canonical catalog of business events: bp.<domain>.<fact>.vN
 * (same names as in workspace.dsl and CLAUDE.md).
 */
export const EventName = {
  TransferRequested: 'bp.transfer.requested.v1',
  TransferConfirmed: 'bp.transfer.confirmed.v1',
  TransferFailed: 'bp.transfer.failed.v1',
  TransferUnknown: 'bp.transfer.unknown.v1',
  PaymentRequested: 'bp.payment.requested.v1',
  PaymentConfirmed: 'bp.payment.confirmed.v1',
  PaymentFailed: 'bp.payment.failed.v1',
  OnboardingVerified: 'bp.onboarding.verified.v1',
  OnboardingRejected: 'bp.onboarding.rejected.v1',
  AuthLoginSucceeded: 'bp.auth.login.succeeded.v1',
  AuthLoginFailed: 'bp.auth.login.failed.v1',
  AuthStepupRequired: 'bp.auth.stepup.required.v1',
  AuthStepupCompleted: 'bp.auth.stepup.completed.v1',
  SecuritySuspicious: 'bp.security.suspicious.v1',
  NotificationSent: 'bp.notification.sent.v1',
  NotificationFailed: 'bp.notification.failed.v1',
} as const;

export type EventNameType = (typeof EventName)[keyof typeof EventName];

/** Common envelope for all events (stable contract). */
export interface EventEnvelope<T = Record<string, unknown>> {
  eventId: string;
  name: EventNameType;
  occurredAt: string;
  correlationId: string;
  idempotencyKey: string | null;
  producer: string;
  schemaVersion: number;
  payload: T;
}

export interface TransferEventPayload {
  transferId: string;
  sourceAccountId: string;
  destinationAccountId: string;
  amountMinor: number;
  currency: string;
  state: string;
  coreReference?: string | null;
  reason?: string;
}
