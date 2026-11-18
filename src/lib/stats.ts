import { ACTIVE_STATUSES, DONE_STATUSES, FAILED_STATUSES, type AnyStatus } from './admin-labels';

export type Period = 'week' | 'month' | 'year' | 'all';
export const PERIODS: { key: Period; label: string }[] = [
  { key: 'all', label: 'Весь час' },
  { key: 'year', label: 'Рік' },
  { key: 'month', label: 'Місяць' },
  { key: 'week', label: '7 днів' },
];
const DAYS: Record<Period, number | null> = { all: null, year: 365, month: 30, week: 7 };

export interface StatRow {
  status: AnyStatus;
  workType: string | null;
  price: number | null;
  prepayment: number | null;
  createdAt: Date;
  closedAt: Date | null;
}

export type Group = 'new' | 'work' | 'done' | 'failed';
export function groupOf(s: AnyStatus): Group {
  if (s === 'new') return 'new';
  if (DONE_STATUSES.includes(s)) return 'done';
  if (FAILED_STATUSES.includes(s)) return 'failed';
  return 'work';
}

export function parsePeriod(v: string | undefined): Period {
  return v === 'week' || v === 'month' || v === 'year' ? v : 'all';
}

const MONTHS = ['Січ', 'Лют', 'Бер', 'Кві', 'Тра', 'Чер', 'Лип', 'Сер', 'Вер', 'Жов', 'Лис', 'Гру'];

/** YYYY-MM за київським часом. */
function monthKey(d: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv', year: 'numeric', month: '2-digit' }).format(d).slice(0, 7);
}

export interface Stats {
  counts: Record<Group, number> & { total: number };
  earned: number;
  avgCheck: number | null;
  expected: number;
  toPay: number;
  funnel: { all: number; taken: number; done: number };
  success: number | null;
  byType: { key: string; count: number; earned: number }[];
  months: { key: string; label: string; sum: number }[];
}

/**
 * Статистика. Період відфільтровує заявки за датою створення; графік за місяцями завжди показує
 * останні 12 місяців за датою закриття виконаних заявок.
 */
export function computeStats(all: StatRow[], period: Period, now: Date = new Date()): Stats {
  const days = DAYS[period];
  const since = days === null ? null : new Date(now.getTime() - days * 86_400_000);
  const rows = since ? all.filter((r) => r.createdAt >= since) : all;

  const counts = { new: 0, work: 0, done: 0, failed: 0, total: rows.length };
  let earned = 0;
  let doneWithPrice = 0;
  let expected = 0;
  let toPay = 0;
  const byType = new Map<string, { count: number; earned: number }>();
  for (const r of rows) {
    const g = groupOf(r.status);
    counts[g]++;
    const price = r.price ?? 0;
    if (g === 'done') {
      earned += price;
      if (price > 0) doneWithPrice++;
    } else if (ACTIVE_STATUSES.includes(r.status)) {
      expected += price;
      toPay += Math.max(0, price - (r.prepayment ?? 0));
    }
    const key = r.workType ?? '—';
    const t = byType.get(key) ?? { count: 0, earned: 0 };
    t.count++;
    if (g === 'done') t.earned += price;
    byType.set(key, t);
  }

  const taken = counts.work + counts.done + counts.failed;
  const finished = counts.done + counts.failed;

  // 12 останніх місяців, найстаріший першим
  const months: Stats['months'] = [];
  const cur = new Date(`${monthKey(now)}-01T00:00:00Z`);
  for (let i = 11; i >= 0; i--) {
    const d = new Date(cur);
    d.setUTCMonth(d.getUTCMonth() - i);
    months.push({ key: d.toISOString().slice(0, 7), label: MONTHS[d.getUTCMonth()]!, sum: 0 });
  }
  for (const r of all) {
    if (groupOf(r.status) !== 'done') continue;
    const m = months.find((x) => x.key === monthKey(r.closedAt ?? r.createdAt));
    if (m) m.sum += r.price ?? 0;
  }

  return {
    counts,
    earned,
    avgCheck: doneWithPrice ? earned / doneWithPrice : null,
    expected,
    toPay,
    funnel: { all: rows.length, taken, done: counts.done },
    success: finished ? Math.round((counts.done / finished) * 100) : null,
    byType: [...byType.entries()].map(([key, v]) => ({ key, ...v })).sort((a, b) => b.count - a.count),
    months,
  };
}
