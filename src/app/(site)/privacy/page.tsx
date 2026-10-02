import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { legalPublishable } from '@/lib/legal';
import { canonicalFor } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Політика конфіденційності — ЗалікОк',
  description: 'Які дані ми отримуємо, навіщо їх використовуємо, скільки зберігаємо і які у вас права.',
  robots: legalPublishable() ? undefined : { index: false, follow: true },
  alternates: canonicalFor('/privacy'),
};

export default function PrivacyPage() {
  return <LegalPage slug="privacy" />;
}
