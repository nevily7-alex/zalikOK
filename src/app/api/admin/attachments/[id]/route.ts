import { apiError } from '@/lib/server/http';
import { prisma } from '@/lib/server/db';
import { decideDownload } from '@/lib/server/downloads';
import { getAccess } from '@/lib/server/guard';
import { storage } from '@/lib/server/storage';

/**
 * Завантаження вкладення лише менеджером. clean — можна; rejected — ніколи; pending — лише за явного
 * ALLOW_UNSCANNED_DOWNLOAD=true і підтвердження ?unscanned=1 (із записом у журнал).
 */
export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const access = await getAccess();
  if (access.kind === 'anonymous') return apiError(401, 'unauthorized', 'Потрібна авторизація.');
  if (access.kind === 'forbidden') return apiError(403, 'forbidden', 'Недостатньо прав.');

  const { id } = await ctx.params;
  if (!/^[0-9a-f-]{36}$/.test(id)) return apiError(404, 'not_found', 'Файл не знайдено.');
  const att = await prisma.attachment.findUnique({ where: { id } });
  if (!att || !att.requestId || att.state !== 'stored') return apiError(404, 'not_found', 'Файл не знайдено.');

  const decision = decideDownload(att.scanStatus, new URL(req.url).searchParams.get('unscanned') === '1');
  if (decision === 'blocked_rejected') return apiError(423, 'rejected', 'Файл відхилено перевіркою, завантаження заборонено.');
  if (decision === 'blocked_pending') {
    return apiError(423, 'not_scanned', 'Файл ще не пройшов перевірку, завантаження заблоковано.');
  }
  if (decision === 'confirm_required') {
    return apiError(423, 'confirmation_required', 'Файл не перевірено автоматично. Підтвердьте завантаження в картці заявки.');
  }

  await prisma.auditLog.create({
    data: {
      actorId: access.manager.id,
      requestId: att.requestId,
      action: decision === 'ok_unscanned' ? 'attachment.download_unscanned' : 'attachment.download',
      meta: { attachmentId: att.id },
    },
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
