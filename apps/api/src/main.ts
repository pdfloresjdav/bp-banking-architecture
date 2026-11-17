import 'reflect-metadata';
import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { StructuredLogger } from '@bp/shared';
import { AppModule } from './app.module';
import { TOKENS } from './common/tokens';
import { HttpExceptionFilter } from './common/http-exception.filter';
import { AppConfig } from './config/configuration';
import { OutboxPublisher } from './infra/messaging/outbox-publisher';
import { RabbitClient } from './infra/messaging/rabbit.client';
import { NotificationHandler } from './modules/notifications/application/notification.handler';
import { startConsumers } from './infra/messaging/consumers';
import { AuditPort, ProcessedStorePort } from '@bp/domain';

async function bootstrap(): Promise<void> {
  const logger = new StructuredLogger('bootstrap');
  const app = await NestFactory.create(AppModule, { bufferLogs: false });
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.useGlobalFilters(new HttpExceptionFilter());

  const cfg = app.get<AppConfig>(TOKENS.Config);

  // Messaging startup: Outbox publisher + consumers.
  const outbox = app.get<OutboxPublisher>(TOKENS.OutboxPublisher);
  outbox.start();
  const rabbit = app.get<RabbitClient>(TOKENS.Rabbit);
  const notifier = app.get<NotificationHandler>(TOKENS.NotificationHandler);
  const audit = app.get<AuditPort>(TOKENS.AuditPort);
  const processed = app.get<ProcessedStorePort>(TOKENS.ProcessedStore);
  await startConsumers(rabbit, notifier, audit, processed);

  await app.listen(cfg.port);
  logger.info('API listening', { port: cfg.port, devAuthBypass: cfg.devAuthBypass });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', message: 'bootstrap failed', error: String(err) }));
  process.exit(1);
});
