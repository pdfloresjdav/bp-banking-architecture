import { DataSource } from 'typeorm';
import { AppConfig } from '../../config/configuration';

export const DATA_SOURCE = Symbol('DATA_SOURCE');

export function createDataSource(cfg: AppConfig): DataSource {
  return new DataSource({
    type: 'postgres',
    host: cfg.database.host,
    port: cfg.database.port,
    username: cfg.database.user,
    password: cfg.database.password,
    database: cfg.database.name,
    synchronize: false,
    logging: false,
    entities: [],
  });
}
