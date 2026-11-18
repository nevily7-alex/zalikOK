import Link from 'next/link';
import { Icon } from './Icon';
import { Art, type ArtName } from './ServiceArt';
import { SectionTitle } from './SectionTitle';
import { content } from '@/lib/content';

const SERVICE_ART: Record<string, ArtName> = { plan: 'docs', editing: 'pencil', formatting: 'laptop' };

export function Services() {
  const { services } = content;
  return (
    <section id="services" className="section container" aria-labelledby="services-title">
      <SectionTitle id="services-title">{services.title}</SectionTitle>
      <ul className="services-grid rv-stagger">
        {services.items.map((item) => (
          <li key={item.id} className={`service-card service-card--${item.tone} rv`}>
            <Art name={SERVICE_ART[item.id] ?? 'docs'} className="service-card__art" />
            <div className="service-card__body">
              <h3>
                <Link href={`/zaiavka?service=${item.id}`} className="service-card__link">
                  {item.title}
                </Link>
              </h3>
              <p>{item.description}</p>
            </div>
            <span className="arrow-circle" aria-hidden="true">
              <Icon name="arrow-right" />
            </span>
          </li>
        ))}
      </ul>
      <p className="services-more rv">
        <Link href="/poslugy" className="btn btn-secondary">
          Усі послуги
          <Icon name="arrow-right" />
        </Link>
      </p>
    </section>
  );
}
