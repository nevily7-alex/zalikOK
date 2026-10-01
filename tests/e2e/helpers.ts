import { randomUUID } from 'node:crypto';
import pg from 'pg';
import type { APIRequestContext } from '@playwright/test';
import { request as pwRequest } from '@playwright/test';

export const BASE = 'http://localhost:3100';

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
export async function sql<T extends Record<string, unknown> = Record<string, unknown>>(q: string, params: unknown[] = []) {
  const r = await pool.query(q, params);
  return r.rows as T[];
}
export async function closePool() {
  await pool.end();
}

/** Унікальний «IP» для окремого кошика rate limit (TRUSTED_PROXY_HEADER=x-forwarded-for). */
export const uniqueIp = () => `10.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`;

export async function apiContext(ip = uniqueIp()): Promise<APIRequestContext> {
  return pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE, 'x-forwarded-for': ip } });
}

export const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(64, 1)]);
export const PDF = Buffer.from('%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n', 'latin1');

export function zip(names: string[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(10, 20);
    central.writeUInt32LE(10, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}
export const DOCX = zip(['[Content_Types].xml', 'word/document.xml']);

export function validBody(extra: Record<string, unknown> = {}) {
  return {
    service: 'plan',
    discipline: 'law',
    topic: 'Правові аспекти захисту даних',
    deadline: '2999-01-01',
    contactMethod: 'telegram',
    contact: `@e2e_${randomUUID().slice(0, 8).replace(/-/g, '')}`,
    privacyConsent: true,
    fileIds: [],
    ...extra,
  };
}

export const idemKey = () => `e2e-${randomUUID()}`;

export async function postRequest(api: APIRequestContext, body: unknown, key = idemKey()) {
  return api.post('/api/requests', { data: body as object, headers: { 'Idempotency-Key': key } });
}

export interface UploadedFile {
  sessionId: string;
  secret: string;
  fileId: string;
}

/** Повний цикл: сесія → слот → PUT → complete. Повертає відповідь complete. */
export async function uploadFile(
  api: APIRequestContext,
  name: string,
  data: Buffer,
  session?: { sessionId: string; secret: string },
) {
  const s = session ?? (await (await api.post('/api/uploads/session')).json());
  const headers = { 'X-Upload-Secret': s.secret };
  const slotRes = await api.post('/api/uploads/files', { data: { sessionId: s.sessionId, name, size: data.length }, headers });
  if (!slotRes.ok()) return { slotRes, session: s as { sessionId: string; secret: string } };
  const slot = await slotRes.json();
  const put = await api.put(slot.url, { data, headers: { ...slot.headers, 'Content-Type': 'application/octet-stream' } });
  const complete = await api.post('/api/uploads/complete', { data: { sessionId: s.sessionId, fileId: slot.fileId }, headers });
  return { slotRes, slot, put, complete, session: s as { sessionId: string; secret: string } };
}

export const MANAGER = () => ({ email: process.env.E2E_MANAGER_EMAIL!, password: process.env.E2E_MANAGER_PASSWORD! });
export const LOW_USER = () => ({ email: process.env.E2E_USER_EMAIL!, password: process.env.E2E_USER_PASSWORD! });

/** Вхід через API better-auth, повертає контекст із cookie сесії. */
export async function loginContext(creds: { email: string; password: string }) {
  const ctx = await pwRequest.newContext({ baseURL: BASE, extraHTTPHeaders: { Origin: BASE, 'x-forwarded-for': uniqueIp() } });
  const res = await ctx.post('/api/auth/sign-in/email', { data: creds });
  if (!res.ok()) throw new Error(`login failed: ${res.status()}`);
  return ctx;
}

// ---- Власні Select/DatePicker ----
import type { Locator } from '@playwright/test';

/** Обрати пункт у власному списку: клік по кнопці, потім по пункту з data-value. */
export async function pickOption(trigger: Locator, value: string) {
  await trigger.click();
  await trigger.page().locator(`[role="option"][data-value="${value}"]`).click();
}

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];

/** Обрати дату YYYY-MM-DD у власному календарі (гортає місяці кнопками). */
export async function pickDate(trigger: Locator, date: string) {
  const page = trigger.page();
  await trigger.click();
  const head = page.locator('.ui-calendar__head strong');
  const [ty, tm] = [Number(date.slice(0, 4)), Number(date.slice(5, 7)) - 1];
  for (let i = 0; i < 40; i++) {
    const [name, year] = (await head.innerText()).split(' ');
    const diff = (ty - Number(year)) * 12 + (tm - MONTHS.indexOf(name!));
    if (diff === 0) break;
    await page.getByRole('button', { name: diff > 0 ? 'Наступний місяць' : 'Попередній місяць' }).click();
  }
  await page.locator(`.ui-calendar [data-date="${date}"]`).click();
}

export const kyivDatePlus = (days: number) =>
  new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(Date.now() + days * 86_400_000));
