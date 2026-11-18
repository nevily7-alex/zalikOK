import { test, expect } from '@playwright/test';
import { DOCX, PDF, pickOption, sql, uniqueIp } from './helpers';
import { SUBMIT_NAME, clickNext, fillStep1, fillStep3, toStep3 } from './wizard-helpers';

// Кожен тест — власний «IP» для rate limit
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueIp() });
});

const title = (page: import('@playwright/test').Page) => page.locator('#step-title');

test.describe('сторінка заявки: майстер із трьох кроків', () => {
  test('структура: окрема сторінка, кроки, ціна збоку, «Що буде далі» під формою, на головній форми немає', async ({ page }) => {
    await page.goto('/zaiavka');
    await expect(page.locator('h1')).toHaveText('Розкажіть про ваше завдання');
    const steps = page.getByRole('list', { name: 'Кроки заявки' }).getByRole('listitem');
    await expect(steps).toHaveCount(3);
    await expect(page.locator('[aria-current="step"]')).toContainText('Робота');
    await expect(title(page)).toHaveText('Яка робота');
    await expect(page.getByRole('complementary')).toContainText('Орієнтовна ціна');
    await expect(page.getByRole('heading', { name: 'Що буде далі' })).toBeVisible();

    await page.goto('/');
    await expect(page.locator('form')).toHaveCount(0); // форма на головній прибрана
    await expect(page.getByRole('link', { name: 'Залишити заявку' }).first()).toHaveAttribute('href', '/zaiavka');
  });

  test('«Що буде далі»: лише факти з Умов, без обіцянок строків', async ({ page }) => {
    await page.goto('/zaiavka');
    const block = page.locator('.whats-next');
    await expect(block.locator('li')).toHaveCount(4);
    const text = await block.innerText();
    expect(text).toContain('50/50');
    expect(text).toContain('Три безкоштовні правки');
    expect(text).toContain('Нічого не платите, поки не погодите ціну');
    expect(text).not.toMatch(/протягом години|за годину|за 10 хвилин|100\s?%\s?унікальн/i);
    await expect(block.getByRole('link', { name: 'Умовах замовлення' })).toHaveAttribute('href', '/umovy');
  });

  test('жива ціна: рахується за видом роботи та обсягом, лічильник «− +», ручна оцінка для складних робіт', async ({ page }) => {
    await page.goto('/zaiavka');
    const price = page.getByTestId('estimate-price');
    await expect(page.getByRole('complementary')).toContainText('Оберіть вид роботи');

    await pickOption(page.locator('#f-workType'), 'kursova');
    await expect(page.locator('#f-pages')).toHaveValue('25');
    await expect(price).toHaveText('Орієнтовно 1 200 грн');

    const plus = page.getByRole('button', { name: 'Збільшити' });
    for (let i = 0; i < 10; i++) await plus.click();
    await expect(page.locator('#f-pages')).toHaveValue('35');
    await expect(price).toHaveText('Орієнтовно 1 700 грн');
    await expect(page.getByRole('complementary')).toContainText('Додатково 10 × 50 грн');
    await page.getByRole('button', { name: 'Зменшити' }).click();
    await expect(page.locator('#f-pages')).toHaveValue('34');

    // межа лічильника
    await page.fill('#f-pages', '1');
    await expect(page.getByRole('button', { name: 'Зменшити' })).toBeDisabled();
    await page.fill('#f-pages', '500');
    await expect(plus).toBeDisabled();

    await pickOption(page.locator('#f-workType'), 'dysertatsiya');
    await expect(page.locator('.estimate__price')).toHaveText('Оцінка менеджером');
    await pickOption(page.locator('#f-workType'), 'other');
    await expect(page.locator('.estimate__price')).toHaveText('Оцінка менеджером');
  });

  test('послуги за знаками: крок лічильника 1000 і мінімальне замовлення', async ({ page }) => {
    await page.goto('/zaiavka');
    await pickOption(page.locator('#f-workType'), 'pereklad');
    await expect(page.getByText('Обсяг, знаків з пробілами')).toBeVisible();
    await expect(page.locator('#f-pages')).toHaveValue('18000');
    await page.getByRole('button', { name: 'Зменшити' }).click();
    await expect(page.locator('#f-pages')).toHaveValue('17000');
    await page.fill('#f-pages', '1000');
    await expect(page.getByTestId('estimate-price')).toHaveText('Орієнтовно 300 грн');
  });

  test('параметри з посилання (тип, обсяг, дедлайн) підставляються, а ціна рахується одразу', async ({ page }) => {
    await page.goto('/zaiavka?type=referat&qty=12');
    await expect(page.locator('#f-workType')).toHaveAttribute('data-value', 'referat');
    await expect(page.locator('#f-pages')).toHaveValue('12');
    await expect(page.getByTestId('estimate-price')).toHaveText('Орієнтовно 500 грн'); // 400 + 2×40 = 480 → 500
    // вигадані значення ігноруються
    await page.goto('/zaiavka?type=hacked&qty=-5&deadline=2001-01-01');
    await expect(page.locator('#f-workType')).toHaveAttribute('data-value', '');
    await expect(page.locator('#f-deadline')).toHaveAttribute('data-value', '');
  });

  test('крок 1: порожні поля → підсумок помилок, фокус на першому неправильному, крок не змінюється', async ({ page }) => {
    await page.goto('/zaiavka');
    await clickNext(page);
    await expect(page.locator('.form-summary')).toBeVisible();
    await expect(page.locator('#f-workType')).toBeFocused();
    await expect(page.locator('#workType-error')).toBeVisible();
    await expect(page.locator('#discipline-error')).toBeVisible();
    await expect(page.locator('#topic-error')).toBeVisible();
    await expect(page.locator('#deadline-error')).toBeVisible();
    await expect(title(page)).toHaveText('Яка робота');
  });

  test('навігація: Далі/Назад зберігають значення, фокус переходить на заголовок кроку, індикатор оновлюється', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillStep1(page);
    await clickNext(page);
    await expect(title(page)).toHaveText('Деталі');
    await expect(title(page)).toBeFocused();
    await expect(page.locator('[aria-current="step"]')).toContainText('Деталі');
    await page.fill('#f-comment', 'Мій коментар лишається');
    await clickNext(page);
    await expect(title(page)).toHaveText('Куди надіслати відповідь');
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.locator('#f-comment')).toHaveValue('Мій коментар лишається');
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.locator('#f-topic')).toHaveValue('Правові аспекти захисту персональних даних');
    await expect(page.locator('#f-workType')).toHaveAttribute('data-value', 'referat');
    // пройдений крок доступний у шапці, майбутній — ні
    await expect(page.getByRole('button', { name: /Крок 3/ })).toBeDisabled();
  });

  test('«Тему ще не визначено» знімає вимогу до теми; «Інше» відкриває вільне поле', async ({ page }) => {
    await page.goto('/zaiavka');
    await expect(page.locator('#f-disciplineOther')).toHaveCount(0);
    await pickOption(page.locator('#f-discipline'), 'other');
    await expect(page.locator('#f-disciplineOther')).toBeVisible();
    await clickNext(page);
    await expect(page.locator('#disciplineOther-error')).toBeVisible();
    await expect(page.locator('#topic-error')).toBeVisible();
    await page.getByLabel('Тему ще не визначено').check();
    await expect(page.locator('#topic-error')).toHaveCount(0);
  });

  test('крок 3: помилки контакту за типом і обов’язкова згода', async ({ page }) => {
    await page.goto('/zaiavka');
    await toStep3(page);
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page.locator('#contactMethod-error')).toBeVisible();
    await expect(page.locator('#privacyConsent-error')).toContainText('Потрібна згода');
    await page.getByLabel('E-mail', { exact: true }).check();
    await page.fill('#f-contact', '@not_an_email');
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page.locator('#contact-error')).toContainText('e-mail');
    await expect(page.getByText('Нічого не платите, поки не погодите ціну.').first()).toBeVisible();
  });

  test('успішна відправка з файлом: перехід на /diakuiemo, у БД вид роботи, файли та серверний розрахунок', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillStep1(page, { type: 'referat' });
    await clickNext(page);
    await page.setInputFiles('#f-files-input', [
      { name: 'вимоги.pdf', mimeType: 'application/pdf', buffer: PDF },
      { name: 'курсова.docx', mimeType: 'application/octet-stream', buffer: DOCX },
    ]);
    await expect(page.getByText('Завантажено').first()).toBeVisible();
    await expect(page.locator('.file-item__name', { hasText: 'вимоги.pdf' })).toBeVisible();
    expect(page.url()).toContain('/zaiavka'); // файл не відправляє заявку
    await clickNext(page);
    const contact = await fillStep3(page);
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page).toHaveURL(/\/diakuiemo\?ref=ZO-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    const url = page.url();
    expect(url).not.toContain(contact.slice(1));
    expect(url).not.toContain('Правов');
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toBeVisible();
    const ref = new URL(url).searchParams.get('ref')!;
    await expect(page.getByText(ref)).toBeVisible();

    const [row] = await sql<{ id: string; contact: string; workType: string; pages: number; clientEstimate: { status: string; total: number } }>(
      'select id, contact, "workType", pages, "clientEstimate" from "Request" where "publicReference" = $1',
      [ref],
    );
    expect(row.contact).toBe(contact);
    expect(row.workType).toBe('referat');
    expect(row.pages).toBe(10);
    expect(row.clientEstimate.status).toBe('ok');
    expect(row.clientEstimate.total).toBe(400); // реферат, базовий пакет 10 стор.
    const atts = await sql<{ scanStatus: string }>('select "scanStatus" from "Attachment" where "requestId" = $1', [row.id]);
    expect(atts).toHaveLength(2);
    expect(atts.every((a) => a.scanStatus === 'pending')).toBe(true);
  });

  test('сервер перераховує орієнтовну ціну для складності й терміновості, а не довіряє клієнту', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillStep1(page, { type: 'kursova', days: 7 });
    await clickNext(page);
    await pickOption(page.locator('#f-complexity'), 'calc');
    await clickNext(page);
    const contact = await fillStep3(page);
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page).toHaveURL(/\/diakuiemo/);
    const [row] = await sql<{ clientEstimate: { status: string; total: number; urgencyMult: number } }>(
      'select "clientEstimate" from "Request" where contact = $1',
      [contact],
    );
    expect(row.clientEstimate.status).toBe('ok');
    expect(row.clientEstimate.urgencyMult).toBe(1.3); // 7 днів із звичайних 10 → 70% → ×1,3
    expect(row.clientEstimate.total).toBe(2200); // 1 200 × 1,4 (розрахункова) × 1,3 = 2 184 → 2 200
  });

  test('файли (крок 2): невірний тип, великий розмір, дубль, видалення', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillStep1(page);
    await clickNext(page);
    await page.setInputFiles('#f-files-input', [
      { name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') },
      { name: 'old.doc', mimeType: 'application/msword', buffer: Buffer.from('x') },
      { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(10 * 1024 * 1024 + 1, 1) },
    ]);
    await expect(page.locator('.field-error-list')).toContainText('virus.exe');
    await expect(page.locator('.field-error-list')).toContainText('old.doc');
    await expect(page.locator('.field-error-list')).toContainText('huge.pdf');
    await expect(page.locator('.file-item')).toHaveCount(0);

    await page.setInputFiles('#f-files-input', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF }]);
    await expect(page.getByText('Завантажено')).toBeVisible();
    await page.setInputFiles('#f-files-input', [{ name: 'a.pdf', mimeType: 'application/pdf', buffer: PDF }]);
    await expect(page.locator('.field-error-list')).toContainText('уже додано');
    await expect(page.locator('.file-item')).toHaveCount(1);

    // файл лишається при переході між кроками
    await clickNext(page);
    await page.getByRole('button', { name: 'Назад' }).click();
    await expect(page.locator('.file-item')).toHaveCount(1);

    await page.getByRole('button', { name: 'Видалити файл a.pdf' }).click();
    await expect(page.locator('.file-item')).toHaveCount(0);
  });

  test('контент файлу не відповідає розширенню → помилка біля файлу; відправку блоковано з поверненням на крок 2', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillStep1(page);
    await clickNext(page);
    await page.setInputFiles('#f-files-input', [{ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>not a pdf</html>') }]);
    await expect(page.locator('.file-item--error')).toBeVisible();
    await clickNext(page);
    await fillStep3(page);
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page.locator('.form-alert')).toContainText('Цей файл не підходить');
    await expect(title(page)).toHaveText('Деталі');
  });

  test('мережева помилка: дані зберігаються, повтор використовує той самий ключ і не створює дубль', async ({ page }) => {
    await page.goto('/zaiavka');
    await toStep3(page);
    const contact = await fillStep3(page);
    const keys: string[] = [];
    await page.route('**/api/requests', async (route) => {
      keys.push(route.request().headers()['idempotency-key']!);
      if (keys.length === 1) {
        // Сервер встигає зберегти, але клієнт не отримує відповідь (таймаут/обрив)
        const res = await route.fetch();
        expect(res.status()).toBe(201);
        await route.abort('connectionreset');
      } else {
        await route.continue();
      }
    });
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page.locator('.form-alert')).toContainText('Не вдалося надіслати заявку');
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toHaveCount(0); // немає хибного успіху
    await expect(page.locator('#f-contact')).toHaveValue(contact);
    const retry = page.getByRole('button', { name: 'Спробувати ще раз' });
    await expect(retry).toBeEnabled();
    await retry.click();
    await expect(page).toHaveURL(/\/diakuiemo\?ref=/);
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    const rows = await sql('select count(*)::int as n from "Request" where contact = $1', [contact]);
    expect(rows[0]!.n).toBe(1);
  });

  test('429: зрозумілий текст із часом очікування, дані збережені', async ({ page }) => {
    await page.goto('/zaiavka');
    await toStep3(page);
    const contact = await fillStep3(page);
    await page.route('**/api/requests', (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'rate_limited', message: 'x' }),
      }),
    );
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(page.locator('.form-alert')).toContainText('Забагато спроб');
    await expect(page.locator('.form-alert')).toContainText('120');
    await expect(page.locator('#f-contact')).toHaveValue(contact);
  });

  test('подвійний submit: другий клік не надсилає другий запит; кнопка вимкнена зі spinner і aria-busy', async ({ page }) => {
    await page.goto('/zaiavka');
    await toStep3(page);
    await fillStep3(page);
    let posts = 0;
    await page.route('**/api/requests', async (route) => {
      posts++;
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    await page.getByRole('button', { name: SUBMIT_NAME }).dblclick();
    await expect(page.locator('form.wizard')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: /Надсилаємо заявку/ })).toBeDisabled();
    await expect(page).toHaveURL(/\/diakuiemo/);
    expect(posts).toBe(1);
  });

  test('помилки від сервера (422) повертають на потрібний крок і показуються біля поля', async ({ page }) => {
    await page.goto('/zaiavka');
    await toStep3(page);
    await fillStep3(page);
    await page.route('**/api/requests', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'validation_failed', message: 'Перевірте виділені поля.', errors: { topic: 'Сервер: тема неприйнятна.' } }),
      }),
    );
    await page.getByRole('button', { name: SUBMIT_NAME }).click();
    await expect(title(page)).toHaveText('Яка робота');
    await expect(page.locator('#topic-error')).toContainText('Сервер: тема неприйнятна.');
    await expect(page.locator('#f-topic')).toBeFocused();
  });

  test('honeypot недоступний із клавіатури та скрінрідерів', async ({ page }) => {
    await page.goto('/zaiavka');
    await toStep3(page);
    const hp = page.locator('.hp-field');
    await expect(hp).toHaveAttribute('aria-hidden', 'true');
    await expect(hp.locator('input')).toHaveAttribute('tabindex', '-1');
    const box = await hp.boundingBox();
    expect(box!.x + box!.width).toBeLessThan(0);
  });

  test('поля ≥ 16px на телефоні (без автозуму iOS)', async ({ page }) => {
    await page.goto('/zaiavka');
    const size = await page.locator('#f-topic').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });

  test('головна: картки послуг і прайс ведуть на сторінку заявки з передвибором', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/zaiavka?service=formatting"]').click();
    await expect(page).toHaveURL(/service=formatting/);
    await fillStep1(page);
    await clickNext(page);
    await expect(page.locator('#f-service')).toHaveAttribute('data-value', 'formatting');
    await pickOption(page.locator('#f-service'), 'editing');
    await expect(page.locator('#f-service')).toHaveAttribute('data-value', 'editing');
  });
});

test.describe('телефон: липка нижня панель', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('на сторінці заявки: ціна, Telegram і головна дія; дублікатів кнопки немає', async ({ page }) => {
    await page.goto('/zaiavka');
    const bar = page.locator('.wizard-bar');
    await expect(bar).toBeVisible();
    await expect(bar.getByRole('link', { name: 'Написати в Telegram' })).toHaveAttribute('href', 'https://t.me/zalikOK_ua');
    await pickOption(page.locator('#f-workType'), 'kursova');
    await expect(bar).toContainText('≈ 1 200 грн');
    // видима лише одна кнопка «Далі»
    await expect(page.getByRole('button', { name: 'Далі' })).toHaveCount(1);
    const box = await bar.boundingBox();
    expect(box!.y + box!.height).toBeGreaterThan(790); // притиснута до низу
    await fillStep1(page, { skipType: true });
    await bar.getByRole('button', { name: 'Далі' }).click();
    await expect(title(page)).toHaveText('Деталі');
    // Назад доступна на кроці 2
    await expect(page.getByRole('button', { name: 'Назад' })).toBeVisible();
  });

  test('на інших сторінках: «Залишити заявку» + Telegram; на /zaiavka глобальної панелі немає', async ({ page }) => {
    for (const path of ['/', '/ceny', '/privacy']) {
      await page.goto(path);
      const cta = page.locator('.sticky-cta');
      await expect(cta, path).toBeVisible();
      await expect(cta.getByRole('link', { name: 'Залишити заявку' })).toHaveAttribute('href', '/zaiavka');
      await expect(cta.getByRole('link', { name: 'Написати в Telegram' })).toBeVisible();
    }
    await page.goto('/zaiavka');
    await expect(page.locator('.sticky-cta')).toHaveCount(0);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('підвал і контент не ховаються під панеллю', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    const copyright = await page.locator('.site-footer small').boundingBox();
    const bar = await page.locator('.sticky-cta').boundingBox();
    expect(copyright!.y + copyright!.height).toBeLessThanOrEqual(bar!.y + 1);
  });
});

test.describe('панель — лише на телефоні', () => {
  test('на комп’ютері липких панелей немає', async ({ page }) => {
    await page.goto('/zaiavka');
    await expect(page.locator('.wizard-bar')).toBeHidden();
    await page.goto('/');
    await expect(page.locator('.sticky-cta')).toBeHidden();
  });
});
