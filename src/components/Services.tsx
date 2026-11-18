import Link from 'next/link';
import { Icon } from './Icon';
import { SectionTitle } from './SectionTitle';
import { ServicesShowcase, type ShowcaseItem } from './ServicesShowcase';
import { getServicePage } from '@/lib/services';
import { findPrice, formatFrom } from '@/lib/prices';
import { content } from '@/lib/content';

/** Послуги на головній: добірка з розділу /poslugy (не всі). Ціни — з прайсу, тексти — коротко й без обіцянок поза Умовами. */
const FEATURED: { slug: string; art: ShowcaseItem['art']; description: string }[] = [
  { slug: 'kursovi-roboty', art: 'docs', description: 'Теоретична чи з практичною частиною: за методичкою вашої кафедри. Ціну менеджер погоджує до початку роботи.' },
  { slug: 'dyplomni-roboty', art: 'cap', description: 'План, написання та оформлення за вимогами вашого вишу. Етапи погоджуємо разом із вами.' },
  { slug: 'referaty', art: 'books', description: 'Тема, структура, список джерел і оформлення за вашими вимогами.' },
  { slug: 'kontrolni-roboty', art: 'calc', description: 'Теоретичні питання й задачі з поясненням розв’язання.' },
  { slug: 'zvity-z-praktyky', art: 'laptop', description: 'Структура звіту, опис бази практики, висновки й додатки.' },
  { slug: 'magisterski-roboty', art: 'steps', description: 'Складні роботи погоджуємо поетапно: план, розділи, правки.' },
];

export function Services() {
  const items: ShowcaseItem[] = FEATURED.flatMap((f) => {
    const s = getServicePage(f.slug);
    if (!s) return [];
    const price = findPrice(s.priceId);
    return [{ slug: s.slug, title: s.title, description: f.description, price: price ? formatFrom(price.from) : null, art: f.art }];
  });

  return (
    <section id="services" className="section container" aria-labelledby="services-title">
      <div className="services-head">
        <SectionTitle id="services-title">{content.services.title}</SectionTitle>
        <Link href="/poslugy" className="btn btn-secondary">
          Усі послуги
          <Icon name="arrow-right" />
        </Link>
      </div>
      <div className="rv">
        <ServicesShowcase items={items} />
      </div>
    </section>
  );
}
