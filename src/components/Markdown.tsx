import type { ReactNode } from 'react';

/**
 * Мінімальний безпечний рендер Markdown для юридичних текстів: заголовки #/##, абзаци, списки (- та 1.),
 * **жирний**, [посилання](url). Без dangerouslySetInnerHTML; небезпечні схеми посилань не рендеряться.
 * Незаповнені поля **[…]** виділяються. Прямі апострофи між літерами замінюються на типографський ’.
 */
const INLINE = /(\*\*[^*]+\*\*|\[[^\]]+\]\([^)\s]+\))/g;
const EMAIL = /([\w.+-]+@[\w-]+(?:\.[\w-]+)+)/;
const SAFE_URL = /^(https:\/\/|http:\/\/|mailto:|tel:)/i;

const typo = (s: string) => s.replace(/(\p{L})'(?=\p{L})/gu, '$1’');

function inline(text: string, keyPrefix: string): ReactNode[] {
  return text.split(INLINE).map((part, i) => {
    const key = `${keyPrefix}-${i}`;
    if (part.startsWith('**') && part.endsWith('**') && part.length > 4) {
      const inner = part.slice(2, -2);
      if (/^\[[^\]]+\]$/.test(inner)) {
        return (
          <mark key={key} className="legal-placeholder">
            {typo(inner)}
          </mark>
        );
      }
      return <strong key={key}>{typo(inner)}</strong>;
    }
    const link = part.match(/^\[([^\]]+)\]\(([^)\s]+)\)$/);
    if (link) {
      const [, label, url] = link;
      if (!SAFE_URL.test(url!)) return typo(label!);
      const external = /^https?:/i.test(url!);
      return (
        <a key={key} href={url} {...(external ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
          {typo(label!)}
        </a>
      );
    }
    // Адреси e-mail у звичайному тексті стають посиланнями mailto:
    return part.split(EMAIL).map((chunk, j) =>
      EMAIL.test(chunk) && j % 2 === 1 ? (
        <a key={`${key}-m${j}`} href={`mailto:${chunk}`}>
          {chunk}
        </a>
      ) : (
        typo(chunk)
      ),
    );
  }).flat();
}

export function Markdown({ source, skipFirstH1 = false }: { source: string; skipFirstH1?: boolean }) {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let i = 0;
  let n = 0;
  let h1Skipped = !skipFirstH1;

  while (i < lines.length) {
    const line = lines[i]!;
    if (line.trim() === '') {
      i++;
      continue;
    }
    if (/^# /.test(line)) {
      if (h1Skipped) blocks.push(<h2 key={n++}>{inline(line.slice(2), `h${n}`)}</h2>);
      h1Skipped = true;
      i++;
    } else if (/^## /.test(line)) {
      blocks.push(<h2 key={n++}>{inline(line.slice(3), `h${n}`)}</h2>);
      i++;
    } else if (/^- /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^- /.test(lines[i]!)) items.push(lines[i++]!.slice(2));
      blocks.push(
        <ul key={n++} className="legal-list">
          {items.map((t, k) => (
            <li key={k}>{inline(t, `u${n}-${k}`)}</li>
          ))}
        </ul>,
      );
    } else if (/^\d+\. /.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\d+\. /.test(lines[i]!)) items.push(lines[i++]!.replace(/^\d+\. /, ''));
      blocks.push(
        <ol key={n++} className="legal-list legal-list--ordered">
          {items.map((t, k) => (
            <li key={k}>{inline(t, `o${n}-${k}`)}</li>
          ))}
        </ol>,
      );
    } else {
      const para: string[] = [];
      while (
        i < lines.length &&
        lines[i]!.trim() !== '' &&
        !/^(#{1,2} |- |\d+\. )/.test(lines[i]!)
      ) {
        para.push(lines[i++]!.trim());
      }
      blocks.push(<p key={n++}>{inline(para.join(' '), `p${n}`)}</p>);
    }
  }
  return <>{blocks}</>;
}
