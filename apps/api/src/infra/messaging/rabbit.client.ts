import { StructuredLogger } from '@bp/shared';
import * as amqp from 'amqplib';

export const EXCHANGE = 'bp.events';
export const DLX = 'bp.events.dlx';

/** RabbitMQ connection and channel with a topic exchange + dead-letter. */
export class RabbitClient {
  private connection?: amqp.Connection;
  private channelRef?: amqp.Channel;
  private readonly logger = new StructuredLogger('RabbitClient');

  constructor(private readonly url: string) {}

  async connect(): Promise<void> {
    this.connection = await amqp.connect(this.url);
    this.channelRef = await this.connection.createChannel();
    await this.channelRef.assertExchange(EXCHANGE, 'topic', { durable: true });
    await this.channelRef.assertExchange(DLX, 'topic', { durable: true });
    this.logger.info('RabbitMQ connected');
  }

  get channel(): amqp.Channel {
    if (!this.channelRef) throw new Error('RabbitMQ channel not initialized');
    return this.channelRef;
  }

  async close(): Promise<void> {
    await this.channelRef?.close().catch(() => undefined);
    await this.connection?.close().catch(() => undefined);
  }
}
