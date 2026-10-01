import 'server-only';
import { prisma } from './db';
import { appUrl, env } from './env';
import { findPrice } from '@/lib/prices';
import { SERVICE_LABELS, type Service } from '@/lib/validation';

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

async function sendTelegram(text: string): Promise<string> {
  const token = env('TELEGRAM_BOT_TOKEN')!;
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ chat_id: env('TELEGRAM_MANAGER_CHAT_ID'), text, disable_web_page_preview: true }),
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
    include: { request: { select: { id: true, publicReference: true, service: true, workType: true, deadline: true } } },
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

    const r = item.request;
    const service = SERVICE_LABELS[r.service as Service] ?? r.service;
    const work = findPrice(r.workType)?.title;
    const text = [
      `Нова заявка ${r.publicReference}`,
      `Послуга: ${service}`,
      ...(work ? [`Вид роботи: ${work}`] : []),
      `Дедлайн: ${r.deadline.toISOString().slice(0, 10)}`,
      `${appUrl()}/admin/requests/${r.id}`,
    ].join('\n');

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
