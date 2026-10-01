// Перевірка сховища вкладень (STORAGE_DRIVER=s3 або local): підписаний PUT → розмір → читання → видалення.
// Запуск: npm run storage:check. Тестовий об'єкт видаляється наприкінці.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { storage } from '../src/lib/server/storage';
import { env } from '../src/lib/server/env';

const store = storage();
const driver = env('STORAGE_DRIVER') ?? 'local';
const key = `${randomUUID()}/${randomUUID()}`;
const body = Buffer.from(`%PDF-1.7\nzalikok storage check ${Date.now()}\n%%EOF\n`, 'latin1');
const results: Record<string, unknown> = { driver };

try {
  const target = await store.createUploadTarget(key, randomUUID(), body.length, 'application/pdf');
  results.signedUrlHost = driver === 's3' ? new URL(target.url).host : 'local';

  if (driver === 's3') {
    const put = await fetch(target.url, { method: 'PUT', headers: { ...target.headers, 'Content-Length': String(body.length) }, body });
    results.put = put.status;
    if (!put.ok) throw new Error(`PUT ${put.status} ${(await put.text()).slice(0, 200)}`);

    // Спроба підробити розмір: підпис має відхилити інший Content-Length
    const tampered = await fetch(target.url, { method: 'PUT', headers: { ...target.headers }, body: Buffer.concat([body, body]) });
    results.tamperedPutRejected = !tampered.ok;
  } else {
    const { writeLocal } = await import('../src/lib/server/storage');
    await writeLocal(key, new Blob([body]).stream() as ReadableStream<Uint8Array>, body.length);
  }

  results.size = await store.size(key);
  results.sizeMatches = results.size === body.length;
  const head = await store.read(key, 0, 7);
  results.signatureOk = head.toString('latin1') === '%PDF-1.7';
  const streamed = await store.stream(key);
  let total = 0;
  const reader = streamed.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
  }
  results.streamBytes = total;
} catch (e) {
  results.error = e instanceof Error ? e.message : String(e);
} finally {
  await store.remove(key).catch(() => undefined);
  results.deleted = (await store.size(key)) === null;
}

const ok = !results.error && results.sizeMatches && results.signatureOk && results.deleted && (driver !== 's3' || results.tamperedPutRejected);
console.log(JSON.stringify({ ok, ...results }));
process.exit(ok ? 0 : 1);
