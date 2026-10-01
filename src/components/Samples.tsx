'use client';

import { useRef, useState } from 'react';
import { Icon } from './Icon';
import { SectionTitle } from './SectionTitle';
import { track } from '@/lib/analytics';

interface Sample {
  id: string;
  title: string;
  description: string;
  label: string;
  asset: string;
}

export function Samples({ title, items, cta }: { title: string; items: Sample[]; cta: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [active, setActive] = useState<Sample | null>(null);

  const openSample = (sample: Sample) => {
    setActive(sample);
    track('example_open', { placement: 'samples', service: sample.id });
    dialogRef.current?.showModal();
  };

  const close = () => dialogRef.current?.close();

  return (
    <section id="samples" className="section container" aria-labelledby="samples-title">
      <SectionTitle id="samples-title">{title}</SectionTitle>
      <ul className="samples-grid">
        {items.map((sample, i) => (
          <li key={sample.id} className={`sample-card sample-card--${i % 2 === 0 ? 'yellow' : 'neutral'}`}>
            <div className="sample-card__preview">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={sample.asset}
                alt={`Демонстраційний матеріал: ${sample.title}`}
                width={720}
                height={1000}
                loading="lazy"
                decoding="async"
              />
            </div>
            <div className="sample-card__body">
              <span className="sample-card__label">{sample.label}</span>
              <h3>{sample.title}</h3>
              <p>{sample.description}</p>
              <button type="button" className="btn btn-secondary btn-sm" onClick={() => openSample(sample)}>
                {cta}
                <Icon name="external" />
              </button>
            </div>
          </li>
        ))}
      </ul>

      <dialog
        ref={dialogRef}
        className="modal"
        aria-labelledby="sample-modal-title"
        onClose={() => setActive(null)}
        onClick={(e) => e.target === dialogRef.current && close()}
      >
        {active && (
          <div className="modal__panel">
            <div className="modal__head">
              <div>
                <p className="sample-card__label">{active.label}</p>
                <h3 id="sample-modal-title">{active.title}</h3>
              </div>
              <button type="button" className="modal__close" onClick={close} autoFocus>
                <Icon name="close" />
                <span className="sr-only">Закрити</span>
              </button>
            </div>
            <div className="modal__image">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={active.asset} alt={`Збільшений демонстраційний матеріал: ${active.title}`} width={720} height={1000} />
            </div>
            <p className="modal__note">
              Це зразок оформлення, а не виконане замовлення і не підтвердження результату чи оцінки. Файл для завантаження
              не передбачено.{' '}
              <a href={active.asset} target="_blank" rel="noopener noreferrer">
                Відкрити зображення окремо
              </a>
            </p>
          </div>
        )}
      </dialog>
    </section>
  );
}
