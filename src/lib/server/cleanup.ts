import 'server-only';
import { prisma } from './db';
import { intEnv } from './env';
import { storage } from './storage';
import { getSiteConfig } from '@/lib/site-config';

export interface CleanupReport {
  dryRun: boolean;
  retentionDays: number;
  expiredSessions: number;
  expiredFiles: number;
  idempotencyKeysCleared: number;
  rateLimitRows: number;
  authRateLimitRows: number;
  requestsPastRetention: number;
}

/**
 * Очищення: прострочені завантаження, ключі ідемпотентності (>24 год), лічильники rate limit,
 * заявки після строку зберігання. Використовується скриптом `npm run cleanup` і ендпоінтом /api/cron/cleanup.
 */
export async function runCleanup(dryRun = false): Promise<CleanupReport> {
  const store = storage();
  const now = new Date();

  const expired = await prisma.uploadSession.findMany({
    where: { closedAt: null, expiresAt: { lt: now } },
    include: { attachments: true },
  });
  let files = 0;
  for (const s of expired) {
    for (const a of s.attachments) {
      files++;
      if (!dryRun) await store.remove(a.storageKey).catch(() => undefined);
    }
    if (!dryRun) await prisma.uploadSession.delete({ where: { id: s.id } });
  }

  const idemCutoff = new Date(now.getTime() - 24 * 3600 * 1000);
  const idemWhere = { idempotencyKeyHash: { not: null }, createdAt: { lt: idemCutoff } };
  const idempotencyKeysCleared = dryRun
    ? await prisma.request.count({ where: idemWhere })
    : (await prisma.request.updateMany({ where: idemWhere, data: { idempotencyKeyHash: null } })).count;

  const rateLimitRows = dryRun
    ? await prisma.rateLimit.count({ where: { resetAt: { lt: now } } })
    : (await prisma.rateLimit.deleteMany({ where: { resetAt: { lt: now } } })).count;

  // Записи ліміту входу старші за добу (lastRequest у мілісекундах)
  const authCutoff = BigInt(now.getTime() - 24 * 3600 * 1000);
  const authRateLimitRows = dryRun
    ? await prisma.authRateLimit.count({ where: { lastRequest: { lt: authCutoff } } })
    : (await prisma.authRateLimit.deleteMany({ where: { lastRequest: { lt: authCutoff } } })).count;

  // Строк зберігання після закриття заявки (значення підтверджує власник до публікації)
  const retentionDays = intEnv('FILE_RETENTION_DAYS', getSiteConfig().retentionDaysAfterClosure);
  const retentionCutoff = new Date(now.getTime() - retentionDays * 24 * 3600 * 1000);
  const old = await prisma.request.findMany({ where: { closedAt: { lt: retentionCutoff } }, include: { attachments: true } });
  for (const r of old) {
    if (dryRun) continue;
    for (const a of r.attachments) await store.remove(a.storageKey).catch(() => undefined);
    await prisma.request.delete({ where: { id: r.id } });
  }

  return {
    dryRun,
    retentionDays,
    expiredSessions: expired.length,
    expiredFiles: files,
    idempotencyKeysCleared,
    rateLimitRows,
    authRateLimitRows,
    requestsPastRetention: old.length,
  };
}
