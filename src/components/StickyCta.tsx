'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Icon } from './Icon';
import { track } from '@/lib/analytics';

/** Липка нижня панель на телефоні: заявка + Telegram. Не показується на сторінці самої заявки й підтвердження. */
export function StickyCta({ telegram }: { telegram: string | null }) {
  const path = usePathname();
  if (path === '/zaiavka' || path === '/diakuiemo') return null;
  return (
    <div className="sticky-cta">
      <Link href="/zaiavka" className="btn btn-primary" onClick={() => track('estimate_cta_click', { placement: 'sticky' })}>
        Залишити заявку
        <Icon name="arrow-right" />
      </Link>
      {telegram && (
        <a
          className="sticky-cta__tg"
          href={telegram}
          target="_blank"
          rel="noopener noreferrer"
          onClick={() => track('telegram_click', { placement: 'sticky' })}
        >
          <Icon name="telegram" />
          <span className="sr-only">Написати в Telegram</span>
        </a>
      )}
    </div>
  );
}
