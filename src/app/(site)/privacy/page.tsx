import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { canonicalFor, legalRobots } from '@/lib/seo';
import { privacy } from '@content/legal';

export const metadata: Metadata = {
  title: 'Політика конфіденційності — ЗалікОк',
  description: 'Які дані ми отримуємо через форму заявки, навіщо їх використовуємо і як їх захищаємо.',
  robots: legalRobots(),
  alternates: canonicalFor('/privacy'),
};

export default function PrivacyPage() {
  return <LegalPage doc={privacy} />;
}
