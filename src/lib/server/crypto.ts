import 'server-only';
import { createHash, createHmac, randomBytes, randomInt, timingSafeEqual } from 'node:crypto';
import { requireEnv } from './env';

export const sha256 = (s: string) => createHash('sha256').update(s).digest('hex');
export const randomToken = (bytes = 32) => randomBytes(bytes).toString('base64url');

export function safeEqual(a: string, b: string): boolean {
  const ba = Buffer.from(a);
  const bb = Buffer.from(b);
  return ba.length === bb.length && timingSafeEqual(ba, bb);
}

export function hmac(data: string): string {
  return createHmac('sha256', requireEnv('AUTH_SECRET')).update(data).digest('base64url');
}

// Без неоднозначних символів (0/O, 1/I/L)
const ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export function newReference(): string {
  let s = '';
  for (let i = 0; i < 10; i++) s += ALPHABET[randomInt(ALPHABET.length)];
  return `ZO-${s.slice(0, 5)}-${s.slice(5)}`;
}

export const REFERENCE_RE = /^ZO-[A-HJKMNP-Z2-9]{5}-[A-HJKMNP-Z2-9]{5}$/;
