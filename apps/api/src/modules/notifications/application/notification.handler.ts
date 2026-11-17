import { EventEnvelope, EventName } from '@bp/contracts';
import { ProcessedStorePort } from '@bp/domain';
import { StructuredLogger } from '@bp/shared';

export interface EmailPort {
  send(to: string, subject: string, body: string): Promise<void>;
}
export interface PushPort {
  send(deviceToken: string, title: string, body: string): Promise<void>;
}
export interface NotificationLogPort {
  record(eventId: string, channel: 'email' | 'push', status: 'SENT' | 'FAILED'): Promise<void>;
}

/**
 * Idempotent event consumer → email + push notifications.
 * Rule: NEVER claim a transfer completed when the state is UNKNOWN/pending — it only reacts to
 * confirmed (completed) and failed (rejected).
 */
export class NotificationHandler {
  private readonly logger = new StructuredLogger('NotificationHandler');

  constructor(
    private readonly processed: ProcessedStorePort,
    private readonly email: EmailPort,
    private readonly push: PushPort,
    private readonly log: NotificationLogPort,
  ) {}

  /** @throws if a provider fails (so the transport nacks → DLQ). */
  async handle(event: EventEnvelope): Promise<'SKIPPED' | 'HANDLED' | 'IGNORED'> {
    if (await this.processed.isProcessed(event.eventId)) {
      return 'SKIPPED'; // duplicate from the bus
    }

    const { subject, body } = this.render(event);
    if (subject === null) {
      await this.processed.markProcessed(event.eventId);
      return 'IGNORED'; // non-notifiable event (e.g. UNKNOWN)
    }

    // Email + push (if one fails, it propagates for retry/DLQ).
    try {
      await this.email.send('customer@example.test', subject, body);
      await this.log.record(event.eventId, 'email', 'SENT');
    } catch (err) {
      await this.log.record(event.eventId, 'email', 'FAILED');
      throw err;
    }
    try {
      await this.push.send('device-token-demo', subject, body);
      await this.log.record(event.eventId, 'push', 'SENT');
    } catch (err) {
      await this.log.record(event.eventId, 'push', 'FAILED');
      throw err;
    }

    await this.processed.markProcessed(event.eventId);
    return 'HANDLED';
  }

  private render(event: EventEnvelope): { subject: string | null; body: string } {
    switch (event.name) {
      case EventName.TransferConfirmed:
        return { subject: 'Transfer completed', body: 'Your transfer was confirmed by the bank.' };
      case EventName.TransferFailed:
        return { subject: 'Transfer rejected', body: 'Your transfer was rejected.' };
      default:
        // UNKNOWN/requested/others → not notified as completed.
        return { subject: null, body: '' };
    }
  }
}
