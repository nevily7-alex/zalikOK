import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Icon } from '@/components/Icon';
import { content } from '@/lib/content';
import { getSiteConfig } from '@/lib/site-config';
import { REFERENCE_RE } from '@/lib/server/crypto';
import { prisma } from '@/lib/server/db';

export const metadata: Metadata = {
  title: 'Заявку отримано — ЗалікОк',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function ThanksPage({ searchParams }: { searchParams: Promise<{ ref?: string }> }) {
  const { ref } = await searchParams;
  // Показуємо підтвердження лише для реально збереженої заявки; персональних даних не виводимо
  if (!ref || !REFERENCE_RE.test(ref)) redirect('/zaiavka');
  const found = await prisma.request.findUnique({ where: { publicReference: ref }, select: { id: true } });
  if (!found) redirect('/zaiavka');

  const config = getSiteConfig();
  const { states } = content.form;

  return (
    <section className="page-narrow" aria-labelledby="thanks-title">
      <div className="success-card" role="status">
        <span className="icon-circle icon-circle--lg" aria-hidden="true">
          <Icon name="check-circle" large />
        </span>
        <h1 id="thanks-title" className="h1-form">
          {states.successTitle}
        </h1>
        <p>{states.successText}</p>
        <p className="field-hint">Номер вашої заявки:</p>
        <p className="reference-box">{ref}</p>
        <p>
          Менеджер зв’яжеться з вами після перегляду вимог.
          {config.workingHours ? ` Години роботи: ${config.workingHours}.` : ''}
        </p>
        <Link href="/" className="btn btn-secondary">
          На головну
        </Link>
      </div>
    </section>
  );
}
