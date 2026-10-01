import 'server-only';
import { NextResponse } from 'next/server';
import { appUrl, env } from './env';
import { sha256 } from './crypto';

export function json(body: unknown, status = 200, headers?: Record<string, string>) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store', ...headers } });
}

export function apiError(status: number, code: string, message: string, extra?: Record<string, unknown>, headers?: Record<string, string>) {
  return json({ code, message, ...extra }, status, headers);
}

/**
 * Захист від CSRF для публічних POST/PUT: Origin має збігатися з Host запиту або APP_URL.
 * Публічні endpoint-и не використовують cookie-авторизацію, але це відсікає чужі сайти.
 */
export function sameOrigin(req: Request): boolean {
  const origin = req.headers.get('origin');
  if (!origin) return false;
  try {
    const o = new URL(origin);
    const host = req.headers.get('host');
    if (host && o.host === host) return true;
    return o.origin === new URL(appUrl()).origin;
  } catch {
    return false;
  }
}

export function forbiddenOrigin() {
  return apiError(403, 'bad_origin', 'Запит відхилено.');
}

/** IP беремо лише з заголовка довіреного проксі (TRUSTED_PROXY_HEADER). Без нього — спільний кошик "unknown". */
export function clientKey(req: Request): string {
  const header = env('TRUSTED_PROXY_HEADER');
  const raw = header ? req.headers.get(header) : null;
  const ip = raw ? raw.split(',')[0]!.trim() : 'unknown';
  return sha256(ip).slice(0, 24);
}
