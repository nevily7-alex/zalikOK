'use client';

import { useEffect } from 'react';

/**
 * Плавна поява блоків `.rv` у головному вмісті при прокрутці.
 * Без JS або з prefers-reduced-motion усе видно одразу: приховування вмикає лише клас `rv-js`.
 */
export function PageReveal() {
  useEffect(() => {
    const root = document.getElementById('main');
    if (!root || typeof IntersectionObserver === 'undefined') return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const items = Array.from(root.querySelectorAll<HTMLElement>('.rv'));
    root.classList.add('rv-js');
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('in');
            io.unobserve(e.target);
          }
        }
      },
      { threshold: 0.05 },
    );
    items.forEach((el) => io.observe(el));
    return () => {
      io.disconnect();
      root.classList.remove('rv-js');
    };
  }, []);
  return null;
}
