import Link from 'next/link';
import { notFound } from 'next/navigation';
import { FormDate, FormSelect } from '@/components/ui/FormControls';
import { prisma } from '@/lib/server/db';
import { requireManager } from '@/lib/server/guard';
import { OUTBOX_LABELS, PRIORITIES, SCAN_LABELS, STATUSES, STATUS_LABELS, formatMoney, remaining, toNum } from '@/lib/admin-labels';
import { formatBytes } from '@/lib/upload-rules';
import { CONTACT_LABELS, DISCIPLINE_LABELS, SERVICE_LABELS, type ContactMethod, type Discipline, type Service } from '@/lib/validation';
import { findPrice } from '@/lib/prices';
import { unscannedDownloadAllowed } from '@/lib/server/downloads';
import { assignToMe, retryNotification, setOutcome, updateNote, updatePrepayment, updatePrice, updateSchedule, updateStatus } from '../../actions';

function describeEstimate(v: unknown): string {
  const e = v as { status?: string; total?: number; reason?: string; normalDays?: number } | null;
  if (!e?.status) return '—';
  if (e.status === 'ok') return `Орієнтовно ${e.total} грн за стартовими тарифами (звичайний строк ${e.normalDays} дн.). Остаточну ціну погоджує менеджер.`;
  if (e.status === 'manual') return `Оцінка менеджером: ${e.reason ?? ''}`.trim();
  return 'Розрахунок неповний';
}

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
  const closedOut = r.status === 'done' || r.status === 'failed';

  const rows: [string, React.ReactNode][] = [
    ['Номер', r.publicReference],
    ['Створено', fmt(r.createdAt)],
    ['Послуга', SERVICE_LABELS[r.service as Service] ?? r.service],
    ['Вид роботи', findPrice(r.workType)?.title ?? (r.workType === 'other' ? 'Інша робота (немає у прайсі)' : '—')],
    ['Розрахунок клієнта', describeEstimate(r.clientEstimate)],
    [
      'Дисципліна',
      r.discipline === 'other'
        ? `Інше: ${r.disciplineOther ?? ''}`
        : (DISCIPLINE_LABELS[r.discipline as Discipline] ?? r.discipline),
    ],
    ['Тема', r.topicUnknown && !r.topic ? 'Ще не визначено' : r.topic],
    ['Дедлайн клієнта', r.deadline.toISOString().slice(0, 10)],
    ['Дедлайн виконання', r.dueDate ? r.dueDate.toISOString().slice(0, 10) : 'не встановлено'],
    ['Обсяг, стор.', r.pages ?? '—'],
    ['Спосіб зв’язку', CONTACT_LABELS[r.contactMethod as ContactMethod] ?? r.contactMethod],
    ['Контакт', r.contact],
    ['Коментар', r.comment || '—'],
    ['Версія політики', `${r.privacyPolicyVersion} (згода ${fmt(r.consentAt)})`],
    ['Відповідальний', r.assignedManager?.email ?? '—'],
  ];

  return (
    <>
      <p>
        <Link href="/admin">← До списку</Link>
      </p>
      <h1 className="admin-h1">Заявка {r.publicReference}</h1>

      <div className="admin-grid">
        <section aria-labelledby="d-title" className="admin-card">
          <h2 id="d-title">Дані заявки</h2>
          <dl className="admin-dl">
            {rows.map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v}</dd>
              </div>
            ))}
          </dl>
        </section>

        <div className="admin-stack">
          <section aria-labelledby="o2-title" className="admin-card">
            <h2 id="o2-title">Результат</h2>
            <p className="field-hint">Поточний статус: <strong>{STATUS_LABELS[r.status]}</strong></p>
            <div className="admin-outcome">
              <form action={setOutcome}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="outcome" value="done" />
                <button className="btn btn-primary" type="submit" disabled={r.status === 'done'}>
                  ✅ Успішно виконано
                </button>
              </form>
              <form action={setOutcome}>
                <input type="hidden" name="id" value={r.id} />
                <input type="hidden" name="outcome" value="failed" />
                <button className="btn btn-secondary" type="submit" disabled={r.status === 'failed'}>
                  ❌ Провалено
                </button>
              </form>
            </div>
            {closedOut && r.closedAt && <p className="field-hint">Закрито: {fmt(r.closedAt)}. Статус можна змінити нижче.</p>}
          </section>

          <section aria-labelledby="p-title" className="admin-card">
            <h2 id="p-title">Оплата</h2>
            <dl className="admin-money">
              <div><dt>Вартість</dt><dd>{formatMoney(price)}</dd></div>
              <div><dt>Передоплата</dt><dd>{formatMoney(prepaid)}</dd></div>
              <div className="admin-money__left"><dt>Залишок до сплати</dt><dd>{formatMoney(left)}</dd></div>
            </dl>
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
            <h2 id="sch-title">Дедлайн виконання і пріоритет</h2>
            <p className="field-hint">За 3 дні до дедлайну менеджеру прийде нагадування в Telegram (якщо дедлайн не задано, береться дедлайн клієнта).</p>
            <form action={updateSchedule} className="admin-inline">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="dueDate">Дедлайн виконання</label>
                <FormDate id="dueDate" name="dueDate" defaultValue={r.dueDate ? r.dueDate.toISOString().slice(0, 10) : ''} placeholder="Не встановлено" />
              </div>
              <div className="field">
                <label htmlFor="priority">Пріоритет</label>
                <FormSelect
                  id="priority"
                  name="priority"
                  defaultValue={String(r.priority)}
                  items={PRIORITIES.map((p) => ({ value: String(p.value), label: p.label }))}
                />
              </div>
              <button className="btn btn-primary btn-sm" type="submit">
                Зберегти
              </button>
            </form>
          </section>

          <section aria-labelledby="s-title" className="admin-card">
            <h2 id="s-title">Статус</h2>
            <form action={updateStatus} className="admin-inline">
              <input type="hidden" name="id" value={r.id} />
              <div className="field">
                <label htmlFor="status">Статус</label>
                <FormSelect
                  id="status"
                  name="status"
                  defaultValue={r.status}
                  items={STATUSES.map((st) => ({ value: st, label: STATUS_LABELS[st] }))}
                />
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

          <section aria-labelledby="n-title" className="admin-card">
            <h2 id="n-title">Нотатка менеджера</h2>
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

      <section aria-labelledby="a-title" className="admin-card">
        <h2 id="a-title">Вкладення ({r.attachments.length})</h2>
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

      <section aria-labelledby="o-title" className="admin-card">
        <h2 id="o-title">Сповіщення менеджеру</h2>
        <ul className="admin-list">
          {r.outbox.map((o) => (
            <li key={o.id}>
              <span>
                {o.channel} · спроб: {o.attempts}
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

      <section aria-labelledby="l-title" className="admin-card">
        <h2 id="l-title">Журнал змін</h2>
        <ul className="admin-list">
          {r.audit.map((a) => (
            <li key={a.id}>
              <span>
                {fmt(a.timestamp)} · {a.action}
                {a.meta ? ` · ${JSON.stringify(a.meta)}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
