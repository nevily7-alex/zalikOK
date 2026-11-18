'use client';

import { useEffect } from 'react';

/**
 * Плавна поява блоків при прокрутці. Без JS (або з prefers-reduced-motion) усе показується одразу:
 * приховування вмикається лише класом `svc-js`, який додається тут.
 */
export function ServiceReveal() {
  useEffect(() => {
    const root = document.querySelector('.svc-detail');
    if (!root) return;
    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const items = Array.from(root.querySelectorAll<HTMLElement>('.svc-rv'));
    if (reduce || typeof IntersectionObserver === 'undefined') return;
    root.classList.add('svc-js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.12 },
    );
    items.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove('svc-js');
    };
  }, []);
  return null;
}
