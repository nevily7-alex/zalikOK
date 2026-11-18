'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Icon } from './Icon';
import { SectionTitle } from './SectionTitle';
import works from '@content/recent-works.json';

const fmt = (n: number) => `${new Intl.NumberFormat('uk-UA').format(n).replace(/\s/g, ' ')} грн`;

/**
 * Приклади замовлень із портфоліо власника (content/recent-works.json): вид, предмет, обсяг, ціна, без імен і тем.
 * Прокрутка без автоанімації: стрілки + свайп/клавіатура (область прокрутки фокусується).
 */
export function RecentWorks() {
  const trackRef = useRef<HTMLUListElement>(null);
  const [canPrev, setCanPrev] = useState(false);
  const [canNext, setCanNext] = useState(true);

  const update = useCallback(() => {
    const el = trackRef.current;
    if (!el) return;
    setCanPrev(el.scrollLeft > 4);
    setCanNext(el.scrollLeft + el.clientWidth < el.scrollWidth - 4);
  }, []);

  useEffect(() => {
    update();
    const el = trackRef.current;
    el?.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      el?.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [update]);

  const scrollBy = (dir: 1 | -1) => {
    const el = trackRef.current;
    if (!el) return;
    const card = el.querySelector('li');
    const step = (card?.clientWidth ?? 280) + 16;
    el.scrollBy({ left: dir * step * 2, behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
  };

  return (
    <section id="works" className="section container rv" aria-labelledby="works-title">
      <div className="works__head">
        <div>
          <SectionTitle id="works-title">{works.title}</SectionTitle>
          <p className="section-lead">{works.lead}</p>
        </div>
        <div className="works__arrows">
          <button type="button" className="works__arrow" onClick={() => scrollBy(-1)} disabled={!canPrev}>
            <Icon name="arrow-left" />
            <span className="sr-only">Попередні роботи</span>
          </button>
          <button type="button" className="works__arrow" onClick={() => scrollBy(1)} disabled={!canNext}>
            <Icon name="arrow-right" />
            <span className="sr-only">Наступні роботи</span>
          </button>
        </div>
      </div>

      <ul ref={trackRef} className="works__track" tabIndex={0} aria-label="Приклади виконаних робіт, прокрутка по горизонталі">
        {works.items.map((w, i) => (
          <li key={`${w.type}-${w.subject}-${i}`} className="work-card">
            <span className="work-card__type">{w.type}</span>
            <p className="work-card__subject">{w.subject}</p>
            <p className="work-card__topic">{works.topicNote}</p>
            <div className="work-card__foot">
              <span className="work-card__volume">{w.volume ?? 'обсяг за вимогами'}</span>
              <strong className="work-card__price">{fmt(w.price)}</strong>
            </div>
          </li>
        ))}
      </ul>

      <p className="works__note">
        {works.note}{' '}
        <Link href="/ceny" className="works__link">
          Розрахувати вартість
        </Link>
      </p>
    </section>
  );
}
