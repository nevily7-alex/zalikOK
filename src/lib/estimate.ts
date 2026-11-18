import { config, getTariff, type Option } from './calc';

/** Налаштування полів оцінки для обраного виду роботи (спільне для форми заявки та калькулятора). */
export interface QtyConfig {
  label: string;
  step: number;
  min: number;
  max: number;
  def: number;
}

export function qtyConfig(typeId: string): QtyConfig | null {
  const t = getTariff(typeId);
  if (!t || t.kind === 'manual') return null;
  if (t.kind === 'chars') return { label: 'Обсяг, знаків з пробілами', step: 1000, min: 1000, max: 1_000_000, def: t.baseChars };
  if (t.kind === 'pages') return { label: `Обсяг, ${t.unit}`, step: 1, min: 1, max: 500, def: t.baseQty };
  if (t.kind === 'units') return { label: `Кількість, ${t.unit}`, step: 1, min: 1, max: 500, def: t.baseQty };
  return { label: 'Сторінок, які потрібно змінити', step: 1, min: 1, max: 500, def: t.baseQty };
}

/** Чи зберігається кількість у полі «сторінок» заявки (1–500). Для послуг за знаками — ні. */
export function mapsToPages(typeId: string): boolean {
  const t = getTariff(typeId);
  return !!t && (t.kind === 'pages' || t.kind === 'units' || t.kind === 'revision');
}

export interface Extras {
  complexity: boolean;
  quality: boolean;
  revision: boolean;
  variant?: { label: string; options: Option[] };
  source?: { label: string };
}

export function extrasFor(typeId: string): Extras {
  const t = getTariff(typeId);
  if (!t || t.kind === 'manual') return { complexity: false, quality: false, revision: false };
  return {
    complexity: t.kind === 'pages' || t.kind === 'chars' || (t.kind === 'units' && !t.noComplexity),
    quality: t.kind === 'chars' && !!t.quality,
    revision: t.kind === 'revision',
    variant: t.kind === 'units' ? t.variant : undefined,
    source: t.kind === 'pages' ? t.source : undefined,
  };
}

export function defaultVariant(typeId: string): string {
  return extrasFor(typeId).variant?.options[0]?.id ?? '';
}

export const COMPLEXITY_OPTIONS = config.complexity.map((o) => ({ value: o.id, label: o.label }));
export const QUALITY_OPTIONS = config.quality.map((o) => ({ value: o.id, label: o.label }));
export const REVISION_OPTIONS = [
  { value: 'proof', label: 'Корекція: мова, оформлення, дрібні правки' },
  { value: 'content', label: 'Зміни за змістом: переписати, доповнити' },
];
