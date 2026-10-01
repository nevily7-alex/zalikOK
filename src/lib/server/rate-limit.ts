import 'server-only';
import { prisma } from './db';

export interface LimitResult {
  allowed: boolean;
  retryAfter: number;
}

/**
 * Фіксоване вікно у спільному сховищі (PostgreSQL), атомарний upsert.
 * Записи мають TTL (resetAt), тому спільний мобільний IP не блокується назавжди.
 */
export async function hit(key: string, max: number, windowSeconds: number): Promise<LimitResult> {
  const now = new Date();
  const resetAt = new Date(now.getTime() + windowSeconds * 1000);
  const rows = await prisma.$queryRaw<{ count: number; resetAt: Date }[]>`
    INSERT INTO "RateLimit" ("key", "count", "resetAt") VALUES (${key}, 1, ${resetAt})
    ON CONFLICT ("key") DO UPDATE SET
      "count" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN 1 ELSE "RateLimit"."count" + 1 END,
      "resetAt" = CASE WHEN "RateLimit"."resetAt" < ${now} THEN ${resetAt} ELSE "RateLimit"."resetAt" END
    RETURNING "count", "resetAt"`;
  const row = rows[0]!;
  const allowed = row.count <= max;
  return { allowed, retryAfter: allowed ? 0 : Math.max(1, Math.ceil((row.resetAt.getTime() - Date.now()) / 1000)) };
}
