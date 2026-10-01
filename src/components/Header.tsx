'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { Icon } from './Icon';
import { track } from '@/lib/analytics';

interface NavItem {
  label: string;
  href: string;
}

export function Header({ nav, cta }: { nav: NavItem[]; cta: string }) {
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 4);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // Синхронізуємо стан із нативним <dialog>: Esc, фокус-трап та повернення фокуса надає браузер.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    const mq = window.matchMedia('(min-width: 1024px)');
    const onChange = () => mq.matches && setOpen(false);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  const close = () => setOpen(false);

  return (
    <header className={`site-header${scrolled ? ' is-scrolled' : ''}`}>
      <div className="container site-header__inner">
        <Logo width={160} priority />
        <nav className="site-nav" aria-label="Основна навігація">
          {nav.map((item) => (
            <Link key={item.href} href={item.href}>
              {item.label}
            </Link>
          ))}
        </nav>
        <Link
          href="/ceny"
          className="btn btn-primary btn-sm site-header__cta"
          onClick={() => track('estimate_cta_click', { placement: 'header' })}
        >
          {cta}
          <Icon name="arrow-right" />
        </Link>
        <button
          type="button"
          className="menu-button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpen(true)}
        >
          <Icon name="menu" />
          <span className="sr-only">Відкрити меню</span>
        </button>
      </div>

      <dialog
        id="mobile-menu"
        ref={dialogRef}
        className="drawer"
        aria-label="Меню"
        onClose={close}
        onClick={(e) => e.target === dialogRef.current && close()}
      >
        <div className="drawer__panel">
          <div className="drawer__head">
            <Logo width={140} />
            <button type="button" className="menu-button" onClick={close}>
              <Icon name="close" />
              <span className="sr-only">Закрити меню</span>
            </button>
          </div>
          <nav aria-label="Мобільна навігація" className="drawer__nav">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} onClick={close}>
                {item.label}
              </Link>
            ))}
          </nav>
          <Link
            href="/ceny"
            className="btn btn-primary btn-block"
            onClick={() => {
              track('estimate_cta_click', { placement: 'drawer' });
              close();
            }}
          >
            {cta}
            <Icon name="arrow-right" />
          </Link>
        </div>
      </dialog>
    </header>
  );
}
