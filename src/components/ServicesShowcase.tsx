'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Art, type ArtName } from './ServiceArt';

export interface ShowcaseItem {
  slug: string;
  title: string;
  description: string;
  price: string | null;
  art: ArtName;
}

const ROTATE_MS = 5000;

/** Перелік послуг: ліворуч список, праворуч велика картка з кнопкою «Детальніше». Саме змінюється, доки користувач не втрутився. */
export function ServicesShowcase({ items }: { items: ShowcaseItem[] }) {
  const [sel, setSel] = useState(0);
  const [auto, setAuto] = useState(true);
  const paused = useRef(false);

  useEffect(() => {
    if (!auto || typeof window === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => {
      if (!paused.current) setSel((s) => (s + 1) % items.length);
    }, ROTATE_MS);
    return () => window.clearInterval(id);
  }, [auto, items.length]);

  const pick = (i: number) => {
    setAuto(false);
    setSel(i);
  };
  const cur = items[sel]!;

  return (
    <div
      className="ssp"
      onMouseEnter={() => (paused.current = true)}
      onMouseLeave={() => (paused.current = false)}
      onFocus={() => (paused.current = true)}
      onBlur={() => (paused.current = false)}
    >
      <ul className="ssp__list">
        {items.map((s, i) => (
          <li key={s.slug}>
            <button type="button" className="ssp__item" aria-pressed={i === sel} onClick={() => pick(i)}>
              <span>{s.title}</span>
              {s.price && <small>{s.price}</small>}
            </button>
          </li>
        ))}
      </ul>
      <div className="ssp__det">
        <div key={`t-${sel}`} className="ssp__txt">
          {cur.price && <span className="ssp__price">{cur.price}</span>}
          <h3>{cur.title}</h3>
          <p>{cur.description}</p>
          <Link href={`/poslugy/${cur.slug}`} className="ssp__go">
            Детальніше
          </Link>
        </div>
        <Art key={`a-${sel}`} name={cur.art} className="ssp__art" />
        {auto && <span key={`b-${sel}`} className="ssp__bar" aria-hidden="true" />}
      </div>
    </div>
  );
}
