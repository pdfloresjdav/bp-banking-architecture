import { EventEnvelope } from '@bp/contracts';
import { EventBusPort } from '@bp/domain';
import { EXCHANGE, RabbitClient } from './rabbit.client';

/** Publishes business events to the topic exchange (routing key = event name). */
export class RabbitEventBusAdapter implements EventBusPort {
  constructor(private readonly client: RabbitClient) {}

  async publish(event: EventEnvelope): Promise<void> {
    const body = Buffer.from(JSON.stringify(event));
    const ok = this.client.channel.publish(EXCHANGE, event.name, body, {
      contentType: 'application/json',
      messageId: event.eventId,
      persistent: true,
    });
    if (!ok) {
      // Backpressure: wait for drain.
      await new Promise<void>((resolve) => this.client.channel.once('drain', () => resolve()));
    }
  }
}
