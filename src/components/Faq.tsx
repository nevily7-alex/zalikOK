'use client';

import { useId, useState } from 'react';
import { Icon } from './Icon';

interface FaqItem {
  question: string;
  answer: string;
}

export function Faq({ items }: { items: FaqItem[] }) {
  const baseId = useId();
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  const columns = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];

  return (
    <div className="faq-grid">
      {columns.map((col, c) => (
        <div key={c} className="faq-col">
          {col.map((item, j) => {
            const index = j * 2 + c;
            const open = openIndex === index;
            const btnId = `${baseId}-q-${index}`;
            const panelId = `${baseId}-a-${index}`;
            return (
              <div key={item.question} className={`faq-item${open ? ' is-open' : ''}`}>
                <h3 className="faq-item__heading">
                  <button
                    type="button"
                    id={btnId}
                    className="faq-item__button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpenIndex(open ? null : index)}
                  >
                    <span>{item.question}</span>
                    <Icon name={open ? 'chevron-up' : 'chevron-down'} />
                  </button>
                </h3>
                <div id={panelId} role="region" aria-labelledby={btnId} hidden={!open} className="faq-item__panel">
                  <p>{item.answer}</p>
                </div>
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
