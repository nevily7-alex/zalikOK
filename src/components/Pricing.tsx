import Link from 'next/link';
import { Icon } from './Icon';
import { PriceCalculator } from './PriceCalculator';
import { SectionTitle } from './SectionTitle';
import { content } from '@/lib/content';

export function Pricing() {
  const { pricing } = content;
  return (
    <section id="pricing" className="section container" aria-labelledby="pricing-title">
      <SectionTitle id="pricing-title">{pricing.title}</SectionTitle>
      <p className="section-lead">{pricing.description}</p>
      <ul className="pricing-factors">
        {pricing.factors.map((f) => (
          <li key={f.title} className="factor-card">
            <span className="icon-circle" aria-hidden="true">
              <Icon name={f.icon} />
            </span>
            <div>
              <h3>{f.title}</h3>
              <p>{f.description}</p>
            </div>
          </li>
        ))}
      </ul>
      <div className="pricing-more">
        <PriceCalculator />
        <div className="pricing-more__text">
          <h3>Повний прайс</h3>
          <p>
            Усі види робіт і стартові ціни зібрано на окремій сторінці. Оберіть потрібну позицію й одразу перейдіть до
            заявки.
          </p>
          <Link href="/ceny" className="btn btn-primary">
            Дивитися весь прайс
            <Icon name="arrow-right" />
          </Link>
        </div>
      </div>
    </section>
  );
}
