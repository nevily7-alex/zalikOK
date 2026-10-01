import { test, expect, request as pwRequest } from '@playwright/test';
import { BASE, MANAGER, apiContext, sql, uniqueIp } from './helpers';

const SECRET = 'e2e-cron-secret-for-tests-only';

test.describe('cron-ендпоінти', () => {
  for (const path of ['/api/cron/outbox', '/api/cron/cleanup?dryRun=1']) {
    test(`${path}: без або з хибним секретом 401, з правильним 200`, async () => {
      const api = await apiContext();
      expect((await api.get(path)).status()).toBe(401);
      expect((await api.get(path, { headers: { Authorization: 'Bearer wrong-secret' } })).status()).toBe(401);
      expect((await api.get(path, { headers: { Authorization: SECRET } })).status()).toBe(401); // без схеми Bearer
      const ok = await api.get(path, { headers: { Authorization: `Bearer ${SECRET}` } });
      expect(ok.status()).toBe(200);
      const body = await ok.json();
      if (path.includes('cleanup')) {
        expect(body.dryRun).toBe(true);
        expect(body).toHaveProperty('authRateLimitRows');
      } else {
        expect(body.notificationsEnabled).toBe(false); // у тестах сповіщення вимкнені
      }
    });
  }

  test('outbox за розкладом обробляє чергу (у тестовому оточенні сповіщення вимкнені → skipped, заявка не втрачається)', async () => {
    const api = await apiContext();
    const res = await api.post('/api/requests', {
      headers: { 'Idempotency-Key': `ops-${Date.now()}-key` },
      data: {
        service: 'plan', discipline: 'law', topic: 'Перевірка розкладу сповіщень', deadline: '2999-01-01',
        contactMethod: 'telegram', contact: `@ops_${Date.now().toString(36)}`, privacyConsent: true, fileIds: [],
      },
    });
    const { requestId } = await res.json();
    expect(res.status()).toBe(201);
    // after() обробляє чергу після відповіді; cron — гарантія для повторів
    await api.get('/api/cron/outbox', { headers: { Authorization: `Bearer ${SECRET}` } });
    await expect
      .poll(async () => (await sql<{ status: string }>('select status from "NotificationOutbox" where "requestId" = $1', [requestId]))[0]?.status)
      .toBe('skipped');
    expect((await sql('select 1 from "Request" where id = $1', [requestId])).length).toBe(1);
  });
});

test.describe('ліміт спроб входу', () => {
  test('6-а невдала спроба з одного IP → 429, лічильник у PostgreSQL; інший IP не заблоковано', async () => {
    const ip = uniqueIp();
    const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE, 'x-forwarded-for': ip } });
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const r = await ctx.post('/api/auth/sign-in/email', { data: { email: MANAGER().email, password: `wrong-password-${i}-xx` } });
      statuses.push(r.status());
    }
    expect(statuses.slice(0, 5).every((s) => s === 401)).toBe(true);
    expect(statuses.slice(5).every((s) => s === 429)).toBe(true);
    const rows = await sql<{ count: number }>(`select count from "AuthRateLimit" where key like $1`, [`${ip}%`]);
    expect(rows.length).toBeGreaterThan(0);

    const other = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE, 'x-forwarded-for': uniqueIp() } });
    const ok = await other.post('/api/auth/sign-in/email', { data: MANAGER() });
    expect(ok.status()).toBe(200);
  });
});
