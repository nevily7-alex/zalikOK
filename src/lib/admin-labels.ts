/** Статуси, які менеджер може вибрати. `closed` і `cancelled` лишилися в БД лише як застарілі (їх перенесено в done/failed). */
export const STATUSES = ['new', 'reviewing', 'awaiting_details', 'quoted', 'in_progress', 'delivered', 'done', 'failed'] as const;
export type StatusValue = (typeof STATUSES)[number];
export type AnyStatus = StatusValue | 'closed' | 'cancelled';

export const STATUS_LABELS: Record<AnyStatus, string> = {
  new: 'Нова',
  reviewing: 'На розгляді',
  awaiting_details: 'Очікуємо деталі',
  quoted: 'Вартість узгоджується',
  in_progress: 'У роботі',
  delivered: 'Передано клієнту',
  done: 'Виконано',
  failed: 'Провалено',
  closed: 'Закрита',
  cancelled: 'Скасована',
};

/** Вкладки списку: Нові / В роботі / Виконані / Провалені. */
export const TABS = [
  { key: 'all', label: 'Усі', statuses: null },
  { key: 'new', label: 'Нові', statuses: ['new'] },
  { key: 'work', label: 'В роботі', statuses: ['reviewing', 'awaiting_details', 'quoted', 'in_progress', 'delivered'] },
  { key: 'done', label: 'Виконані', statuses: ['done', 'closed'] },
  { key: 'failed', label: 'Провалені', statuses: ['failed', 'cancelled'] },
] as const;
export type TabKey = (typeof TABS)[number]['key'];

export function tabStatuses(key: string | undefined): AnyStatus[] | null {
  const t = TABS.find((x) => x.key === key);
  return t && t.statuses ? ([...t.statuses] as AnyStatus[]) : null;
}

/** Заявки, над якими ще працюємо (для нагадувань і прогнозу прибутку). */
export const ACTIVE_STATUSES: AnyStatus[] = ['new', 'reviewing', 'awaiting_details', 'quoted', 'in_progress', 'delivered'];
export const DONE_STATUSES: AnyStatus[] = ['done', 'closed'];
export const FAILED_STATUSES: AnyStatus[] = ['failed', 'cancelled'];

export const PRIORITIES = [
  { value: 0, label: 'Звичайний' },
  { value: 1, label: 'Високий' },
  { value: 2, label: 'Терміновий' },
] as const;
export const PRIORITY_LABELS: Record<number, string> = { 0: 'Звичайний', 1: 'Високий', 2: 'Терміновий' };

export const SCAN_LABELS = { pending: 'Очікує перевірки', clean: 'Перевірено', rejected: 'Відхилено' } as const;
export const OUTBOX_LABELS = { pending: 'У черзі', sent: 'Надіслано', failed: 'Помилка', skipped: 'Вимкнено' } as const;

/** Гроші: Decimal/рядок/число → число або null. */
export function toNum(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Number(String(v));
  return Number.isFinite(n) ? n : null;
}

export function formatMoney(n: number | null | undefined): string {
  if (n === null || n === undefined) return '—';
  return `${new Intl.NumberFormat('uk-UA', { maximumFractionDigits: 2 }).format(n).replace(/\s/g, ' ')} грн`;
}

/** Залишок до сплати з урахуванням передоплати (не менше нуля). */
export function remaining(price: number | null, prepayment: number | null): number | null {
  if (price === null) return null;
  return Math.max(0, Math.round((price - (prepayment ?? 0)) * 100) / 100);
}
