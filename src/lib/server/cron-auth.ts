import 'server-only';
import { safeEqual } from './crypto';
import { env } from './env';
import { apiError } from './http';

/**
 * Захист cron-ендпоінтів. Планувальник надсилає `Authorization: Bearer <CRON_SECRET>`
 * (так робить Vercel Cron; для інших — додайте заголовок вручну). Без CRON_SECRET ендпоінти вимкнені.
 */
export function checkCron(req: Request): Response | null {
  const secret = env('CRON_SECRET');
  if (!secret) return apiError(404, 'not_found', 'Не знайдено.');
  const header = req.headers.get('authorization') ?? '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token || !safeEqual(token, secret)) return apiError(401, 'unauthorized', 'Потрібна авторизація.');
  return null;
}
