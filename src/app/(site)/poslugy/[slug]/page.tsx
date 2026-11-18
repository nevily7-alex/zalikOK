import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { getServicePage, servicePages } from '@/lib/services';
import { getTariff } from '@/lib/calc';
import { findPrice, formatFrom } from '@/lib/prices';
import { canonicalFor } from '@/lib/seo';
import { PriceCalculator } from '@/components/PriceCalculator';
import { ServiceBlocks } from '@/components/ServiceBlocks';
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

export default async function ServicePage({ params }: Props) {
  const { slug } = await params;
  const s = getServicePage(slug);
  if (!s) notFound();
  const price = findPrice(s.priceId);
  const tariff = s.priceId ? getTariff(s.priceId) : undefined;
  const note = tariff && tariff.kind === 'pages' ? tariff.note : undefined;
  const orderHref = s.priceId ? `/zaiavka?type=${s.priceId}` : '/zaiavka';

  return (
    <div className="container svc-page">
      <nav className="svc-crumbs" aria-label="Навігація">
        <Link href="/poslugy">Послуги</Link> <span aria-hidden>/</span> <span>{s.title}</span>
      </nav>
      <header className="svc-head">
        <h1 className="h1-form">{s.h1}</h1>
        {s.tagline && <p className="section-lead">{s.tagline}</p>}
        <div className="svc-head__actions">
          <TrackedLink href={orderHref} className="btn btn-primary" event="estimate_cta_click" payload={{ placement: 'service-hero', service: s.slug }}>
            Дізнатися вартість <Icon name="arrow-right" />
          </TrackedLink>
        </div>
      </header>

      {s.terms && s.terms.length > 0 && (
        <section className="svc-section svc-prose" aria-label="Умови">
          <ServiceBlocks blocks={s.terms} />
        </section>
      )}

      <section className="svc-section" aria-labelledby="svc-price">
        <h2 id="svc-price" className="svc-h2">Вартість</h2>
        {price ? (
          <p className="svc-price">
            <strong>{formatFrom(price.from)}</strong>
            <span>Орієнтовна стартова ціна. Остаточну вартість менеджер погоджує після перегляду вимог.</span>
          </p>
        ) : (
          <p className="svc-price">
            <strong>Вартість після перегляду вимог</strong>
            <span>Менеджер оцінює роботу індивідуально й погоджує ціну до початку виконання.</span>
          </p>
        )}
        {note && <p className="field-hint">{note}</p>}
        {s.tiers.length > 0 && (
          <ul className="svc-tiers">
            {s.tiers.map((t) => (
              <li key={t.name}>
                <h3>{t.name}</h3>
                {t.desc && <p>{t.desc}</p>}
                {t.pages && <p className="svc-tiers__pages">{t.pages}</p>}
              </li>
            ))}
          </ul>
        )}
        <p>
          <Link href="/ceny" className="svc-link">Повний прайс</Link>
        </p>
        {s.priceId && <PriceCalculator initialType={s.priceId} />}
      </section>

      {s.faq.length > 0 && (
        <section className="svc-section" aria-labelledby="svc-faq">
          <h2 id="svc-faq" className="svc-h2">{s.faqTitle}</h2>
          <div className="svc-faq">
            {s.faq.map((f) => (
              <details key={f.q} className="svc-faq__item">
                <summary>{f.q}</summary>
                <div className="svc-prose">
                  <ServiceBlocks blocks={f.a} />
                </div>
              </details>
            ))}
          </div>
        </section>
      )}

      {s.article.length > 0 && (
        <article className="svc-section svc-prose">
          {s.articleTitle && <h2 className="svc-h2">{s.articleTitle}</h2>}
          <ServiceBlocks blocks={s.article} />
        </article>
      )}

      {s.subjects.length > 0 && (
        <section className="svc-section" aria-labelledby="svc-subjects">
          <h2 id="svc-subjects" className="svc-h2">{s.subjectsTitle ?? `${s.title} з вашого предмета`}</h2>
          <ul className="svc-chips">
            {s.subjects.map((x) => (
              <li key={x}>{x}</li>
            ))}
          </ul>
        </section>
      )}

      <section className="cta-banner svc-section" aria-labelledby="svc-cta">
        <div>
          <h2 id="svc-cta">{s.ctaTitle ?? `Дізнайтеся вартість: ${s.title.toLowerCase()}`}</h2>
          <p>Заповніть коротку заявку з трьох кроків. Орієнтовну ціну побачите одразу.</p>
        </div>
        <div className="cta-banner__actions">
          <TrackedLink href={orderHref} className="btn btn-primary" event="estimate_cta_click" payload={{ placement: 'service-cta', service: s.slug }}>
            Залишити заявку <Icon name="arrow-right" />
          </TrackedLink>
        </div>
      </section>
    </div>
  );
}
