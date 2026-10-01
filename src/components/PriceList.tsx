import Link from 'next/link';
import { Icon } from './Icon';
import { formatFrom, prices } from '@/lib/prices';

const GROUP_ICONS: Record<string, string> = { study: 'book', science: 'graduation', texts: 'edit', support: 'format' };

export function PriceList() {
  return (
    <div className="price-groups">
      {prices.groups.map((g) => (
        <section key={g.id} className="price-group" aria-labelledby={`pg-${g.id}`}>
          <header className="price-group__head">
            <span className="icon-circle" aria-hidden="true">
              <Icon name={GROUP_ICONS[g.id] ?? 'document'} />
            </span>
            <h2 id={`pg-${g.id}`}>{g.title}</h2>
          </header>
          <ul>
            {g.items.map((i) => (
              <li key={i.id}>
                <Link href={`/zaiavka?type=${i.id}`} className="price-row">
                  <span>{i.title}</span>
                  <strong>{formatFrom(i.from)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
