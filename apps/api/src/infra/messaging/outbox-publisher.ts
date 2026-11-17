import { EventEnvelope, EventNameType } from '@bp/contracts';
import { EventBusPort } from '@bp/domain';
import { StructuredLogger } from '@bp/shared';
import { DataSource } from 'typeorm';

interface OutboxRow {
  id: string;
  event_id: string;
  name: string;
  payload: Record<string, unknown>;
  correlation_id: string;
  idempotency_key: string | null;
  attempts: number;
}

/**
 * Outbox Publisher (at-least-once): reads PENDING events, publishes them, and marks them SENT.
 * On failure it increments attempts (retried in the next cycle). No events are lost.
 */
export class OutboxPublisher {
  private timer?: NodeJS.Timeout;
  private running = false;
  private readonly logger = new StructuredLogger('OutboxPublisher');

  constructor(
    private readonly ds: DataSource,
    private readonly bus: EventBusPort,
    private readonly intervalMs = 1000,
    private readonly batchSize = 50,
  ) {}

  start(): void {
    this.timer = setInterval(() => void this.tick(), this.intervalMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async tick(): Promise<number> {
    if (this.running) return 0;
    this.running = true;
    let published = 0;
    try {
      const rows: OutboxRow[] = await this.ds.query(
        `SELECT id, event_id, name, payload, correlation_id, idempotency_key, attempts
         FROM outbox_events WHERE status='PENDING' ORDER BY id ASC LIMIT $1`,
        [this.batchSize],
      );
      for (const row of rows) {
        const event: EventEnvelope = {
          eventId: row.event_id,
          name: row.name as EventNameType,
          occurredAt: new Date().toISOString(),
          correlationId: row.correlation_id,
          idempotencyKey: row.idempotency_key,
          producer: 'bp-outbox',
          schemaVersion: 1,
          payload: row.payload,
        };
        try {
          await this.bus.publish(event);
          await this.ds.query(`UPDATE outbox_events SET status='SENT', sent_at=now() WHERE id=$1`, [row.id]);
          published++;
        } catch (err) {
          await this.ds.query(`UPDATE outbox_events SET attempts=attempts+1 WHERE id=$1`, [row.id]);
          this.logger.warn('Failed to publish event; will retry', { eventId: row.event_id });
        }
      }
    } finally {
      this.running = false;
    }
    return published;
  }
}
