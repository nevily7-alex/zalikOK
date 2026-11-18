'use client';

import { useState } from 'react';

/** Копіює значення (контакт) одним кліком. Стоїть над розтягнутим посиланням картки, тож картку не відкриває. */
export function CopyButton({ value, label }: { value: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="admin-copy"
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
      {done ? '✓' : '⧉'}
    </button>
  );
}
