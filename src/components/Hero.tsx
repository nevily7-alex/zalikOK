import { Icon } from './Icon';
import { TrackedLink } from './TrackedLink';
import { content } from '@/lib/content';
import { getSiteConfig, telegramHref } from '@/lib/site-config';

const BENEFIT_ICONS = ['graduation', 'document', 'chat'];

export function Hero() {
  const { hero } = content;
  const tg = telegramHref(getSiteConfig());

  return (
    <section className="hero container" aria-labelledby="hero-title">
      <div className="hero__text">
        <h1 id="hero-title">{hero.title}</h1>
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
              href="/#request"
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
      </div>
    </section>
  );
}
