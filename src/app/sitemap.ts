import type { MetadataRoute } from 'next';
import { servicePages } from '@/lib/services';
import { legalPublishable } from '@/lib/legal';
import { siteUrl } from '@/lib/site-config';
import { appUrl, isProd } from '@/lib/server/env';

export default function sitemap(): MetadataRoute.Sitemap {
  // Без реального домену у production sitemap порожній (домен не вигадуємо)
  const base = siteUrl() ?? (isProd ? null : appUrl());
  if (!base) return [];
  const pages = ['/', '/ceny', '/zaiavka', '/poslugy', ...servicePages.map((x) => `/poslugy/${x.slug}`)];
  // Юридичні сторінки потрапляють у sitemap лише після перегляду й заповнення всіх полів
  if (legalPublishable()) pages.push('/umovy', '/privacy');
  return pages.map((p) => ({ url: `${base}${p}` }));
}
