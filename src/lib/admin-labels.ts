export const STATUSES = [
  'new',
  'reviewing',
  'awaiting_details',
  'quoted',
  'in_progress',
  'delivered',
  'closed',
  'cancelled',
] as const;
export type StatusValue = (typeof STATUSES)[number];

export const STATUS_LABELS: Record<StatusValue, string> = {
  new: 'Нова',
  reviewing: 'На розгляді',
  awaiting_details: 'Очікуємо деталі',
  quoted: 'Вартість узгоджується',
  in_progress: 'У роботі',
  delivered: 'Передано',
  closed: 'Закрита',
  cancelled: 'Скасована',
};

export const SCAN_LABELS = { pending: 'Очікує перевірки', clean: 'Перевірено', rejected: 'Відхилено' } as const;
export const OUTBOX_LABELS = { pending: 'У черзі', sent: 'Надіслано', failed: 'Помилка', skipped: 'Вимкнено' } as const;
