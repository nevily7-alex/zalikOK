// Локальна PostgreSQL для розробки (embedded-postgres). Не для production.
import EmbeddedPostgres from 'embedded-postgres';
import fs from 'node:fs';
import path from 'node:path';

const dataDir = path.resolve('.data/pg');
const port = Number(process.env.DEV_DB_PORT ?? 54329);
const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'zalikok',
  password: 'zalikok',
  port,
  persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const fresh = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (fresh) await pg.initialise();
await pg.start();
if (fresh) await pg.createDatabase('zalikok');
console.log(`PostgreSQL запущено: postgresql://zalikok:zalikok@localhost:${port}/zalikok`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => undefined, 1 << 30);
