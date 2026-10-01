import { defineConfig } from 'vitest/config';
import path from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@content': path.resolve('content'),
      '@': path.resolve('src'),
      'server-only': path.resolve('tests/stubs/server-only.ts'),
    },
  },
  test: { include: ['tests/unit/**/*.test.ts'], environment: 'node', testTimeout: 20000 },
});
