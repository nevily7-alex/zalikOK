# ЗалікОк — розробка, запуск, розгортання

Сайт допомоги з курсовими: Next.js 16 (App Router) + TypeScript, звичайний CSS з токенами, Zod, PostgreSQL + Prisma 7, better-auth, приватне сховище вкладень (local для розробки / S3-сумісне для production).

> Сайт **не опубліковано**. Перед запуском виконайте список у [LAUNCH_BLOCKERS.md](LAUNCH_BLOCKERS.md).

## Швидкий старт (локально)

Потрібно: Node.js ≥ 20.9 (перевірено на 24), npm.

```bash
npm install
cp .env.example .env        # заповніть AUTH_SECRET (openssl rand -base64 32)
npm run db:dev              # термінал 1: локальна PostgreSQL (embedded) на порту 54329
npm run db:migrate          # термінал 2: застосувати міграції
npm run dev                 # http://localhost:3000
```

Створити менеджера (пароль ≥ 12 символів; змінні лише для цього процесу):

```bash
ADMIN_EMAIL=you@example.com ADMIN_PASSWORD='довгий-пароль' npm run admin:create
```

Панель: `/admin` (вхід `/admin/login`). Ролі: `manager`, `admin` — доступ; будь-яка інша (`user`) — відмова. Публічної реєстрації немає.

> У середовищах без embedded-postgres використовуйте будь-який PostgreSQL ≥ 15 і задайте `DATABASE_URL`. Кодування БД має бути UTF8.

## Команди

| Команда | Призначення |
|---|---|
| `npm run dev` / `build` / `start` | розробка / збірка / запуск збірки |
| `npm run typecheck` / `npm run lint` | TypeScript / ESLint |
| `npm test` | unit + інтеграційні тести (Vitest; outbox потребує БД) |
| `npm run build && npm run test:e2e` | E2E Playwright проти production-збірки (порт 3100, потрібен Google Chrome) |
| `npm run db:migrate` | `prisma migrate deploy` |
| `npm run db:migrate:dev` | нова міграція під час розробки |
| `npm run db:check-rls` / `npm run storage:check` | перевірка RLS у БД / перевірка сховища вкладень |
| `GET /api/cron/outbox`, `/api/cron/cleanup` | те саме за розкладом через HTTP (CRON_SECRET) |
| `npm run cleanup [-- --dry-run]` | прострочені завантаження, ключі ідемпотентності, rate-limit, строк зберігання |
| `npm run outbox:run` | обробка черги сповіщень (запускати за розкладом) |
| `npm run admin:create` | створити/оновити менеджера |

E2E використовують облікові дані з `.env.e2e` (у `.gitignore`): `E2E_MANAGER_EMAIL/PASSWORD`, `E2E_USER_EMAIL/PASSWORD`. Створіть цих двох користувачів через `admin:create` (ролі `manager` та `user`).

## Структура

```
content/            site-content.json (тексти), site-config.json (контакти, null до заповнення), legal.ts (чернетки умов/політики)
public/assets/      логотипи, іконки + sprite, hero, зразки, шрифти (повні оригінали + OFL), декор, OG
src/app/(site)/     /, /zaiavka, /umovy, /privacy, /diakuiemo
src/app/admin/      /admin/login, список і картка заявки (server actions)
src/app/api/        requests, uploads/*, admin/attachments/[id], auth/[...all]
src/components/     секції головної, RequestForm (єдина форма), Header (drawer), Faq, Samples (modal)
src/lib/            validation (спільна Zod-схема), upload-rules, kyiv-date; server/* — db, storage, auth, rate-limit, notify
src/fonts/          підмножина Manrope/Nunito Sans (латиниця+кирилиця) для next/font
prisma/             schema + міграції
tests/              unit (Vitest), e2e (Playwright)
scripts/            dev-db, create-manager, cleanup, run-outbox, скріншоти
```

Шрифти: `next/font/local` використовує підмножини з `src/fonts` (≈71 КБ замість ≈263 КБ). Перегенерація з оригіналів:

```bash
pip install fonttools brotli
python -m fontTools.varLib.instancer public/assets/fonts/NunitoSans-Variable.ttf wght=300:900 wdth=100 opsz=12 YTLC=500 -o .data/nunito-wght.ttf
python -m fontTools.subset .data/nunito-wght.ttf --unicodes="U+0020-007E,U+00A0-00FF,U+0400-045F,U+0490-0491,U+2013-2014,U+2018-201E,U+2022,U+2026,U+20B4,U+2116" --layout-features='*' --flavor=woff2 --output-file=src/fonts/NunitoSans-subset.woff2
```

## Змінні середовища

Повний список з поясненнями — `.env.example`. Секрети лише на сервері/в системі хостингу.

| Змінна | Обов'язкова | Опис |
|---|---|---|
| `DATABASE_URL` | так | PostgreSQL (UTF8) |
| `AUTH_SECRET` | так | ≥ 32 символи, підпис сесій better-auth |
| `APP_URL` | так (prod) | публічна адреса, використовується для Origin-перевірок, cookie, посилань у сповіщеннях |
| `STORAGE_DRIVER` | так | `s3` у production (`local` заблоковано у production без `ALLOW_LOCAL_STORAGE_IN_PRODUCTION`) |
| `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE` | для s3 | приватний bucket; CORS лише для origin застосунку, метод PUT |
| `UPLOAD_SCAN_MODE` | так | `off` (файли лишаються `pending`, завантаження менеджером заблоковано), `clamav` (+`CLAMAV_HOST/PORT`), `dev-trust` (лише development) |
| `NOTIFICATIONS_ENABLED`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MANAGER_CHAT_ID` | опційно | у development завжди вимкнено |
| `TRUSTED_PROXY_HEADER` | рекомендовано | заголовок з IP клієнта від довіреного проксі хостингу (напр. `x-forwarded-for`). Без нього всі клієнти ділять один кошик rate limit |
| `RATE_LIMIT_MAX`, `RATE_LIMIT_WINDOW_MINUTES` | ні | за замовчуванням 5 / 15 |
| `FILE_RETENTION_DAYS`, `ABANDONED_UPLOAD_HOURS` | ні | технічні значення за замовчуванням 180 днів / 24 год — не юридична вимога |
| `NEXT_PUBLIC_ANALYTICS_ENDPOINT` | ні | без неї аналітика вимкнена |

## Supabase (база даних + файли)

Supabase використовується лише як керована PostgreSQL і S3-сумісне приватне сховище. Вхід менеджера лишається на better-auth, клієнтські SDK Supabase не потрібні.

1. **Підключення до БД** (Project → Connect). У `.env`:
   - `DATABASE_URL` — Transaction pooler (порт 6543), **без** `?sslmode=`; `DATABASE_SSL=verify` (перевірка сертифіката; корінь Supabase вбудовано в `src/lib/server/supabase-ca.ts`, для іншого провайдера задайте `DATABASE_SSL_CA`).
   - `DIRECT_URL` — Direct connection / Session pooler (порт 5432) з `?sslmode=require`. Лише для міграцій.
2. **Міграції:** `npm run db:migrate`. Міграція `enable_rls` вмикає RLS на всіх таблицях і забирає права у ролей `anon`/`authenticated`, щоб дані заявок не були доступні через публічне Data API Supabase. Після кожної нової міграції: `npm run db:check-rls` (має вивести `"ok":true`). Нові таблиці потребують `ENABLE ROW LEVEL SECURITY`.
3. **Сховище:** Storage → New bucket (`Public` вимкнено). Storage → S3 Connection → створити ключі доступу. У `.env`: `STORAGE_DRIVER=s3`, `S3_ENDPOINT`, `S3_REGION`, `S3_BUCKET`, `S3_ACCESS_KEY_ID`, `S3_SECRET_ACCESS_KEY`, `S3_FORCE_PATH_STYLE=true`. Перевірка: `npm run storage:check` (підписаний PUT, підробка розміру відхиляється, читання, видалення).
4. Дані клієнтів зберігаються у регіоні проєкту — оберіть регіон свідомо. Безкоштовний план без point-in-time recovery і може призупинятися при неактивності.
5. Автотести (Vitest outbox, Playwright) відмовляються працювати з не-локальною БД. Для тестів поверніть локальні налаштування (`.env.backup`) і запустіть `npm run db:dev`.
6. Service role key і пароль БД не потрапляють у браузер і не комітяться; `NEXT_PUBLIC_*` змінних для Supabase немає.

## Telegram-сповіщення менеджеру

1. У Telegram: `@BotFather` → `/newbot` → отримати токен. Відкрийте бота й натисніть Start (або додайте бота в групу менеджерів і напишіть там повідомлення).
2. У терміналі: `npm run setup:telegram`. Скрипт перевірить токен, знайде чат, надішле тестове повідомлення й запише `TELEGRAM_BOT_TOKEN`, `TELEGRAM_MANAGER_CHAT_ID`, `NOTIFICATIONS_ENABLED=true` у `.env`.
3. У development сповіщення йдуть лише з `ALLOW_DEV_NOTIFICATIONS=true` (скрипт пропонує це для тесту). У production достатньо `NOTIFICATIONS_ENABLED=true` + токен + chat id у змінних хостингу.
4. Повідомлення мінімальне: номер заявки, послуга, вид роботи, дедлайн, посилання в admin (на основі `APP_URL`). Без контакту клієнта та файлів, тож безпечно для групового чату.
5. Збій Telegram заявку не втрачає: повтори з exponential backoff (до 6 спроб), стан «Помилка» і кнопка «Повторити» у картці заявки; `npm run outbox:run` обробляє чергу за розкладом.

## Як працює відправка заявки

1. Файли (за бажанням): `POST /api/uploads/session` → секрет сесії (у БД лише хеш) → `POST /api/uploads/files` (слот і підписаний PUT URL з розміром/типом) → PUT → `POST /api/uploads/complete` (перевірка розміру, сигнатури, DOCX-каталогу, PDF-скриптів; AV за режимом).
2. `POST /api/requests` з `Idempotency-Key`: серверна валідація, перевірка належності файлів сесії та її секрету, транзакція «заявка + вкладення + outbox + audit». Повтор з тим самим ключем → 200 з тією ж заявкою.
3. Telegram-сповіщення йде через outbox (retry з exponential backoff, максимум 6 спроб, стан `failed` видно в панелі). Збій сповіщення заявку не втрачає.

## Розгортання (без публікації)

1. Підготуйте PostgreSQL (UTF8), приватний S3-bucket, домен, хостинг Node.js ≥ 20.9 за HTTPS-проксі.
2. Задайте змінні середовища (див. таблицю). `NODE_ENV=production`.
3. `npm ci && npm run build` (збірка виконує `prisma generate`).
4. Міграції: `npm run db:migrate` (`prisma migrate deploy`) — **до** запуску нової версії.
5. `npm start` за проксі; створіть менеджера `admin:create`.
6. Розклад: або `npm run outbox:run` (щохвилини) і `npm run cleanup` (щодоби), або HTTP-ендпоінти `GET /api/cron/outbox` та `GET /api/cron/cleanup` із заголовком `Authorization: Bearer <CRON_SECRET>` (Vercel Cron додає його сам; без `CRON_SECRET` ендпоінти вимкнені). Нова заявка відправляє сповіщення відразу через `after()`; cron потрібен для повторів після збоїв.
7. Заповніть `content/site-config.json` (домен, Telegram, e-mail, години, оператор) і юридичні тексти; після юридичного перегляду змініть `legalStatus` (знімає noindex і додає сторінки в sitemap).

### Резервні копії, відновлення, відкат
- БД: щоденний `pg_dump` (шифрований, не публічний) + PITR, якщо підтримує провайдер. Перевірте відновлення на тестовому інстансі.
- Bucket: версіонування та lifecycle (видалення за строком зберігання), бекап у окремий акаунт.
- Відкат застосунку: попередня збірка (артефакт). Міграції — вперед сумісні; перед ризиковою міграцією робіть бекап. Деструктивні зміни схеми — у два релізи (expand → contract).
- `cleanup` можна запускати з `--dry-run` для перегляду, що буде видалено.

## Безпека — коротко
Origin-перевірка публічних POST/PUT, rate limit у PostgreSQL з TTL, ідемпотентність, приватні вкладення без публічних URL, перевірка сигнатур (MIME/розширення недостатньо), `scanStatus` не стає `clean` без сканера, серверна авторизація (better-auth, HttpOnly/SameSite cookie, Secure у production), роль перевіряється на кожній сторінці/дії/API, аудит змін без копій контактів, логи без текстів заявок і токенів.
