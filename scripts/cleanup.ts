// Очищення: прострочені завантаження, ключі ідемпотентності, ліміти, заявки після строку зберігання.
// Запуск за розкладом (cron/планувальник хостингу): npm run cleanup [-- --dry-run]
// Те саме виконує ендпоінт GET /api/cron/cleanup (потрібен CRON_SECRET).
import 'dotenv/config';
import { prisma } from '../src/lib/server/db';
import { runCleanup } from '../src/lib/server/cleanup';

const report = await runCleanup(process.argv.includes('--dry-run'));
console.log(JSON.stringify(report));
await prisma.$disconnect();
