import type { Metadata } from 'next';
import { RequestForm } from '@/components/RequestForm';
import { content } from '@/lib/content';
import { canonicalFor } from '@/lib/seo';
import { isValidDateString, todayInKyiv } from '@/lib/kyiv-date';

export const metadata: Metadata = {
  title: 'Заявка — ЗалікОк',
  description: 'Надішліть тему, дедлайн і вимоги, щоб отримати індивідуальний розрахунок допомоги з курсовою.',
  alternates: canonicalFor('/zaiavka'),
};

export default async function ZaiavkaPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const initial = one('service');
  const initialType = one('type');
  // Параметри з калькулятора: перевіряємо перед підстановкою у форму
  const pagesNum = Number(one('pages'));
  const initialPages = Number.isInteger(pagesNum) && pagesNum >= 1 && pagesNum <= 500 ? String(pagesNum) : undefined;
  const dl = one('deadline');
  const initialDeadline = dl && isValidDateString(dl) && dl >= todayInKyiv() ? dl : undefined;
  const scope = one('scope')?.slice(0, 240);
  return (
    <section className="section container request-section request-section--page" aria-labelledby="request-title">
      <div className="request-section__intro">
        <h1 id="request-title" className="h1-form">
          {content.form.title}
        </h1>
        <p className="section-lead">{content.form.description}</p>
      </div>
      <div className="request-section__panel">
        <RequestForm
          initialService={initial}
          initialWorkType={initialType}
          initialPages={initialPages}
          initialDeadline={initialDeadline}
          initialComment={scope}
        />
      </div>
    </section>
  );
}
