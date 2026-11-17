/* Applies the SQL schema (idempotent) against PostgreSQL. */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadConfig } from '../../config/configuration';
import { createDataSource } from './data-source';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const ds = createDataSource(cfg);
  await ds.initialize();
  const sql = readFileSync(join(__dirname, 'schema.sql'), 'utf8');
  await ds.query(sql);
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({ level: 'info', message: 'migrations applied', db: cfg.database.name }));
  await ds.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', message: 'migration failed', error: String(err) }));
  process.exit(1);
});
