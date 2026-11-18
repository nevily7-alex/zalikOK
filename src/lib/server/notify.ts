import 'server-only';
import { prisma } from './db';
import { appUrl, env } from './env';
import { findPrice } from '@/lib/prices';
import { todayInKyiv } from '@/lib/kyiv-date';
import { ACTIVE_STATUSES, formatMoney, remaining, toNum } from '@/lib/admin-labels';
import { CONTACT_LABELS, DISCIPLINE_LABELS, SERVICE_LABELS, type ContactMethod, type Discipline, type Service } from '@/lib/validation';

const MAX_ATTEMPTS = 6;

export function notificationsEnabled(): boolean {
  // У development нічого не надсилається, доки власник свідомо не ввімкне ALLOW_DEV_NOTIFICATIONS (для тесту на власному чаті)
  const envAllowed = process.env.NODE_ENV !== 'development' || env('ALLOW_DEV_NOTIFICATIONS') === 'true';
  return envAllowed && env('NOTIFICATIONS_ENABLED') === 'true' && !!env('TELEGRAM_BOT_TOKEN') && !!env('TELEGRAM_MANAGER_CHAT_ID');
}

/** Очищена помилка: без токенів, URL-ів та вмісту заявок. */
function sanitizeError(e: unknown): string {
  const msg = e instanceof Error ? e.message : String(e);
  return msg.replace(/bot\d+:[\w-]+/gi, 'bot***').replace(/https?:\/\/\S+/g, '[url]').slice(0, 200);
}

function backoffMs(attempts: number): number {
  return Math.min(60 * 60 * 1000, 30_000 * 2 ** (attempts - 1));
}

const esc = (v: string) => v.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

export interface NotifyRequest {
  id: string;
  publicReference: string;
  service: string;
  workType: string | null;
  discipline: string;
  disciplineOther: string | null;
  pages: number | null;
  deadline: Date;
  contactMethod: string;
  contact: string;
  dueDate?: Date | null;
  estimatedPrice?: unknown;
  prepayment?: unknown;
}

/**
 * Текст сповіщення (Telegram, parse_mode=HTML). Контакт у <code> копіюється одним дотиком,
 * поруч посилання «написати». Тему роботи й коментар не додаємо: вони лише в адмін-панелі.
 */
export interface RequestButton {
  text: string;
  url: string;
}

/** Telegram відхиляє кнопки з localhost/не-https, тож у розробці лишається текстове посилання. */
function isPublicHttps(url: string): boolean {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && !/^(localhost|127\.|\[::1\])/i.test(u.hostname) && !u.hostname.endsWith('.local');
  } catch {
    return false;
  }
}

const adminUrl = (r: NotifyRequest) => `${appUrl()}/admin/requests/${r.id}`;

/** Кнопки під повідомленням: відкрити заявку в адмінці; написати клієнту в Telegram (e-mail у кнопку не вставити: лише http/https/tg). */
export function buildRequestButtons(r: NotifyRequest): RequestButton[][] {
  const rows: RequestButton[][] = [];
  if (isPublicHttps(adminUrl(r))) rows.push([{ text: '🔗 Відкрити заявку в адмінці', url: adminUrl(r) }]);
  if (r.contactMethod === 'telegram') {
    const user = r.contact.trim().replace(/^@/, '');
    rows.push([{ text: '✈️ Написати клієнту в Telegram', url: `https://t.me/${encodeURIComponent(user)}` }]);
  }
  return rows;
}

function contactBlock(r: NotifyRequest): string[] {
  const method = r.contactMethod as ContactMethod;
  const c = r.contact.trim();
  if (method === 'telegram') return [`✈️ <b>Telegram:</b> <code>@${esc(c.replace(/^@/, ''))}</code>`];
  if (method === 'email') return [`✉️ <b>E-mail:</b> <code>${esc(c)}</code>`, `👉 <a href="mailto:${esc(c)}">Написати листа</a>`];
  return [`📞 <b>${CONTACT_LABELS.phone}:</b> <code>${esc(c)}</code>`];
}

const dmy = (iso: string) => iso.split('-').reverse().join('.');

/** Нагадування про дедлайн виконання (за 3 дні): що за заявка, скільки лишилось до дедлайну, гроші, контакт. */
export function buildReminderMessage(r: NotifyRequest, now: Date = new Date()): string {
  const hasAdminButton = isPublicHttps(adminUrl(r));
  const service = SERVICE_LABELS[r.service as Service] ?? r.service;
  const work = findPrice(r.workType)?.title;
  const due = (r.dueDate ?? r.deadline).toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${due}T00:00:00Z`) - Date.parse(`${todayInKyiv(now)}T00:00:00Z`)) / 86_400_000);
  const when = days < 0 ? `прострочено на ${-days} дн.` : days === 0 ? 'сьогодні' : `через ${days} дн.`;
  const price = toNum(r.estimatedPrice);
  const prepaid = toNum(r.prepayment);
  return [
    `⏰ <b>Нагадування про дедлайн</b> <code>${esc(r.publicReference)}</code>`,
    '',
    `📅 <b>Здати до:</b> ${dmy(due)} (${when})${r.dueDate ? '' : ' — дедлайн клієнта'}`,
    `📌 <b>Послуга:</b> ${esc(service)}${work ? ` · ${esc(work)}` : ''}`,
    ...(price !== null
      ? [`💰 <b>Вартість:</b> ${formatMoney(price)} · передоплата ${formatMoney(prepaid ?? 0)} · <b>залишок ${formatMoney(remaining(price, prepaid))}</b>`]
      : ['💰 <b>Вартість:</b> ще не вказана']),
    '',
    '👤 <b>Контакт клієнта</b>',
    ...contactBlock(r),
    ...(hasAdminButton ? [] : ['', `🔗 <a href="${esc(adminUrl(r))}">Відкрити заявку в адмінці</a>`]),
  ].join('\n');
}

export function buildRequestMessage(r: NotifyRequest, now: Date = new Date()): string {
  const hasAdminButton = isPublicHttps(adminUrl(r));
  const service = SERVICE_LABELS[r.service as Service] ?? r.service;
  const work = findPrice(r.workType)?.title;
  const discipline = r.disciplineOther?.trim() || DISCIPLINE_LABELS[r.discipline as Discipline] || r.discipline;
  const dl = r.deadline.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${dl}T00:00:00Z`) - Date.parse(`${todayInKyiv(now)}T00:00:00Z`)) / 86_400_000);
  const left = days < 0 ? '' : days === 0 ? ' (сьогодні)' : ` (через ${days} дн.)`;
  const [y, m, d] = dl.split('-');

  const contactLines = contactBlock(r);

  return [
    `🆕 <b>Нова заявка</b> <code>${esc(r.publicReference)}</code>`,
    '',
    `📌 <b>Послуга:</b> ${esc(service)}`,
    ...(work ? [`🧾 <b>Вид роботи:</b> ${esc(work)}`] : []),
    `📚 <b>Предмет:</b> ${esc(discipline)}`,
    ...(r.pages ? [`📄 <b>Обсяг:</b> ${r.pages} стор.`] : []),
    `📅 <b>Дедлайн:</b> ${d}.${m}.${y}${left}`,
    '',
    '👤 <b>Контакт клієнта</b>',
    ...contactLines,
    ...(hasAdminButton ? [] : ['', `🔗 <a href="${esc(adminUrl(r))}">Відкрити заявку в адмінці</a>`]),
  ].join('\n');
}

async function sendTelegram(text: string, buttons: RequestButton[][] = []): Promise<string> {
  const token = env('TELEGRAM_BOT_TOKEN')!;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_MANAGER_CHAT_ID'), text, parse_mode: 'HTML',
      disable_web_page_preview: true,
      ...(buttons.length ? { reply_markup: { inline_keyboard: buttons } } : {}),
    }),
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) throw new Error(`Telegram HTTP ${res.status}`);
  const data = (await res.json()) as { result?: { message_id?: number } };
  return String(data.result?.message_id ?? '');
}

/**
 * Обробляє outbox. Telegram-повідомлення мінімальне: reference, послуга, дедлайн, посилання в admin.
 * Без production-адаптера (development / NOTIFICATIONS_ENABLED!=true) повідомлення не надсилаються —
 * записи отримують статус skipped.
 */
export async function processOutbox(limit = 10): Promise<{ sent: number; failed: number; skipped: number }> {
  const stats = { sent: 0, failed: 0, skipped: 0 };
  const due = await prisma.notificationOutbox.findMany({
    where: { status: 'pending', nextAttemptAt: { lte: new Date() } },
    orderBy: { nextAttemptAt: 'asc' },
    take: limit,
    include: { request: { select: { id: true, publicReference: true, service: true, workType: true, discipline: true, disciplineOther: true, pages: true, deadline: true, dueDate: true, estimatedPrice: true, prepayment: true, contactMethod: true, contact: true } } },
  });

  for (const item of due) {
    // Захоплюємо запис, щоб паралельні запуски не відправили його двічі
    const claimed = await prisma.notificationOutbox.updateMany({
      where: { id: item.id, status: 'pending', attempts: item.attempts },
      data: { attempts: { increment: 1 }, nextAttemptAt: new Date(Date.now() + 5 * 60 * 1000) },
    });
    if (claimed.count === 0) continue;

    if (!notificationsEnabled()) {
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: 'skipped', lastError: 'Сповіщення вимкнені (NOTIFICATIONS_ENABLED / development)' },
      });
      stats.skipped++;
      continue;
    }

    const text = item.kind === 'deadline_reminder' ? buildReminderMessage(item.request) : buildRequestMessage(item.request);

    try {
      const providerMessageId = await sendTelegram(text, buildRequestButtons(item.request));
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: { status: 'sent', providerMessageId, lastError: null },
      });
      stats.sent++;
    } catch (e) {
      const attempts = item.attempts + 1;
      const final = attempts >= MAX_ATTEMPTS;
      await prisma.notificationOutbox.update({
        where: { id: item.id },
        data: {
          status: final ? 'failed' : 'pending',
          lastError: sanitizeError(e),
          nextAttemptAt: new Date(Date.now() + backoffMs(attempts)),
        },
      });
      if (final) stats.failed++;
    }
  }
  return stats;
}

/** Днів наперед, за скільки нагадувати про дедлайн. */
export const REMINDER_DAYS = 3;

/**
 * Ставить у чергу нагадування для активних заявок, чий дедлайн (виконання, а якщо його немає — клієнта)
 * настає протягом REMINDER_DAYS днів або вже минув. Одна заявка — одне нагадування на дедлайн.
 * Запускається щодоби з cron разом із обробкою черги.
 */
export async function enqueueDeadlineReminders(now: Date = new Date()): Promise<number> {
  const limit = new Date(`${todayInKyiv(now)}T00:00:00Z`);
  limit.setUTCDate(limit.getUTCDate() + REMINDER_DAYS);
  const due = await prisma.request.findMany({
    where: {
      status: { in: ACTIVE_STATUSES as never },
      reminderSentAt: null,
      OR: [{ dueDate: { lte: limit } }, { dueDate: null, deadline: { lte: limit } }],
    },
    select: { id: true },
    take: 200,
  });
  for (const r of due) {
    await prisma.$transaction([
      prisma.notificationOutbox.create({ data: { requestId: r.id, channel: 'telegram', kind: 'deadline_reminder' } }),
      prisma.request.update({ where: { id: r.id }, data: { reminderSentAt: now } }),
    ]);
  }
  return due.length;
}
