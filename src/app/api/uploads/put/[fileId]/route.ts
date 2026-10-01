import { prisma } from '@/lib/server/db';
import { apiError, forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { verifyLocalPut, writeLocal, storage } from '@/lib/server/storage';
import { env } from '@/lib/server/env';
import { MAX_FILE_BYTES } from '@/lib/upload-rules';

/**
 * Локальний аналог підписаного PUT (STORAGE_DRIVER=local, лише розробка).
 * Підпис прив'язує fileId, термін дії та точний розмір; сервер читає не більше заявленого.
 */
export async function PUT(req: Request, ctx: { params: Promise<{ fileId: string }> }) {
  if (env('STORAGE_DRIVER') === 's3') return apiError(404, 'not_found', 'Не знайдено.');
  if (!sameOrigin(req)) return forbiddenOrigin();
  const { fileId } = await ctx.params;
  const url = new URL(req.url);
  const exp = Number(url.searchParams.get('e'));
  const sig = url.searchParams.get('s') ?? '';
  if (!/^[0-9a-f-]{36}$/.test(fileId)) return apiError(404, 'not_found', 'Не знайдено.');

  const att = await prisma.attachment.findUnique({ where: { id: fileId }, include: { session: true } });
  if (!att || att.state !== 'slot' || att.session.closedAt || att.session.expiresAt < new Date()) {
    return apiError(403, 'bad_slot', 'Слот завантаження недійсний.');
  }
  if (!Number.isFinite(exp) || !verifyLocalPut(fileId, exp, att.sizeBytes, sig)) {
    return apiError(403, 'bad_signature', 'Недійсний підпис завантаження.');
  }
  const declared = Number(req.headers.get('content-length'));
  if (!Number.isFinite(declared) || declared !== att.sizeBytes || declared > MAX_FILE_BYTES) {
    return apiError(422, 'size_mismatch', 'Розмір файлу не збігається із заявленим.');
  }
  if (!req.body) return apiError(400, 'empty', 'Порожнє тіло запиту.');
  try {
    const written = await writeLocal(att.storageKey, req.body, att.sizeBytes);
    if (written !== att.sizeBytes) {
      await storage().remove(att.storageKey);
      return apiError(422, 'size_mismatch', 'Розмір файлу не збігається із заявленим.');
    }
  } catch {
    return apiError(422, 'upload_failed', 'Не вдалося прийняти файл.');
  }
  return json({ ok: true });
}
