import { EventEnvelope, EventName } from '@bp/contracts';
import { ProcessedStorePort } from '@bp/domain';
import { EmailPort, NotificationHandler, NotificationLogPort, PushPort } from './notification.handler';

class FakeProcessed implements ProcessedStorePort {
  seen = new Set<string>();
  async isProcessed(id: string) {
    return this.seen.has(id);
  }
  async markProcessed(id: string) {
    this.seen.add(id);
  }
}
class OkEmail implements EmailPort {
  calls = 0;
  async send() {
    this.calls++;
  }
}
class OkPush implements PushPort {
  calls = 0;
  async send() {
    this.calls++;
  }
}
class FailEmail implements EmailPort {
  async send(): Promise<void> {
    throw new Error('smtp down');
  }
}
class FakeLog implements NotificationLogPort {
  entries: Array<[string, string, string]> = [];
  async record(id: string, ch: 'email' | 'push', st: 'SENT' | 'FAILED') {
    this.entries.push([id, ch, st]);
  }
}

function event(name: string, eventId = 'e1'): EventEnvelope {
  return {
    eventId,
    name: name as EventEnvelope['name'],
    occurredAt: new Date().toISOString(),
    correlationId: 'c1',
    idempotencyKey: 'k1',
    producer: 'test',
    schemaVersion: 1,
    payload: {},
  };
}

describe('NotificationHandler', () => {
  it('sends email+push on transfer.confirmed', async () => {
    const email = new OkEmail();
    const push = new OkPush();
    const h = new NotificationHandler(new FakeProcessed(), email, push, new FakeLog());
    const r = await h.handle(event(EventName.TransferConfirmed));
    expect(r).toBe('HANDLED');
    expect(email.calls).toBe(1);
    expect(push.calls).toBe(1);
  });

  it('ignores non-notifiable events (e.g. UNKNOWN) without claiming completion', async () => {
    const email = new OkEmail();
    const h = new NotificationHandler(new FakeProcessed(), email, new OkPush(), new FakeLog());
    const r = await h.handle(event(EventName.TransferUnknown));
    expect(r).toBe('IGNORED');
    expect(email.calls).toBe(0);
  });

  it('is idempotent against duplicate events', async () => {
    const processed = new FakeProcessed();
    const email = new OkEmail();
    const h = new NotificationHandler(processed, email, new OkPush(), new FakeLog());
    await h.handle(event(EventName.TransferConfirmed, 'dup'));
    const second = await h.handle(event(EventName.TransferConfirmed, 'dup'));
    expect(second).toBe('SKIPPED');
    expect(email.calls).toBe(1); // does not resend
  });

  it('propagates provider failure (to nack → DLQ) and records FAILED', async () => {
    const log = new FakeLog();
    const h = new NotificationHandler(new FakeProcessed(), new FailEmail(), new OkPush(), log);
    await expect(h.handle(event(EventName.TransferConfirmed, 'f1'))).rejects.toThrow('smtp down');
    expect(log.entries).toContainEqual(['f1', 'email', 'FAILED']);
  });
});
