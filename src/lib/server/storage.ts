import 'server-only';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env, isProd } from './env';
import { hmac, safeEqual } from './crypto';

export interface UploadTarget {
  url: string;
  headers: Record<string, string>;
}

/** Приватне сховище вкладень. Ключі генерує лише сервер; публічного доступу немає. */
export interface Storage {
  createUploadTarget(key: string, fileId: string, size: number, contentType: string): Promise<UploadTarget>;
  size(key: string): Promise<number | null>;
  read(key: string, start: number, endInclusive: number): Promise<Buffer>;
  stream(key: string): Promise<ReadableStream<Uint8Array>>;
  remove(key: string): Promise<void>;
}

const KEY_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}$/;

// ---------- Локальне сховище (лише розробка) ----------
function localRoot(): string {
  return path.resolve(/* turbopackIgnore: true */ env('LOCAL_STORAGE_DIR') ?? '.data/storage');
}
export function localPath(key: string): string {
  if (!KEY_RE.test(key)) throw new Error('Некоректний ключ сховища');
  return path.join(localRoot(), key);
}

export function signLocalPut(fileId: string, exp: number, size: number): string {
  return hmac(`put:${fileId}:${exp}:${size}`);
}
export function verifyLocalPut(fileId: string, exp: number, size: number, sig: string): boolean {
  return exp > Date.now() / 1000 && safeEqual(signLocalPut(fileId, exp, size), sig);
}

export async function writeLocal(key: string, body: ReadableStream<Uint8Array>, maxBytes: number): Promise<number> {
  const file = localPath(key);
  await fsp.mkdir(path.dirname(file), { recursive: true });
  let written = 0;
  const limiter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      written += chunk.byteLength;
      if (written > maxBytes) controller.error(new Error('too_large'));
      else controller.enqueue(chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(body.pipeThrough(limiter) as never), fs.createWriteStream(file));
  } catch (e) {
    await fsp.rm(file, { force: true });
    throw e;
  }
  return written;
}

const local: Storage = {
  async createUploadTarget(_key, fileId, size) {
    const exp = Math.floor(Date.now() / 1000) + 15 * 60;
    const sig = signLocalPut(fileId, exp, size);
    return {
      url: `/api/uploads/put/${fileId}?e=${exp}&s=${sig}`,
      headers: {},
    };
  },
  async size(key) {
    try {
      return (await fsp.stat(localPath(key))).size;
    } catch {
      return null;
    }
  },
  async read(key, start, endInclusive) {
    const fh = await fsp.open(localPath(key), 'r');
    try {
      const len = endInclusive - start + 1;
      const buf = Buffer.alloc(len);
      const { bytesRead } = await fh.read(buf, 0, len, start);
      return buf.subarray(0, bytesRead);
    } finally {
      await fh.close();
    }
  },
  async stream(key) {
    return Readable.toWeb(fs.createReadStream(localPath(key))) as unknown as ReadableStream<Uint8Array>;
  },
  async remove(key) {
    await fsp.rm(localPath(key), { force: true });
  },
};

// ---------- S3-сумісне сховище ----------
let s3Client: S3Client | null = null;
function s3(): { client: S3Client; bucket: string } {
  const bucket = env('S3_BUCKET');
  if (!bucket) throw new Error('Не задано S3_BUCKET');
  s3Client ??= new S3Client({
    region: env('S3_REGION') ?? 'auto',
    endpoint: env('S3_ENDPOINT'),
    forcePathStyle: env('S3_FORCE_PATH_STYLE') === 'true',
    credentials:
      env('S3_ACCESS_KEY_ID') && env('S3_SECRET_ACCESS_KEY')
        ? { accessKeyId: env('S3_ACCESS_KEY_ID')!, secretAccessKey: env('S3_SECRET_ACCESS_KEY')! }
        : undefined,
  });
  return { client: s3Client, bucket };
}

const s3Storage: Storage = {
  async createUploadTarget(key, _fileId, size, contentType) {
    const { client, bucket } = s3();
    // ContentLength і ContentType входять у підпис: інший розмір/тип сховище відхилить
    const url = await getSignedUrl(
      client,
      new PutObjectCommand({ Bucket: bucket, Key: key, ContentLength: size, ContentType: contentType }),
      { expiresIn: 15 * 60, signableHeaders: new Set(['content-length', 'content-type']) },
    );
    return { url, headers: { 'Content-Type': contentType } };
  },
  async size(key) {
    const { client, bucket } = s3();
    try {
      const r = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
      return r.ContentLength ?? null;
    } catch {
      return null;
    }
  },
  async read(key, start, endInclusive) {
    const { client, bucket } = s3();
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: `bytes=${start}-${endInclusive}` }));
    return Buffer.from(await r.Body!.transformToByteArray());
  },
  async stream(key) {
    const { client, bucket } = s3();
    const r = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    return r.Body!.transformToWebStream() as ReadableStream<Uint8Array>;
  },
  async remove(key) {
    const { client, bucket } = s3();
    await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
  },
};

export function storage(): Storage {
  const driver = env('STORAGE_DRIVER') ?? 'local';
  if (driver === 's3') return s3Storage;
  if (isProd && !env('ALLOW_LOCAL_STORAGE_IN_PRODUCTION')) {
    throw new Error('У production потрібен STORAGE_DRIVER=s3 (приватне S3-сховище).');
  }
  return local;
}
