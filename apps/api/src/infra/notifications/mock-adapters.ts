import { StructuredLogger } from '@bp/shared';
import { DataSource } from 'typeorm';
import { EmailPort, NotificationLogPort, PushPort } from '../../modules/notifications/application/notification.handler';

const logger = new StructuredLogger('NotificationMocks');

/** Simulated email. Injects a failure when NOTIFY_FAIL=email (for DLQ tests). */
export class MockEmailAdapter implements EmailPort {
  async send(to: string, subject: string): Promise<void> {
    if (process.env.NOTIFY_FAIL === 'email') throw new Error('mock smtp failure');
    logger.info('email sent (simulated)', { to, subject });
  }
}

/** Simulated push. */
export class MockPushAdapter implements PushPort {
  async send(deviceToken: string, title: string): Promise<void> {
    if (process.env.NOTIFY_FAIL === 'push') throw new Error('mock push failure');
    logger.info('push sent (simulated)', { title });
  }
}

/** Delivery log in PostgreSQL. */
export class NotificationLogAdapter implements NotificationLogPort {
  constructor(private readonly ds: DataSource) {}
  async record(eventId: string, channel: 'email' | 'push', status: 'SENT' | 'FAILED'): Promise<void> {
    await this.ds.query(`INSERT INTO notifications (event_id, channel, status) VALUES ($1,$2,$3)`, [eventId, channel, status]);
  }
}
