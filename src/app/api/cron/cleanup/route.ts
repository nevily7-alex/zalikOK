import { checkCron } from '@/lib/server/cron-auth';
import { runCleanup } from '@/lib/server/cleanup';
import { json } from '@/lib/server/http';

export const maxDuration = 60;

/** Щоденне очищення (прострочені завантаження, ключі, ліміти, строк зберігання). ?dryRun=1 — лише підрахунок. */
async function handle(req: Request) {
  const denied = checkCron(req);
  if (denied) return denied;
  const dryRun = new URL(req.url).searchParams.get('dryRun') === '1';
  return json(await runCleanup(dryRun));
}

export const GET = handle;
export const POST = handle;
