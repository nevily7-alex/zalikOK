import { checkCron } from '@/lib/server/cron-auth';
import { json } from '@/lib/server/http';
import { notificationsEnabled, processOutbox } from '@/lib/server/notify';

export const maxDuration = 60;

/** Обробка черги сповіщень за розкладом (повтори після збоїв). Запускати щохвилини-кілька хвилин. */
async function handle(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  const stats = await processOutbox(50);
  return json({ notificationsEnabled: notificationsEnabled(), ...stats });
}

export const GET = handle;
export const POST = handle;
