import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/site-config';

export default function robots(): MetadataRoute.Robots {
  const base = siteUrl();
  // Домен ще не заданий (тестовий стенд, напр. *.vercel.app): сайт не індексується
  if (!base) return { rules: [{ userAgent: '*', disallow: ['/'] }] };
  return {
    rules: [{ userAgent: '*', allow: '/', disallow: ['/admin', '/api/', '/diakuiemo'] }],
    sitemap: `${base}/sitemap.xml`,
  };
}
