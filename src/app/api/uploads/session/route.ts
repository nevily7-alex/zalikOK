import { prisma } from '@/lib/server/db';
import { randomToken, sha256 } from '@/lib/server/crypto';
import { apiError, clientKey, forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { hit } from '@/lib/server/rate-limit';
import { sessionTtlMs } from '@/lib/server/upload-session';

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const limit = await hit(`upload-session:${clientKey(req)}`, 20, 15 * 60);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Забагато спроб. Зачекайте трохи та повторіть.', undefined, {
      'Retry-After': String(limit.retryAfter),
    });
  }
  const secret = randomToken(32);
  const expiresAt = new Date(Date.now() + sessionTtlMs());
  const session = await prisma.uploadSession.create({ data: { secretHash: sha256(secret), expiresAt } });
  return json({ sessionId: session.id, secret, expiresAt: expiresAt.toISOString() }, 201);
}
