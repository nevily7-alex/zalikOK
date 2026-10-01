import { test, expect, type Page } from '@playwright/test';
import { DOCX, PDF, kyivDatePlus, pickDate, pickOption, sql, uniqueIp } from './helpers';


// Кожен тест — власний «IP» для rate limit
test.use({ extraHTTPHeaders: {} });
test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueIp() });
});

async function fillValid(page: Page, contact = `@form_${Date.now().toString(36)}`) {
  await pickOption(page.locator('#f-discipline'), 'law');
  await page.fill('#f-topic', 'Правові аспекти захисту персональних даних');
  await pickDate(page.locator('#f-deadline'), kyivDatePlus(45));
  await page.getByLabel('Telegram', { exact: true }).check();
  await page.fill('#f-contact', contact);
  await page.locator('#f-privacyConsent').check();
  return contact;
}

test.describe('форма заявки', () => {
  test('передвибір послуги з ?service= та мова/ярлики форми', async ({ page }) => {
    await page.goto('/zaiavka?service=editing');
    await expect(page.locator('#f-service')).toHaveAttribute('data-value', 'editing');
    await page.goto('/zaiavka?service=hacked');
    await expect(page.locator('#f-service')).toHaveAttribute('data-value', 'research-support');
    await expect(page.locator('h1')).toHaveText('Розкажіть про ваше завдання');
    for (const l of ['Яка допомога потрібна?', 'Дисципліна', 'Тема роботи', 'Дедлайн', 'Як з вами зв’язатися?', 'Ваш контакт']) {
      await expect(page.getByText(l, { exact: true }).first()).toBeVisible();
    }
  });

  test('порожня форма: summary, помилки під полями, фокус на першому неправильному, значення не зникають', async ({ page }) => {
    await page.goto('/zaiavka');
    await page.fill('#f-comment', 'Мій коментар лишається');
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('.form-summary')).toBeVisible();
    await expect(page.locator('#f-discipline')).toBeFocused();
    await expect(page.locator('#discipline-error')).toBeVisible();
    await expect(page.locator('#f-discipline')).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('#privacyConsent-error')).toContainText('Потрібна згода');
    await expect(page.locator('#f-comment')).toHaveValue('Мій коментар лишається');
    expect(page.url()).toContain('/zaiavka'); // подання не відбулося
  });

  test('«Тему ще не визначено» знімає вимогу до теми; «Інше» відкриває вільне поле', async ({ page }) => {
    await page.goto('/zaiavka');
    await expect(page.locator('#f-disciplineOther')).toHaveCount(0);
    await pickOption(page.locator('#f-discipline'), 'other');
    await expect(page.locator('#f-disciplineOther')).toBeVisible();
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('#disciplineOther-error')).toBeVisible();
    await expect(page.locator('#topic-error')).toBeVisible();
    await page.getByLabel('Тему ще не визначено').check();
    await expect(page.locator('#topic-error')).toHaveCount(0);
  });

  test('помилки контакту за типом, дедлайн у минулому', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillValid(page);
    await page.getByLabel('E-mail', { exact: true }).check();
    await page.fill('#f-contact', '@not_an_email');
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('#contact-error')).toContainText('e-mail');
    // календар не дозволяє обрати минулу дату (свіжа сторінка: календар відкривається на поточному місяці)
    await page.reload();
    await page.locator('#f-deadline').click();
    const yesterday = kyivDatePlus(-1);
    if (yesterday.slice(0, 7) === kyivDatePlus(0).slice(0, 7)) {
      await expect(page.locator(`.ui-calendar [data-date="${yesterday}"]`)).toBeDisabled();
    }
    await page.keyboard.press('Escape');
    await expect(page.locator('#f-deadline')).toBeFocused();
  });

  test('успішна відправка з файлом веде на /diakuiemo з номером; персональних даних в URL немає', async ({ page }) => {
    await page.goto('/zaiavka');
    const contact = await fillValid(page);
    await page.setInputFiles('#f-files-input', [
      { name: 'вимоги.pdf', mimeType: 'application/pdf', buffer: PDF },
      { name: 'курсова.docx', mimeType: 'application/octet-stream', buffer: DOCX },
    ]);
    await expect(page.getByText('Завантажено').first()).toBeVisible();
    await expect(page.locator('.file-item__name', { hasText: 'вимоги.pdf' })).toBeVisible();
    // файл не відправляє заявку
    expect(page.url()).toContain('/zaiavka');

    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page).toHaveURL(/\/diakuiemo\?ref=ZO-[A-Z0-9]{5}-[A-Z0-9]{5}$/);
    const url = page.url();
    expect(url).not.toContain(contact.slice(1));
    expect(url).not.toContain('Правов');
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toBeVisible();
    const ref = new URL(url).searchParams.get('ref')!;
    await expect(page.getByText(ref)).toBeVisible();
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);

    const [row] = await sql<{ id: string; contact: string; privacyPolicyVersion: string }>(
      'select id, contact, "privacyPolicyVersion" from "Request" where "publicReference" = $1',
      [ref],
    );
    expect(row.contact).toBe(contact);
    expect(row.privacyPolicyVersion).toBeTruthy();
    const atts = await sql<{ scanStatus: string; detectedMime: string }>('select "scanStatus", "detectedMime" from "Attachment" where "requestId" = $1', [row.id]);
    expect(atts).toHaveLength(2);
    expect(atts.every((a) => a.scanStatus === 'pending')).toBe(true); // сканер не налаштовано → не «перевірено»
  });

  test('файли: невірний тип, великий розмір, дубль, видалення', async ({ page }) => {
    await page.goto('/zaiavka');
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

    await page.getByRole('button', { name: 'Видалити файл a.pdf' }).click();
    await expect(page.locator('.file-item')).toHaveCount(0);
  });

  test('контент файлу не відповідає розширенню → помилка біля файлу, відправку блоковано', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillValid(page);
    await page.setInputFiles('#f-files-input', [{ name: 'fake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('<html>not a pdf</html>') }]);
    await expect(page.locator('.file-item--error')).toBeVisible();
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('.form-alert')).toContainText('Цей файл не підходить');
    expect(page.url()).toContain('/zaiavka');
  });

  test('мережева помилка: дані зберігаються, повтор використовує той самий ключ і не створює дубль', async ({ page }) => {
    await page.goto('/zaiavka');
    const contact = await fillValid(page);
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
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('.form-alert')).toContainText('Не вдалося надіслати заявку');
    await expect(page.getByRole('heading', { name: 'Заявку отримано' })).toHaveCount(0); // немає хибного успіху
    await expect(page.locator('#f-contact')).toHaveValue(contact);
    await expect(page.locator('#f-topic')).toHaveValue('Правові аспекти захисту персональних даних');
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
    const contact = await fillValid(page);
    await page.route('**/api/requests', (route) =>
      route.fulfill({
        status: 429,
        headers: { 'Retry-After': '120', 'Content-Type': 'application/json' },
        body: JSON.stringify({ code: 'rate_limited', message: 'x' }),
      }),
    );
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('.form-alert')).toContainText('Забагато спроб');
    await expect(page.locator('.form-alert')).toContainText('120');
    await expect(page.locator('#f-contact')).toHaveValue(contact);
  });

  test('подвійний submit: другий клік не надсилає другий запит; кнопка вимкнена зі spinner і aria-busy', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillValid(page);
    let posts = 0;
    await page.route('**/api/requests', async (route) => {
      posts++;
      await new Promise((r) => setTimeout(r, 800));
      await route.continue();
    });
    const btn = page.getByRole('button', { name: 'Отримати розрахунок' });
    await btn.dblclick();
    await expect(page.locator('form.request-form')).toHaveAttribute('aria-busy', 'true');
    await expect(page.getByRole('button', { name: /Надсилаємо заявку/ })).toBeDisabled();
    await expect(page).toHaveURL(/\/diakuiemo/);
    expect(posts).toBe(1);
  });

  test('помилки валідації з сервера (422) відображаються біля полів', async ({ page }) => {
    await page.goto('/zaiavka');
    await fillValid(page);
    await page.route('**/api/requests', (route) =>
      route.fulfill({
        status: 422,
        contentType: 'application/json',
        body: JSON.stringify({ code: 'validation_failed', message: 'Перевірте виділені поля.', errors: { topic: 'Сервер: тема неприйнятна.' } }),
      }),
    );
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('#topic-error')).toContainText('Сервер: тема неприйнятна.');
    await expect(page.locator('#f-topic')).toBeFocused();
  });

  test('honeypot недоступний із клавіатури та скрінрідерів', async ({ page }) => {
    await page.goto('/zaiavka');
    const hp = page.locator('.hp-field');
    await expect(hp).toHaveAttribute('aria-hidden', 'true');
    await expect(hp.locator('input')).toHaveAttribute('tabindex', '-1');
    const box = await hp.boundingBox();
    expect(box!.x + box!.width).toBeLessThan(0);
  });

  test('головна: форма в секції #request працює так само (передвибір з картки)', async ({ page }) => {
    await page.goto('/');
    await page.locator('a[href="/zaiavka?service=formatting"]').click();
    await expect(page).toHaveURL(/service=formatting/);
    await expect(page.locator('#f-service')).toHaveAttribute('data-value', 'formatting');
    await page.goto('/');
    await expect(page.locator('#request form')).toBeVisible();
    // поля мобільної форми ≥ 16px
    const size = await page.locator('#f-topic').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    expect(size).toBeGreaterThanOrEqual(16);
  });
});
