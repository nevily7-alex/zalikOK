import { Prisma } from '@/generated/prisma/client';
import { after } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { newReference, safeEqual, sha256 } from '@/lib/server/crypto';
import { apiError, clientKey, forbiddenOrigin, json, sameOrigin } from '@/lib/server/http';
import { hit } from '@/lib/server/rate-limit';
import { intEnv } from '@/lib/server/env';
import { processOutbox } from '@/lib/server/notify';
import { getSiteConfig } from '@/lib/site-config';
import { MAX_FILES, MAX_TOTAL_BYTES } from '@/lib/upload-rules';
import { normalizeContact, validateRequest } from '@/lib/validation';

export const maxDuration = 30;
const MAX_BODY_BYTES = 64 * 1024;

const extraSchema = z.object({
  uploadSessionId: z.string().optional(),
  uploadSecret: z.string().optional(),
  fileIds: z.array(z.string().regex(/^[0-9a-f-]{36}$/)).max(MAX_FILES).optional().default([]),
  utm: z
    .record(z.string(), z.string().max(100))
    .optional(),
});

const UTM_ALLOWED = ['utm_source', 'utm_medium', 'utm_campaign'];

function view(r: { id: string; publicReference: string }) {
  return { requestId: r.id, reference: r.publicReference, status: 'received' as const };
}

export async function POST(req: Request) {
  if (!sameOrigin(req)) return forbiddenOrigin();

  const idemKey = req.headers.get('idempotency-key');
  if (!idemKey || idemKey.length < 8 || idemKey.length > 128 || !/^[\w.:-]+$/.test(idemKey)) {
    return apiError(400, 'idempotency_key_required', 'Потрібен заголовок Idempotency-Key.');
  }

  const raw = await req.text();
  if (raw.length > MAX_BODY_BYTES) return apiError(413, 'payload_too_large', 'Запит завеликий.');
  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return apiError(400, 'bad_json', 'Некоректний формат запиту.');
  }

  const keyHash = sha256(`idem:${idemKey}`);
  const bodyHash = sha256(raw);

  // Повтор із тим самим ключем (напр., після таймауту) не створює дубль
  const existing = await prisma.request.findUnique({ where: { idempotencyKeyHash: keyHash } });
  if (existing) {
    if (existing.bodyHash && existing.bodyHash !== bodyHash) {
      return apiError(409, 'idempotency_conflict', 'Цей ключ уже використано для іншої заявки.');
    }
    return json(view(existing), 200);
  }

  const parsed = validateRequest(body);
  if (!parsed.success) {
    return apiError(422, 'validation_failed', 'Перевірте виділені поля.', { errors: parsed.errors });
  }
  const data = parsed.data;

  const limit = await hit(`request:${clientKey(req)}`, intEnv('RATE_LIMIT_MAX', 5), intEnv('RATE_LIMIT_WINDOW_MINUTES', 15) * 60);
  if (!limit.allowed) {
    return apiError(429, 'rate_limited', 'Забагато спроб. Зачекайте трохи та повторіть надсилання.', undefined, {
      'Retry-After': String(limit.retryAfter),
    });
  }

  if (data.honeypot) return apiError(400, 'rejected', 'Запит відхилено.');
  const contact = normalizeContact(data.contactMethod, data.contact);
  if (!contact) return apiError(422, 'validation_failed', 'Перевірте виділені поля.', { errors: { contact: 'Некоректний контакт.' } });

  const extra = extraSchema.safeParse(body);
  if (!extra.success) return apiError(400, 'bad_request', 'Некоректний запит.');
  const { uploadSessionId, uploadSecret, fileIds } = extra.data;

  // ---- Вкладення: лише з власної, незакритої сесії, після перевірки ----
  let session: { id: string } | null = null;
  if (fileIds.length > 0) {
    if (!uploadSessionId || !uploadSecret) return apiError(403, 'bad_session', 'Недійсна сесія завантаження.');
    const s = await prisma.uploadSession.findUnique({ where: { id: uploadSessionId } });
    if (!s || s.closedAt || s.expiresAt < new Date() || !safeEqual(s.secretHash, sha256(uploadSecret))) {
      return apiError(403, 'bad_session', 'Недійсна сесія завантаження.');
    }
    const atts = await prisma.attachment.findMany({ where: { id: { in: fileIds }, sessionId: s.id } });
    const unique = new Set(fileIds);
    if (
      atts.length !== unique.size ||
      atts.some((a) => a.state !== 'stored' || a.requestId !== null || a.scanStatus === 'rejected') ||
      atts.reduce((sum, a) => sum + a.sizeBytes, 0) > MAX_TOTAL_BYTES
    ) {
      return apiError(403, 'bad_files', 'Один або кілька файлів недоступні для цієї заявки.');
    }
    session = s;
  }

  const utm = extra.data.utm
    ? Object.fromEntries(Object.entries(extra.data.utm).filter(([k]) => UTM_ALLOWED.includes(k)))
    : undefined;

  try {
    const created = await prisma.$transaction(async (tx) => {
      const r = await tx.request.create({
        data: {
          publicReference: newReference(),
          service: data.service,
          workType: data.workType ?? null,
          discipline: data.discipline,
          disciplineOther: data.discipline === 'other' ? data.disciplineOther : null,
          topic: data.topicUnknown && !data.topic ? '' : data.topic,
          topicUnknown: data.topicUnknown,
          deadline: new Date(`${data.deadline}T00:00:00Z`),
          pages: data.pages ?? null,
          contactMethod: data.contactMethod,
          contact,
          comment: data.comment,
          privacyPolicyVersion: getSiteConfig().privacyPolicyVersion,
          consentAt: new Date(),
          idempotencyKeyHash: keyHash,
          bodyHash,
          sourceUtm: utm && Object.keys(utm).length ? utm : undefined,
        },
      });
      if (session) {
        await tx.attachment.updateMany({ where: { id: { in: fileIds }, sessionId: session.id }, data: { requestId: r.id } });
        await tx.uploadSession.update({ where: { id: session.id }, data: { closedAt: new Date() } });
      }
      await tx.notificationOutbox.create({ data: { requestId: r.id, channel: 'telegram' } });
      await tx.auditLog.create({ data: { requestId: r.id, action: 'request.created', meta: { files: fileIds.length } } });
      return r;
    });
    // Після відповіді клієнту; на serverless-хостингах `after` дає функції дозавершити відправку сповіщення
    after(() => processOutbox().catch(() => undefined));
    return json(view(created), 201);
  } catch (e) {
    // Гонка двох однакових запитів: повертаємо вже створену заявку
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      const again = await prisma.request.findUnique({ where: { idempotencyKeyHash: keyHash } });
      if (again) return json(view(again), 200);
    }
    console.error('request.create failed', e instanceof Error ? e.name : 'error', (e as { code?: string }).code, e instanceof Error ? e.message.slice(-300) : '');
    return apiError(500, 'server_error', 'Не вдалося зберегти заявку. Спробуйте ще раз.');
  }
}
