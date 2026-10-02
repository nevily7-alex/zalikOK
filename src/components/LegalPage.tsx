import { Icon } from './Icon';
import { Markdown } from './Markdown';
import { loadLegal, type LegalSlug } from '@/lib/legal';
import { getSiteConfig } from '@/lib/site-config';

export function LegalPage({ slug }: { slug: LegalSlug }) {
  const doc = loadLegal(slug);
  const review = getSiteConfig().legalStatus === 'review_required';
  return (
    <article className="page-narrow prose legal" aria-labelledby="legal-title">
      <h1 id="legal-title" className="h1-form">
        {doc.title}
      </h1>
      {(review || doc.placeholders.length > 0) && (
        <div className="notice" role="note">
          <Icon name="info" />
          <div>
            {doc.placeholders.length > 0 && (
              <p>
                У тексті залишилися поля, які потрібно заповнити до публікації (виділені жовтим): {doc.placeholders.length}.
              </p>
            )}
            {review && <p>Документ очікує юридичного перегляду (статус review_required).</p>}
          </div>
        </div>
      )}
      <Markdown source={doc.source} skipFirstH1 />
    </article>
  );
}
