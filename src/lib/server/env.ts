import 'server-only';

export const isProd = process.env.NODE_ENV === 'production';

export function env(name: string): string | undefined {
  const v = process.env[name];
  return v && v.trim() !== '' ? v.trim() : undefined;
}

export function requireEnv(name: string): string {
  const v = env(name);
  if (!v) throw new Error(`Не задано змінну середовища ${name}`);
  return v;
}

export function intEnv(name: string, fallback: number): number {
  const v = Number(env(name));
  return Number.isFinite(v) && v > 0 ? Math.floor(v) : fallback;
}

/**
 * Публічна адреса застосунку: APP_URL, інакше системні змінні Vercel (production-аліас / адреса деплою), інакше localhost.
 * Після підключення домену задайте APP_URL явно.
 */
export function appUrl(): string {
  const vercelProd = env('VERCEL_PROJECT_PRODUCTION_URL');
  const vercel = env('VERCEL_ENV') === 'production' && vercelProd ? vercelProd : env('VERCEL_URL');
  const base = env('APP_URL') ?? (vercel ? `https://${vercel}` : 'http://localhost:3000');
  return base.replace(/\/$/, '');
}
