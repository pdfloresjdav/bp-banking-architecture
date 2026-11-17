import { EventEnvelope } from '@bp/contracts';
import { AuditPort, ProcessedStorePort } from '@bp/domain';
import { StructuredLogger } from '@bp/shared';
import { NotificationHandler } from '../../modules/notifications/application/notification.handler';
import { EXCHANGE, DLX, RabbitClient } from './rabbit.client';

const logger = new StructuredLogger('Consumers');

/** Wrapper that namespaces idempotency keys per consumer. */
class PrefixedProcessedStore implements ProcessedStorePort {
  constructor(private readonly inner: ProcessedStorePort, private readonly prefix: string) {}
  isProcessed(id: string): Promise<boolean> {
    return this.inner.isProcessed(`${this.prefix}:${id}`);
  }
  markProcessed(id: string): Promise<void> {
    return this.inner.markProcessed(`${this.prefix}:${id}`);
  }
}

export async function startConsumers(
  rabbit: RabbitClient,
  notificationHandler: NotificationHandler,
  audit: AuditPort,
  processed: ProcessedStorePort,
): Promise<void> {
  const ch = rabbit.channel;

  // Notifications queue (confirmed/failed/unknown) with a DLQ.
  const notifQueue = 'bp.notifications';
  const dlq = 'bp.notifications.dlq';
  await ch.assertQueue(dlq, { durable: true });
  await ch.bindQueue(dlq, DLX, '#');
  await ch.assertQueue(notifQueue, { durable: true, deadLetterExchange: DLX });
  // '#' matches zero or more words: bp.transfer.confirmed.v1 (4 words) matches.
  await ch.bindQueue(notifQueue, EXCHANGE, 'bp.transfer.#');

  // Audit queue (all events).
  const auditQueue = 'bp.audit';
  await ch.assertQueue(auditQueue, { durable: true });
  await ch.bindQueue(auditQueue, EXCHANGE, '#');

  await ch.consume(notifQueue, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as EventEnvelope;
      await notificationHandler.handle(event);
      ch.ack(msg);
    } catch (err) {
      logger.warn('Notification failed → DLQ', { error: String(err) });
      ch.nack(msg, false, false); // to DLQ (no infinite requeue)
    }
  });

  await ch.consume(auditQueue, async (msg) => {
    if (!msg) return;
    try {
      const event = JSON.parse(msg.content.toString()) as EventEnvelope;
      const auditStore = new PrefixedProcessedStore(processed, 'audit');
      if (!(await auditStore.isProcessed(event.eventId))) {
        await audit.append({
          action: event.name,
          result: event.name.includes('failed') ? 'FAILURE' : 'SUCCESS',
          userId: (event.payload as { userId?: string }).userId ?? null,
          correlationId: event.correlationId,
          metadata: { eventId: event.eventId },
        });
        await auditStore.markProcessed(event.eventId);
      }
      ch.ack(msg);
    } catch (err) {
      logger.warn('Audit of event failed; requeue', { error: String(err) });
      ch.nack(msg, false, true);
    }
  });

  // Note: notifications use the raw eventId; audit uses the 'audit:' prefix → no collision.
  logger.info('Consumers started');
}
