'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import { processOutbox } from '@/lib/server/notify';
import { STATUSES } from '@/lib/admin-labels';

const idSchema = z.string().uuid();

async function audit(actorId: string, requestId: string, action: string, meta?: Record<string, string | number | null>) {
  // Без копій контактних даних чи тексту заявки
  await prisma.auditLog.create({ data: { actorId, requestId, action, meta: meta ?? undefined } });
}

export async function updateStatus(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const status = z.enum(STATUSES).parse(formData.get('status'));
  const current = await prisma.request.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (current.status === status) return;
  await prisma.request.update({
    where: { id },
    data: { status, closedAt: status === 'done' || status === 'failed' ? new Date() : null },
  });
  await audit(m.id, id, 'status.changed', { from: current.status, to: status });
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath('/admin');
  revalidatePath('/admin/stats');
}

/** Кнопки «Успішно виконано» / «Провалено». */
export async function setOutcome(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const outcome = z.enum(['done', 'failed']).parse(formData.get('outcome'));
  const current = await prisma.request.findUniqueOrThrow({ where: { id }, select: { status: true } });
  if (current.status === outcome) return;
  await prisma.request.update({ where: { id }, data: { status: outcome, closedAt: new Date() } });
  await audit(m.id, id, 'status.changed', { from: current.status, to: outcome });
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath('/admin');
  revalidatePath('/admin/stats');
}

const MONEY_RE = /^\d{1,8}([.,]\d{1,2})?$/;
function parseMoney(raw: FormDataEntryValue | null): string | null {
  const v = String(raw ?? '').trim().replace(/\s/g, '').replace(',', '.');
  if (v === '') return null;
  if (!MONEY_RE.test(v.replace('.', ','))) throw new Error('Некоректна сума');
  return v;
}

export async function updatePrepayment(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const prepayment = parseMoney(formData.get('prepayment'));
  const current = await prisma.request.findUniqueOrThrow({ where: { id }, select: { estimatedPrice: true } });
  if (prepayment !== null && current.estimatedPrice !== null && Number(prepayment) > Number(current.estimatedPrice)) {
    throw new Error('Передоплата не може перевищувати вартість');
  }
  await prisma.request.update({ where: { id }, data: { prepayment } });
  await audit(m.id, id, 'prepayment.changed', { to: prepayment });
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath('/admin/stats');
}

/** Дедлайн виконання (його ставить менеджер) і пріоритет. Нова дата дедлайну знову вмикає нагадування. */
export async function updateSchedule(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const rawDate = String(formData.get('dueDate') ?? '').trim();
  const priority = z.coerce.number().int().min(0).max(2).parse(formData.get('priority') ?? 0);
  if (rawDate && !/^\d{4}-\d{2}-\d{2}$/.test(rawDate)) throw new Error('Некоректна дата');
  const dueDate = rawDate ? new Date(`${rawDate}T00:00:00Z`) : null;
  const current = await prisma.request.findUniqueOrThrow({ where: { id }, select: { dueDate: true } });
  const changed = (current.dueDate?.toISOString().slice(0, 10) ?? null) !== (rawDate || null);
  await prisma.request.update({ where: { id }, data: { dueDate, priority, ...(changed ? { reminderSentAt: null } : {}) } });
  await audit(m.id, id, 'schedule.changed', { dueDate: rawDate || null, priority });
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath('/admin');
}

export async function updatePrice(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const raw = String(formData.get('price') ?? '').trim().replace(',', '.');
  let price: string | null = null;
  if (raw !== '') {
    if (!/^\d{1,8}(\.\d{1,2})?$/.test(raw)) throw new Error('Некоректна сума');
    price = raw;
  }
  const current = await prisma.request.findUniqueOrThrow({ where: { id }, select: { prepayment: true } });
  if (price !== null && current.prepayment !== null && Number(current.prepayment) > Number(price)) {
    throw new Error('Вартість не може бути меншою за передоплату');
  }
  await prisma.request.update({ where: { id }, data: { estimatedPrice: price } });
  await audit(m.id, id, 'price.changed', { to: price });
  revalidatePath(`/admin/requests/${id}`);
  revalidatePath('/admin/stats');
}

export async function updateNote(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const note = z.string().max(5000).parse(String(formData.get('note') ?? '')).trim();
  await prisma.request.update({ where: { id }, data: { managerNote: note || null } });
  await audit(m.id, id, 'note.changed');
  revalidatePath(`/admin/requests/${id}`);
}

export async function assignToMe(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  await prisma.request.update({ where: { id }, data: { assignedManagerId: m.id } });
  await audit(m.id, id, 'assigned');
  revalidatePath(`/admin/requests/${id}`);
}

export async function retryNotification(formData: FormData) {
  const m = await requireManager();
  const id = idSchema.parse(formData.get('id'));
  const requestId = idSchema.parse(formData.get('requestId'));
  await prisma.notificationOutbox.update({
    where: { id },
    data: { status: 'pending', attempts: 0, nextAttemptAt: new Date(), lastError: null },
  });
  await audit(m.id, requestId, 'notification.retry');
  await processOutbox().catch(() => undefined);
  revalidatePath(`/admin/requests/${requestId}`);
}
