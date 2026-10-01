'use client';

import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from '../Icon';
import { isValidDateString, todayInKyiv } from '@/lib/kyiv-date';

const MONTHS = ['Січень', 'Лютий', 'Березень', 'Квітень', 'Травень', 'Червень', 'Липень', 'Серпень', 'Вересень', 'Жовтень', 'Листопад', 'Грудень'];
const WEEKDAYS = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

const pad = (n: number) => String(n).padStart(2, '0');
const iso = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
const parts = (s: string) => ({ y: Number(s.slice(0, 4)), m: Number(s.slice(5, 7)) - 1, d: Number(s.slice(8, 10)) });
function addDays(s: string, n: number): string {
  const { y, m, d } = parts(s);
  return new Date(Date.UTC(y, m, d + n)).toISOString().slice(0, 10);
}
function addMonths(s: string, n: number): string {
  const { y, m, d } = parts(s);
  const target = new Date(Date.UTC(y, m + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  return iso(target.getUTCFullYear(), target.getUTCMonth(), Math.min(d, last));
}
export const formatDate = (s: string) => (isValidDateString(s) ? `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}` : '');

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  min?: string;
  name?: string;
  placeholder?: string;
  clearable?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

/** Власний календар у стилі сайту. Клавіші: стрілки (±1/±7 днів), PageUp/PageDown (місяць), Home/End, Enter/Space, Esc. */
export function DatePicker({ id, value, onChange, min, name, placeholder = 'Оберіть дату', clearable, invalid, describedBy, className }: Props) {
  const popId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [up, setUp] = useState(false);
  const [focused, setFocused] = useState('');

  const today = todayInKyiv();
  const clamp = (d: string) => (min && d < min ? min : d);

  const openPop = () => {
    const start = clamp(isValidDateString(value) ? value : today);
    setFocused(start);
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setUp(window.innerHeight - rect.bottom < 420 && rect.top > window.innerHeight - rect.bottom);
    setOpen(true);
  };
  const close = (returnFocus = true) => {
    setOpen(false);
    if (returnFocus) triggerRef.current?.focus();
  };
  const pick = (d: string) => {
    if (min && d < min) return;
    onChange(d);
    close();
  };

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // Календар не виходить за межі екрана (вузькі телефони): зсуваємо по горизонталі
  useLayoutEffect(() => {
    const pop = popRef.current;
    if (!open || !pop) return;
    pop.style.transform = '';
    const r = pop.getBoundingClientRect();
    const margin = 12;
    const vw = document.documentElement.clientWidth;
    let dx = 0;
    if (r.right > vw - margin) dx = vw - margin - r.right;
    if (r.left + dx < margin) dx = margin - r.left;
    if (dx) pop.style.transform = `translateX(${dx}px)`;
  }, [open]);

  // Фокус на активному дні після кожного руху
  useEffect(() => {
    if (!open || !focused) return;
    popRef.current?.querySelector<HTMLButtonElement>(`[data-date="${focused}"]`)?.focus();
  }, [open, focused]);

  const { y, m } = parts(focused || today);
  const first = (new Date(Date.UTC(y, m, 1)).getUTCDay() + 6) % 7;
  const daysInMonth = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  const cells: (string | null)[] = [...Array(first).fill(null), ...Array.from({ length: daysInMonth }, (_, i) => iso(y, m, i + 1))];
  while (cells.length % 7) cells.push(null);

  const move = (to: string) => setFocused(clamp(to));
  const onGridKey = (e: React.KeyboardEvent) => {
    const k = e.key;
    const map: Record<string, () => void> = {
      ArrowLeft: () => move(addDays(focused, -1)),
      ArrowRight: () => move(addDays(focused, 1)),
      ArrowUp: () => move(addDays(focused, -7)),
      ArrowDown: () => move(addDays(focused, 7)),
      Home: () => move(addDays(focused, -((parts(focused).d - 1 + first) % 7))),
      End: () => move(addDays(focused, 6 - ((parts(focused).d - 1 + first) % 7))),
      PageUp: () => move(addMonths(focused, e.shiftKey ? -12 : -1)),
      PageDown: () => move(addMonths(focused, e.shiftKey ? 12 : 1)),
    };
    if (map[k]) {
      e.preventDefault();
      map[k]();
    } else if (k === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      close();
    }
  };

  const prevDisabled = !!min && iso(y, m, 1) <= min.slice(0, 8) + '01';

  return (
    <div ref={wrapRef} className={`ui-date${up ? ' is-up' : ''}${className ? ` ${className}` : ''}`}>
      <button
        ref={triggerRef}
        type="button"
        id={id}
        className="ui-select__button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls={open ? popId : undefined}
        data-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-value={value}
        onClick={() => (open ? close(false) : openPop())}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown' && !open) {
            e.preventDefault();
            openPop();
          }
        }}
      >
        <span className={value ? '' : 'ui-placeholder'}>{value ? formatDate(value) : placeholder}</span>
        <Icon name="calendar" className="ui-select__chevron" />
      </button>
      {name && <input type="hidden" name={name} value={value} />}

      {open && (
        <div
          ref={popRef}
          id={popId}
          role="dialog"
          aria-label="Оберіть дату"
          className="ui-popup ui-calendar"
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              e.preventDefault();
              close();
            }
          }}
        >
          <div className="ui-calendar__head">
            <button
              type="button"
              className="icon-btn"
              disabled={prevDisabled}
              onClick={() => move(addMonths(focused, -1))}
            >
              <Icon name="arrow-left" />
              <span className="sr-only">Попередній місяць</span>
            </button>
            <strong aria-live="polite">
              {MONTHS[m]} {y}
            </strong>
            <button type="button" className="icon-btn" onClick={() => move(addMonths(focused, 1))}>
              <Icon name="arrow-right" />
              <span className="sr-only">Наступний місяць</span>
            </button>
          </div>
          <div role="grid" aria-label={`${MONTHS[m]} ${y}`} onKeyDown={onGridKey}>
            <div role="row" className="ui-calendar__row ui-calendar__weekdays">
              {WEEKDAYS.map((w) => (
                <span key={w} role="columnheader">
                  {w}
                </span>
              ))}
            </div>
            {Array.from({ length: cells.length / 7 }, (_, r) => (
              <div role="row" key={r} className="ui-calendar__row">
                {cells.slice(r * 7, r * 7 + 7).map((d, c) =>
                  d ? (
                    <span role="gridcell" key={d} aria-selected={d === value}>
                      <button
                        type="button"
                        data-date={d}
                        tabIndex={d === focused ? 0 : -1}
                        disabled={!!min && d < min}
                        aria-label={`${Number(d.slice(8))} ${MONTHS[m]!.toLowerCase()} ${y}`}
                        aria-current={d === today ? 'date' : undefined}
                        className={`ui-day${d === value ? ' is-selected' : ''}${d === today ? ' is-today' : ''}`}
                        onClick={() => pick(d)}
                      >
                        {Number(d.slice(8))}
                      </button>
                    </span>
                  ) : (
                    <span key={`e${r}-${c}`} role="gridcell" aria-hidden="true" />
                  ),
                )}
              </div>
            ))}
          </div>
          <div className="ui-calendar__foot">
            <button
              type="button"
              className="ui-link"
              disabled={!!min && today < min}
              onClick={() => pick(today)}
            >
              Сьогодні
            </button>
            {clearable && value && (
              <button
                type="button"
                className="ui-link"
                onClick={() => {
                  onChange('');
                  close();
                }}
              >
                Очистити
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
