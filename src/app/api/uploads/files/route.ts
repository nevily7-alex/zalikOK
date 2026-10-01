import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { apiError, clientKey, forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { hit } from '@/lib/server/rate-limit';
import { storage } from '@/lib/server/storage';
import { authorizeSession } from '@/lib/server/upload-session';
import {
  ALLOWED_TYPES,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  kindFromExt,
  sanitizeFilename,
} from '@/lib/upload-rules';

const bodySchema = z.object({
  sessionId: z.string(),
  name: z.string().min(1).max(255),
  size: z.number().int().positive(),
});

/** Видає слот для завантаження: ключ і підписаний PUT-URL з обмеженнями розміру/типу. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request', 'Некоректний запит.');
  const { sessionId, name, size } = parsed.data;

  const session = await authorizeSession(sessionId, req.headers.get('x-upload-secret'));
  if (!session) return apiError(403, 'bad_session', 'Сесію завантаження не знайдено або її завершено.');

  const limit = await hit(`upload-file:${clientKey(req)}`, 60, 15 * 60);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Забагато спроб. Зачекайте трохи та повторіть.', undefined, {
      'Retry-After': String(limit.retryAfter),
    });
  }

  const kind = kindFromExt(name);
  if (!kind) return apiError(422, 'bad_type', 'Формат файлу не підходить. Дозволено PDF, DOCX, PNG, JPG.');
  if (size > MAX_FILE_BYTES) return apiError(422, 'too_large', 'Файл перевищує 10 МіБ.');

  const existing = await prisma.attachment.findMany({ where: { sessionId }, select: { sizeBytes: true } });
  if (existing.length >= MAX_FILES) return apiError(422, 'too_many', `Можна додати не більше ${MAX_FILES} файлів.`);
  if (existing.reduce((s, a) => s + a.sizeBytes, 0) + size > MAX_TOTAL_BYTES) {
    return apiError(422, 'total_too_large', 'Перевищено загальний ліміт 25 МіБ.');
  }

  const id = randomUUID();
  const storageKey = `${sessionId}/${id}`;
  await prisma.attachment.create({
    data: {
      id,
      sessionId,
      originalFilename: sanitizeFilename(name),
      storageKey,
      declaredKind: kind,
      sizeBytes: size,
    },
  });
  const target = await storage().createUploadTarget(storageKey, id, size, ALLOWED_TYPES[kind].mime);
  return json({ fileId: id, url: target.url, headers: target.headers }, 201);
}
