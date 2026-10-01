import { defineConfig } from '@playwright/test';
import dotenv from 'dotenv';
import { assertLocalDatabase } from './tests/local-db-guard';

dotenv.config();
dotenv.config({ path: '.env.e2e' });
assertLocalDatabase();

const PORT = 3100;

export default defineConfig({
  testDir: 'tests/e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  fullyParallel: false,
  reporter: [['list']],
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: 'chrome',
    locale: 'uk-UA',
    trace: 'retain-on-failure',
  },
  webServer: {
    // Продакшн-збірка: `npm run build` має бути виконано раніше
    command: `npm run start -- -p ${PORT}`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      NODE_ENV: 'production',
      CRON_SECRET: 'e2e-cron-secret-for-tests-only',
      APP_URL: `http://localhost:${PORT}`,
      TRUSTED_PROXY_HEADER: 'x-forwarded-for',
      ALLOW_LOCAL_STORAGE_IN_PRODUCTION: 'true',
      UPLOAD_SCAN_MODE: 'off',
      NOTIFICATIONS_ENABLED: 'false',
      RATE_LIMIT_MAX: '5',
    },
  },
});
