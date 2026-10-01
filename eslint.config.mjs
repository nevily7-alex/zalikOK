import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

const config = [
  ...nextVitals,
  ...nextTs,
  { ignores: ['.next/**', 'node_modules/**', 'src/generated/**', 'public/**', '.data/**', 'test-results/**', 'playwright-report/**'] },
];

export default config;
