import { test, expect, request as pwRequest } from '@playwright/test';
import {
  BASE,
  DOCX,
  LOW_USER,
  MANAGER,
  PDF,
  PNG,
  apiContext,
  idemKey,
  loginContext,
  pickOption,
  postRequest,
  sql,
  uniqueIp,
  uploadFile,
  validBody,
} from './helpers';


test.describe('POST /api/requests', () => {
  test('успішно створює заявку (201) і повторює з тим самим ключем без дубля (200)', async () => {
    const api = await apiContext();
    const key = idemKey();
    const body = validBody();
    const first = await postRequest(api, body, key);
    expect(first.status()).toBe(201);
    const a = await first.json();
    expect(a.status).toBe('received');
    expect(a.reference).toMatch(/^ZO-/);
    expect(Object.keys(a).sort()).toEqual(['reference', 'requestId', 'status']); // без внутрішніх даних/контактів

    const again = await postRequest(api, body, key);
    expect(again.status()).toBe(200);
    expect((await again.json()).reference).toBe(a.reference);
    const rows = await sql('select count(*)::int as n from "Request" where "publicReference" = $1', [a.reference]);
    expect(rows[0]!.n).toBe(1);
    const outbox = await sql('select count(*)::int as n from "NotificationOutbox" where "requestId" = $1', [a.requestId]);
    expect(outbox[0]!.n).toBe(1);
  });

  test('той самий ключ з іншим тілом → 409', async () => {
    const api = await apiContext();
    const key = idemKey();
    expect((await postRequest(api, validBody(), key)).status()).toBe(201);
    expect((await postRequest(api, validBody({ topic: 'Інша тема для заявки' }), key)).status()).toBe(409);
  });

  test('два паралельні запити з одним ключем створюють одну заявку', async () => {
    const api = await apiContext();
    const key = idemKey();
    const body = validBody();
    const [r1, r2] = await Promise.all([postRequest(api, body, key), postRequest(api, body, key)]);
    expect([r1.status(), r2.status()].sort()).toEqual([200, 201]);
    const refs = new Set([(await r1.json()).reference, (await r2.json()).reference]);
    expect(refs.size).toBe(1);
  });

  test('без згоди на обробку даних → 422', async () => {
    const api = await apiContext();
    const res = await postRequest(api, validBody({ privacyConsent: false }));
    expect(res.status()).toBe(422);
    expect((await res.json()).errors.privacyConsent).toBeTruthy();
  });

  test('помилки валідації: дата в минулому, невірний контакт, honeypot', async () => {
    const api = await apiContext();
    const res = await postRequest(api, validBody({ deadline: '2001-01-01', contact: 'не контакт' }));
    expect(res.status()).toBe(422);
    const errors = (await res.json()).errors;
    expect(errors.deadline).toBeTruthy();
    expect(errors.contact).toBeTruthy();
    expect((await postRequest(api, validBody({ honeypot: 'spam' }))).status()).toBe(422);
  });

  test('сторонній Origin і відсутній Idempotency-Key відхиляються', async () => {
    const evil = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: 'https://evil.example', 'x-forwarded-for': uniqueIp() } });
    expect((await postRequest(evil, validBody())).status()).toBe(403);
    const none = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': uniqueIp() } });
    expect((await postRequest(none, validBody())).status()).toBe(403);
    const api = await apiContext();
    const res = await api.post('/api/requests', { data: validBody() });
    expect(res.status()).toBe(400);
  });

  test('завеликий payload → 413', async () => {
    const api = await apiContext();
    const res = await postRequest(api, validBody({ comment: 'a'.repeat(70 * 1024) }));
    expect(res.status()).toBe(413);
  });

  test('rate limit: 6-й запит за вікно → 429 з Retry-After', async () => {
    const api = await apiContext(); // власний «IP»
    for (let i = 0; i < 5; i++) expect((await postRequest(api, validBody())).status()).toBe(201);
    const blocked = await postRequest(api, validBody());
    expect(blocked.status()).toBe(429);
    expect(Number(blocked.headers()['retry-after'])).toBeGreaterThan(0);
    // інший клієнт не заблокований
    const other = await apiContext();
    expect((await postRequest(other, validBody())).status()).toBe(201);
  });
});

test.describe('вкладення', () => {
  test('коректні файли PNG/PDF/DOCX приймаються й прив’язуються до заявки; файли не публічні', async () => {
    const api = await apiContext();
    const first = await uploadFile(api, 'scan.png', PNG);
    expect(first.complete!.status()).toBe(200);
    const s = first.session;
    const second = await uploadFile(api, 'tz.pdf', PDF, s);
    const third = await uploadFile(api, 'курсова.docx', DOCX, s);
    expect(second.complete!.status()).toBe(200);
    expect(third.complete!.status()).toBe(200);
    // scanStatus не позначається clean без налаштованого сканера (UPLOAD_SCAN_MODE=off)
    expect((await first.complete!.json()).scanStatus).toBe('pending');

    const ids = [first.slot.fileId, second.slot!.fileId, third.slot!.fileId];
    const res = await postRequest(api, validBody({ uploadSessionId: s.sessionId, uploadSecret: s.secret, fileIds: ids }));
    expect(res.status()).toBe(201);
    const { requestId } = await res.json();
    const atts = await sql('select "requestId", "scanStatus" from "Attachment" where "requestId" = $1', [requestId]);
    expect(atts).toHaveLength(3);

    // сесію закрито: повторне використання неможливе
    const reuse = await postRequest(api, validBody({ uploadSessionId: s.sessionId, uploadSecret: s.secret, fileIds: [ids[0]] }));
    expect(reuse.status()).toBe(403);

    // публічного доступу до сховища немає
    const attRows = await sql<{ storageKey: string }>('select "storageKey" from "Attachment" where "requestId" = $1 limit 1', [requestId]);
    const key = attRows[0]!.storageKey;
    for (const p of [`/.data/storage/${key}`, `/api/uploads/${key}`, `/${key}`]) {
      expect((await api.get(p)).status()).toBe(404);
    }
  });

  test('HTML під виглядом PNG/PDF відхиляється за вмістом; SVG/HTML/EXE/DOC — за типом', async () => {
    const api = await apiContext();
    const html = Buffer.from('<html><script>alert(1)</script></html>');
    for (const name of ['fake.png', 'fake.pdf', 'fake.docx', 'fake.jpg']) {
      const r = await uploadFile(api, name, html);
      expect(r.complete!.status(), name).toBe(422);
      expect((await r.complete!.json()).code).toBe('file_rejected');
    }
    // MIME/розширення збігаються, але вміст — PNG під назвою PDF
    expect((await uploadFile(api, 'png-as.pdf', PNG)).complete!.status()).toBe(422);
    for (const name of ['x.svg', 'x.html', 'x.js', 'x.exe', 'old.doc', 'noext']) {
      const r = await uploadFile(api, name, PNG);
      expect(r.slotRes.status(), name).toBe(422);
      expect((await r.slotRes.json()).code).toBe('bad_type');
    }
  });

  test('ліміти: файл > 10 МіБ, 6-й файл, підроблений розмір у PUT', async () => {
    const api = await apiContext();
    const s = await (await api.post('/api/uploads/session')).json();
    const h = { 'X-Upload-Secret': s.secret };
    const big = await api.post('/api/uploads/files', { data: { sessionId: s.sessionId, name: 'big.pdf', size: 10 * 1024 * 1024 + 1 }, headers: h });
    expect(big.status()).toBe(422);

    for (let i = 0; i < 5; i++) {
      const r = await api.post('/api/uploads/files', { data: { sessionId: s.sessionId, name: `f${i}.pdf`, size: 1000 }, headers: h });
      expect(r.status()).toBe(201);
    }
    const sixth = await api.post('/api/uploads/files', { data: { sessionId: s.sessionId, name: 'f6.pdf', size: 1000 }, headers: h });
    expect(sixth.status()).toBe(422);
    expect((await sixth.json()).code).toBe('too_many');

    // загальний ліміт 25 МіБ
    const s2 = await (await api.post('/api/uploads/session')).json();
    const h2 = { 'X-Upload-Secret': s2.secret };
    for (let i = 0; i < 2; i++) {
      expect((await api.post('/api/uploads/files', { data: { sessionId: s2.sessionId, name: `a${i}.pdf`, size: 10 * 1024 * 1024 }, headers: h2 })).status()).toBe(201);
    }
    const over = await api.post('/api/uploads/files', { data: { sessionId: s2.sessionId, name: 'c.pdf', size: 6 * 1024 * 1024 }, headers: h2 });
    expect(over.status()).toBe(422);
    expect((await over.json()).code).toBe('total_too_large');

    // PUT з розміром, що не збігається із заявленим
    const s3 = await (await api.post('/api/uploads/session')).json();
    const slot = await (await api.post('/api/uploads/files', { data: { sessionId: s3.sessionId, name: 'p.pdf', size: 500 }, headers: { 'X-Upload-Secret': s3.secret } })).json();
    const put = await api.put(slot.url, { data: Buffer.alloc(900, 1) });
    expect(put.status()).toBe(422);
  });

  test('підпис PUT: чужий/підроблений підпис і сліпе вгадування fileId відхиляються', async () => {
    const api = await apiContext();
    const s = await (await api.post('/api/uploads/session')).json();
    const slot = await (await api.post('/api/uploads/files', { data: { sessionId: s.sessionId, name: 'p.pdf', size: PDF.length }, headers: { 'X-Upload-Secret': s.secret } })).json();
    const url = new URL(slot.url, BASE);
    url.searchParams.set('s', 'AAAA' + url.searchParams.get('s')!.slice(4));
    expect((await api.put(url.pathname + url.search, { data: PDF })).status()).toBe(403);
    const noSig = await api.put(`/api/uploads/put/${slot.fileId}`, { data: PDF });
    expect(noSig.status()).toBe(403);
  });

  test('чужа upload-сесія: файли не можна прикріпити без її секрету; complete/remove з чужим секретом заборонені', async () => {
    const attacker = await apiContext();
    const victim = await apiContext();
    const v = await uploadFile(victim, 'secret.pdf', PDF);
    expect(v.complete!.status()).toBe(200);
    const a = await uploadFile(attacker, 'mine.pdf', PDF);

    // 1) атакуючий знає fileId жертви, але не її секрет
    const own = a.session;
    const res1 = await postRequest(attacker, validBody({ uploadSessionId: own.sessionId, uploadSecret: own.secret, fileIds: [v.slot!.fileId] }));
    expect(res1.status()).toBe(403);
    // 2) знає і sessionId жертви, але секрет власний
    const res2 = await postRequest(attacker, validBody({ uploadSessionId: v.session.sessionId, uploadSecret: own.secret, fileIds: [v.slot!.fileId] }));
    expect(res2.status()).toBe(403);
    // 3) complete/remove з чужим секретом
    const c = await attacker.post('/api/uploads/complete', { data: { sessionId: v.session.sessionId, fileId: v.slot!.fileId }, headers: { 'X-Upload-Secret': own.secret } });
    expect(c.status()).toBe(403);
    const rm = await attacker.post('/api/uploads/remove', { data: { sessionId: v.session.sessionId, fileId: v.slot!.fileId }, headers: { 'X-Upload-Secret': own.secret } });
    expect(rm.status()).toBe(403);
    // файл жертви цілий
    const still = await sql('select count(*)::int as n from "Attachment" where id = $1', [v.slot!.fileId]);
    expect(still[0]!.n).toBe(1);
    // 4) файл у стані slot (не завантажено) прикріпити не можна
    const s = await (await attacker.post('/api/uploads/session')).json();
    const slot = await (await attacker.post('/api/uploads/files', { data: { sessionId: s.sessionId, name: 'x.pdf', size: 10 }, headers: { 'X-Upload-Secret': s.secret } })).json();
    const res4 = await postRequest(attacker, validBody({ uploadSessionId: s.sessionId, uploadSecret: s.secret, fileIds: [slot.fileId] }));
    expect(res4.status()).toBe(403);
  });
});

test.describe('доступ до панелі та вкладень', () => {
  async function requestWithFile(scanStatus: 'pending' | 'clean') {
    const api = await apiContext();
    const up = await uploadFile(api, 'doc.pdf', PDF);
    const res = await postRequest(api, validBody({ uploadSessionId: up.session.sessionId, uploadSecret: up.session.secret, fileIds: [up.slot!.fileId] }));
    const { requestId } = await res.json();
    await sql('update "Attachment" set "scanStatus" = $1 where id = $2', [scanStatus, up.slot!.fileId]);
    return { attId: up.slot!.fileId as string, requestId: requestId as string };
  }

  test('завантаження вкладень: аноніму 401, користувачу без ролі 403, менеджеру — лише після перевірки', async () => {
    const { attId } = await requestWithFile('pending');
    const anon = await apiContext();
    expect((await anon.get(`/api/admin/attachments/${attId}`)).status()).toBe(401);

    const low = await loginContext(LOW_USER());
    expect((await low.get(`/api/admin/attachments/${attId}`)).status()).toBe(403);

    const mgr = await loginContext(MANAGER());
    expect((await mgr.get(`/api/admin/attachments/${attId}`)).status()).toBe(423); // не перевірено

    await sql('update "Attachment" set "scanStatus" = \'clean\' where id = $1', [attId]);
    const ok = await mgr.get(`/api/admin/attachments/${attId}`);
    expect(ok.status()).toBe(200);
    expect(ok.headers()['content-type']).toBe('application/octet-stream');
    expect(ok.headers()['content-disposition']).toContain('attachment');
    expect(ok.headers()['x-content-type-options']).toBe('nosniff');
    expect((await ok.body()).equals(PDF)).toBe(true);
  });

  test('сторінки /admin: аноніма — на логін, користувача без ролі — відмова, менеджеру доступно', async ({ browser }) => {
    const anon = await browser.newContext({ baseURL: BASE });
    const p1 = await anon.newPage();
    await p1.goto('/admin');
    await expect(p1).toHaveURL(/\/admin\/login$/);
    await p1.goto('/admin/requests/00000000-0000-0000-0000-000000000000');
    await expect(p1).toHaveURL(/\/admin\/login$/);
    // публічні заголовки: noindex
    const res = await anon.request.get('/admin/login');
    expect(res.headers()['x-robots-tag']).toContain('noindex');
    await anon.close();

    const low = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': uniqueIp() } });
    const p2 = await low.newPage();
    await p2.goto('/admin/login');
    await p2.fill('#email', LOW_USER().email);
    await p2.fill('#password', LOW_USER().password);
    await p2.click('button[type=submit]');
    await expect(p2.getByText(/не має (ролі|доступу)/)).toBeVisible();
    await expect(p2.getByRole('heading', { name: /^Заявки/ })).toHaveCount(0);
    await low.close();
  });

  test('менеджер: вхід, список з пошуком, зміна статусу/ціни/нотатки пишуться в аудит', async ({ browser }) => {
    const { requestId } = await requestWithFile('clean');
    const [{ publicReference }] = await sql<{ publicReference: string }>('select "publicReference" from "Request" where id = $1', [requestId]);

    const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': uniqueIp() } });
    const page = await ctx.newPage();
    await page.goto('/admin');
    await page.fill('#email', MANAGER().email);
    await page.fill('#password', MANAGER().password);
    await page.click('button[type=submit]');
    await expect(page.getByRole('heading', { name: /^Заявки/ })).toBeVisible();

    await page.fill('#q', publicReference);
    await page.getByRole('button', { name: 'Застосувати' }).click();
    await page.getByRole('link', { name: publicReference }).click();
    await expect(page.getByRole('heading', { name: `Заявка ${publicReference}` })).toBeVisible();

    await pickOption(page.locator('#status'), 'quoted');
    await page.getByRole('button', { name: 'Зберегти статус' }).click();
    await page.fill('#price', '1250,50');
    await page.getByRole('button', { name: 'Зберегти вартість' }).click();
    await page.fill('#note', 'Тестова нотатка менеджера');
    await page.getByRole('button', { name: 'Зберегти нотатку' }).click();
    await expect(page.getByText('status.changed')).toBeVisible();

    const [row] = await sql<{ status: string; estimatedPrice: string; managerNote: string }>(
      'select status, "estimatedPrice"::text, "managerNote" from "Request" where id = $1',
      [requestId],
    );
    expect(row.status).toBe('quoted');
    expect(row.estimatedPrice).toBe('1250.50');
    expect(row.managerNote).toBe('Тестова нотатка менеджера');
    const audit = await sql<{ action: string; meta: unknown }>('select action, meta from "AuditLog" where "requestId" = $1', [requestId]);
    const actions = audit.map((a) => a.action);
    expect(actions).toEqual(expect.arrayContaining(['request.created', 'status.changed', 'price.changed', 'note.changed']));
    expect(JSON.stringify(audit)).not.toContain('@e2e_'); // без копій контактів

    // сповіщення у не-production/вимкнене: заявка збережена, outbox не відправлено
    const outbox = await sql<{ status: string }>('select status from "NotificationOutbox" where "requestId" = $1', [requestId]);
    expect(['skipped', 'pending']).toContain(outbox[0]!.status);
    await ctx.close();
  });

  test('вхід: неправильний пароль відхиляється; публічної реєстрації немає', async () => {
    const api = await apiContext();
    const bad = await api.post('/api/auth/sign-in/email', { data: { email: MANAGER().email, password: 'wrong-password-123' } });
    expect(bad.status()).toBeGreaterThanOrEqual(400);
    const signup = await api.post('/api/auth/sign-up/email', { data: { email: 'new@test.localhost', name: 'X', password: 'a-very-long-password' } });
    expect(signup.status()).toBeGreaterThanOrEqual(400);
    const users = await sql('select count(*)::int as n from "User" where email = $1', ['new@test.localhost']);
    expect(users[0]!.n).toBe(0);
  });
});
