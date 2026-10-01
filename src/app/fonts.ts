// Підмножина (латиниця + кирилиця, у т.ч. Ґ Є І Ї та апостроф) із наданих варіативних шрифтів: ~71 КБ замість ~263 КБ.
// Оригінали (повні TTF/WOFF2 і OFL) лежать у public/assets/fonts. Команда підмножини — у README_DEV.md.
import localFont from 'next/font/local';

export const manrope = localFont({
  src: '../fonts/Manrope-subset.woff2',
  weight: '200 800',
  style: 'normal',
  display: 'swap',
  variable: '--font-manrope',
  fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
});

export const nunito = localFont({
  src: '../fonts/NunitoSans-subset.woff2',
  weight: '300 900',
  style: 'normal',
  display: 'swap',
  variable: '--font-nunito',
  fallback: ['system-ui', 'Segoe UI', 'Arial', 'sans-serif'],
});
