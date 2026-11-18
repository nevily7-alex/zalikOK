'use client';

import { useEffect, useState } from 'react';

const nf = new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 0 });
const fmt = (n: number, unit: string) => `${nf.format(Math.round(n)).replace(/\s/g, ' ')}${unit}`;

/**
 * Число «набігає» від нуля до значення. Без JS або з prefers-reduced-motion показується одразу кінцеве значення
 * (серверний HTML містить його ж).
 */
export function CountUp({ value, unit = '' }: { value: number; unit?: string }) {
  const [text, setText] = useState(fmt(value, unit));
  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches || value === 0) return;
    let raf = 0;
    const t0 = performance.now();
    const dur = 800;
    const tick = (t: number) => {
      const p = Math.min(1, (t - t0) / dur);
      setText(fmt(value * (1 - Math.pow(1 - p, 3)), unit));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, unit]);
  return <span suppressHydrationWarning>{text}</span>;
}
