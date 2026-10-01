// Обробка черги сповіщень (запуск за розкладом, напр. щохвилини): npm run outbox:run
import 'dotenv/config';
import { processOutbox, notificationsEnabled } from '../src/lib/server/notify';
import { prisma } from '../src/lib/server/db';

const stats = await processOutbox(50);
console.log(JSON.stringify({ notificationsEnabled: notificationsEnabled(), ...stats }));
await prisma.$disconnect();
