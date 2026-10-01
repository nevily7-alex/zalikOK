'use client';

import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../Icon';

export interface SelectOption {
  value: string;
  label: string;
}
export interface SelectGroup {
  label: string;
  options: SelectOption[];
}
export type SelectItem = SelectOption | SelectGroup;

interface Props {
  id: string;
  value: string;
  onChange: (value: string) => void;
  items: SelectItem[];
  placeholder?: string;
  name?: string;
  disabled?: boolean;
  invalid?: boolean;
  describedBy?: string;
  className?: string;
}

const isGroup = (i: SelectItem): i is SelectGroup => 'options' in i;

/**
 * Власний список у стилі сайту (ARIA combobox + listbox). Фокус лишається на кнопці, активний пункт — aria-activedescendant.
 * Клавіші: ↑ ↓ Home End, Enter/Space, Esc, набір літер для пошуку.
 */
export function Select({ id, value, onChange, items, placeholder = 'Оберіть', name, disabled, invalid, describedBy, className }: Props) {
  const listId = useId();
  const wrapRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const typeahead = useRef({ text: '', timer: 0 as unknown as ReturnType<typeof setTimeout> });
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [up, setUp] = useState(false);

  const flat = useMemo(() => items.flatMap((i) => (isGroup(i) ? i.options : [i])), [items]);
  const selectedIndex = flat.findIndex((o) => o.value === value);
  const selected = selectedIndex >= 0 ? flat[selectedIndex] : undefined;

  const openList = () => {
    if (disabled) return;
    const rect = wrapRef.current?.getBoundingClientRect();
    if (rect) setUp(window.innerHeight - rect.bottom < 300 && rect.top > window.innerHeight - rect.bottom);
    setActive(selectedIndex >= 0 ? selectedIndex : 0);
    setOpen(true);
  };
  const close = () => setOpen(false);
  const choose = (i: number) => {
    const o = flat[i];
    if (o) onChange(o.value);
    close();
  };

  // закриття по кліку поза компонентом
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (!wrapRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);

  // активний пункт завжди видно
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [open, active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (disabled) return;
    const last = flat.length - 1;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.min(last, a + 1));
        break;
      case 'ArrowUp':
        e.preventDefault();
        if (!open) openList();
        else setActive((a) => Math.max(0, a - 1));
        break;
      case 'Home':
        if (open) {
          e.preventDefault();
          setActive(0);
        }
        break;
      case 'End':
        if (open) {
          e.preventDefault();
          setActive(last);
        }
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        if (open) choose(active);
        else openList();
        break;
      case 'Escape':
        if (open) {
          e.preventDefault();
          e.stopPropagation();
          close();
        }
        break;
      case 'Tab':
        if (open) close();
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          const t = typeahead.current;
          clearTimeout(t.timer);
          t.text += e.key.toLowerCase();
          t.timer = setTimeout(() => (t.text = ''), 600);
          const from = open ? active + (t.text.length === 1 ? 1 : 0) : 0;
          const order = [...flat.keys()];
          const rotated = [...order.slice(from), ...order.slice(0, from)];
          const hit = rotated.find((i) => flat[i]!.label.toLowerCase().startsWith(t.text));
          if (hit !== undefined) {
            if (!open) openList();
            setActive(hit);
          }
        }
    }
  };

  const renderOption = (o: SelectOption) => {
    const index = flat.indexOf(o);
    const isSelected = o.value === value;
    return (
      <div
        key={o.value || '__empty'}
        id={`${listId}-${index}`}
        role="option"
        aria-selected={isSelected}
        data-index={index}
        data-value={o.value}
        className={`ui-option${index === active ? ' is-active' : ''}${isSelected ? ' is-selected' : ''}`}
        onMouseEnter={() => setActive(index)}
        onClick={() => choose(index)}
      >
        <span>{o.label}</span>
        {isSelected && <Icon name="check" />}
      </div>
    );
  };

  return (
    <div ref={wrapRef} className={`ui-select${open ? ' is-open' : ''}${up ? ' is-up' : ''}${className ? ` ${className}` : ''}`}>
      <button
        type="button"
        id={id}
        role="combobox"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={listId}
        aria-activedescendant={open ? `${listId}-${active}` : undefined}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        data-value={value}
        disabled={disabled}
        className="ui-select__button"
        onClick={() => (open ? close() : openList())}
        onKeyDown={onKeyDown}
      >
        <span className={selected ? '' : 'ui-placeholder'}>{selected ? selected.label : placeholder}</span>
        <Icon name="chevron-down" className="ui-select__chevron" />
      </button>
      {name && <input type="hidden" name={name} value={value} />}
      {open && (
        <div
          ref={listRef}
          id={listId}
          role="listbox"
          aria-labelledby={id}
          className="ui-popup ui-list"
          onMouseDown={(e) => e.preventDefault()}
        >
          {items.map((item) =>
            isGroup(item) ? (
              <div key={item.label} role="group" aria-label={item.label}>
                <div className="ui-group-label" aria-hidden="true">
                  {item.label}
                </div>
                {item.options.map(renderOption)}
              </div>
            ) : (
              renderOption(item)
            ),
          )}
        </div>
      )}
    </div>
  );
}
