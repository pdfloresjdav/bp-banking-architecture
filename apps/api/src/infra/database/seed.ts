/*
 * Platform seeds. Fictitious FINANCIAL data (customers, accounts, movements) lives in the
 * simulated Core (WireMock: infrastructure/mocks/wiremock), not in this database.
 * Here we only verify connectivity and leave the operational tables ready (empty).
 */
import { loadConfig } from '../../config/configuration';
import { createDataSource } from './data-source';

async function main(): Promise<void> {
  const cfg = loadConfig();
  const ds = createDataSource(cfg);
  await ds.initialize();
  const [{ count }] = await ds.query('SELECT count(*)::int AS count FROM transfers');
  // eslint-disable-next-line no-console
  console.log(
    JSON.stringify({
      level: 'info',
      message: 'seed ok (financial data in WireMock; operational tables ready)',
      transfers: count,
    }),
  );
  await ds.destroy();
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(JSON.stringify({ level: 'error', message: 'seed failed', error: String(err) }));
  process.exit(1);
});
