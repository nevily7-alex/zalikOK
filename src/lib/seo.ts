import type { Metadata } from 'next';
import { getSiteConfig, siteUrl } from './site-config';

/** Canonical лише після того, як власник вказав домен. */
export function canonicalFor(path: string): Metadata['alternates'] | undefined {
  const base = siteUrl();
  return base ? { canonical: `${base}${path}` } : undefined;
}

/** Чернетки юридичних сторінок не індексуються, доки статус review_required. */
export function legalRobots(): Metadata['robots'] | undefined {
  return getSiteConfig().legalStatus === 'review_required' ? { index: false, follow: true } : undefined;
}
