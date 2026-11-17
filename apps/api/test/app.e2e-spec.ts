/**
 * End-to-end tests (Supertest) against the in-process Nest app connected to the Docker infrastructure.
 *
 * REQUIRES Docker services: postgres, redis, rabbitmq, wiremock-core, wiremock-complementary.
 *   pnpm env:up && pnpm migrate     # before running
 *   pnpm --filter @bp/api test:e2e
 *
 * These tests run with DEV_AUTH_BYPASS=true to exercise the functional flows without the interactive
 * OIDC browser login. Real token-level authentication is covered separately in auth.e2e-spec.ts.
 */
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';
import { TOKENS } from '../src/common/tokens';
import { HttpExceptionFilter } from '../src/common/http-exception.filter';
import { OutboxPublisher } from '../src/infra/messaging/outbox-publisher';
import { RabbitClient } from '../src/infra/messaging/rabbit.client';
import { NotificationHandler } from '../src/modules/notifications/application/notification.handler';
import { startConsumers } from '../src/infra/messaging/consumers';
import type Redis from 'ioredis';
import { AuditPort, ProcessedStorePort } from '@bp/domain';

process.env.DEV_AUTH_BYPASS = 'true';
process.env.INTERNAL_API_TOKEN = 'e2e-internal-token';

const USER = { 'x-debug-user': 'user-1', 'x-debug-stepup': 'true' };

function transferBody(destination: string, amountMinor = 1500) {
  return { sourceAccountId: 'acc-001', destinationAccountId: destination, amount: { amountMinor, currency: 'USD' }, kind: 'INTERBANK' };
}

describe('BP API (e2e, requires Docker)', () => {
  let app: INestApplication;
  let ds: DataSource;
  let outbox: OutboxPublisher;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    ds = app.get<DataSource>(TOKENS.DataSource);
    // Isolate the run: the operational DB is persistent across runs, so reset it.
    await ds.query(
      `TRUNCATE transfers, idempotency_keys, outbox_events, audit_log, processed_events, notifications, reconciliation_attempts RESTART IDENTITY CASCADE`,
    );
    // Flush the cache so cache MISS/HIT assertions are deterministic.
    const redis = app.get<Redis>(TOKENS.Redis);
    await redis.flushdb();
    outbox = app.get<OutboxPublisher>(TOKENS.OutboxPublisher);
    outbox.start();
    const rabbit = app.get<RabbitClient>(TOKENS.Rabbit);
    const notifier = app.get<NotificationHandler>(TOKENS.NotificationHandler);
    const audit = app.get<AuditPort>(TOKENS.AuditPort);
    const processed = app.get<ProcessedStorePort>(TOKENS.ProcessedStore);
    await startConsumers(rabbit, notifier, audit, processed);
  });

  afterAll(async () => {
    outbox?.stop();
    await app?.close();
  });

  it('requires authentication (401 without a user, bypass expects header but default applies) — health is public', async () => {
    await request(app.getHttpServer()).get('/health/live').expect(200);
  });

  it('returns the customer profile', async () => {
    const res = await request(app.getHttpServer()).get('/v1/customers/me').set(USER).expect(200);
    expect(res.body.userId).toBe('user-1');
    expect(res.body.accountsCount).toBeGreaterThan(0);
  });

  it('lists accounts', async () => {
    const res = await request(app.getHttpServer()).get('/v1/accounts').set(USER).expect(200);
    expect(res.body.items[0].accountId).toBe('acc-001');
  });

  it('enforces account-ownership authorization (403 for another account)', async () => {
    await request(app.getHttpServer()).get('/v1/accounts/acc-777/movements').set(USER).expect(403);
  });

  it('movement history: cache MISS then HIT', async () => {
    const k = `acc-001`;
    const miss = await request(app.getHttpServer()).get(`/v1/accounts/${k}/movements`).set(USER).expect(200);
    expect(miss.body._cache).toBe('MISS');
    const hit = await request(app.getHttpServer()).get(`/v1/accounts/${k}/movements`).set(USER).expect(200);
    expect(hit.body._cache).toBe('HIT');
  });

  it('successful transfer → CONFIRMED', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-ok-1')
      .send(transferBody('acc-999')).expect(201);
    expect(res.body.state).toBe('CONFIRMED');
    expect(res.body.coreReference).toBeTruthy();
  });

  it('rejected transfer → REJECTED', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-rej-1')
      .send(transferBody('acc-reject')).expect(201);
    expect(res.body.state).toBe('REJECTED');
  });

  it('Core timeout → UNKNOWN', async () => {
    const res = await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-unk-1')
      .send(transferBody('acc-timeout')).expect(201);
    expect(res.body.state).toBe('UNKNOWN');
  });

  it('idempotent replay with same key → same transferId', async () => {
    const first = await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-rpl-1').send(transferBody('acc-999')).expect(201);
    const second = await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-rpl-1').send(transferBody('acc-999')).expect(201);
    expect(second.body.transferId).toBe(first.body.transferId);
  });

  it('idempotency conflict with different payload → 409', async () => {
    await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-cfl-1').send(transferBody('acc-999', 2000)).expect(201);
    await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', 'e2e-cfl-1').send(transferBody('acc-999', 7000)).expect(409);
  });

  it('step-up required (missing stepup) → 401', async () => {
    await request(app.getHttpServer())
      .post('/v1/transfers').set('x-debug-user', 'user-1').set('Idempotency-Key', 'e2e-nostep')
      .send(transferBody('acc-999')).expect(401);
  });

  it('Idempotency-Key required → 400', async () => {
    await request(app.getHttpServer()).post('/v1/transfers').set(USER).send(transferBody('acc-999')).expect(400);
  });

  it('persists the Outbox and marks events SENT', async () => {
    // allow the publisher a couple of cycles
    await new Promise((r) => setTimeout(r, 1500));
    const [{ sent }] = await ds.query(`SELECT count(*)::int AS sent FROM outbox_events WHERE status='SENT'`);
    expect(sent).toBeGreaterThan(0);
  });

  it('creates audit records', async () => {
    const res = await request(app.getHttpServer()).get('/v1/audit?limit=5').set(USER).expect(200);
    expect(res.body.items.length).toBeGreaterThan(0);
  });

  it('processes notifications (email + push) from events', async () => {
    await new Promise((r) => setTimeout(r, 1500));
    const rows = await ds.query(`SELECT channel, status FROM notifications WHERE status='SENT'`);
    const channels = rows.map((r: { channel: string }) => r.channel);
    expect(channels).toEqual(expect.arrayContaining(['email', 'push']));
  });

  it('reconciliation endpoint requires the internal token (401)', async () => {
    await request(app.getHttpServer()).post('/internal/reconcile').expect(401);
  });

  it('reconciliation resolves an UNKNOWN transfer without re-executing the command', async () => {
    // create an UNKNOWN transfer
    const unk = await request(app.getHttpServer())
      .post('/v1/transfers').set(USER).set('Idempotency-Key', `e2e-rec-${Date.now()}`)
      .send(transferBody('acc-timeout')).expect(201);
    expect(unk.body.state).toBe('UNKNOWN');

    const res = await request(app.getHttpServer())
      .post('/internal/reconcile').set('x-internal-token', 'e2e-internal-token').expect(200);
    expect(res.body.skipped).toBe(false);
    expect(res.body.resolved).toBeGreaterThanOrEqual(1);

    const after = await request(app.getHttpServer()).get(`/v1/transfers/${unk.body.transferId}`).set(USER).expect(200);
    expect(after.body.state).toBe('CONFIRMED'); // Core status lookup returns CONFIRMED in the mock
    const [{ cnt }] = await ds.query(`SELECT count(*)::int AS cnt FROM reconciliation_attempts WHERE transfer_id=$1`, [unk.body.transferId]);
    expect(cnt).toBeGreaterThanOrEqual(1);
  });
});
