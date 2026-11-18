import type { Metadata } from 'next';
import { RequestWizard } from '@/components/RequestWizard';
import { WhatsNext } from '@/components/WhatsNext';
import { canonicalFor } from '@/lib/seo';
import { isValidDateString, todayInKyiv } from '@/lib/kyiv-date';
import { getSiteConfig, telegramHref } from '@/lib/site-config';

export const metadata: Metadata = {
  title: 'Заявка — ЗалікОк',
  description: 'Заявка з трьох кроків: оберіть роботу, додайте деталі та контакт. Орієнтовну ціну побачите одразу.',
  alternates: canonicalFor('/zaiavka'),
};

type SP = Record<string, string | string[] | undefined>;

export default async function ZaiavkaPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  // Параметри з калькулятора/посилань перевіряються тут; сама форма додатково валідує все на сервері
  const qtyNum = Number(one('qty') ?? one('pages'));
  const qty = Number.isInteger(qtyNum) && qtyNum >= 1 && qtyNum <= 1_000_000 ? String(qtyNum) : undefined;
  const dl = one('deadline');
  const deadline = dl && isValidDateString(dl) && dl >= todayInKyiv() ? dl : undefined;
  const src = Number(one('src'));

  return (
    <div className="container order-page">
      <header className="order-page__head">
        <h1 className="h1-form">Розкажіть про ваше завдання</h1>
        <p className="section-lead">Три короткі кроки. Орієнтовна ціна рахується одразу, нічого платити не потрібно.</p>
      </header>
      <RequestWizard
        telegram={telegramHref(getSiteConfig())}
        initial={{
          service: one('service'),
          workType: one('type'),
          qty,
          deadline,
          comment: one('scope')?.slice(0, 240),
          complexity: one('cx')?.slice(0, 20),
          variant: one('variant')?.slice(0, 20),
          revisionMode: one('mode'),
          quality: one('quality')?.slice(0, 20),
          sourceQty: Number.isInteger(src) && src > 0 ? String(src) : undefined,
        }}
      />
      <WhatsNext />
    </div>
  );
}
