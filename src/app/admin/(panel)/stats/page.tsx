import Link from 'next/link';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import { formatMoney, toNum } from '@/lib/admin-labels';
import { PERIODS, computeStats, parsePeriod, type Group } from '@/lib/stats';
import { findPrice } from '@/lib/prices';
import { CountUp } from './CountUp';

export const metadata = { title: 'Статистика — ЗалікОк' };
export const dynamic = 'force-dynamic';

const GROUPS: { key: Group; label: string; color: string }[] = [
  { key: 'new', label: 'Нові', color: '#2a7de1' },
  { key: 'work', label: 'В роботі', color: '#f2b705' },
  { key: 'done', label: 'Виконані', color: '#2fb67a' },
  { key: 'failed', label: 'Провалені', color: '#e5484d' },
];

const typeLabel = (key: string) => (key === '—' ? 'Не вказано' : key === 'other' ? 'Інша робота' : (findPrice(key)?.title ?? key));

export default async function StatsPage({ searchParams }: { searchParams: Promise<{ p?: string }> }) {
  await requireManager();
  const period = parsePeriod((await searchParams).p);

  const rows = await prisma.request.findMany({
    select: { status: true, workType: true, estimatedPrice: true, prepayment: true, createdAt: true, closedAt: true },
  });
  const s = computeStats(
    rows.map((r) => ({ status: r.status, workType: r.workType, price: toNum(r.estimatedPrice), prepayment: toNum(r.prepayment), createdAt: r.createdAt, closedAt: r.closedAt })),
    period,
  );

  const total = s.counts.total;
  const C = 2 * Math.PI * 58;
  const lens = GROUPS.map((g) => (total ? (s.counts[g.key] / total) * C : 0));
  const segs = GROUPS.map((g, i) => ({ ...g, len: lens[i]!, offset: lens.slice(0, i).reduce((x, y) => x + y, 0) }));
  const maxMonth = Math.max(1, ...s.months.map((m) => m.sum));
  const maxType = Math.max(1, ...s.byType.map((t) => t.earned));
  const funnel = [
    { label: 'Усі заявки', value: s.funnel.all, color: '#2a7de1' },
    { label: 'Взяті в роботу', value: s.funnel.taken, color: '#f2b705' },
    { label: 'Успішно виконані', value: s.funnel.done, color: '#2fb67a' },
  ];

  return (
    <>
      <h1 className="admin-h1">Статистика</h1>
      <nav className="st-periods" aria-label="Період">
        {PERIODS.map((p) => (
          <Link key={p.key} href={p.key === 'all' ? '/admin/stats' : `/admin/stats?p=${p.key}`} aria-current={period === p.key ? 'page' : undefined}>
            {p.label}
          </Link>
        ))}
      </nav>
      <p className="field-hint st-hint">
        Період рахується за датою створення заявок. Графік за місяцями завжди показує останні 12 місяців за датою закриття виконаних.
      </p>

      <ul className="st-tiles">
        <li className="st-tile st-tile--y">
          <span>Загальний заробіток</span>
          <strong>
            <CountUp value={s.earned} unit=" грн" />
          </strong>
          <small>сума вартості виконаних</small>
        </li>
        <li className="st-tile st-tile--g">
          <span>Середній чек</span>
          <strong>{s.avgCheck === null ? '—' : <CountUp value={s.avgCheck} unit=" грн" />}</strong>
          <small>за виконаними з вказаною вартістю</small>
        </li>
        <li className="st-tile st-tile--o">
          <span>Очікується (в роботі)</span>
          <strong>
            <CountUp value={s.expected} unit=" грн" />
          </strong>
          <small>сума заявок у роботі</small>
        </li>
        <li className="st-tile st-tile--d">
          <span>Залишок до сплати</span>
          <strong>
            <CountUp value={s.toPay} unit=" грн" />
          </strong>
          <small>за заявками в роботі</small>
        </li>
      </ul>

      <div className="st-row2">
        <section className="admin-card" aria-labelledby="st-status">
          <h2 id="st-status">Заявки за статусами</h2>
          <p className="field-hint">Скільки заявок у кожному статусі</p>
          <div className="st-donut">
            <svg viewBox="0 0 170 170" role="img" aria-label="Розподіл заявок за статусами">
              <circle cx="85" cy="85" r="58" fill="none" stroke="#f1eee5" strokeWidth="26" />
              {segs.map(
                (g) =>
                  g.len > 0 && (
                    <circle
                      key={g.key}
                      className="st-donut__seg"
                      cx="85"
                      cy="85"
                      r="58"
                      fill="none"
                      stroke={g.color}
                      strokeWidth="26"
                      strokeDasharray={`${g.len} ${C - g.len}`}
                      strokeDashoffset={-g.offset}
                      style={{ ['--len' as string]: g.len, ['--c' as string]: C }}
                    />
                  ),
              )}
            </svg>
            <ul className="st-legend">
              {GROUPS.map((g) => (
                <li key={g.key}>
                  <i style={{ background: g.color }} aria-hidden="true" />
                  {g.label}
                  <b>
                    {s.counts[g.key]} · {total ? Math.round((s.counts[g.key] / total) * 100) : 0}%
                  </b>
                </li>
              ))}
              <li className="st-legend__total">
                Усього<b>{total}</b>
              </li>
            </ul>
          </div>
        </section>

        <section className="admin-card" aria-labelledby="st-funnel">
          <h2 id="st-funnel">Воронка заявок</h2>
          <p className="field-hint">
            Успішність: <b>{s.success === null ? '—' : `${s.success}%`}</b> (виконані / виконані + провалені)
          </p>
          <ul className="st-funnel">
            {funnel.map((f) => (
              <li key={f.label} style={{ background: f.color, ['--w' as string]: `${s.funnel.all ? Math.round((f.value / s.funnel.all) * 100) : 0}%` }}>
                {f.label}
                <b>{f.value}</b>
              </li>
            ))}
          </ul>
        </section>
      </div>

      <section className="admin-card st-block" aria-labelledby="st-months">
        <h2 id="st-months">Заробіток за місяцями</h2>
        <p className="field-hint">Виконані заявки, сума вартості</p>
        <ol className="st-bars">
          {s.months.map((m) => (
            <li key={m.key} title={`${m.label}: ${formatMoney(m.sum)}`}>
              <em>{formatMoney(m.sum)}</em>
              <i style={{ ['--h' as string]: `${Math.round((m.sum / maxMonth) * 100)}%` }} />
              <span>{m.label}</span>
            </li>
          ))}
        </ol>
      </section>

      <section className="admin-card st-block" aria-labelledby="st-types">
        <h2 id="st-types">За видами робіт</h2>
        <p className="field-hint">Кількість заявок і заробіток</p>
        <div className="admin-table-wrap">
          <table className="admin-table">
            <caption className="sr-only">Заявки за видами робіт</caption>
            <thead>
              <tr>
                <th scope="col">Вид роботи</th>
                <th scope="col">Заявок</th>
                <th scope="col">Заробіток</th>
                <th scope="col">Частка</th>
              </tr>
            </thead>
            <tbody>
              {s.byType.length === 0 && (
                <tr>
                  <td colSpan={4}>Заявок за цей період немає.</td>
                </tr>
              )}
              {s.byType.map((t) => (
                <tr key={t.key}>
                  <td>{typeLabel(t.key)}</td>
                  <td>{t.count}</td>
                  <td>
                    <strong>{formatMoney(t.earned)}</strong>
                  </td>
                  <td className="st-share">
                    <span className="st-minibar" aria-hidden="true">
                      <i style={{ ['--w' as string]: `${Math.round((t.earned / maxType) * 100)}%` }} />
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
