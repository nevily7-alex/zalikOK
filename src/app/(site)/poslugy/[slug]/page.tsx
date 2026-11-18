import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServicePage, servicePages, type Block } from '@/lib/services';
import { getTariff } from '@/lib/calc';
import { findPrice, formatFrom } from '@/lib/prices';
import { canonicalFor } from '@/lib/seo';
import { getSiteConfig, telegramHref } from '@/lib/site-config';
import { PriceCalculator } from '@/components/PriceCalculator';
import { ServiceBlocks } from '@/components/ServiceBlocks';
import { Art, ArtScene, ART_CYCLE, type ArtName } from '@/components/ServiceArt';
import { ServiceReveal } from '@/components/ServiceReveal';
import { Icon } from '@/components/Icon';
import { TrackedLink } from '@/components/TrackedLink';

export function generateStaticParams() {
  return servicePages.map((s) => ({ slug: s.slug }));
}

type Props = { params: Promise<{ slug: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const s = getServicePage(slug);
  if (!s) return {};
  return {
    title: `${s.title} на замовлення — ЗалікОк`,
    description: s.tagline ?? `${s.title}: опис послуги, орієнтовна вартість і калькулятор. Остаточну ціну менеджер погоджує до початку роботи.`,
    alternates: canonicalFor(`/poslugy/${s.slug}`),
  };
}

/** Підсвічує жовтим лише ключову фразу (до 2 слів), «на замовлення» лишається звичайним текстом. */
function Marked({ text }: { text: string }) {
  const m = text.trim().match(/^(.*?)(\s+на замовлення)?$/);
  const core = (m?.[1] ?? text).split(/\s+/);
  const tail = m?.[2] ?? '';
  if (core.length > 4) return <>{text}</>;
  const n = core.length === 1 ? 1 : Math.min(2, core.length - 1);
  const head = core.slice(0, core.length - n).join(' ');
  return (
    <>
      {head && `${head} `}
      <mark>{core.slice(core.length - n).join(' ')}</mark>
      {tail}
    </>
  );
}

/** Ділить статтю на вступ (до першого підзаголовка) і розділи за h2/h3. */
function splitArticle(blocks: Block[]) {
  const intro: Block[] = [];
  const sections: { title: string; body: Block[] }[] = [];
  for (const b of blocks) {
    if (b.t === 'h2' || b.t === 'h3') {
      sections.push({ title: b.html, body: [] });
    } else if (sections.length === 0) {
      intro.push(b);
    } else {
      sections[sections.length - 1]!.body.push(b);
    }
  }
  return { intro, sections };
}

const CONDITIONS = [
  'Ціна до початку роботи',
  'Три безкоштовні звернення з правками',
  'Оплата 50/50 або 100%',
  'Єдині умови для кожної роботи',
];

const TIER_ART: ArtName[] = ['docs', 'laptop', 'books', 'calc'];

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const s = getServicePage(slug);
  if (!s) notFound();
  const price = findPrice(s.priceId);
  const tariff = s.priceId ? getTariff(s.priceId) : undefined;
  const note = tariff && tariff.kind === 'pages' ? tariff.note : undefined;
  const orderHref = s.priceId ? `/zaiavka?type=${s.priceId}` : '/zaiavka';
  const tg = telegramHref(getSiteConfig());
  const { intro, sections } = splitArticle(s.article);
  const half = Math.ceil(s.subjects.length / 2);
  const subjectRows = [s.subjects.slice(0, half), s.subjects.slice(half)].filter((r) => r.length > 0);

  return (
    <div className="svc-detail">
      <ServiceReveal />

      <section className="svc-hero">
        <div className="container svc-hero__grid">
          <nav className="svc-crumbs svc-hero__crumbs" aria-label="Навігація">
            <Link href="/poslugy">Послуги</Link> <span aria-hidden>/</span> <span>{s.title}</span>
          </nav>
          <div className="svc-hero__txt">
            <h1 className="svc-hero__h1">
              <Marked text={s.h1} />
            </h1>
            <p className="svc-hero__lead">{s.tagline ?? 'Ціну й строк менеджер погоджує з вами до початку роботи.'}</p>
            <div className="svc-hero__cta">
              <TrackedLink href={orderHref} className="btn btn-primary" event="estimate_cta_click" payload={{ placement: 'service-hero', service: s.slug }}>
                Дізнатися вартість <Icon name="arrow-right" />
              </TrackedLink>
              {tg && (
                <TrackedLink href={tg} external className="btn btn-secondary" event="telegram_click" payload={{ placement: 'service-hero', service: s.slug }}>
                  <Icon name="telegram" />
                  Написати в Telegram
                </TrackedLink>
              )}
            </div>
          </div>
          <div className="svc-hero__art" aria-hidden="true">
            <ArtScene />
            {price && (
              <div className="svc-fc svc-fc--y" style={{ right: 12, top: 10 }}>
                {formatFrom(price.from)}
                <small>орієнтовна стартова ціна</small>
              </div>
            )}
            <div className="svc-fc" style={{ left: 0, top: '34%', animationDelay: '-1.5s' }}>
              Погодження ціни
              <small>до початку роботи</small>
            </div>
            <div className="svc-fc" style={{ right: 28, top: '62%', animationDelay: '-3s' }}>
              3 правки
              <small>безкоштовні звернення</small>
            </div>
          </div>
        </div>
      </section>

      <section className="svc-sec" aria-labelledby="svc-terms">
        <div className="container">
          <h2 id="svc-terms" className="svc-title svc-rv">
            Одні й ті самі <mark>умови</mark> для кожної роботи
          </h2>
          <div className="svc-mq svc-rv" aria-label="Умови співпраці">
            <div className="svc-mq__track">
              {[0, 1].map((k) => (
                <div className="svc-mq__grp" key={k} aria-hidden={k === 1 ? true : undefined}>
                  {[...CONDITIONS, ...CONDITIONS].map((c, i) => (
                    <span key={i}>{c}</span>
                  ))}
                </div>
              ))}
            </div>
          </div>
          {s.terms && s.terms.length > 0 && (
            <div className="svc-prose svc-terms-text svc-rv">
              <ServiceBlocks blocks={s.terms} />
            </div>
          )}
        </div>
      </section>

      <section className="svc-sec svc-sec--band" aria-labelledby="svc-price">
        <div className="container">
          <h2 id="svc-price" className="svc-title svc-rv">
            <mark>Вартість</mark>
          </h2>
          <div className={`svc-pr${s.priceId ? ' svc-pr--calc' : ''}`}>
            <div className="svc-rv">
              <span className="svc-pr__tag">Орієнтовна стартова ціна</span>
              {price ? (
                <p className="svc-price">
                  <strong>{formatFrom(price.from)}</strong>
                  <span>Остаточну вартість менеджер погоджує після перегляду вимог.</span>
                </p>
              ) : (
                <p className="svc-price">
                  <strong>Вартість після перегляду вимог</strong>
                  <span>Менеджер оцінює роботу індивідуально й погоджує ціну до початку виконання.</span>
                </p>
              )}
              {note && <p className="field-hint">{note}</p>}
              <div className="svc-pr__links">
                <TrackedLink href={orderHref} className="btn btn-primary" event="estimate_cta_click" payload={{ placement: 'service-price', service: s.slug }}>
                  Залишити заявку <Icon name="arrow-right" />
                </TrackedLink>
                <Link href="/ceny" className="svc-link">Повний прайс</Link>
              </div>
              <Art name="calc" className="svc-pr__art" />
            </div>
            {s.priceId && (
              <div className="svc-rv svc-pr__calc">
                <PriceCalculator initialType={s.priceId} />
              </div>
            )}
          </div>
          {s.tiers.length > 0 && (
            <ul className="svc-tiers">
              {s.tiers.map((t, i) => (
                <li key={t.name} className="svc-tier svc-rv">
                  <Art name={TIER_ART[i % TIER_ART.length]!} className="svc-tier__art" />
                  <h3>{t.name}</h3>
                  {t.desc && <p>{t.desc}</p>}
                  {t.pages && <p className="svc-tiers__pages">{t.pages}</p>}
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>

      {s.article.length > 0 && (
        <section className="svc-sec" aria-labelledby="svc-article">
          <div className="container">
            <h2 id="svc-article" className="svc-title svc-rv">
              <Marked text={s.articleTitle ?? s.title} />
            </h2>
            {intro.length > 0 && (
              <div className="svc-prose svc-intro svc-rv">
                <ServiceBlocks blocks={intro} />
              </div>
            )}
            {sections.length > 0 && (
              <div className="svc-cards">
                {sections.map((sec, i) => (
                  <article key={i} className={`svc-acard svc-rv${sec.body.some((b) => b.t === 'table') ? ' svc-acard--wide' : ''}`}>
                    <Art name={ART_CYCLE[i % ART_CYCLE.length]!} className="svc-acard__art" />
                    <h3 dangerouslySetInnerHTML={{ __html: sec.title }} />
                    <div className="svc-prose">
                      <ServiceBlocks blocks={sec.body} />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </div>
        </section>
      )}

      {s.faq.length > 0 && (
        <section className="svc-sec svc-sec--band" aria-labelledby="svc-faq">
          <div className="container">
            <h2 id="svc-faq" className="svc-title svc-rv">
              <Marked text={s.faqTitle} />
            </h2>
            <div className="svc-faq">
              {s.faq.map((f) => (
                <details key={f.q} className="svc-faq__item svc-rv">
                  <summary>
                    <span>{f.q}</span>
                    <i aria-hidden="true">+</i>
                  </summary>
                  <div className="svc-prose">
                    <ServiceBlocks blocks={f.a} />
                  </div>
                </details>
              ))}
            </div>
          </div>
        </section>
      )}

      {subjectRows.length > 0 && (
        <section className="svc-sec" aria-labelledby="svc-subjects">
          <div className="container">
            <div className="svc-subj-head svc-rv">
              <Art name="cap" className="svc-subj-head__art" />
              <h2 id="svc-subjects" className="svc-title">
                <Marked text={s.subjectsTitle ?? `${s.title} з вашого предмета`} />
              </h2>
            </div>
          </div>
          <div className="svc-sjm svc-rv" aria-label="Предмети">
            {subjectRows.map((row, ri) => (
              <div className={`svc-sjm__row${ri % 2 ? ' svc-sjm__row--rev' : ''}`} key={ri} style={{ ['--svc-dur' as string]: `${Math.max(30, row.length * 2.4)}s` }}>
                {[0, 1].map((k) => (
                  <div className="svc-sjm__grp" key={k} aria-hidden={k === 1 ? true : undefined}>
                    {row.map((x) => (
                      <span key={x}>{x}</span>
                    ))}
                  </div>
                ))}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="svc-sec" aria-labelledby="svc-cta">
        <div className="container">
          <div className="svc-cta svc-rv">
            <Art name="laptop" className="svc-cta__art" />
            <div className="svc-cta__txt">
              <h2 id="svc-cta">{s.ctaTitle ?? `Дізнайтеся вартість: ${s.title.toLowerCase()}`}</h2>
              <p>Заповніть коротку заявку з трьох кроків. Орієнтовну ціну побачите одразу.</p>
            </div>
            <TrackedLink href={orderHref} className="btn svc-cta__btn" event="estimate_cta_click" payload={{ placement: 'service-cta', service: s.slug }}>
              Залишити заявку <Icon name="arrow-right" />
            </TrackedLink>
          </div>
        </div>
      </section>
    </div>
  );
}
