import 'dotenv/config';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/server/db';
import { enqueueDeadlineReminders } from '@/lib/server/notify';
import { formatReference } from '@/lib/server/crypto';
import { newReference } from '@/lib/server/crypto';
import { assertLocalDatabase } from '../local-db-guard';

assertLocalDatabase();

const created: string[] = [];
const NOW = new Date('2026-12-01T08:00:00Z'); // 1 грудня за Києвом
const day = (iso: string) => new Date(`${iso}T00:00:00Z`);

async function make(over: Record<string, unknown>) {
  const r = await prisma.request.create({
    data: {
      publicReference: newReference(),
      service: 'plan',
      discipline: 'law',
      topic: 'Тема',
      deadline: day('2999-01-01'),
      contactMethod: 'email',
      contact: 'a@b.ua',
      privacyPolicyVersion: 'test',
      consentAt: new Date(),
      ...over,
    } as never,
  });
  created.push(r.id);
  return r;
}

afterAll(async () => {
  await prisma.request.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('нагадування про дедлайн (за 3 дні)', () => {
  it('ставить у чергу лише активні заявки з дедлайном ≤ 3 днів, один раз', async () => {
    const soon = await make({ dueDate: day('2026-12-03') });
    const exactly3 = await make({ dueDate: day('2026-12-04') });
    const far = await make({ dueDate: day('2026-12-10') });
    const clientDeadline = await make({ deadline: day('2026-12-02') }); // власного дедлайну немає
    const finished = await make({ dueDate: day('2026-12-02'), status: 'done' });
    const failed = await make({ dueDate: day('2026-12-02'), status: 'failed' });
    const already = await make({ dueDate: day('2026-12-02'), reminderSentAt: new Date() });

    await enqueueDeadlineReminders(NOW);
    const ids = created;
    const out = await prisma.notificationOutbox.findMany({ where: { requestId: { in: ids } } });
    const has = (id: string) => out.some((o) => o.requestId === id && o.kind === 'deadline_reminder');
    expect(has(soon.id)).toBe(true);
    expect(has(exactly3.id)).toBe(true);
    expect(has(clientDeadline.id)).toBe(true);
    expect(has(far.id)).toBe(false);
    expect(has(finished.id)).toBe(false);
    expect(has(failed.id)).toBe(false);
    expect(has(already.id)).toBe(false);

    // повторний запуск не дублює
    await enqueueDeadlineReminders(NOW);
    const again = await prisma.notificationOutbox.count({ where: { requestId: soon.id, kind: 'deadline_reminder' } });
    expect(again).toBe(1);
    const updated = await prisma.request.findUniqueOrThrow({ where: { id: soon.id }, select: { reminderSentAt: true } });
    expect(updated.reminderSentAt).not.toBeNull();
  });
});

describe('номер заявки', () => {
  it('порядковий номер форматується як шестизначний', () => {
    expect(formatReference(1)).toBe('000001');
    expect(formatReference(42)).toBe('000042');
    expect(formatReference(1234567)).toBe('1234567');
  });
});
