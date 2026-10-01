import 'dotenv/config';
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/server/db';
import { processOutbox } from '@/lib/server/notify';
import { newReference } from '@/lib/server/crypto';
import { assertLocalDatabase } from '../local-db-guard';

assertLocalDatabase();

const CONTACT = '@private_contact_value';
const created: string[] = [];

async function makeRequest() {
  const r = await prisma.request.create({
    data: {
      publicReference: newReference(),
      service: 'plan',
      discipline: 'law',
      topic: 'Приватна тема заявки',
      deadline: new Date('2999-01-01T00:00:00Z'),
      contactMethod: 'telegram',
      contact: CONTACT,
      privacyPolicyVersion: 'test',
      consentAt: new Date(),
      outbox: { create: { channel: 'telegram' } },
    },
    include: { outbox: true },
  });
  created.push(r.id);
  return r;
}

beforeEach(() => {
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('NOTIFICATIONS_ENABLED', 'true');
  vi.stubEnv('ALLOW_DEV_NOTIFICATIONS', 'false'); // не залежить від локального .env
  vi.stubEnv('TELEGRAM_BOT_TOKEN', '123456:SECRET-token');
  vi.stubEnv('TELEGRAM_MANAGER_CHAT_ID', '42');
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
afterAll(async () => {
  await prisma.request.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe('outbox', () => {
  it('у development нічого не надсилає (skipped)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    const r = await makeRequest();
    await processOutbox(200);
    expect(fetchMock).not.toHaveBeenCalled();
    const o = await prisma.notificationOutbox.findFirstOrThrow({ where: { requestId: r.id } });
    expect(o.status).toBe('skipped');
  });

  it('у development сповіщення йдуть лише після явного ALLOW_DEV_NOTIFICATIONS=true (тест на власному чаті)', async () => {
    vi.stubEnv('NODE_ENV', 'development');
    vi.stubEnv('ALLOW_DEV_NOTIFICATIONS', 'true');
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { message_id: 9 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await makeRequest();
    await prisma.request.update({ where: { id: r.id }, data: { workType: 'kursova' } });
    await processOutbox(200);
    const call = fetchMock.mock.calls.find((c) => String(c[1].body).includes(r.publicReference));
    expect(call).toBeTruthy();
    expect(call![0]).toContain('api.telegram.org');
    const text = JSON.parse(call![1].body).text as string;
    expect(text).toContain('Вид роботи: Курсова робота');
    expect(text).not.toContain(CONTACT);
  });

  it('збій Telegram не втрачає заявку: retry з backoff, потім failed, без токена в помилці', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('connect fail https://api.telegram.org/bot123456:SECRET-token/sendMessage')));
    const r = await makeRequest();
    const outboxId = r.outbox[0]!.id;

    await processOutbox(200);
    let o = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    expect(o.status).toBe('pending');
    expect(o.attempts).toBe(1);
    expect(o.nextAttemptAt.getTime()).toBeGreaterThan(Date.now());
    expect(o.lastError).not.toContain('SECRET');
    expect(await prisma.request.count({ where: { id: r.id } })).toBe(1);

    for (let i = 0; i < 6; i++) {
      await prisma.notificationOutbox.update({ where: { id: outboxId }, data: { nextAttemptAt: new Date() } });
      await processOutbox(200);
    }
    o = await prisma.notificationOutbox.findUniqueOrThrow({ where: { id: outboxId } });
    expect(o.status).toBe('failed');
    expect(o.attempts).toBe(6);
  });

  it('успішне повідомлення мінімальне: reference, послуга, дедлайн, посилання; без контакту', async () => {
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ result: { message_id: 7 } }) });
    vi.stubGlobal('fetch', fetchMock);
    const r = await makeRequest();
    await processOutbox(200);
    const call = fetchMock.mock.calls.find((c) => String(c[1].body).includes(r.publicReference));
    expect(call).toBeTruthy();
    const text = JSON.parse(call![1].body).text as string;
    expect(text).toContain(r.publicReference);
    expect(text).toContain('/admin/requests/');
    expect(text).not.toContain(CONTACT);
    expect(text).not.toContain('Приватна тема');
    const o = await prisma.notificationOutbox.findFirstOrThrow({ where: { requestId: r.id } });
    expect(o.status).toBe('sent');
    expect(o.providerMessageId).toBe('7');
  });
});
