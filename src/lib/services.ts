import raw from '@content/services/pages.json';

export type Block =
  | { t: 'p'; html: string }
  | { t: 'ul' | 'ol'; items: string[] }
  | { t: 'h2' | 'h3' | 'h4'; html: string }
  | { t: 'table'; rows: string[][] };

export interface ServicePage {
  slug: string;
  title: string;
  priceId: string | null;
  h1: string;
  tagline: string | null;
  terms: Block[] | null;
  tiers: { name: string; desc: string; pages: string }[];
  faqTitle: string;
  faq: { q: string; a: Block[] }[];
  articleTitle: string | null;
  article: Block[];
  subjectsTitle: string | null;
  subjects: string[];
  ctaTitle: string | null;
}

export const servicePages = raw as unknown as ServicePage[];

export function getServicePage(slug: string): ServicePage | undefined {
  return servicePages.find((s) => s.slug === slug);
}
