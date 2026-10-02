// Готує змінні середовища для Vercel з вашого локального .env. Запуск: npm run vercel:env
// Створює файл .vercel-env.txt (в .gitignore): його вміст вставляється у Vercel → Settings → Environment Variables → Import .env.
// На екран значення НЕ виводяться. Після імпорту файл видаліть.
import 'dotenv/config';
import fs from 'node:fs';
import { randomBytes } from 'node:crypto';

const OUT = '.vercel-env.txt';
const e = process.env;
const missing = [];
const take = (name, { required = true } = {}) => {
  const v = (e[name] ?? '').trim();
  if (!v && required) missing.push(name);
  return v;
};

const vars = {
  // Нові секрети лише для production (локальні лишаються окремими)
  AUTH_SECRET: randomBytes(32).toString('base64'),
  CRON_SECRET: randomBytes(32).toString('hex'),

  DATABASE_URL: take('DATABASE_URL'),
  DATABASE_SSL: 'verify',

  STORAGE_DRIVER: 's3',
  S3_ENDPOINT: take('S3_ENDPOINT'),
  S3_REGION: take('S3_REGION'),
  S3_BUCKET: take('S3_BUCKET'),
  S3_ACCESS_KEY_ID: take('S3_ACCESS_KEY_ID'),
  S3_SECRET_ACCESS_KEY: take('S3_SECRET_ACCESS_KEY'),
  S3_FORCE_PATH_STYLE: 'true',

  // Автоматичного антивіруса на Vercel немає: файли лишаються «не перевірено»,
  // менеджер може завантажити їх лише з явним підтвердженням (і записом у журнал)
  UPLOAD_SCAN_MODE: 'off',
  ALLOW_UNSCANNED_DOWNLOAD: 'true',

  NOTIFICATIONS_ENABLED: e.NOTIFICATIONS_ENABLED === 'true' ? 'true' : 'false',
  TELEGRAM_BOT_TOKEN: take('TELEGRAM_BOT_TOKEN', { required: false }),
  TELEGRAM_MANAGER_CHAT_ID: take('TELEGRAM_MANAGER_CHAT_ID', { required: false }),

  // Vercel виставляє справжню адресу клієнта у X-Forwarded-For (зовнішні значення перезаписує)
  TRUSTED_PROXY_HEADER: 'x-forwarded-for',
};

if (e.STORAGE_DRIVER !== 's3') console.log('Увага: локально STORAGE_DRIVER не s3 — S3_* можуть бути порожніми.');
if (missing.length) {
  console.log(`Не вистачає у .env: ${missing.join(', ')}. Заповніть (npm run setup:supabase) і запустіть ще раз.`);
  process.exit(1);
}
if (vars.NOTIFICATIONS_ENABLED === 'true' && (!vars.TELEGRAM_BOT_TOKEN || !vars.TELEGRAM_MANAGER_CHAT_ID)) {
  console.log('Увага: сповіщення ввімкнені, але немає токена або chat id Telegram (npm run setup:telegram).');
}

const lines = Object.entries(vars)
  .filter(([, v]) => v !== '')
  .map(([k, v]) => `${k}=${v}`);
fs.writeFileSync(OUT, lines.join('\n') + '\n');
console.log(`Готово: ${OUT} — ${lines.length} змінних: ${Object.keys(vars).filter((k) => vars[k] !== '').join(', ')}`);
console.log('APP_URL не задається: поки домену немає, адресу береться з Vercel автоматично.');
console.log('Скопіюйте вміст файлу у Vercel (Import .env), потім ВИДАЛІТЬ файл.');
