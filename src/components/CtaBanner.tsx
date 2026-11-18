import { Icon } from './Icon';
import { TrackedLink } from './TrackedLink';
import { getSiteConfig, telegramHref } from '@/lib/site-config';

/** Заклик до заявки на головній: сама форма тепер окрема сторінка /zaiavka. */
export function CtaBanner() {
  const tg = telegramHref(getSiteConfig());
  return (
    <section id="request" className="section container" aria-labelledby="cta-title">
      <div className="cta-banner">
        <div>
          <h2 id="cta-title">Готові розпочати?</h2>
          <p>Заповніть коротку заявку з трьох кроків: робота, деталі, контакт. Орієнтовну ціну побачите одразу.</p>
        </div>
        <div className="cta-banner__actions">
          <TrackedLink href="/zaiavka" className="btn btn-primary" event="estimate_cta_click" payload={{ placement: 'cta-banner' }}>
            Залишити заявку
            <Icon name="arrow-right" />
          </TrackedLink>
          {tg && (
            <TrackedLink href={tg} external className="btn btn-secondary" event="telegram_click" payload={{ placement: 'cta-banner' }}>
              <Icon name="telegram" />
              Написати в Telegram
            </TrackedLink>
          )}
        </div>
      </div>
    </section>
  );
}
