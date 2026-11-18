import type { Metadata } from 'next';
import Link from 'next/link';
import { servicePages } from '@/lib/services';
import { findPrice, formatFrom } from '@/lib/prices';
import { canonicalFor } from '@/lib/seo';
import { Icon } from '@/components/Icon';

export const metadata: Metadata = {
  title: 'Послуги — ЗалікОк',
  description: 'Допомога з курсовими, дипломними, магістерськими, рефератами, контрольними, звітами та іншими студентськими й науковими роботами.',
  alternates: canonicalFor('/poslugy'),
};

export default function ServicesPage() {
  return (
    <div className="container svc-page">
      <header className="svc-head">
        <h1 className="h1-form">Послуги</h1>
        <p className="section-lead">
          Оберіть вид роботи: на сторінці — опис, орієнтовна вартість, калькулятор і відповіді на запитання. Остаточну ціну менеджер погоджує до початку роботи.
        </p>
      </header>
      <ul className="svc-grid">
        {servicePages.map((s) => {
          const price = findPrice(s.priceId);
          return (
            <li key={s.slug}>
              <Link href={`/poslugy/${s.slug}`} className="svc-card">
                <span className="svc-card__title">{s.title}</span>
                <span className="svc-card__price">{price ? formatFrom(price.from) : 'вартість після перегляду вимог'}</span>
                <span className="svc-card__more">
                  Детальніше <Icon name="arrow-right" />
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
