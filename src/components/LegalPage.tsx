import { Icon } from './Icon';
import { getSiteConfig } from '@/lib/site-config';
import type { LegalDoc } from '@content/legal';

const MISSING = '[потребує заповнення власником]';

function values(): Record<string, string> {
  const c = getSiteConfig();
  const contact = c.email ?? c.telegramUrl ?? c.phone ?? MISSING;
  return {
    operatorName: c.operatorName ?? MISSING,
    operatorRegistration: c.operatorRegistration ?? MISSING,
    dataContact: contact,
    version: c.privacyPolicyVersion,
    retention: `Технічне значення за замовчуванням: до ${c.retentionDaysAfterClosure} днів після закриття заявки, незавершені завантаження видаляються через 24 години. Остаточні строки має підтвердити власник: ${MISSING}`,
    analytics: c.analyticsEnabled ? MISSING : 'Аналітика та аналітичні cookies наразі не підключені.',
    paymentRules: MISSING,
    revisionRules: MISSING,
    refundRules: MISSING,
    disputeContact: contact,
    providers: MISSING,
  };
}

export function LegalPage({ doc }: { doc: LegalDoc }) {
  const vars = values();
  const fill = (s: string) => s.replace(/\{\{(\w+)\}\}/g, (_, k: string) => vars[k] ?? MISSING);
  const draft = getSiteConfig().legalStatus === 'review_required';
  return (
    <article className="page-narrow prose" aria-labelledby="legal-title">
      <h1 id="legal-title" className="h1-form">
        {doc.title}
      </h1>
      {draft && (
        <p className="notice" role="note">
          <Icon name="info" />
          <span>
            Робоча чернетка (статус review_required). Документ залежить від реального оператора, способу оплати та
            обробки даних і потребує перегляду перед публікацією.
          </span>
        </p>
      )}
      <p>{doc.intro}</p>
      <ol>
        {doc.sections.map((s) => (
          <li key={s.title}>
            <h2>{s.title}</h2>
            {s.paragraphs.map((p, i) => (
              <p key={i}>{fill(p)}</p>
            ))}
          </li>
        ))}
      </ol>
    </article>
  );
}
