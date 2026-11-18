import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { FormDate, FormSelect } from '@/components/ui/FormControls';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
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
import { CopyButton } from './CopyButton';

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

  const [rows, total, grouped, money] = await Promise.all([
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
    prisma.request.findMany({ where: { estimatedPrice: { not: null } }, select: { status: true, estimatedPrice: true, prepayment: true } }),
  ]);
  // Підсумки для верхньої панелі: за всіма заявками, незалежно від фільтрів
  let earned = 0;
  let toPay = 0;
  for (const m of money) {
    const price = toNum(m.estimatedPrice) ?? 0;
    if (DONE_STATUSES.includes(m.status)) earned += price;
    else if (ACTIVE_STATUSES.includes(m.status)) toPay += Math.max(0, price - (toNum(m.prepayment) ?? 0));
  }
  const countAll = (key: string) => {
    const st = tabStatuses(key);
    return grouped.filter((g) => !st || st.includes(g.status)).reduce((n, g) => n + g._count._all, 0);
  };
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

      <ul className="admin-kpis admin-kpis--top">
        <li className="admin-kpi">
          <span>Усього заявок</span>
          <strong>{countAll('all')}</strong>
        </li>
        <li className="admin-kpi">
          <span>Нові та в роботі</span>
          <strong>{countAll('new') + countAll('work')}</strong>
        </li>
        <li className="admin-kpi admin-kpi--money">
          <span>Загальний заробіток</span>
          <strong>{formatMoney(earned)}</strong>
        </li>
        <li className="admin-kpi admin-kpi--money">
          <span>Залишок до сплати (в роботі)</span>
          <strong>{formatMoney(toPay)}</strong>
        </li>
      </ul>


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

      <ul className="admin-rows">
        {rows.length === 0 && <li className="admin-empty">Заявок за цими умовами немає.</li>}
        {rows.map((r, i) => {
          const price = toNum(r.estimatedPrice);
          const pre = toNum(r.prepayment) ?? 0;
          const left = remaining(price, pre);
          const pct = price ? Math.min(100, Math.round((pre / price) * 100)) : 0;
          const full = price !== null && pre > 0 && left === 0;
          const active = ACTIVE_STATUSES.includes(r.status);
          const due = r.dueDate ?? r.deadline;
          const days = Math.round((Date.parse(`${due.toISOString().slice(0, 10)}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86_400_000);
          const chip = days < 0 ? `прострочено ${-days} дн.` : days === 0 ? 'сьогодні' : `через ${days} дн.`;
          const chipClass = days < 0 ? 'admin-chip--bad' : days <= 3 ? 'admin-chip--soon' : '';
          const work = findPrice(r.workType)?.title;
          const group =
            r.status === 'new' ? 'new' : r.status === 'done' || r.status === 'closed' ? 'done' : r.status === 'failed' || r.status === 'cancelled' ? 'failed' : 'work';
          const method = CONTACT_LABELS[r.contactMethod as ContactMethod] ?? r.contactMethod;
          return (
            <li key={r.id} className={`admin-rowcard admin-rowcard--${group}`} style={{ ['--i' as string]: Math.min(i, 12) }}>
              <span className="admin-rowcard__stripe" aria-hidden="true" />
              <div className="admin-rowcard__mid">
                <div className="admin-rowcard__top">
                  <Link href={`/admin/requests/${r.id}`} className="admin-rowcard__num">
                    № {r.publicReference}
                  </Link>
                  <span className={`admin-status admin-status--${r.status}`}>{STATUS_LABELS[r.status]}</span>
                  {r.priority > 0 && (
                    <strong className={`admin-prio admin-prio--${r.priority}`}>
                      {r.priority === 2 ? '🔥' : '⚑'} {PRIORITY_LABELS[r.priority]}
                    </strong>
                  )}
                  <small className="admin-rowcard__created">
                    {r.createdAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv', dateStyle: 'short', timeStyle: 'short' })}
                    {r.outbox.length > 0 && <strong className="admin-badge admin-badge--bad">Сповіщення: помилка</strong>}
                  </small>
                </div>
                <h3 className="admin-rowcard__topic">{r.topic || (r.topicUnknown ? 'Тему ще не визначено' : '—')}</h3>
                <div className="admin-rowcard__meta">
                  <span>
                    {SERVICE_LABELS[r.service as Service] ?? r.service}
                    {work ? ` · ${work}` : ''}
                  </span>
                  <span className="admin-rowcard__contact">
                    {r.contact} <small>({method})</small>
                    <CopyButton value={r.contact} label={r.contact} />
                  </span>
                  <span className="admin-rowcard__dl">
                    {dmy(due)}
                    {active && <span className={`admin-chip ${chipClass}`}>{chip}</span>}
                    <small>{r.dueDate ? 'дедлайн виконання' : 'дедлайн клієнта'}</small>
                  </span>
                </div>
              </div>
              <div className="admin-rowcard__price">
                {price === null ? (
                  <span className="admin-price admin-price--none">вартість не вказана</span>
                ) : (
                  <>
                    <span className="admin-price">{formatMoney(price)}</span>
                    <div className="admin-pay">
                      <div className={`admin-pay__bar${full ? '' : ' admin-pay__bar--part'}`} role="img" aria-label={`Оплачено ${pct}%`}>
                        <i style={{ ['--w' as string]: `${pct}%` }} />
                      </div>
                      <small>
                        {pre > 0 ? (
                          full ? (
                            <b>✓ Оплачено повністю</b>
                          ) : (
                            <>
                              внесено <b>{formatMoney(pre)}</b> · залишок <b>{formatMoney(left)}</b>
                            </>
                          )
                        ) : (
                          'передоплати ще немає'
                        )}
                      </small>
                    </div>
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>

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
