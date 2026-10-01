import { apiError } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { getAccess } from '@/lib/server/guard';
import { storage } from '@/lib/server/storage';

/** Завантаження вкладення лише менеджером і лише після успішної перевірки (scanStatus=clean). */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (access.kind === 'anonymous') return apiError(401, 'unauthorized', 'Потрібна авторизація.');
  if (access.kind === 'forbidden') return apiError(403, 'forbidden', 'Недостатньо прав.');

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(404, 'not_found', 'Файл не знайдено.');
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att || !att.requestId || att.state !== 'stored') return apiError(404, 'not_found', 'Файл не знайдено.');
  if (att.scanStatus !== 'clean') {
    return apiError(423, 'not_scanned', 'Файл ще не пройшов перевірку, завантаження заблоковано.');
  }

  await prisma.auditLog.create({
    data: { actorId: access.manager.id, requestId: att.requestId, action: 'attachment.download', meta: { attachmentId: att.id } },
  });
  const body = await storage().stream(att.storageKey);
  const ascii = att.originalFilename.replace(/[^\w.\-]+/g, '_');
  return new Response(body, {
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(att.sizeBytes),
      'Content-Disposition': `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(att.originalFilename)}`,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'private, no-store',
    },
  });
}
