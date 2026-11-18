import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormDate, FormSelect } from '@/components/ui/FormControls';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import {
  ACTIVE_STATUSES,
  OUTBOX_LABELS,
  PRIORITIES,
  PRIORITY_LABELS,
  SCAN_LABELS,
  STATUSES,
  STATUS_LABELS,
  formatMoney,
  remaining,
  toNum,
  type AnyStatus,
} from '@/lib/admin-labels';
import { todayInKyiv } from '@/lib/kyiv-date';
import { formatBytes } from '@/lib/upload-rules';
import { CONTACT_LABELS, DISCIPLINE_LABELS, SERVICE_LABELS, type ContactMethod, type Discipline, type Service } from '@/lib/validation';
import { findPrice } from '@/lib/prices';
import { unscannedDownloadAllowed } from '@/lib/server/downloads';
import { assignToMe, retryNotification, setOutcome, updateNote, updatePrepayment, updatePrice, updateSchedule, updateStatus } from '../../actions';
import { CopyButton } from '../../CopyButton';

function describeEstimate(v: unknown): string {
  const e = v as { status?: string; total?: number; reason?: string; normalDays?: number } | null;
  if (!e?.status) return '—';
  if (e.status === 'ok') return `Орієнтовно ${e.total} грн за стартовими тарифами (звичайний строк ${e.normalDays} дн.). Остаточну ціну погоджує менеджер.`;
  if (e.status === 'manual') return `Оцінка менеджером: ${e.reason ?? ''}`.trim();
  return 'Розрахунок неповний';
}

/** Кроки шапки: клік по кроку ставить статус. «На розгляді» входить у крок «Нова», «Очікуємо деталі» у «Вартість». */
const STEPS: { key: (typeof STATUSES)[number]; label: string; includes: AnyStatus[] }[] = [
  { key: 'new', label: 'Нова', includes: ['new', 'reviewing'] },
  { key: 'quoted', label: 'Вартість', includes: ['awaiting_details', 'quoted'] },
  { key: 'in_progress', label: 'У роботі', includes: ['in_progress'] },
  { key: 'delivered', label: 'Передано', includes: ['delivered'] },
  { key: 'done', label: 'Виконано', includes: ['done', 'closed'] },
];

const statusGroup = (s: AnyStatus) =>
  s === 'new' ? 'new' : s === 'done' || s === 'closed' ? 'done' : s === 'failed' || s === 'cancelled' ? 'failed' : 'work';

/** Один рядок журналу: значок, зрозумілий текст і службова назва дії (для пошуку по журналу). */
function describeAudit(action: string, meta: unknown): { icon: string; text: string } {
  const m = (meta ?? {}) as Record<string, string | number | null>;
  const st = (v: unknown) => STATUS_LABELS[v as AnyStatus] ?? String(v);
  switch (action) {
    case 'request.created':
      return { icon: '✚', text: 'Заявку створено' };
    case 'status.changed':
      return { icon: '⇄', text: `Статус: ${st(m.from)} → ${st(m.to)}` };
    case 'price.changed':
      return { icon: '₴', text: m.to ? `Вартість: ${formatMoney(Number(m.to))}` : 'Вартість очищено' };
    case 'prepayment.changed':
      return { icon: '💳', text: m.to ? `Передоплата: ${formatMoney(Number(m.to))}` : 'Передоплату очищено' };
    case 'schedule.changed':
      return {
        icon: '📅',
        text: `Дедлайн виконання: ${m.dueDate ? String(m.dueDate).split('-').reverse().join('.') : 'не встановлено'} · пріоритет: ${PRIORITY_LABELS[Number(m.priority ?? 0)] ?? '—'}`,
      };
    case 'note.changed':
      return { icon: '📝', text: 'Нотатку змінено' };
    case 'assigned':
      return { icon: '👤', text: 'Заявку взято в роботу менеджером' };
    case 'notification.retry':
      return { icon: '🔔', text: 'Повторна відправка сповіщення' };
    default:
      return { icon: '•', text: action };
  }
}

const dmy = (d: Date) => d.toISOString().slice(0, 10).split('-').reverse().join('.');
const dayNum = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

export default async function RequestPage({ params }: { params: Promise<{ id: string }> }) {
  const manager = await requireManager();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const r = await prisma.request.findUnique({
    where: { id },
    include: {
      attachments: { where: { state: 'stored' }, orderBy: { createdAt: 'asc' } },
      outbox: { orderBy: { createdAt: 'desc' } },
      audit: { orderBy: { timestamp: 'desc' }, take: 50 },
      assignedManager: { select: { email: true } },
    },
  });
  if (!r) notFound();
  const fmt = (d: Date) => d.toLocaleString('uk-UA', { timeZone: 'Europe/Kyiv' });

  const price = toNum(r.estimatedPrice);
  const prepaid = toNum(r.prepayment);
  const left = remaining(price, prepaid);
  const pct = price ? Math.min(100, Math.round(((prepaid ?? 0) / price) * 100)) : 0;
  const fullyPaid = price !== null && (prepaid ?? 0) > 0 && left === 0;
  const closedOut = r.status === 'done' || r.status === 'failed';
  const group = statusGroup(r.status);

  // Дедлайн: виконання (якщо задано), інакше клієнта; смуга — скільки часу від створення вже минуло
  const today = todayInKyiv();
  const dueIso = (r.dueDate ?? r.deadline).toISOString().slice(0, 10);
  const days = Math.round(dayNum(dueIso) - dayNum(today));
  const total = Math.max(1, dayNum(dueIso) - dayNum(r.createdAt.toISOString().slice(0, 10)));
  const elapsed = Math.min(100, Math.max(0, Math.round(((dayNum(today) - dayNum(r.createdAt.toISOString().slice(0, 10))) / total) * 100)));
  const active = ACTIVE_STATUSES.includes(r.status);
  const dlClass = !active ? '' : days < 0 ? 'rq-cd--bad' : days <= 3 ? 'rq-cd--soon' : '';
  const dlWord = days < 0 ? 'днів тому' : 'днів лишилось';
  const RING = 2 * Math.PI * 52;

  const method = r.contactMethod as ContactMethod;
  const contact = r.contact.trim();
  const writeHref =
    method === 'telegram' ? `https://t.me/${encodeURIComponent(contact.replace(/^@/, ''))}` : method === 'email' ? `mailto:${contact}` : `tel:${contact}`;
  const writeLabel = method === 'telegram' ? '✈️ Написати в Telegram' : method === 'email' ? '✉️ Написати листа' : '📞 Подзвонити';
  const curStep = STEPS.findIndex((s) => s.includes.includes(r.status));

  const rows: [string, React.ReactNode][] = [
    ['Номер', r.publicReference],
    ['Створено', fmt(r.createdAt)],
    ['Послуга', SERVICE_LABELS[r.service as Service] ?? r.service],
    ['Вид роботи', findPrice(r.workType)?.title ?? (r.workType === 'other' ? 'Інша робота (немає у прайсі)' : '—')],
    ['Розрахунок клієнта', describeEstimate(r.clientEstimate)],
    [
      'Дисципліна',
      r.discipline === 'other' ? `Інше: ${r.disciplineOther ?? ''}` : (DISCIPLINE_LABELS[r.discipline as Discipline] ?? r.discipline),
    ],
    ['Тема', r.topicUnknown && !r.topic ? 'Ще не визначено' : r.topic],
    ['Дедлайн клієнта', r.deadline.toISOString().slice(0, 10)],
    ['Дедлайн виконання', r.dueDate ? r.dueDate.toISOString().slice(0, 10) : 'не встановлено'],
    ['Обсяг, стор.', r.pages ?? '—'],
    ['Коментар', r.comment || '—'],
    ['Версія політики', `${r.privacyPolicyVersion} (згода ${fmt(r.consentAt)})`],
    ['Відповідальний', r.assignedManager?.email ?? '—'],
  ];

  return (
    <>
      <p>
        <Link href="/admin">← До списку</Link>
      </p>

      {/* Шапка: номер, статус, пріоритет, ціна, кроки статусу */}
      <section className="rq-hero" aria-labelledby="rq-title">
        <div className="rq-hero__top">
          <h1 id="rq-title" className="rq-hero__title">
            Заявка {r.publicReference}
          </h1>
          <span className={`admin-status admin-status--${r.status}`}>{STATUS_LABELS[r.status]}</span>
          {r.priority > 0 && (
            <strong className={`admin-prio admin-prio--${r.priority}`}>
              {r.priority === 2 ? '🔥' : '⚑'} {PRIORITY_LABELS[r.priority]}
            </strong>
          )}
          <div className="rq-hero__price">
            <span className="admin-price">{price === null ? 'вартість не вказана' : formatMoney(price)}</span>
            <small>
              {price === null
                ? ' '
                : (prepaid ?? 0) > 0
                  ? fullyPaid
                    ? '✓ оплачено повністю'
                    : `внесено ${formatMoney(prepaid)} · залишок ${formatMoney(left)}`
                  : 'передоплати ще немає'}
            </small>
          </div>
        </div>
        <p className="rq-hero__meta">
          {SERVICE_LABELS[r.service as Service] ?? r.service}
          {findPrice(r.workType)?.title ? ` · ${findPrice(r.workType)!.title}` : ''} · створено {fmt(r.createdAt)}
        </p>
        <ol className="rq-steps" aria-label="Статус заявки">
          {STEPS.map((s, i) => {
            const passed = group !== 'failed' && curStep > i;
            const current = curStep === i;
            return (
              <li key={s.key} className={`rq-step${passed ? ' rq-step--done' : ''}${current ? ' rq-step--cur' : ''}`}>
                <form action={updateStatus}>
                  <input type="hidden" name="id" value={r.id} />
                  <input type="hidden" name="status" value={s.key} />
                  <button type="submit" aria-current={current ? 'step' : undefined} title={`Поставити статус: ${s.label}`}>
                    <i>{passed ? '✓' : i + 1}</i>
                    <span>{s.label}</span>
                  </button>
                </form>
              </li>
            );
          })}
          {group === 'failed' && (
            <li className="rq-step rq-step--fail rq-step--cur">
              <form action={updateStatus}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="status" value="failed" />
                <button type="submit" aria-current="step">
                  <i>✕</i>
                  <span>Провалено</span>
                </button>
              </form>
            </li>
          )}
        </ol>
      </section>

      {/* Великі плитки */}
      <ul className="rq-tiles">
        <li className="rq-tile rq-tile--price">
          <span>Вартість</span>
          <strong>{formatMoney(price)}</strong>
        </li>
        <li className="rq-tile rq-tile--paid">
          <span>Передоплата</span>
          <strong>{formatMoney(prepaid)}</strong>
        </li>
        <li className="rq-tile rq-tile--left admin-kpi--left">
          <span>Залишок</span>
          <strong>{formatMoney(left)}</strong>
        </li>
        <li className={`rq-tile rq-tile--due ${dlClass}`}>
          <span>Дедлайн {r.dueDate ? 'виконання' : 'клієнта'}</span>
          <strong>{!active ? dmy(r.dueDate ?? r.deadline) : days < 0 ? `прострочено ${-days} дн.` : days === 0 ? 'сьогодні' : `через ${days} дн.`}</strong>
        </li>
      </ul>

      <div className="admin-grid">
        <div className="admin-stack">
          <section aria-labelledby="d-title" className="admin-card">
            <h2 id="d-title">📋 Дані заявки</h2>
            <dl className="admin-dl">
              {rows.map(([k, v]) => (
                <div key={k}>
                  <dt>{k}</dt>
                  <dd>{v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section aria-labelledby="c-title" className="admin-card">
            <h2 id="c-title">👤 Клієнт</h2>
            <div className="rq-client">
              <span className="rq-client__av" aria-hidden="true">
                {contact.replace(/^@/, '').charAt(0).toUpperCase() || '?'}
              </span>
              <div>
                <small>{CONTACT_LABELS[method] ?? r.contactMethod}</small>
                <div className="rq-client__v">{contact}</div>
              </div>
            </div>
            <div className="rq-client__act">
              <CopyButton value={contact} label={contact} text="⧉ Скопіювати" />
              <a className="btn btn-primary btn-sm" href={writeHref} {...(method === 'telegram' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
                {writeLabel}
              </a>
            </div>
          </section>

          <section aria-labelledby="a-title" className="admin-card">
            <h2 id="a-title">📎 Вкладення ({r.attachments.length})</h2>
            {unscannedDownloadAllowed() && r.attachments.some((a) => a.scanStatus === 'pending') && (
              <p className="notice" role="note">
                Автоматичної антивірусної перевірки немає: файли «не перевірено». Відкривайте їх лише після перевірки антивірусом
                на вашому комп’ютері й не вмикайте макроси. Кожне таке завантаження записується в журнал.
              </p>
            )}
            {r.attachments.length === 0 ? (
              <p>Файлів немає.</p>
            ) : (
              <ul className="admin-list">
                {r.attachments.map((a) => (
                  <li key={a.id}>
                    <span>
                      {a.originalFilename} · {formatBytes(a.sizeBytes)} · {a.detectedMime}
                    </span>
                    <span className={`admin-badge admin-badge--${a.scanStatus}`}>{SCAN_LABELS[a.scanStatus]}</span>
                    {a.scanStatus === 'clean' ? (
                      <a href={`/api/admin/attachments/${a.id}`} className="btn btn-secondary btn-sm">
                        Завантажити
                      </a>
                    ) : a.scanStatus === 'pending' && unscannedDownloadAllowed() ? (
                      <a href={`/api/admin/attachments/${a.id}?unscanned=1`} className="btn btn-secondary btn-sm">
                        Завантажити (не перевірено)
                      </a>
                    ) : (
                      <span className="field-hint">Завантаження заблоковано до перевірки</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>

        <div className="admin-stack">
          <section aria-labelledby="o2-title" className="admin-card">
            <h2 id="o2-title">🏁 Результат</h2>
            <p className="field-hint">
              Поточний статус: <strong>{STATUS_LABELS[r.status]}</strong>
            </p>
            <div className="rq-outcome">
              <form action={setOutcome}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="outcome" value="done" />
                <button className="btn rq-outcome__ok" type="submit" disabled={r.status === 'done'}>
                  ✅ Успішно виконано
                </button>
              </form>
              <form action={setOutcome}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="outcome" value="failed" />
                <button className="btn rq-outcome__bad" type="submit" disabled={r.status === 'failed'}>
                  ❌ Провалено
                </button>
              </form>
            </div>
            {closedOut && r.closedAt && <p className="field-hint">Закрито: {fmt(r.closedAt)}. Статус можна змінити нижче.</p>}
            <form action={updateStatus} className="admin-inline">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="status">Інший статус</label>
                <FormSelect id="status" name="status" defaultValue={r.status} items={STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] }))} />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">
                Зберегти статус
              </button>
            </form>
            <form action={assignToMe}>
              <input type="hidden" name="id" value={r.id} />
              <button className="btn btn-secondary btn-sm" type="submit">
                Взяти собі ({manager.email})
              </button>
            </form>
          </section>

          <section aria-labelledby="p-title" className="admin-card">
            <h2 id="p-title">💳 Оплата</h2>
            <div className="rq-pay">
              <div className="rq-ring" role="img" aria-label={`Оплачено ${pct}%`}>
                <svg viewBox="0 0 120 120" aria-hidden="true">
                  <circle className="rq-ring__bg" cx="60" cy="60" r="52" fill="none" strokeWidth="12" />
                  <circle
                    className="rq-ring__fg"
                    cx="60"
                    cy="60"
                    r="52"
                    fill="none"
                    strokeWidth="12"
                    strokeDasharray={RING}
                    style={{ ['--full' as string]: RING, ['--off' as string]: RING * (1 - pct / 100) }}
                  />
                </svg>
                <b>{pct}%</b>
              </div>
              <dl className="admin-money">
                <div>
                  <dt>Вартість</dt>
                  <dd>{formatMoney(price)}</dd>
                </div>
                <div>
                  <dt>Передоплата</dt>
                  <dd>{formatMoney(prepaid)}</dd>
                </div>
                <div className="admin-money__left">
                  <dt>Залишок</dt>
                  <dd>{formatMoney(left)}</dd>
                </div>
              </dl>
            </div>
            <form action={updatePrice} className="admin-inline">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="price">Вартість, грн</label>
                <input id="price" name="price" type="text" inputMode="decimal" defaultValue={r.estimatedPrice?.toString() ?? ''} />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">
                Зберегти вартість
              </button>
            </form>
            <form action={updatePrepayment} className="admin-inline">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="prepayment">Внесена передоплата, грн</label>
                <input id="prepayment" name="prepayment" type="text" inputMode="decimal" defaultValue={r.prepayment?.toString() ?? ''} placeholder="0" />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">
                Зберегти передоплату
              </button>
            </form>
          </section>

          <section aria-labelledby="sch-title" className="admin-card">
            <h2 id="sch-title">📅 Дедлайн виконання</h2>
            <div className={`rq-cd ${dlClass}`}>
              <div className="rq-cd__n">
                {Math.abs(days)}
                <small>{dlWord}</small>
              </div>
              <div>
                <b>{dmy(r.dueDate ?? r.deadline)}</b>
                <small className="rq-cd__who">{r.dueDate ? ' · дедлайн виконання' : ' · дедлайн клієнта (свій не задано)'}</small>
                <div className="rq-cd__bar" role="img" aria-label={`Минуло ${elapsed}% часу`}>
                  <i style={{ ['--w' as string]: `${elapsed}%` }} />
                </div>
                <p className="field-hint">За 3 дні до дедлайну менеджеру прийде нагадування в Telegram.</p>
              </div>
            </div>
            <form action={updateSchedule} className="admin-inline">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="dueDate">Дедлайн виконання</label>
                <FormDate id="dueDate" name="dueDate" defaultValue={r.dueDate ? r.dueDate.toISOString().slice(0, 10) : ''} placeholder="Не встановлено" />
              </div>
              <div className="field">
                <label htmlFor="priority">Пріоритет</label>
                <FormSelect id="priority" name="priority" defaultValue={String(r.priority)} items={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))} />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">
                Зберегти
              </button>
            </form>
          </section>

          <section aria-labelledby="n-title" className="admin-card">
            <h2 id="n-title">📝 Нотатка менеджера</h2>
            <form action={updateNote}>
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="note" className="sr-only">
                  Нотатка
                </label>
                <textarea id="note" name="note" maxLength={5000} defaultValue={r.managerNote ?? ''} />
              </div>
              <button className="btn btn-primary btn-sm" type="submit" style={{ marginTop: 12 }}>
                Зберегти нотатку
              </button>
            </form>
          </section>
        </div>
      </div>

      <section aria-labelledby="l-title" className="admin-card">
        <h2 id="l-title">🕘 Журнал змін</h2>
        <ol className="rq-timeline">
          {r.audit.map((a) => {
            const d = describeAudit(a.action, a.meta);
            return (
              <li key={a.id}>
                <i aria-hidden="true">{d.icon}</i>
                <div>
                  {d.text}
                  <small>
                    {fmt(a.timestamp)} · {a.action}
                  </small>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section aria-labelledby="o-title" className="admin-card">
        <h2 id="o-title">🔔 Сповіщення менеджеру</h2>
        <ul className="admin-list">
          {r.outbox.map((o) => (
            <li key={o.id}>
              <span>
                {o.channel}
                {o.kind === 'deadline_reminder' ? ' · нагадування про дедлайн' : ''} · спроб: {o.attempts}
                {o.lastError ? ` · ${o.lastError}` : ''}
              </span>
              <span className={`admin-badge admin-badge--${o.status === 'failed' ? 'bad' : o.status}`}>{OUTBOX_LABELS[o.status]}</span>
              {(o.status === 'failed' || o.status === 'skipped') && (
                <form action={retryNotification}>
                  <input type="hidden" name="id" value={o.id} />
                  <input type="hidden" name="requestId" value={r.id} />
                  <button className="btn btn-secondary btn-sm" type="submit">
                    Повторити
                  </button>
                </form>
              )}
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
