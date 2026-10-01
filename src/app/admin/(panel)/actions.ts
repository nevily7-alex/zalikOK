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
    data: { status, closedAt: status === 'closed' || status === 'cancelled' ? new Date() : null },
  });
  await audit(m.id, id, 'status.changed', { from: current.status, to: status });
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
  await prisma.request.update({ where: { id }, data: { estimatedPrice: price } });
  await audit(m.id, id, 'price.changed', { to: price });
  revalidatePath(`/admin/requests/${id}`);
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
