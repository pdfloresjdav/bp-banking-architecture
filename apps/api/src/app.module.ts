import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import Redis from 'ioredis';
import { DataSource } from 'typeorm';
import {
  AccountAuthorizationPort,
  TransferService,
} from './modules/transfers/application/transfer.service';
import { MovementsService } from './modules/movements/application/movements.service';
import { NotificationHandler } from './modules/notifications/application/notification.handler';
import { AppConfig, loadConfig } from './config/configuration';
import { TOKENS } from './common/tokens';
import { CorrelationMiddleware } from './common/correlation.middleware';
import { createDataSource } from './infra/database/data-source';
import { TypeOrmTransferRepository } from './infra/database/typeorm-transfer.repository';
import { TypeOrmAuditAdapter } from './infra/database/typeorm-audit.adapter';
import { TypeOrmProcessedStore } from './infra/database/typeorm-processed.store';
import { RedisCacheAdapter } from './infra/cache/redis-cache.adapter';
import { RabbitClient } from './infra/messaging/rabbit.client';
import { RabbitEventBusAdapter } from './infra/messaging/rabbit-event-bus.adapter';
import { OutboxPublisher } from './infra/messaging/outbox-publisher';
import { HttpCoreAdapter } from './infra/core-integration/http-core.adapter';
import { CoreAccountAuthorizationAdapter } from './modules/accounts/application/account-authorization.adapter';
import { MockEmailAdapter, MockPushAdapter, NotificationLogAdapter } from './infra/notifications/mock-adapters';
import {
  AuditPort,
  CachePort,
  CorePort,
  EventBusPort,
  ProcessedStorePort,
  TransferRepositoryPort,
} from '@bp/domain';
import { AuthGuard } from './modules/identity/auth.guard';
import { BffController } from './modules/identity/bff.controller';
import { ReconciliationService } from './modules/transfers/application/reconciliation.service';
import { InternalTokenGuard } from './modules/internal/internal-token.guard';
import { ReconciliationController } from './modules/internal/reconciliation.controller';
import { TransferController } from './modules/transfers/transfer.controller';
import { MovementsController } from './modules/movements/movements.controller';
import { AccountsController } from './modules/accounts/accounts.controller';
import { CustomerController } from './modules/customer/customer.controller';
import { AuditController } from './modules/audit/audit.controller';
import { HealthController } from './modules/health/health.controller';

@Module({
  controllers: [
    BffController,
    TransferController,
    MovementsController,
    AccountsController,
    CustomerController,
    AuditController,
    HealthController,
    ReconciliationController,
  ],
  providers: [
    AuthGuard,
    InternalTokenGuard,
    { provide: TOKENS.Config, useFactory: loadConfig },
    {
      provide: TOKENS.DataSource,
      inject: [TOKENS.Config],
      useFactory: async (cfg: AppConfig): Promise<DataSource> => {
        const ds = createDataSource(cfg);
        await ds.initialize();
        return ds;
      },
    },
    {
      provide: TOKENS.Redis,
      inject: [TOKENS.Config],
      useFactory: (cfg: AppConfig): Redis => new Redis({ host: cfg.redis.host, port: cfg.redis.port, maxRetriesPerRequest: null }),
    },
    {
      provide: TOKENS.Rabbit,
      inject: [TOKENS.Config],
      useFactory: async (cfg: AppConfig): Promise<RabbitClient> => {
        const client = new RabbitClient(cfg.rabbit.url);
        await client.connect();
        return client;
      },
    },
    {
      provide: TOKENS.CorePort,
      inject: [TOKENS.Config],
      useFactory: (cfg: AppConfig): CorePort => new HttpCoreAdapter(cfg.core.baseUrl, cfg.core.timeoutMs),
    },
    {
      provide: TOKENS.CachePort,
      inject: [TOKENS.Redis],
      useFactory: (redis: Redis): CachePort => new RedisCacheAdapter(redis),
    },
    {
      provide: TOKENS.EventBus,
      inject: [TOKENS.Rabbit],
      useFactory: (rabbit: RabbitClient): EventBusPort => new RabbitEventBusAdapter(rabbit),
    },
    {
      provide: TOKENS.AuditPort,
      inject: [TOKENS.DataSource],
      useFactory: (ds: DataSource): TypeOrmAuditAdapter => new TypeOrmAuditAdapter(ds),
    },
    {
      provide: TOKENS.ProcessedStore,
      inject: [TOKENS.DataSource],
      useFactory: (ds: DataSource): ProcessedStorePort => new TypeOrmProcessedStore(ds),
    },
    {
      provide: TOKENS.AccountAuthorization,
      inject: [TOKENS.CorePort],
      useFactory: (core: CorePort): AccountAuthorizationPort => new CoreAccountAuthorizationAdapter(core),
    },
    {
      provide: TOKENS.TransferRepository,
      inject: [TOKENS.DataSource],
      useFactory: (ds: DataSource): TransferRepositoryPort => new TypeOrmTransferRepository(ds),
    },
    {
      provide: TOKENS.TransferService,
      inject: [TOKENS.TransferRepository, TOKENS.CorePort, TOKENS.AccountAuthorization, TOKENS.AuditPort],
      useFactory: (
        repo: TransferRepositoryPort,
        core: CorePort,
        accounts: AccountAuthorizationPort,
        audit: AuditPort,
      ): TransferService => new TransferService(repo, core, accounts, audit),
    },
    {
      provide: TOKENS.MovementsService,
      inject: [TOKENS.CorePort, TOKENS.CachePort, TOKENS.AccountAuthorization, TOKENS.Config],
      useFactory: (
        core: CorePort,
        cache: CachePort,
        accounts: AccountAuthorizationPort,
        cfg: AppConfig,
      ): MovementsService => new MovementsService(core, cache, accounts, cfg.cacheTtlSeconds),
    },
    {
      provide: TOKENS.OutboxPublisher,
      inject: [TOKENS.DataSource, TOKENS.EventBus],
      useFactory: (ds: DataSource, bus: EventBusPort): OutboxPublisher => new OutboxPublisher(ds, bus),
    },
    {
      provide: TOKENS.NotificationHandler,
      inject: [TOKENS.ProcessedStore, TOKENS.DataSource],
      useFactory: (processed: ProcessedStorePort, ds: DataSource): NotificationHandler =>
        new NotificationHandler(processed, new MockEmailAdapter(), new MockPushAdapter(), new NotificationLogAdapter(ds)),
    },
    {
      provide: TOKENS.ReconciliationService,
      inject: [TOKENS.DataSource, TOKENS.TransferRepository, TOKENS.CorePort, TOKENS.AuditPort],
      useFactory: (
        ds: DataSource,
        repo: TransferRepositoryPort,
        core: CorePort,
        audit: AuditPort,
      ): ReconciliationService => new ReconciliationService(ds, repo, core, audit),
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer): void {
    consumer.apply(CorrelationMiddleware).forRoutes('*');
  }
}
