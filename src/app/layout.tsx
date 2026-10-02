import type { Metadata, Viewport } from 'next';
import { manrope, nunito } from './fonts';
import { canonicalFor } from '@/lib/seo';
import { siteUrl } from '@/lib/site-config';
import { appUrl, isProd } from '@/lib/server/env';
import '@/styles/tokens.css';
import '@/styles/base.css';
import '@/styles/site.css';
import '@/styles/form.css';
import '@/styles/ui.css';

const DESCRIPTION =
  'ЗалікОк допомагає з планом і структурою, редагуванням та оформленням курсових робіт. Надішліть тему та вимоги — менеджер зв’яжеться для уточнення деталей.';

export function generateMetadata(): Metadata {
  // metadataBase і абсолютні OG-адреси — лише коли відомий реальний домен (або локальна розробка)
  const base = siteUrl() ?? (isProd ? null : appUrl());
  return {
    ...(base ? { metadataBase: new URL(base) } : {}),
    // Без заданого домену (тестовий стенд) сторінки не індексуються
    ...(siteUrl() ? {} : { robots: { index: false, follow: false } }),
    title: 'ЗалікОк — допомога з курсовими роботами',
    description: DESCRIPTION,
    alternates: canonicalFor('/'),
    icons: {
      icon: [
        { url: '/assets/brand/favicon.svg', type: 'image/svg+xml' },
        { url: '/assets/brand/icon-32.png', sizes: '32x32', type: 'image/png' },
      ],
      apple: '/assets/brand/icon-180.png',
    },
    openGraph: {
      type: 'website',
      locale: 'uk_UA',
      siteName: 'ЗалікОк',
      title: 'ЗалікОк — допомога з курсовими роботами',
      description: DESCRIPTION,
      ...(base ? { images: [{ url: '/assets/social/og-cover.png', width: 1200, height: 630, alt: 'ЗалікОк' }] } : {}),
    },
    twitter: { card: base ? 'summary_large_image' : 'summary' },
  };
}

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#FFFEFA',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="uk" className={`${manrope.variable} ${nunito.variable}`}>
      <body>
        <a href="#main" className="skip-link">
          Перейти до змісту
        </a>
        {children}
      </body>
    </html>
  );
}
