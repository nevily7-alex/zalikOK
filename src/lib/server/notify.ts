import 'server-only';
import { prisma } from './db';
import { appUrl, env } from './env';
import { findPrice } from '@/lib/prices';
import { todayInKyiv } from '@/lib/kyiv-date';
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
}

/**
 * Текст сповіщення (Telegram, parse_mode=HTML). Контакт у <code> копіюється одним дотиком,
 * поруч посилання «написати». Тему роботи й коментар не додаємо: вони лише в адмін-панелі.
 */
export function buildRequestMessage(r: NotifyRequest, now: Date = new Date()): string {
  const service = SERVICE_LABELS[r.service as Service] ?? r.service;
  const work = findPrice(r.workType)?.title;
  const discipline = r.disciplineOther?.trim() || DISCIPLINE_LABELS[r.discipline as Discipline] || r.discipline;
  const dl = r.deadline.toISOString().slice(0, 10);
  const days = Math.round((Date.parse(`${dl}T00:00:00Z`) - Date.parse(`${todayInKyiv(now)}T00:00:00Z`)) / 86_400_000);
  const left = days < 0 ? '' : days === 0 ? ' (сьогодні)' : ` (через ${days} дн.)`;
  const [y, m, d] = dl.split('-');

  const method = r.contactMethod as ContactMethod;
  const c = r.contact.trim();
  let contactLines: string[];
  if (method === 'telegram') {
    const user = c.replace(/^@/, '');
    contactLines = [`✈️ <b>Telegram:</b> <code>@${esc(user)}</code>`, `👉 <a href="https://t.me/${encodeURIComponent(user)}">Написати в Telegram</a>`];
  } else if (method === 'email') {
    contactLines = [`✉️ <b>E-mail:</b> <code>${esc(c)}</code>`, `👉 <a href="mailto:${esc(c)}">Написати листа</a>`];
  } else {
    contactLines = [`📞 <b>${CONTACT_LABELS.phone}:</b> <code>${esc(c)}</code>`];
  }

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
    '',
    `🔗 <a href="${esc(appUrl())}/admin/requests/${esc(r.id)}">Відкрити заявку в адмінці</a>`,
  ].join('\n');
}

async function sendTelegram(text: string): Promise<string> {
  const token = env('TELEGRAM_BOT_TOKEN')!;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_MANAGER_CHAT_ID'), text, parse_mode: 'HTML', disable_web_page_preview: true }),
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
    include: { request: { select: { id: true, publicReference: true, service: true, workType: true, discipline: true, disciplineOther: true, pages: true, deadline: true, contactMethod: true, contact: true } } },
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

    const text = buildRequestMessage(item.request);

    try {
      const providerMessageId = await sendTelegram(text);
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
