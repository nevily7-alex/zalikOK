import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import { ACTIVE_STATUSES, DONE_STATUSES, FAILED_STATUSES, TABS, formatMoney, toNum, type AnyStatus } from '@/lib/admin-labels';
import { todayInKyiv } from '@/lib/kyiv-date';
import { findPrice } from '@/lib/prices';

export const metadata = { title: 'Статистика — ЗалікОк' };

const GROUPS = [
  { key: 'new', label: 'Нові', statuses: ['new'] as AnyStatus[] },
  { key: 'work', label: 'В роботі', statuses: TABS.find((t) => t.key === 'work')!.statuses as unknown as AnyStatus[] },
  { key: 'done', label: 'Виконані', statuses: DONE_STATUSES },
  { key: 'failed', label: 'Провалені', statuses: FAILED_STATUSES },
];
const groupOf = (s: AnyStatus) => GROUPS.find((g) => g.statuses.includes(s))?.key ?? 'work';

export default async function StatsPage() {
  await requireManager();
  const monthStart = new Date(`${todayInKyiv().slice(0, 7)}-01T00:00:00Z`);

  const [byType, money, month] = await Promise.all([
    prisma.request.groupBy({ by: ['workType', 'status'], _count: { _all: true }, _sum: { estimatedPrice: true } }),
    prisma.request.findMany({ select: { status: true, estimatedPrice: true, prepayment: true } }),
    prisma.request.findMany({
      where: { status: { in: DONE_STATUSES as never }, closedAt: { gte: monthStart } },
      select: { estimatedPrice: true },
    }),
  ]);

  const count = { new: 0, work: 0, done: 0, failed: 0 };
  for (const g of byType) count[groupOf(g.status) as keyof typeof count] += g._count._all;
  const total = count.new + count.work + count.done + count.failed;
  const finished = count.done + count.failed;

  let earned = 0;
  let doneWithPrice = 0;
  let expected = 0;
  let prepaid = 0;
  let toPay = 0;
  for (const r of money) {
    const price = toNum(r.estimatedPrice) ?? 0;
    const pre = toNum(r.prepayment) ?? 0;
    if (DONE_STATUSES.includes(r.status)) {
      earned += price;
      if (price > 0) doneWithPrice++;
    } else if (ACTIVE_STATUSES.includes(r.status)) {
      expected += price;
      prepaid += pre;
      toPay += Math.max(0, price - pre);
    }
  }
  const earnedMonth = month.reduce((n, r) => n + (toNum(r.estimatedPrice) ?? 0), 0);

  const rows = new Map<string, { label: string; new: number; work: number; done: number; failed: number; earned: number }>();
  for (const g of byType) {
    const key = g.workType ?? '—';
    const label = g.workType === null ? 'Не вказано' : g.workType === 'other' ? 'Інша робота' : (findPrice(g.workType)?.title ?? g.workType);
    const row = rows.get(key) ?? { label, new: 0, work: 0, done: 0, failed: 0, earned: 0 };
    const grp = groupOf(g.status) as 'new' | 'work' | 'done' | 'failed';
    row[grp] += g._count._all;
    if (grp === 'done') row.earned += toNum(g._sum.estimatedPrice) ?? 0;
    rows.set(key, row);
  }
  const table = [...rows.values()].sort((a, b) => b.new + b.work + b.done + b.failed - (a.new + a.work + a.done + a.failed));

  const kpi: [string, string, string?][] = [
    ['Усього заявок', String(total)],
    ['Нові', String(count.new)],
    ['В роботі', String(count.work)],
    ['Виконані', String(count.done)],
    ['Провалені', String(count.failed)],
    ['Успішність', finished ? `${Math.round((count.done / finished) * 100)}%` : '—', 'виконані / (виконані + провалені)'],
  ];
  const cash: [string, string, string?][] = [
    ['Загальний заробіток', formatMoney(earned), 'сума вартості виконаних заявок'],
    ['Заробіток цього місяця', formatMoney(earnedMonth), 'виконані з початку місяця'],
    ['Середній чек', doneWithPrice ? formatMoney(earned / doneWithPrice) : '—', 'за виконаними з вказаною вартістю'],
    ['В роботі на суму', formatMoney(expected), 'очікуваний дохід'],
    ['Отримано передоплат', formatMoney(prepaid), 'за заявками в роботі'],
    ['Залишок до сплати', formatMoney(toPay), 'за заявками в роботі'],
  ];

  return (
    <>
      <h1 className="admin-h1">Статистика</h1>
      <h2 className="admin-h2">Заявки за статусами</h2>
      <ul className="admin-kpis">
        {kpi.map(([k, v, hint]) => (
          <li key={k} className="admin-kpi">
            <span>{k}</span>
            <strong>{v}</strong>
            {hint && <small>{hint}</small>}
          </li>
        ))}
      </ul>
      <h2 className="admin-h2">Гроші</h2>
      <ul className="admin-kpis">
        {cash.map(([k, v, hint]) => (
          <li key={k} className="admin-kpi admin-kpi--money">
            <span>{k}</span>
            <strong>{v}</strong>
            {hint && <small>{hint}</small>}
          </li>
        ))}
      </ul>
      <h2 className="admin-h2">За видами робіт</h2>
      <div className="admin-table-wrap">
        <table className="admin-table">
          <caption className="sr-only">Заявки за видами робіт і статусами</caption>
          <thead>
            <tr>
              <th scope="col">Вид роботи</th>
              <th scope="col">Нові</th>
              <th scope="col">В роботі</th>
              <th scope="col">Виконані</th>
              <th scope="col">Провалені</th>
              <th scope="col">Усього</th>
              <th scope="col">Заробіток</th>
            </tr>
          </thead>
          <tbody>
            {table.length === 0 && (
              <tr>
                <td colSpan={7}>Заявок ще немає.</td>
              </tr>
            )}
            {table.map((r) => (
              <tr key={r.label}>
                <td>{r.label}</td>
                <td>{r.new}</td>
                <td>{r.work}</td>
                <td>{r.done}</td>
                <td>{r.failed}</td>
                <td>
                  <strong>{r.new + r.work + r.done + r.failed}</strong>
                </td>
                <td>{formatMoney(r.earned)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
