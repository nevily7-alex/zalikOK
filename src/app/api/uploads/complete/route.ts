import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { apiError, forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { storage } from '@/lib/server/storage';
import { authorizeSession } from '@/lib/server/upload-session';
import { checkFile } from '@/lib/server/file-checks';
import { scanObject } from '@/lib/server/scan';
import type { AllowedKind } from '@/lib/upload-rules';

const bodySchema = z.object({ sessionId: z.string(), fileId: z.string() });

/** Перевіряє факт завантаження, розмір, сигнатуру; невдалі файли видаляються. */
export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return apiError(400, 'bad_request', 'Некоректний запит.');
  const session = await authorizeSession(parsed.data.sessionId, req.headers.get('x-upload-secret'));
  if (!session) return apiError(403, 'bad_session', 'Сесію завантаження не знайдено або її завершено.');

  const att = await prisma.attachment.findFirst({ where: { id: parsed.data.fileId, sessionId: session.id } });
  if (!att) return apiError(404, 'not_found', 'Файл не знайдено.');
  if (att.state === 'stored') return json({ fileId: att.id, scanStatus: att.scanStatus });

  const store = storage();
  const reject = async (reason: string) => {
    await store.remove(att.storageKey).catch(() => undefined);
    await prisma.attachment.delete({ where: { id: att.id } }).catch(() => undefined);
    return apiError(422, 'file_rejected', reason);
  };

  const actual = await store.size(att.storageKey);
  if (actual === null) return apiError(409, 'not_uploaded', 'Файл ще не завантажено.');
  if (actual !== att.sizeBytes) return reject('Розмір файлу не збігається із заявленим.');

  // Для DOCX потрібен центральний каталог у кінці файлу, тому читаємо весь файл (до 10 МіБ)
  const buf = await store.read(att.storageKey, 0, att.sizeBytes - 1);
  const result = checkFile(buf, att.declaredKind as AllowedKind);
  if (!result.ok) return reject(result.reason);

  const scanStatus = await scanObject(att.storageKey);
  if (scanStatus === 'rejected') return reject('Файл не пройшов антивірусну перевірку.');

  await prisma.attachment.update({
    where: { id: att.id },
    data: { state: 'stored', detectedMime: result.mime, scanStatus },
  });
  return json({ fileId: att.id, scanStatus });
}
