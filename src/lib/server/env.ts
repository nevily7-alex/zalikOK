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

export function appUrl(): string {
  return (env('APP_URL') ?? 'http://localhost:3000').replace(/\/$/, '');
}
