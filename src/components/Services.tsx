import Link from 'next/link';
import { Icon } from './Icon';
import { SectionTitle } from './SectionTitle';
import { content } from '@/lib/content';

export function Services() {
  const { services } = content;
  return (
    <section id="services" className="section container" aria-labelledby="services-title">
      <SectionTitle id="services-title">{services.title}</SectionTitle>
      <ul className="services-grid">
        {services.items.map((item) => (
          <li key={item.id} className={`service-card service-card--${item.tone}`}>
            <span className="icon-circle icon-circle--lg" aria-hidden="true">
              <Icon name={item.icon} large />
            </span>
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
    </section>
  );
}
