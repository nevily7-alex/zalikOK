import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { apiError, forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { storage } from '@/lib/server/storage';
import { authorizeSession } from '@/lib/server/upload-session';

const bodySchema = z.object({ sessionId: z.string(), fileId: z.string() });

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request', 'Некоректний запит.');
  const session = await authorizeSession(parsed.data.sessionId, req.headers.get('x-upload-secret'));
  if (!session) return apiError(403, 'bad_session', 'Сесію завантаження не знайдено або її завершено.');
  const att = await prisma.attachment.findFirst({
    where: { id: parsed.data.fileId, sessionId: session.id, requestId: null },
  });
  if (att) {
    await storage().remove(att.storageKey).catch(() => undefined);
    await prisma.attachment.delete({ where: { id: att.id } });
  }
  return json({ ok: true });
}
