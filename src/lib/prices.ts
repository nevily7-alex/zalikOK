import raw from '@content/prices.json';

export interface PriceItem {
  id: string;
  title: string;
  from: number;
}
export interface PriceGroup {
  id: string;
  title: string;
  items: PriceItem[];
}

export const prices = raw as { currency: string; note: string; groups: PriceGroup[] };

export const ALL_PRICE_ITEMS: PriceItem[] = prices.groups.flatMap((g) => g.items);
export const PRICE_IDS = ALL_PRICE_ITEMS.map((i) => i.id) as [string, ...string[]];

export function findPrice(id: string | undefined | null): PriceItem | undefined {
  return id ? ALL_PRICE_ITEMS.find((i) => i.id === id) : undefined;
}

/** «від 1 000 грн» (нерозривні пробіли) */
export function formatFrom(amount: number): string {
  const n = new Intl.NumberFormat('uk-UA').format(amount).replace(/\s/g, ' ');
  return `від ${n} ${prices.currency}`;
}
