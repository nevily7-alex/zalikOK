'use client';

import { useRouter } from 'next/navigation';

/**
 * Тіло таблиці, де рядок відкриває заявку кліком у будь-якому місці.
 * Посилання в першій клітинці лишається для клавіатури й відкриття в новій вкладці; виділення тексту рядок не відкриває.
 */
export function RowLinks({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  return (
    <tbody
      onClick={(e) => {
        const target = e.target as HTMLElement;
        if (target.closest('a, button, input, select, textarea, label')) return;
        if (window.getSelection()?.toString()) return;
        const href = target.closest('tr')?.getAttribute('data-href');
        if (!href) return;
        if (e.metaKey || e.ctrlKey) window.open(href, '_blank');
        else router.push(href);
      }}
    >
      {children}
    </tbody>
  );
}
