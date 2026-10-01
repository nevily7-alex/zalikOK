import { z } from 'zod';
import raw from '@content/site-config.json';

const nullableString = z.string().trim().min(1).nullable();

const schema = z.object({
  domain: nullableString,
  telegramUrl: nullableString,
  email: nullableString,
  phone: nullableString,
  operatorName: nullableString,
  operatorRegistration: nullableString,
  workingHours: nullableString,
  responseTime: nullableString,
  privacyPolicyVersion: z.string().min(1),
  legalStatus: z.string(),
  analyticsEnabled: z.boolean(),
  retentionDaysAfterClosure: z.number().int().positive(),
});

export type SiteConfig = z.infer<typeof schema>;

const config: SiteConfig = schema.parse(raw);

export function getSiteConfig(): SiteConfig {
  return config;
}

/** Безпечний http(s)-URL для Telegram; інакше null (кнопка не створюється). */
export function telegramHref(c: SiteConfig = config): string | null {
  if (!c.telegramUrl) return null;
  try {
    const u = new URL(c.telegramUrl);
    return u.protocol === 'https:' && /(^|\.)t\.me$|(^|\.)telegram\.me$/.test(u.hostname) ? u.toString() : null;
  } catch {
    return null;
  }
}

export function emailHref(c: SiteConfig = config): string | null {
  return c.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email) ? `mailto:${c.email}` : null;
}

export function phoneHref(c: SiteConfig = config): string | null {
  if (!c.phone) return null;
  const digits = c.phone.replace(/[^\d+]/g, '');
  return digits.length >= 7 ? `tel:${digits}` : null;
}

export function siteUrl(): string | null {
  if (config.domain) return `https://${config.domain.replace(/^https?:\/\//, '').replace(/\/$/, '')}`;
  return null;
}
