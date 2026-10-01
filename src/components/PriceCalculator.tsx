'use client';

import Link from 'next/link';
import { useId, useMemo, useState } from 'react';
import { Icon } from './Icon';
import { DatePicker } from './ui/DatePicker';
import { Select, type SelectItem } from './ui/Select';
import { track } from '@/lib/analytics';
import { calculate, config, getTariff, type CalcInput } from '@/lib/calc';
import { todayInKyiv } from '@/lib/kyiv-date';
import { findPrice, prices } from '@/lib/prices';

const typeItems: SelectItem[] = prices.groups.map((g) => ({
  label: g.title,
  options: g.items.map((i) => ({ value: i.id, label: i.title })),
}));
const complexityItems = config.complexity.map((o) => ({ value: o.id, label: o.label }));
const qualityItems = config.quality.map((o) => ({ value: o.id, label: o.label }));
const revisionItems = [
  { value: 'proof', label: 'Корекція: мова, оформлення, дрібні правки' },
  { value: 'content', label: 'Зміни за змістом: переписати, доповнити' },
];

const fmtMoney = (n: number) => `${new Intl.NumberFormat('uk-UA').format(n).replace(/\s/g, ' ')} грн`;

interface State {
  typeId: string;
  qty: string;
  sourceQty: string;
  complexity: string;
  quality: string;
  variant: string;
  revisionMode: '' | 'proof' | 'content';
  deadline: string;
}

function defaults(typeId: string): State {
  const t = getTariff(typeId);
  let qty = '';
  if (t?.kind === 'pages' || t?.kind === 'units' || t?.kind === 'revision') qty = String(t.baseQty);
  if (t?.kind === 'chars') qty = String(t.baseChars);
  return {
    typeId,
    qty,
    sourceQty: '',
    complexity: 'basic',
    quality: 'good',
    variant: t?.kind === 'units' && t.variant ? t.variant.options[0]!.id : '',
    revisionMode: '',
    deadline: '',
  };
}

/** Приблизний розрахунок за тарифною сіткою (content/tariffs.json). Остаточну вартість погоджує менеджер. */
export function PriceCalculator() {
  const id = useId();
  const [s, setS] = useState<State>(defaults(''));
  const [minDate] = useState(() => todayInKyiv());
  const t = getTariff(s.typeId);
  const price = findPrice(s.typeId);

  const input: CalcInput = useMemo(
    () => ({
      typeId: s.typeId,
      qty: s.qty.trim() === '' ? undefined : Number(s.qty),
      sourceQty: s.sourceQty.trim() === '' ? undefined : Number(s.sourceQty),
      complexity: s.complexity,
      quality: s.quality,
      variant: s.variant,
      revisionMode: s.revisionMode || undefined,
      deadline: s.deadline || undefined,
    }),
    [s],
  );
  const result = useMemo(() => (s.typeId ? calculate(input) : null), [input, s.typeId]);

  const set = <K extends keyof State>(k: K, v: State[K]) => setS((prev) => ({ ...prev, [k]: v }));

  const qtyLabel =
    t?.kind === 'pages'
      ? `Обсяг, ${t.unit}`
      : t?.kind === 'chars'
        ? 'Обсяг, знаків з пробілами'
        : t?.kind === 'units'
          ? `Кількість, ${t.unit}`
          : t?.kind === 'revision'
            ? 'Сторінок, які потрібно змінити'
            : '';

  const scope = useMemo(() => {
    if (!price || !t || t.kind === 'manual') return '';
    const parts = [`Калькулятор: ${price.title}`];
    if (s.qty) parts.push(`${s.qty} ${t.kind === 'chars' ? 'знаків' : t.kind === 'revision' ? 'стор. до змін' : t.unit}`);
    if (s.sourceQty) parts.push(`вихідний матеріал ${s.sourceQty} стор.`);
    if (t.kind === 'revision' && s.revisionMode) parts.push(s.revisionMode === 'proof' ? 'правки: корекція' : 'правки: зміст');
    if (result?.status === 'ok') parts.push(`орієнтовно ${result.total} грн`);
    return parts.join('; ').slice(0, 240);
  }, [price, t, s.qty, s.sourceQty, s.revisionMode, result]);

  const href = useMemo(() => {
    const p = new URLSearchParams();
    if (s.typeId) p.set('type', s.typeId);
    const q = Number(s.qty);
    if (t?.kind === 'pages' && Number.isInteger(q) && q >= 1 && q <= 500) p.set('pages', String(q));
    if (s.deadline) p.set('deadline', s.deadline);
    if (scope) p.set('scope', scope);
    return `/zaiavka?${p.toString()}`;
  }, [s.typeId, s.qty, s.deadline, scope, t]);

  const needsComplexity = t && (t.kind === 'pages' || t.kind === 'chars' || (t.kind === 'units' && !t.noComplexity));

  return (
    <div id="calculator" className="calc" role="group" aria-labelledby={`${id}-title`}>
      <h3 id={`${id}-title`}>Орієнтовна вартість</h3>

      <div className="field">
        <label htmlFor={`${id}-type`}>Вид роботи</label>
        <Select
          id={`${id}-type`}
          value={s.typeId}
          placeholder="Оберіть вид роботи"
          items={typeItems}
          onChange={(v) => setS(defaults(v))}
        />
      </div>

      {t && t.kind !== 'manual' && (
        <>
          <div className="field">
            <label htmlFor={`${id}-qty`}>{qtyLabel}</label>
            <input
              id={`${id}-qty`}
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={s.qty}
              onChange={(e) => set('qty', e.target.value)}
              aria-describedby={t.kind === 'pages' ? `${id}-qty-hint` : undefined}
            />
            {t.kind === 'pages' && (
              <p id={`${id}-qty-hint`} className="field-hint">
                Сторінка: A4, шрифт 14, інтервал 1,5. Титульний аркуш, зміст і додатки в обсяг не входять.
              </p>
            )}
          </div>

          {t.kind === 'pages' && t.source && (
            <div className="field">
              <label htmlFor={`${id}-src`}>{t.source.label}</label>
              <input
                id={`${id}-src`}
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                value={s.sourceQty}
                onChange={(e) => set('sourceQty', e.target.value)}
              />
            </div>
          )}

          {t.kind === 'revision' && (
            <div className="field">
              <label htmlFor={`${id}-mode`}>Характер правок</label>
              <Select
                id={`${id}-mode`}
                value={s.revisionMode}
                placeholder="Оберіть"
                items={revisionItems}
                onChange={(v) => set('revisionMode', v as State['revisionMode'])}
              />
              <p className="field-hint">Якщо текст потрібно переписати майже повністю, краще оцінити як нову роботу.</p>
            </div>
          )}

          {t.kind === 'units' && t.variant && (
            <div className="field">
              <label htmlFor={`${id}-variant`}>{t.variant.label}</label>
              <Select
                id={`${id}-variant`}
                value={s.variant}
                items={t.variant.options.map((o) => ({ value: o.id, label: o.label }))}
                onChange={(v) => set('variant', v)}
              />
            </div>
          )}

          {needsComplexity && (
            <div className="field">
              <label htmlFor={`${id}-cx`}>Складність</label>
              <Select id={`${id}-cx`} value={s.complexity} items={complexityItems} onChange={(v) => set('complexity', v)} />
            </div>
          )}

          {t.kind === 'chars' && t.quality && (
            <div className="field">
              <label htmlFor={`${id}-q`}>Якість вихідних матеріалів</label>
              <Select id={`${id}-q`} value={s.quality} items={qualityItems} onChange={(v) => set('quality', v)} />
            </div>
          )}

          <div className="field">
            <label htmlFor={`${id}-dl`}>
              Дедлайн <span className="optional">(необов’язково)</span>
            </label>
            <DatePicker
              id={`${id}-dl`}
              min={minDate}
              value={s.deadline}
              placeholder="Оберіть дату"
              clearable
              onChange={(v) => set('deadline', v)}
            />
          </div>
        </>
      )}

      <div className="calc__result" role="status" aria-live="polite">
        {!s.typeId && <p className="field-hint">Оберіть вид роботи, щоб побачити орієнтовну вартість.</p>}
        {result?.status === 'incomplete' && <p className="field-hint">{result.reason}</p>}
        {result?.status === 'manual' && (
          <>
            <p className="calc__price calc__price--manual">Оцінка менеджером</p>
            <p className="field-hint">{result.reason}</p>
          </>
        )}
        {result?.status === 'ok' && (
          <>
            <p className="calc__price">Орієнтовно {fmtMoney(result.total)}</p>
            <dl className="calc__lines">
              {result.lines.map((l) => (
                <div key={l.label}>
                  <dt>{l.label}</dt>
                  <dd>{fmtMoney(Math.round(l.amount))}</dd>
                </div>
              ))}
            </dl>
            <p className="field-hint">
              Звичайний строк для такого обсягу: близько {result.normalDays} дн. Це попередній розрахунок за стартовими
              тарифами. Остаточну вартість менеджер погоджує після перегляду вимог.
            </p>
          </>
        )}
      </div>

      {result?.status === 'ok' || result?.status === 'manual' ? (
        <Link
          href={href}
          className="btn btn-primary btn-block"
          onClick={() => track('estimate_cta_click', { placement: 'calculator', service: s.typeId })}
        >
          {result.status === 'ok' ? 'Надіслати вимоги й уточнити вартість' : 'Надіслати вимоги для оцінки'}
          <Icon name="arrow-right" />
        </Link>
      ) : (
        <Link
          href="/#request"
          className="btn btn-secondary btn-block"
          onClick={() => track('estimate_cta_click', { placement: 'calculator-empty' })}
        >
          Одразу залишити заявку
        </Link>
      )}
    </div>
  );
}
