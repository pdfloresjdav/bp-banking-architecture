/** Dependency-injection tokens (ports → adapters). */
export const TOKENS = {
  Config: Symbol('Config'),
  DataSource: Symbol('DataSource'),
  Redis: Symbol('Redis'),
  Rabbit: Symbol('Rabbit'),
  CorePort: Symbol('CorePort'),
  CachePort: Symbol('CachePort'),
  EventBus: Symbol('EventBus'),
  AuditPort: Symbol('AuditPort'),
  ProcessedStore: Symbol('ProcessedStore'),
  AccountAuthorization: Symbol('AccountAuthorization'),
  TransferRepository: Symbol('TransferRepository'),
  TransferService: Symbol('TransferService'),
  MovementsService: Symbol('MovementsService'),
  OutboxPublisher: Symbol('OutboxPublisher'),
  NotificationHandler: Symbol('NotificationHandler'),
  ReconciliationService: Symbol('ReconciliationService'),
} as const;
