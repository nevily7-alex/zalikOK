import 'server-only';
import { prisma } from './db';
import { safeEqual, sha256 } from './crypto';
import { intEnv } from './env';

export const sessionTtlMs = () => intEnv('ABANDONED_UPLOAD_HOURS', 24) * 3600 * 1000;

/** Сесія валідна лише з правильним секретом, незакрита та непрострочена. */
export async function authorizeSession(sessionId: unknown, secret: string | null) {
  if (typeof sessionId !== 'string' || !/^[0-9a-f-]{36}$/.test(sessionId) || !secret) return null;
  const session = await prisma.uploadSession.findUnique({ where: { id: sessionId } });
  if (!session || session.closedAt || session.expiresAt < new Date()) return null;
  return safeEqual(session.secretHash, sha256(secret)) ? session : null;
}
