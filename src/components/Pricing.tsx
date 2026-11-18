import { Icon } from './Icon';
import { PricingExplorer } from './PricingExplorer';
import { SectionTitle } from './SectionTitle';
import { content } from '@/lib/content';

export function Pricing() {
  const { pricing } = content;
  return (
    <section id="pricing" className="section container" aria-labelledby="pricing-title">
      <SectionTitle id="pricing-title">{pricing.title}</SectionTitle>
      <ul className="pricing-factors rv-stagger">
        {pricing.factors.map((f) => (
          <li key={f.title} className="factor-card rv">
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
      <PricingExplorer />
    </section>
  );
}
