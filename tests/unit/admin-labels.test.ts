import { describe, expect, it } from 'vitest';
import { formatMoney, remaining, tabStatuses, toNum } from '@/lib/admin-labels';

describe('гроші в адмінці', () => {
  it('залишок = вартість − передоплата, не менше нуля', () => {
    expect(remaining(2000, 500)).toBe(1500);
    expect(remaining(2000, null)).toBe(2000);
    expect(remaining(1000, 1500)).toBe(0);
    expect(remaining(null, 500)).toBeNull();
    expect(remaining(1250.5, 250.25)).toBe(1000.25);
  });
  it('форматування й розбір', () => {
    expect(formatMoney(1000)).toBe('1 000 грн');
    expect(formatMoney(null)).toBe('—');
    expect(toNum('1250.50')).toBe(1250.5);
    expect(toNum('')).toBeNull();
  });
  it('вкладки: нові / в роботі / виконані / провалені', () => {
    expect(tabStatuses('new')).toEqual(['new']);
    expect(tabStatuses('work')).toContain('in_progress');
    expect(tabStatuses('done')).toEqual(['done', 'closed']);
    expect(tabStatuses('failed')).toEqual(['failed', 'cancelled']);
    expect(tabStatuses('all')).toBeNull();
  });
});
