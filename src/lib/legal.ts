import fs from 'node:fs';
import path from 'node:path';
import { getSiteConfig } from './site-config';

export type LegalSlug = 'terms' | 'privacy';

/** Незаповнене поле у тексті: **[... заповнити ...]** */
const PLACEHOLDER = /\*\*\[[^\]]+\]\*\*/g;

export interface LegalSource {
  slug: LegalSlug;
  source: string;
  title: string;
  placeholders: string[];
}

export function loadLegal(slug: LegalSlug): LegalSource {
  const source = fs.readFileSync(path.join(process.cwd(), 'content', 'legal', `${slug}.md`), 'utf8').replace(/\r\n/g, '\n');
  const title = source.match(/^# (.+)$/m)?.[1]?.trim() ?? slug;
  return { slug, source, title, placeholders: [...new Set(source.match(PLACEHOLDER) ?? [])] };
}

/**
 * Документи можна індексувати й додавати в sitemap, лише коли пройшли юридичний перегляд
 * (legalStatus у site-config.json змінено з review_required) і в тексті не лишилося незаповнених полів.
 */
export function legalPublishable(): boolean {
  if (getSiteConfig().legalStatus === 'review_required') return false;
  return (['terms', 'privacy'] as const).every((s) => loadLegal(s).placeholders.length === 0);
}
