import { checkCron } from '@/lib/server/cron-auth';
import { json } from '@/lib/server/http';
import { enqueueDeadlineReminders, notificationsEnabled, processOutbox } from '@/lib/server/notify';

export const maxDuration = 60;

/** Щодоби: нагадування про дедлайни за 3 дні + обробка черги сповіщень (повтори після збоїв). */
async function handle(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  const reminders = await enqueueDeadlineReminders();
  const stats = await processOutbox(50);
  return json({ notificationsEnabled: notificationsEnabled(), reminders, ...stats });
}

export const GET = handle;
export const POST = handle;
