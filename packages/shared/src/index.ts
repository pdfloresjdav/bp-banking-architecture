import { randomUUID } from 'node:crypto';

export const CORRELATION_HEADER = 'x-correlation-id';
export const IDEMPOTENCY_HEADER = 'idempotency-key';

export function newCorrelationId(): string {
  return randomUUID();
}

export function newId(prefix: string): string {
  return `${prefix}_${randomUUID()}`;
}

/** Minimal structured JSON logger (no PII in messages). */
export interface LogFields {
  correlationId?: string;
  [k: string]: unknown;
}

export class StructuredLogger {
  constructor(private readonly context: string) {}

  private emit(level: string, message: string, fields: LogFields = {}): void {
    const line = JSON.stringify({
      ts: new Date().toISOString(),
      level,
      context: this.context,
      message,
      ...fields,
    });
    // eslint-disable-next-line no-console
    console.log(line);
  }
  info(message: string, fields?: LogFields): void {
    this.emit('info', message, fields);
  }
  warn(message: string, fields?: LogFields): void {
    this.emit('warn', message, fields);
  }
  error(message: string, fields?: LogFields): void {
    this.emit('error', message, fields);
  }
}

/** Sleep helper for backoff (jitter added by the caller). */
export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}
