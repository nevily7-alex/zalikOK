'use client';

/**
 * Адаптер аналітики. За замовчуванням ВИМКНЕНИЙ: без NEXT_PUBLIC_ANALYTICS_ENDPOINT нічого не надсилається.
 * У payload дозволені лише page, placement, service, errorCode — ніколи тема, контакт, імена файлів, коментар.
 */
export type AnalyticsEvent =
  | 'estimate_cta_click'
  | 'telegram_click'
  | 'service_select'
  | 'example_open'
  | 'request_start'
  | 'request_submit_success'
  | 'request_submit_error';

export interface AnalyticsPayload {
  page?: string;
  placement?: string;
  service?: string;
  errorCode?: string;
}

const ALLOWED_KEYS: (keyof AnalyticsPayload)[] = ['page', 'placement', 'service', 'errorCode'];

export function track(event: AnalyticsEvent, payload: AnalyticsPayload = {}): void {
  const endpoint = process.env.NEXT_PUBLIC_ANALYTICS_ENDPOINT;
  if (!endpoint || typeof window === 'undefined') return;
  const safe: Record<string, string> = { event };
  for (const key of ALLOWED_KEYS) {
    const value = payload[key];
    if (typeof value === 'string') safe[key] = value.slice(0, 80);
  }
  if (!safe.page) safe.page = window.location.pathname;
  try {
    const body = JSON.stringify(safe);
    if (navigator.sendBeacon) navigator.sendBeacon(endpoint, body);
    else void fetch(endpoint, { method: 'POST', body, keepalive: true });
  } catch {
    /* аналітика не повинна ламати інтерфейс */
  }
}
