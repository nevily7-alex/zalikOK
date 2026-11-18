'use client';

import { useState } from 'react';

/**
 * Копіює значення (контакт) одним кліком. Без `text` це маленька іконка над розтягнутим посиланням картки списку
 * (картку не відкриває); з `text` це звичайна кнопка з підписом.
 */
export function CopyButton({ value, label, text }: { value: string; label: string; text?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className={text ? 'btn btn-secondary btn-sm' : 'admin-copy'}
      aria-label={`Скопіювати: ${label}`}
      title="Скопіювати"
      onClick={async (e) => {
        e.stopPropagation();
        try {
          await navigator.clipboard.writeText(value);
          setDone(true);
          setTimeout(() => setDone(false), 1500);
        } catch {
          /* буфер недоступний: тихо ігноруємо */
        }
      }}
    >
      {done ? (text ? '✓ Скопійовано' : '✓') : (text ?? '⧉')}
    </button>
  );
}
