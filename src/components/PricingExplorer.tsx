'use client';

import Link from 'next/link';
import { useRef, useState } from 'react';
import { PriceCalculator } from './PriceCalculator';
import { formatFrom, prices } from '@/lib/prices';

/** Прайс за вкладками груп + калькулятор збоку (макет «C. Вкладки»). Доступні вкладки: ← → Home End. */
export function PricingExplorer() {
  const groups = prices.groups;
  const [active, setActive] = useState(0);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const group = groups[active]!;

  const select = (i: number) => {
    setActive(i);
    tabRefs.current[i]?.focus();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    const last = groups.length - 1;
    const map: Record<string, number> = {
      ArrowRight: active === last ? 0 : active + 1,
      ArrowLeft: active === 0 ? last : active - 1,
      Home: 0,
      End: last,
    };
    if (e.key in map) {
      e.preventDefault();
      select(map[e.key]!);
    }
  };

  return (
    <div className="price-explorer">
      <div className="price-explorer__list">
        <div role="tablist" aria-label="Групи послуг" className="price-tabs" onKeyDown={onKeyDown}>
          {groups.map((g, i) => (
            <button
              key={g.id}
              ref={(el) => {
                tabRefs.current[i] = el;
              }}
              type="button"
              role="tab"
              id={`price-tab-${g.id}`}
              aria-selected={i === active}
              aria-controls={`price-panel-${g.id}`}
              tabIndex={i === active ? 0 : -1}
              className="price-tab"
              onClick={() => setActive(i)}
            >
              {g.title}
              <span className="price-tab__n" aria-hidden="true">
                {g.items.length}
              </span>
            </button>
          ))}
        </div>
        <div
          role="tabpanel"
          id={`price-panel-${group.id}`}
          aria-labelledby={`price-tab-${group.id}`}
          className="price-panel"
          tabIndex={0}
        >
          <ul className="price-panel__rows">
            {group.items.map((i) => (
              <li key={i.id}>
                <Link href={`/zaiavka?type=${i.id}`} className="price-row">
                  <span>{i.title}</span>
                  <strong>{formatFrom(i.from)}</strong>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
      <PriceCalculator />
    </div>
  );
}
