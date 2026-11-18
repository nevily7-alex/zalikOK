import { Icon } from './Icon';
import { findPrice, formatFrom } from '@/lib/prices';
import { TrackedLink } from './TrackedLink';
import { content } from '@/lib/content';
import { getSiteConfig, telegramHref } from '@/lib/site-config';

const BENEFIT_ICONS = ['graduation', 'document', 'chat'];

/** Підсвічує жовтим кінець заголовка (2–3 слова). */
function Title({ text }: { text: string }) {
  const w = text.trim().split(/\s+/);
  const n = w.length >= 5 ? 3 : w.length >= 3 ? 2 : 1;
  return (
    <>
      {w.slice(0, w.length - n).join(' ')} <mark className="hero__mark">{w.slice(w.length - n).join(' ')}</mark>
    </>
  );
}

export function Hero() {
  const { hero } = content;
  const tg = telegramHref(getSiteConfig());
  const price = findPrice('kursova');

  return (
    <section className="hero container" aria-labelledby="hero-title">
      <div className="hero__text">
        <h1 id="hero-title">
          <Title text={hero.title} />
        </h1>
        <p className="hero__lead">{hero.description}</p>
        <div className="hero__actions">
          <TrackedLink
            href="/ceny"
            className="btn btn-primary"
            event="estimate_cta_click"
            payload={{ placement: 'hero' }}
          >
            {hero.primary}
            <Icon name="arrow-right" />
          </TrackedLink>
          {tg ? (
            <TrackedLink href={tg} external className="btn btn-secondary" event="telegram_click" payload={{ placement: 'hero' }}>
              <Icon name="telegram" />
              {hero.secondary}
            </TrackedLink>
          ) : (
            // Telegram ще не налаштовано: замість неробочої кнопки — якір до форми
            <TrackedLink
              href="/zaiavka"
              className="btn btn-secondary"
              event="estimate_cta_click"
              payload={{ placement: 'hero-secondary' }}
            >
              <Icon name="edit" />
              Залишити заявку
            </TrackedLink>
          )}
        </div>
        <ul className="hero__benefits">
          {hero.benefits.map((text, i) => (
            <li key={text}>
              <span className="icon-circle" aria-hidden="true">
                <Icon name={BENEFIT_ICONS[i] ?? 'check'} />
              </span>
              <span>{text}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="hero__art">
        <picture>
          <source media="(max-width: 639px)" srcSet="/assets/illustrations/hero-stationery-mobile.webp" />
          <img
            src="/assets/illustrations/hero-stationery.webp"
            alt=""
            width={1536}
            height={1024}
            fetchPriority="high"
            decoding="async"
          />
        </picture>
        <div className="hero-fc hero-fc--y" aria-hidden="true">
          {price ? formatFrom(price.from) : 'Ціна до початку'}
          <small>орієнтовна стартова ціна</small>
        </div>
        <div className="hero-fc hero-fc--l" aria-hidden="true">
          Погодження ціни
          <small>до початку роботи</small>
        </div>
        <div className="hero-fc hero-fc--r" aria-hidden="true">
          3 правки
          <small>безкоштовні звернення</small>
        </div>
      </div>
    </section>
  );
}
