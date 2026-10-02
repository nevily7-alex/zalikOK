import { afterEach, describe, expect, it, vi } from 'vitest';
import { decideDownload } from '@/lib/server/downloads';
import { appUrl } from '@/lib/server/env';
import robots from '@/app/robots';

afterEach(() => vi.unstubAllEnvs());

describe('завантаження файлів менеджером', () => {
  it('clean — завжди; rejected — ніколи', () => {
    for (const allow of [true, false]) {
      expect(decideDownload('clean', false, allow)).toBe('ok');
      expect(decideDownload('rejected', true, allow)).toBe('blocked_rejected');
    }
  });
  it('pending: без дозволу власника заблоковано, з дозволом — лише після явного підтвердження', () => {
    expect(decideDownload('pending', true, false)).toBe('blocked_pending');
    expect(decideDownload('pending', false, true)).toBe('confirm_required');
    expect(decideDownload('pending', true, true)).toBe('ok_unscanned');
  });
  it('за замовчуванням (змінна не задана) pending заблоковано', () => {
    vi.stubEnv('ALLOW_UNSCANNED_DOWNLOAD', '');
    expect(decideDownload('pending', true)).toBe('blocked_pending');
  });
});

describe('публічна адреса на Vercel', () => {
  it('APP_URL має пріоритет', () => {
    vi.stubEnv('APP_URL', 'https://example.com.ua/');
    vi.stubEnv('VERCEL_URL', 'abc.vercel.app');
    expect(appUrl()).toBe('https://example.com.ua');
  });
  it('без APP_URL у production береться production-аліас, у preview — адреса деплою', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL_ENV', 'production');
    vi.stubEnv('VERCEL_PROJECT_PRODUCTION_URL', 'zalik-ok.vercel.app');
    vi.stubEnv('VERCEL_URL', 'zalik-ok-abc123.vercel.app');
    expect(appUrl()).toBe('https://zalik-ok.vercel.app');
    vi.stubEnv('VERCEL_ENV', 'preview');
    expect(appUrl()).toBe('https://zalik-ok-abc123.vercel.app');
  });
  it('локально — localhost', () => {
    vi.stubEnv('APP_URL', '');
    vi.stubEnv('VERCEL_URL', '');
    vi.stubEnv('VERCEL_ENV', '');
    expect(appUrl()).toBe('http://localhost:3000');
  });
});

describe('індексація без домену', () => {
  it('robots.txt забороняє все, поки домен не задано', () => {
    const r = robots();
    expect(r.rules).toEqual([{ userAgent: '*', disallow: ['/'] }]);
    expect(r.sitemap).toBeUndefined();
  });
});
