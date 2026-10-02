import type { Metadata } from 'next';
import { siteUrl } from './site-config';

/** Canonical лише після того, як власник вказав домен. */
export function canonicalFor(path: string): Metadata['alternates'] | undefined {
  const base = siteUrl();
  return base ? { canonical: `${base}${path}` } : undefined;
}
