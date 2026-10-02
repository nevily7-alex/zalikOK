import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { legalPublishable } from '@/lib/legal';
import { canonicalFor } from '@/lib/seo';

export const metadata: Metadata = {
  title: 'Умови замовлення та надання послуг — ЗалікОк',
  description: 'Умови співпраці: як погоджується завдання, вартість і оплата, передача результату, правки, строки, скасування й претензії.',
  robots: legalPublishable() ? undefined : { index: false, follow: true },
  alternates: canonicalFor('/umovy'),
};

export default function TermsPage() {
  return <LegalPage slug="terms" />;
}
