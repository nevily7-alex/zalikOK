import type { MetadataRoute } from 'next';
import { getSiteConfig, siteUrl } from '@/lib/site-config';
import { appUrl, isProd } from '@/lib/server/env';

export default function sitemap(): MetadataRoute.Sitemap {
  // Без реального домену у production sitemap порожній (домен не вигадуємо)
  const base = siteUrl() ?? (isProd ? null : appUrl());
  if (!base) return [];
  const pages = ['/', '/ceny', '/zaiavka'];
  // Чернетки юридичних сторінок не потрапляють у sitemap до завершення перегляду
  if (getSiteConfig().legalStatus !== 'review_required') pages.push('/umovy', '/privacy');
  return pages.map((p) => ({ url: `${base}${p}` }));
}
