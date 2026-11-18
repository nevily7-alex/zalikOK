import type { Metadata } from 'next';
import { PricingExplorer } from '@/components/PricingExplorer';
import { canonicalFor } from '@/lib/seo';
import { prices } from '@/lib/prices';

export const metadata: Metadata = {
  title: 'Вартість і послуги — ЗалікОк',
  description:
    'Стартові ціни на допомогу з навчальними та науковими роботами. Остаточну вартість менеджер погоджує після перегляду вимог.',
  alternates: canonicalFor('/ceny'),
};

export default function PricesPage() {
  return (
    <div className="container prices-page">
      <header className="prices-page__head">
        <h1 className="h1-form">Вартість і послуги</h1>
        <p className="section-lead">{prices.note}</p>
      </header>
      <PricingExplorer />
    </div>
  );
}
