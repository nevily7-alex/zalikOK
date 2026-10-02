import { describe, expect, it } from 'vitest';
import { calculate, config, urgencyFor } from '@/lib/calc';
import { ALL_PRICE_ITEMS } from '@/lib/prices';

const TODAY = '2030-01-01';
const plus = (days: number) => new Date(Date.parse(`${TODAY}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

describe('калькулятор', () => {
  it('приклад із тарифної моделі: курсова 35 стор., розрахункова, дедлайн через 7 днів → ~3 094 → 3 100', () => {
    const r = calculate({ typeId: 'kursova', qty: 35, complexity: 'calc', deadline: plus(7), today: TODAY });
    expect(r.status).toBe('ok');
    if (r.status !== 'ok') return;
    expect(r.normalDays).toBe(14);
    expect(r.urgencyMult).toBe(1.3);
    expect(r.exact).toBeCloseTo(3094, 5);
    expect(r.total).toBe(3100);
  });

  it('менший за пакет обсяг не знижує ціну; доплата лише за додатковий обсяг', () => {
    const small = calculate({ typeId: 'kursova', qty: 10, today: TODAY });
    const base = calculate({ typeId: 'kursova', qty: 25, today: TODAY });
    const more = calculate({ typeId: 'kursova', qty: 35, today: TODAY });
    expect(small.status === 'ok' && small.exact).toBe(1200);
    expect(base.status === 'ok' && base.exact).toBe(1200);
    expect(more.status === 'ok' && more.exact).toBe(1700);
  });

  it('межі терміновості', () => {
    expect(urgencyFor(10, 10)).toEqual({ mult: 1 });
    expect(urgencyFor(10, 8)).toEqual({ mult: 1.15 });
    expect(urgencyFor(10, 7.5)).toEqual({ mult: 1.15 });
    expect(urgencyFor(10, 5)).toEqual({ mult: 1.3 });
    expect(urgencyFor(10, 3)).toEqual({ mult: 1.5 });
    expect(urgencyFor(10, 2.5)).toEqual({ mult: 1.5 });
    expect(urgencyFor(10, 2)).toEqual({ manual: true });
  });

  it('стислий дедлайн, сьогодні та минуле', () => {
    expect(calculate({ typeId: 'kursova', qty: 25, deadline: plus(1), today: TODAY }).status).toBe('manual');
    expect(calculate({ typeId: 'kursova', qty: 25, deadline: plus(0), today: TODAY }).status).toBe('manual');
    expect(calculate({ typeId: 'kursova', qty: 25, deadline: plus(-1), today: TODAY }).status).toBe('incomplete');
    expect(calculate({ typeId: 'kursova', qty: 25, deadline: plus(10), today: TODAY }).status).toBe('ok');
  });

  it('текстові послуги: мінімум, тариф за знаки, якість скану', () => {
    const min = calculate({ typeId: 'pereklad', qty: 1000, today: TODAY });
    expect(min.status === 'ok' && min.exact).toBe(300);
    const big = calculate({ typeId: 'pereklad', qty: 18000, today: TODAY });
    expect(big.status === 'ok' && big.exact).toBe(1800);
    const scan = calculate({ typeId: 'pereklad', qty: 18000, quality: 'scan', today: TODAY });
    expect(scan.status === 'ok' && scan.exact).toBeCloseTo(2160, 5);
    expect(calculate({ typeId: 'pereklad', qty: 18000, quality: 'unreadable', today: TODAY }).status).toBe('manual');
    const proof = calculate({ typeId: 'perevirka-tekstu', qty: 20000, today: TODAY });
    expect(proof.status === 'ok' && proof.exact).toBe(600);
  });

  it('презентація та креслення: варіанти замість складності', () => {
    const p = calculate({ typeId: 'prezentatsiya', qty: 20, variant: 'write', today: TODAY });
    expect(p.status === 'ok' && p.exact).toBeCloseTo((500 + 10 * 50) * 1.3, 5);
    expect(calculate({ typeId: 'prezentatsiya', qty: 20, today: TODAY }).status).toBe('incomplete'); // варіант не обрано
    const d = calculate({ typeId: 'kreslennya', qty: 2, variant: 'a3', today: TODAY });
    expect(d.status === 'ok' && d.exact).toBeCloseTo(1000 * 1.4, 5);
    expect(calculate({ typeId: 'kreslennya', qty: 1, variant: 'a0', today: TODAY }).status).toBe('manual');
  });

  it('доопрацювання: мінімум і ставки за зачеплені сторінки', () => {
    const proof = calculate({ typeId: 'dopratsyuvannya-kursovoi', qty: 10, revisionMode: 'proof', today: TODAY });
    expect(proof.status === 'ok' && proof.exact).toBe(450); // 10×20=200 < мінімуму
    const content = calculate({ typeId: 'dopratsyuvannya-dyplomnoi', qty: 20, revisionMode: 'content', today: TODAY });
    expect(content.status === 'ok' && content.exact).toBe(1800);
    expect(calculate({ typeId: 'dopratsyuvannya-kursovoi', qty: 10, today: TODAY }).status).toBe('incomplete');
  });

  it('великий вихідний матеріал, нестандартна складність і дисертації → менеджер', () => {
    expect(calculate({ typeId: 'retsenziya', qty: 2, sourceQty: 500, today: TODAY }).status).toBe('manual');
    expect(calculate({ typeId: 'retsenziya', qty: 2, sourceQty: 20, today: TODAY }).status).toBe('ok');
    expect(calculate({ typeId: 'retsenziya', qty: 2, today: TODAY }).status).toBe('incomplete');
    expect(calculate({ typeId: 'kursova', qty: 25, complexity: 'custom', today: TODAY }).status).toBe('manual');
    expect(calculate({ typeId: 'dysertatsiya', today: TODAY }).status).toBe('manual');
    expect(calculate({ typeId: 'dopratsyuvannya-dysertatsii', today: TODAY }).status).toBe('manual');
  });

  it('некоректні дані: обсяг 0, дробовий, відсутній, невідомий вид', () => {
    for (const qty of [0, -3, 2.5, undefined]) {
      expect(calculate({ typeId: 'kursova', qty, today: TODAY }).status).toBe('incomplete');
    }
    expect(calculate({ typeId: 'nope', qty: 5, today: TODAY }).status).toBe('incomplete');
  });

  it('великий обсяг збільшує звичайний строк: 50 стор. курсової → 20 днів', () => {
    const r = calculate({ typeId: 'kursova', qty: 50, today: TODAY });
    expect(r.status === 'ok' && r.normalDays).toBe(20);
  });

  it('ціна «від» у прайсі дорівнює мінімуму калькулятора (прайс і калькулятор не розходяться)', () => {
    for (const item of ALL_PRICE_ITEMS) {
      const t = config.tariffs[item.id]!;
      if (t.kind === 'manual') continue; // дисертації: оцінка менеджера, «від» лише орієнтир
      const min = t.kind === 'chars' || t.kind === 'revision' ? t.min : t.base;
      expect(item.from, item.title).toBe(min);
    }
  });

  it('кожна позиція прайсу має тариф, а виключених послуг немає', () => {
    for (const item of ALL_PRICE_ITEMS) expect(config.tariffs[item.id], item.id).toBeTruthy();
    for (const id of Object.keys(config.tariffs)) expect(ALL_PRICE_ITEMS.some((i) => i.id === id), id).toBe(true);
    expect(Object.keys(config.tariffs)).toHaveLength(31);
  });
});
