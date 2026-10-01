import Link from 'next/link';
import type { Prisma } from '@/generated/prisma/client';
import { FormDate, FormSelect } from '@/components/ui/FormControls';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import { STATUSES, STATUS_LABELS, type StatusValue } from '@/lib/admin-labels';
import { SERVICE_LABELS, type Service } from '@/lib/validation';

type SP = { q?: string; status?: string; from?: string; to?: string; sort?: string; page?: string };
const PAGE_SIZE = 25;
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default async function RequestsPage({ searchParams }: { searchParams: Promise<SP> }) {
  await requireManager();
  const sp = await searchParams;

  const where: Prisma.RequestWhereInput = {};
  const q = sp.q?.trim().toUpperCase();
  if (q) where.publicReference = { contains: q.slice(0, 20) };
  if (sp.status && (STATUSES as readonly string[]).includes(sp.status)) where.status = sp.status as StatusValue;
  const deadline: Prisma.DateTimeFilter = {};
  if (sp.from && DATE_RE.test(sp.from)) deadline.gte = new Date(`${sp.from}T00:00:00Z`);
  if (sp.to && DATE_RE.test(sp.to)) deadline.lte = new Date(`${sp.to}T00:00:00Z`);
  if (Object.keys(deadline).length) where.deadline = deadline;

  const orderBy: Prisma.RequestOrderByWithRelationInput =
    sp.sort === 'created_asc' ? { createdAt: 'asc' } : sp.sort === 'deadline' ? { deadline: 'asc' } : { createdAt: 'desc' };
  const page = Math.max(1, Number(sp.page) || 1);

  const [rows, total] = await Promise.all([
    prisma.request.findMany({
      where,
      orderBy,
      skip: (page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
      select: {
        id: true,
        publicReference: true,
        service: true,
        deadline: true,
        status: true,
        createdAt: true,
        _count: { select: { attachments: true } },
        outbox: { where: { status: 'failed' }, select: { id: true } },
      },
    }),
    prisma.request.count({ where }),
  ]);
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const qs = (n: number) => {
    const p = new URLSearchParams();
    for (const [k, v] of Object.entries({ ...sp, page: String(n) })) if (v) p.set(k, v);
    return `/admin?${p.toString()}`;
  };

  return (
    <>
      <h1 className="admin-h1">Заявки ({total})</h1>
      <form className="admin-filters" method="get">
        <div className="field">
          <label htmlFor="q">Номер заявки</label>
          <input id="q" name="q" type="search" defaultValue={sp.q ?? ''} placeholder="ZO-…" />
        </div>
        <div className="field">
          <label htmlFor="status">Статус</label>
          <FormSelect
            id="status"
            name="status"
            defaultValue={sp.status ?? ''}
            items={[{ value: '', label: 'Усі' }, ...STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] }))]}
          />
        </div>
        <div className="field">
          <label htmlFor="from">Дедлайн від</label>
          <FormDate id="from" name="from" defaultValue={sp.from ?? ''} placeholder="Будь-який" />
        </div>
        <div className="field">
          <label htmlFor="to">Дедлайн до</label>
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
              { value: 'deadline', label: 'За дедлайном' },
            ]}
          />
        </div>
        <button className="btn btn-primary btn-sm" type="submit">
          Застосувати
        </button>
      </form>

      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">Список заявок</caption>
          <thead>
            <tr>
              <th scope="col">Номер</th>
              <th scope="col">Послуга</th>
              <th scope="col">Дедлайн</th>
              <th scope="col">Статус</th>
              <th scope="col">Створено</th>
              <th scope="col">Файли</th>
              <th scope="col">Сповіщення</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={7}>Заявок за цими умовами немає.</td>
              </tr>
            )}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>
                  <Link href={`/admin/requests/${r.id}`}>{r.publicReference}</Link>
                </td>
                <td>{SERVICE_LABELS[r.service as Service] ?? r.service}</td>
                <td>{r.deadline.toISOString().slice(0, 10)}</td>
                <td>{STATUS_LABELS[r.status]}</td>
                <td>{r.createdAt.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' })}</td>
                <td>{r._count.attachments}</td>
                <td>{r.outbox.length ? <strong className="admin-badge admin-badge--bad">Помилка</strong> : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {pages > 1 && (
        <nav className="admin-pager" aria-label="Сторінки">
          {page > 1 && <Link href={qs(page - 1)}>← Назад</Link>}
          <span>
            Сторінка {page} з {pages}
          </span>
          {page < pages && <Link href={qs(page + 1)}>Далі →</Link>}
        </nav>
      )}
    </>
  );
}
