import { describe, expect, it } from 'vitest';
import { computeStats, groupOf, parsePeriod, type StatRow } from '@/lib/stats';

const NOW = new Date('2026-11-20T12:00:00Z');
const d = (iso: string) => new Date(`${iso}T12:00:00Z`);
const row = (over: Partial<StatRow>): StatRow => ({ status: 'new', workType: 'kursova', price: null, prepayment: null, createdAt: d('2026-11-19'), closedAt: null, ...over });

describe('статистика адмінки', () => {
  const rows: StatRow[] = [
    row({ status: 'new' }),
    row({ status: 'in_progress', price: 2000, prepayment: 500 }),
    row({ status: 'quoted', price: 1000, prepayment: 1000, workType: 'referat' }),
    row({ status: 'done', price: 4000, closedAt: d('2026-11-10'), workType: 'dyplomna', createdAt: d('2026-11-01') }),
    row({ status: 'closed', price: 1000, closedAt: d('2026-10-05'), createdAt: d('2026-09-01') }), // старий статус = виконано
    row({ status: 'failed', price: 300, createdAt: d('2026-05-01'), closedAt: d('2026-05-02') }),
  ];

  it('рахує статуси, гроші, воронку й успішність за весь час', () => {
    const s = computeStats(rows, 'all', NOW);
    expect(s.counts).toEqual({ new: 1, work: 2, done: 2, failed: 1, total: 6 });
    expect(s.earned).toBe(5000);
    expect(s.avgCheck).toBe(2500);
    expect(s.expected).toBe(3000);
    expect(s.toPay).toBe(1500); // (2000−500) + (1000−1000)
    expect(s.funnel).toEqual({ all: 6, taken: 5, done: 2 });
    expect(s.success).toBe(67); // 2 / (2 + 1)
  });

  it('період відфільтровує за датою створення', () => {
    const s = computeStats(rows, 'week', NOW);
    expect(s.counts.total).toBe(3); // лише створені 19.11
    expect(s.earned).toBe(0);
    expect(s.success).toBeNull();
    const m = computeStats(rows, 'month', NOW);
    expect(m.counts.total).toBe(4); // + створена 01.11
    expect(m.earned).toBe(4000);
  });

  it('графік за місяцями: 12 місяців, виконані за датою закриття', () => {
    const s = computeStats(rows, 'week', NOW); // графік не залежить від періоду
    expect(s.months).toHaveLength(12);
    expect(s.months.at(-1)!.key).toBe('2026-11');
    expect(s.months.find((m) => m.key === '2026-11')!.sum).toBe(4000);
    expect(s.months.find((m) => m.key === '2026-10')!.sum).toBe(1000);
  });

  it('види робіт: кількість і заробіток, за кількістю спадаючи', () => {
    const s = computeStats(rows, 'all', NOW);
    expect(s.byType[0]).toMatchObject({ key: 'kursova', count: 4 });
    expect(s.byType.find((t) => t.key === 'dyplomna')).toMatchObject({ count: 1, earned: 4000 });
  });

  it('групи статусів і розбір періоду', () => {
    expect(groupOf('delivered')).toBe('work');
    expect(groupOf('cancelled')).toBe('failed');
    expect(parsePeriod('year')).toBe('year');
    expect(parsePeriod('x')).toBe('all');
    expect(parsePeriod(undefined)).toBe('all');
  });
});
