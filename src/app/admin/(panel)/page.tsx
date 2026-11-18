import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { FormDate, FormSelect } from '@/components/ui/FormControls';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import {
  ACTIVE_STATUSES,
  PRIORITY_LABELS,
  STATUS_LABELS,
  TABS,
  formatMoney,
  remaining,
  tabStatuses,
  toNum,
} from '@/lib/admin-labels';
import { todayInKyiv } from '@/lib/kyiv-date';
import { findPrice } from '@/lib/prices';
import { CONTACT_LABELS, SERVICE_LABELS, type ContactMethod, type Service } from '@/lib/validation';
import { RowLinks } from './RowLinks';

type SP = { q?: string; tab?: string; from?: string; to?: string; sort?: string; page?: string };
const PAGE_SIZE = 25;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const dmy = (d: Date | null) => (d ? d.toISOString().slice(0, 10).split('-').reverse().join('.') : '—');

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const sp = await searchParams;
  const tab = TABS.some((t) => t.key === sp.tab) ? (sp.tab as string) : 'all';

  const where: Prisma.RequestWhereInput = {};
  const q = sp.q?.trim();
  if (q) {
    const digits = q.replace(/\D/g, '');
    where.publicReference = { contains: digits.length === q.length ? digits.slice(0, 12) : q.toUpperCase().slice(0, 20) };
  }
  const statuses = tabStatuses(tab);
  if (statuses) where.status = { in: statuses };
  const deadline: Prisma.DateTimeFilter = {};
  if (sp.from && DATE_RE.test(sp.from)) deadline.gte = new Date(`${sp.from}T00:00:00Z`);
  if (sp.to && DATE_RE.test(sp.to)) deadline.lte = new Date(`${sp.to}T00:00:00Z`);
  if (Object.keys(deadline).length) where.deadline = deadline;

  const orderBy: Prisma.RequestOrderByWithRelationInput[] =
    sp.sort === 'created_asc'
      ? [{ createdAt: 'asc' }]
      : sp.sort === 'deadline'
        ? [{ deadline: 'asc' }]
        : sp.sort === 'due'
          ? [{ dueDate: { sort: 'asc', nulls: 'last' } }, { deadline: 'asc' }]
          : sp.sort === 'priority'
            ? [{ priority: 'desc' }, { dueDate: { sort: 'asc', nulls: 'last' } }, { deadline: 'asc' }]
            : [{ createdAt: 'desc' }];
  const page = Math.max(1, Number(sp.page) || 1);

  // Лічильники вкладок рахуємо без фільтра статусу, але з рештою фільтрів
  const whereNoTab = { ...where };
  delete whereNoTab.status;

  const [rows, total, grouped] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        publicReference: true,
        service: true,
        workType: true,
        topic: true,
        topicUnknown: true,
        contactMethod: true,
        contact: true,
        deadline: true,
        dueDate: true,
        priority: true,
        estimatedPrice: true,
        prepayment: true,
        status: true,
        createdAt: true,
        _count: { select: { attachments: true } },
        outbox: { where: { status: 'failed' }, select: { id: true } },
      },
    }),
    prisma.request.count({ where }),
    prisma.request.groupBy({ by: ['status'], where: whereNoTab, _count: { _all: true } }),
  ]);
  const countFor = (key: string) => {
    const st = tabStatuses(key);
    return grouped.filter((g) => !st || st.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  };
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (over: Record<string, string>) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, ...over })) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `/admin?${s}` : '/admin';
  };
  const today = todayInKyiv();

  return (
    <>
      <h1 className="admin-h1">Заявки ({total})</h1>

      <nav className="admin-tabs" aria-label="Тип заявок">
        {TABS.map((t) => (
          <Link key={t.key} href={qs({ tab: t.key === 'all' ? '' : t.key, page: '' })} aria-current={tab === t.key ? 'page' : undefined}>
            {t.label} <span>{countFor(t.key)}</span>
          </Link>
        ))}
      </nav>

      <form className="admin-filters" method="get">
        {tab !== 'all' && <input type="hidden" name="tab" value={tab} />}
        <div className="field">
          <label htmlFor="q">Номер заявки</label>
          <input id="q" name="q" type="search" defaultValue={sp.q ?? ''} placeholder="000001" inputMode="numeric" />
        </div>
        <div className="field">
          <label htmlFor="from">Дедлайн клієнта від</label>
          <FormDate id="from" name="from" defaultValue={sp.from ?? ''} placeholder="Будь-який" />
        </div>
        <div className="field">
          <label htmlFor="to">Дедлайн клієнта до</label>
          <FormDate id="to" name="to" defaultValue={sp.to ?? ''} placeholder="Будь-який" />
        </div>
        <div className="field">
          <label htmlFor="sort">Сортування</label>
          <FormSelect
            id="sort"
            name="sort"
            defaultValue={sp.sort ?? ''}
            items={[
              { value: '', label: 'Спочатку нові' },
              { value: 'created_asc', label: 'Спочатку старі' },
              { value: 'priority', label: 'За пріоритетом' },
              { value: 'due', label: 'За дедлайном виконання' },
              { value: 'deadline', label: 'За дедлайном клієнта' },
            ]}
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          Застосувати
        </button>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table admin-table--rows">
          <caption className="sr-only">Список заявок</caption>
          <thead>
            <tr>
              <th scope="col">Номер</th>
              <th scope="col">Послуга</th>
              <th scope="col">Тема</th>
              <th scope="col">Контакт</th>
              <th scope="col">Дедлайн</th>
              <th scope="col">Пріоритет</th>
              <th scope="col">Вартість</th>
              <th scope="col">Статус</th>
              <th scope="col">Створено</th>
              <th scope="col">Сповіщення</th>
            </tr>
          </thead>
          <RowLinks>
            {rows.length === 0 && (
              <tr>
                <td colSpan={10}>Заявок за цими умовами немає.</td>
              </tr>
            )}
            {rows.map((r) => {
              const price = toNum(r.estimatedPrice);
              const left = remaining(price, toNum(r.prepayment));
              const due = r.dueDate ?? r.deadline;
              const overdue = ACTIVE_STATUSES.includes(r.status) && due.toISOString().slice(0, 10) < today;
              const work = findPrice(r.workType)?.title;
              return (
                <tr key={r.id} data-href={`/admin/requests/${r.id}`} className="admin-row">
                  <td>
                    <Link href={`/admin/requests/${r.id}`}>{r.publicReference}</Link>
                  </td>
                  <td>
                    {SERVICE_LABELS[r.service as Service] ?? r.service}
                    {work && <small className="admin-sub">{work}</small>}
                  </td>
                  <td className="admin-topic">{r.topic || (r.topicUnknown ? 'Ще не визначено' : '—')}</td>
                  <td>
                    {r.contact}
                    <small className="admin-sub">{CONTACT_LABELS[r.contactMethod as ContactMethod] ?? r.contactMethod}</small>
                  </td>
                  <td>
                    <span className={overdue ? 'admin-badge admin-badge--bad' : undefined}>{dmy(r.dueDate ?? r.deadline)}</span>
                    <small className="admin-sub">{r.dueDate ? `клієнт: ${dmy(r.deadline)}` : 'дедлайн клієнта'}</small>
                  </td>
                  <td>{r.priority > 0 ? <strong className={`admin-prio admin-prio--${r.priority}`}>{PRIORITY_LABELS[r.priority]}</strong> : '—'}</td>
                  <td>
                    {formatMoney(price)}
                    {price !== null && r.prepayment !== null && <small className="admin-sub">залишок {formatMoney(left)}</small>}
                  </td>
                  <td>
                    <span className={`admin-status admin-status--${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  </td>
                  <td>{r.createdAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short' })}</td>
                  <td>{r.outbox.length ? <strong className="admin-badge admin-badge--bad">Помилка</strong> : '—'}</td>
                </tr>
              );
            })}
          </RowLinks>
        </table>
      </div>

      {pages > 1 && (
        <nav className="admin-pager" aria-label="Сторінки">
          {page > 1 && <Link href={qs({ page: String(page - 1) })}>← Назад</Link>}
          <span>
            Сторінка {page} з {pages}
          </span>
          {page < pages && <Link href={qs({ page: String(page + 1) })}>Далі →</Link>}
        </nav>
      )}
    </>
  );
}
