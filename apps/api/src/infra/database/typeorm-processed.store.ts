import { ProcessedStorePort } from '@bp/domain';
import { DataSource } from 'typeorm';

/** Consumer idempotency: marks events as already processed. */
export class TypeOrmProcessedStore implements ProcessedStorePort {
  constructor(private readonly ds: DataSource) {}

  async isProcessed(eventId: string): Promise<boolean> {
    const rows = await this.ds.query(`SELECT 1 FROM processed_events WHERE event_id=$1`, [eventId]);
    return rows.length > 0;
  }

  async markProcessed(eventId: string): Promise<void> {
    await this.ds.query(
      `INSERT INTO processed_events (event_id) VALUES ($1) ON CONFLICT (event_id) DO NOTHING`,
      [eventId],
    );
  }
}
