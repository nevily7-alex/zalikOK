import 'server-only';
import { betterAuth } from 'better-auth';
import { prismaAdapter } from 'better-auth/adapters/prisma';
import { nextCookies } from 'better-auth/next-js';
import { prisma } from './db';
import { appUrl, env, isProd, requireEnv } from './env';

function create() {
  return betterAuth({
    baseURL: appUrl(),
    secret: requireEnv('AUTH_SECRET'),
    trustedOrigins: [appUrl()],
    database: prismaAdapter(prisma, { provider: 'postgresql' }),
    // Публічної реєстрації немає: менеджерів створює власник через `npm run admin:create`
    emailAndPassword: { enabled: true, disableSignUp: true, minPasswordLength: 12, maxPasswordLength: 128 },
    session: { expiresIn: 60 * 60 * 12, updateAge: 60 * 30 },
    advanced: {
      useSecureCookies: isProd,
      // IP для ліміту спроб — лише із заголовка довіреного проксі (як і для rate limit заявок)
      ...(env('TRUSTED_PROXY_HEADER') ? { ipAddress: { ipAddressHeaders: [env('TRUSTED_PROXY_HEADER')!] } } : {}),
      defaultCookieAttributes: { httpOnly: true, sameSite: 'lax', secure: isProd },
    },
    rateLimit: {
      enabled: true,
      // Спільне сховище (PostgreSQL), а не памʼять процесу: працює на кількох інстансах і в serverless
      storage: 'database',
      modelName: 'authRateLimit',
      window: 60,
      max: 60,
      customRules: { '/sign-in/email': { window: 300, max: 5 } },
    },
    user: {
      additionalFields: {
        role: { type: 'string', required: false, defaultValue: 'user', input: false },
      },
    },
    plugins: [nextCookies()],
  });
}

type Auth = ReturnType<typeof create>;
const globalForAuth = globalThis as unknown as { __auth?: Auth };

export function getAuth(): Auth {
  return (globalForAuth.__auth ??= create());
}
