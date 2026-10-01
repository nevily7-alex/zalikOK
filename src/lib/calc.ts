import raw from '@content/tariffs.json';
import { isValidDateString, todayInKyiv } from './kyiv-date';

export interface Option {
  id: string;
  label: string;
  mult?: number;
  manual?: boolean;
}
interface SourceCfg {
  label: string;
  manualAbove: number;
}
export type Tariff =
  | { kind: 'pages'; unit: string; base: number; baseQty: number; extra: number; normalDays: number; source?: SourceCfg; noComplexity?: boolean }
  | { kind: 'chars'; min: number; rate: number; perChars: number; baseChars: number; normalDays: number; quality?: boolean }
  | {
      kind: 'units';
      unit: string;
      base: number;
      baseQty: number;
      extra: number;
      normalDays: number;
      noComplexity?: boolean;
      variant?: { label: string; options: Option[] };
    }
  | { kind: 'revision'; min: number; proof: number; content: number; baseQty: number; normalDays: number }
  | { kind: 'manual'; reason: string };

interface Config {
  rounding: number;
  complexity: Option[];
  urgency: { minRatio: number; mult: number }[];
  quality: Option[];
  tariffs: Record<string, Tariff>;
}
export const config = raw as unknown as Config;

export function getTariff(typeId: string): Tariff | undefined {
  return config.tariffs[typeId];
}

export interface CalcInput {
  typeId: string;
  qty?: number;
  sourceQty?: number;
  complexity?: string;
  quality?: string;
  variant?: string;
  revisionMode?: 'proof' | 'content';
  deadline?: string; // YYYY-MM-DD
  today?: string;
}

export interface Line {
  label: string;
  amount: number;
}
export type CalcResult =
  | { status: 'ok'; total: number; exact: number; lines: Line[]; normalDays: number; urgencyMult: number }
  | { status: 'manual'; reason: string }
  | { status: 'incomplete'; reason: string };

const MAX_QTY = 100_000_000;

export function roundTo(n: number, step = config.rounding): number {
  return Math.round(n / step) * step;
}

function daysBetween(from: string, to: string): number {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

export function urgencyFor(normalDays: number, availableDays: number): { mult: number } | { manual: true } {
  const ratio = availableDays / normalDays;
  for (const step of config.urgency) if (ratio >= step.minRatio) return { mult: step.mult };
  return { manual: true };
}

const manual = (reason: string): CalcResult => ({ status: 'manual', reason });
const incomplete = (reason: string): CalcResult => ({ status: 'incomplete', reason });
const fmt = (n: number) => new Intl.NumberFormat('uk-UA').format(Math.round(n)).replace(/\s/g, ' ');
const mult = (m: number) => `×${String(m).replace('.', ',')}`;

/** Ціна = [базовий пакет + додатковий обсяг × тариф] × складність × терміновість. Для невідомих/нестандартних випадків — оцінка менеджера. */
export function calculate(input: CalcInput): CalcResult {
  const t = getTariff(input.typeId);
  if (!t) return incomplete('Оберіть вид роботи.');
  if (t.kind === 'manual') return manual(t.reason);

  const qty = input.qty ?? NaN;
  if (!Number.isFinite(qty) || qty <= 0 || !Number.isInteger(qty)) return incomplete('Вкажіть обсяг цілим числом.');
  if (qty > MAX_QTY) return manual('Такий обсяг оцінює менеджер.');

  const lines: Line[] = [];
  let volume = 0;
  let scale = 1; // для обсягу, що перевищує базовий пакет (обчислення звичайного строку)

  if (t.kind === 'pages' || t.kind === 'units') {
    if (t.kind === 'pages' && t.source) {
      const s = input.sourceQty ?? NaN;
      if (!Number.isFinite(s) || s <= 0) return incomplete(`${t.source.label}: вкажіть число.`);
      if (s > t.source.manualAbove) return manual('Великий вихідний матеріал: вартість оцінює менеджер.');
    }
    const extraQty = Math.max(0, qty - t.baseQty);
    lines.push({ label: `Базовий пакет (до ${fmt(t.baseQty)} ${t.unit})`, amount: t.base });
    if (extraQty > 0) lines.push({ label: `Додатково ${fmt(extraQty)} × ${fmt(t.extra)} грн`, amount: extraQty * t.extra });
    volume = t.base + extraQty * t.extra;
    scale = Math.max(1, qty / t.baseQty);
  } else if (t.kind === 'chars') {
    const exact = (qty / t.perChars) * t.rate;
    volume = Math.max(t.min, exact);
    lines.push(
      exact < t.min
        ? { label: `Мінімальне замовлення`, amount: t.min }
        : { label: `${fmt(qty)} знаків × ${fmt(t.rate)} грн за ${fmt(t.perChars)}`, amount: exact },
    );
    scale = Math.max(1, qty / t.baseChars);
  } else {
    // revision: рахуємо лише сторінки, які треба змінити
    const mode = input.revisionMode;
    if (!mode) return incomplete('Оберіть характер правок.');
    const rate = mode === 'proof' ? t.proof : t.content;
    const exact = qty * rate;
    volume = Math.max(t.min, exact);
    lines.push(
      exact < t.min
        ? { label: 'Мінімальне замовлення', amount: t.min }
        : { label: `${fmt(qty)} стор. × ${fmt(rate)} грн`, amount: exact },
    );
    scale = Math.max(1, qty / t.baseQty);
  }

  let current = volume;

  // Складність (один загальний рівень)
  const usesComplexity = t.kind === 'pages' || t.kind === 'chars' || (t.kind === 'units' && !t.noComplexity);
  if (usesComplexity) {
    const c = config.complexity.find((o) => o.id === (input.complexity ?? 'basic'));
    if (!c) return incomplete('Оберіть рівень складності.');
    if (c.manual) return manual('Нестандартне завдання: вартість оцінює менеджер.');
    if (c.mult && c.mult !== 1) {
      const next = current * c.mult;
      lines.push({ label: `Складність ${mult(c.mult)}`, amount: next - current });
      current = next;
    }
  }

  // Варіант (презентація, креслення)
  if (t.kind === 'units' && t.variant) {
    const v = t.variant.options.find((o) => o.id === input.variant);
    if (!v) return incomplete(`${t.variant.label}: оберіть варіант.`);
    if (v.manual) return manual('Нестандартний формат: вартість оцінює менеджер.');
    if (v.mult && v.mult !== 1) {
      const next = current * v.mult;
      lines.push({ label: `${v.label} ${mult(v.mult)}`, amount: next - current });
      current = next;
    }
  }

  // Якість вихідних матеріалів
  if (t.kind === 'chars' && t.quality) {
    const q = config.quality.find((o) => o.id === (input.quality ?? 'good'));
    if (!q) return incomplete('Оберіть якість вихідних матеріалів.');
    if (q.manual) return manual('Нечитабельні матеріали: вартість оцінює менеджер.');
    if (q.mult && q.mult !== 1) {
      const next = current * q.mult;
      lines.push({ label: `Якість матеріалу ${mult(q.mult)}`, amount: next - current });
      current = next;
    }
  }

  // Терміновість відносно звичайного строку цієї послуги й обсягу
  const normalDays = Math.ceil(t.normalDays * scale);
  let urgencyMult = 1;
  if (input.deadline) {
    if (!isValidDateString(input.deadline)) return incomplete('Вкажіть коректний дедлайн.');
    const today = input.today ?? todayInKyiv();
    const available = daysBetween(today, input.deadline);
    if (available < 0) return incomplete('Дедлайн не може бути у минулому.');
    const u = urgencyFor(normalDays, available);
    if ('manual' in u) return manual('Дуже стислий строк: менеджер перевірить, чи це можливо, і назве вартість.');
    urgencyMult = u.mult;
    if (u.mult !== 1) {
      const next = current * u.mult;
      lines.push({ label: `Терміновість ${mult(u.mult)}`, amount: next - current });
      current = next;
    }
  }

  return { status: 'ok', total: roundTo(current), exact: current, lines, normalDays, urgencyMult };
}
