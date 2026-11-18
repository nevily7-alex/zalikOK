import type { ReactNode } from 'react';

/** Векторні ілюстрації для сторінок послуг. Палітра збігається з токенами сайту. */
const Y = '#ffd43b';
const S = '#fff4cc';
const G = '#2b2a2e';
const W = '#ffffff';
const M = '#e8e4da';
const sw = { stroke: G, strokeWidth: 4 } as const;

export type ArtName = 'docs' | 'cap' | 'laptop' | 'calc' | 'chat' | 'books' | 'shield' | 'steps' | 'pencil';

export const ART_CYCLE: ArtName[] = ['docs', 'calc', 'steps', 'books', 'chat', 'shield', 'laptop', 'cap'];

const parts: Record<ArtName, ReactNode> = {
  docs: (
    <>
      <rect x="38" y="34" width="104" height="132" rx="14" fill={M} transform="rotate(-8 90 100)" />
      <rect x="52" y="28" width="104" height="132" rx="14" fill={W} {...sw} />
      <rect x="68" y="50" width="48" height="8" rx="4" fill={Y} />
      <rect x="68" y="72" width="72" height="6" rx="3" fill={M} />
      <rect x="68" y="88" width="72" height="6" rx="3" fill={M} />
      <rect x="68" y="104" width="52" height="6" rx="3" fill={M} />
      <circle cx="142" cy="140" r="26" fill={Y} {...sw} />
      <path d="M130 140l9 9 16-18" fill="none" stroke={G} strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  ),
  cap: (
    <>
      <path d="M100 52L28 88l72 36 72-36z" fill={G} />
      <path d="M60 106v34c0 12 18 22 40 22s40-10 40-22v-34l-40 20z" fill={Y} {...sw} strokeLinejoin="round" />
      <path d="M172 88v48" stroke={G} strokeWidth="4" strokeLinecap="round" />
      <circle cx="172" cy="142" r="9" fill={Y} {...sw} />
    </>
  ),
  laptop: (
    <>
      <rect x="38" y="40" width="124" height="86" rx="12" fill={W} {...sw} />
      <path d="M52 108l24-26 20 14 28-34 20 18" fill="none" stroke={G} strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <circle cx="76" cy="82" r="6" fill={Y} stroke={G} strokeWidth="3" />
      <circle cx="144" cy="80" r="6" fill={Y} stroke={G} strokeWidth="3" />
      <path d="M20 140h160l-12 18H32z" fill={Y} {...sw} strokeLinejoin="round" />
    </>
  ),
  calc: (
    <>
      <rect x="52" y="24" width="96" height="152" rx="16" fill={W} {...sw} />
      <rect x="66" y="40" width="68" height="30" rx="8" fill={S} stroke={G} strokeWidth="3" />
      <path d="M80 56h40" stroke={G} strokeWidth="5" strokeLinecap="round" />
      {[0, 1, 2].flatMap((r) =>
        [0, 1, 2].map((c) => <rect key={`${r}${c}`} x={68 + c * 24} y={86 + r * 26} width="18" height="18" rx="6" fill={r === 2 && c === 2 ? Y : M} />),
      )}
    </>
  ),
  chat: (
    <>
      <path d="M30 40h92a14 14 0 0 1 14 14v46a14 14 0 0 1-14 14H74l-26 20v-20H30a14 14 0 0 1-14-14V54a14 14 0 0 1 14-14z" fill={Y} {...sw} strokeLinejoin="round" />
      <path d="M40 64h64M40 82h40" stroke={G} strokeWidth="5" strokeLinecap="round" />
      <path d="M110 120h62a14 14 0 0 1 14 14v26a14 14 0 0 1-14 14h-10v16l-20-16h-32a14 14 0 0 1-14-14v-26a14 14 0 0 1 14-14z" fill={W} {...sw} strokeLinejoin="round" transform="translate(-6 -6)" />
    </>
  ),
  books: (
    <>
      <rect x="30" y="118" width="140" height="34" rx="8" fill={Y} {...sw} />
      <path d="M48 118v34M64 118v34" stroke={G} strokeWidth="3" />
      <rect x="44" y="82" width="120" height="34" rx="8" fill={W} {...sw} transform="rotate(-4 104 99)" />
      <rect x="54" y="46" width="100" height="34" rx="8" fill={G} transform="rotate(3 104 63)" />
      <path d="M70 58h40" stroke={Y} strokeWidth="5" strokeLinecap="round" transform="rotate(3 104 63)" />
    </>
  ),
  shield: (
    <>
      <path d="M100 26l62 22v44c0 40-26 66-62 82-36-16-62-42-62-82V48z" fill={Y} {...sw} strokeLinejoin="round" />
      <rect x="76" y="90" width="48" height="38" rx="9" fill={W} {...sw} />
      <path d="M84 90V78a16 16 0 0 1 32 0v12" fill="none" stroke={G} strokeWidth="4" />
      <circle cx="100" cy="108" r="5" fill={G} />
    </>
  ),
  steps: (
    <>
      <path d="M24 160h44v-30h44v-30h44V70h28" fill="none" stroke={G} strokeWidth="4" strokeLinejoin="round" />
      <circle cx="46" cy="160" r="12" fill={Y} {...sw} />
      <circle cx="90" cy="130" r="12" fill={Y} {...sw} />
      <circle cx="134" cy="100" r="12" fill={Y} {...sw} />
      <path d="M164 42l8 18 20 2-15 13 5 20-18-10-18 10 5-20-15-13 20-2z" fill={Y} {...sw} strokeLinejoin="round" />
    </>
  ),
  pencil: (
    <g transform="rotate(35 100 100)">
      <rect x="84" y="20" width="32" height="120" rx="6" fill={Y} {...sw} />
      <path d="M84 140h32l-16 36z" fill={S} {...sw} strokeLinejoin="round" />
      <path d="M94 160h12l-6 16z" fill={G} />
      <rect x="84" y="20" width="32" height="22" rx="6" fill={G} />
    </g>
  ),
};

/** Одна ілюстрація (декоративна). */
export function Art({ name, className = '' }: { name: ArtName; className?: string }) {
  return (
    <svg className={`svc-art ${className}`} viewBox="0 0 200 200" aria-hidden="true" focusable="false">
      {parts[name]}
    </svg>
  );
}

/** Велика сцена для шапки: предмети плавно «пливуть». */
export function ArtScene() {
  return (
    <svg className="svc-art svc-scene" viewBox="0 0 460 360" aria-hidden="true" focusable="false">
      <circle cx="230" cy="190" r="150" fill={S} />
      <circle cx="360" cy="70" r="26" fill={Y} />
      <g transform="translate(108 70) scale(1.2)">
        <g className="svc-bob">{parts.laptop}</g>
      </g>
      <g transform="translate(300 170) scale(.8)">
        <g className="svc-bob svc-bob--2">{parts.books}</g>
      </g>
      <g transform="translate(20 190) scale(.7)">
        <g className="svc-bob svc-bob--3">{parts.cap}</g>
      </g>
      <g transform="translate(330 -10) scale(.55)">
        <g className="svc-bob svc-bob--2">{parts.pencil}</g>
      </g>
      <g fill={G}>
        <path d="M60 60l4 10 10 4-10 4-4 10-4-10-10-4 10-4z" />
        <path d="M410 250l3 8 8 3-8 3-3 8-3-8-8-3 8-3z" />
      </g>
    </svg>
  );
}
