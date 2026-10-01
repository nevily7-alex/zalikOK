import type { Metadata } from 'next';
import { LegalPage } from '@/components/LegalPage';
import { canonicalFor, legalRobots } from '@/lib/seo';
import { terms } from '@content/legal';

export const metadata: Metadata = {
  title: 'Умови роботи — ЗалікОк',
  description: 'Умови співпраці: як погоджується завдання, вартість, передача матеріалів і межі послуги.',
  robots: legalRobots(),
  alternates: canonicalFor('/umovy'),
};

export default function TermsPage() {
  return <LegalPage doc={terms} />;
}
