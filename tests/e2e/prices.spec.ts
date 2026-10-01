import { test, expect } from '@playwright/test';
import { kyivDatePlus, pickDate, pickOption, sql, uniqueIp } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueIp() });
});

test.describe('прайс і калькулятор', () => {
  test('кнопки «Дізнатися вартість» ведуть до розділу вартості', async ({ page }) => {
    await page.goto('/');
    const hrefs = await page
      .getByRole('link', { name: 'Дізнатися вартість' })
      .evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    expect(hrefs.length).toBeGreaterThanOrEqual(2);
    expect(hrefs.every((h) => h === '/ceny')).toBe(true);
    await page.getByRole('link', { name: 'Дізнатися вартість' }).first().click();
    await expect(page).toHaveURL(/\/ceny$/);
    await expect(page.locator('h1')).toHaveText('Вартість і послуги');
    await expect(page.locator('#calculator')).toBeVisible();
  });

  test('головна без довгого списку: калькулятор і посилання на повний прайс', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#pricing .price-row')).toHaveCount(0);
    await page.getByRole('link', { name: 'Дивитися весь прайс' }).click();
    await expect(page).toHaveURL(/\/ceny$/);
  });

  test('прайс: 31 позиція з цінами «від», без виключених послуг і обіцянок уникальності', async ({ page }) => {
    await page.goto('/ceny');
    const rows = page.locator('.price-row');
    await expect(rows).toHaveCount(31);
    await expect(page.locator('.price-row', { hasText: 'Курсова робота' }).first()).toContainText('від 1 000 грн');
    await expect(page.locator('.price-row', { hasText: 'Дисертація' }).first()).toContainText('від 50 000 грн');
    const text = await page.locator('main').innerText();
    for (const banned of ['Підвищення унікальності', 'іспит', 'Тести']) expect(text).not.toContain(banned);
    expect(text).not.toMatch(/\d+\s?%/);
  });

  test('калькулятор: приклад із тарифної моделі та перехід до форми з підставленими параметрами', async ({ page }) => {
    await page.goto('/ceny');
    const calc = page.locator('#calculator');
    await expect(calc.getByText('Оберіть вид роботи, щоб побачити орієнтовну вартість.')).toBeVisible();
    await pickOption(calc.getByLabel('Вид роботи'), 'kursova');
    await expect(calc.locator('.calc__price')).toHaveText('Орієнтовно 1 200 грн'); // базовий пакет 25 стор.
    await calc.getByLabel(/Обсяг, сторінок/).fill('35');
    await pickOption(calc.getByLabel('Складність'), 'calc');
    const d = new Date(Date.now() + 7 * 86_400_000);
    const deadline = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(d);
    await pickDate(calc.getByLabel(/Дедлайн/), deadline);
    await expect(calc.locator('.calc__price')).toHaveText('Орієнтовно 3 100 грн');
    await expect(calc).toContainText('Додатково 10 × 50 грн');
    await expect(calc).toContainText('Складність ×1,4');
    await expect(calc).toContainText('Терміновість ×1,3');
    await expect(calc).toContainText('Остаточну вартість менеджер погоджує');

    await calc.getByRole('link', { name: 'Надіслати вимоги й уточнити вартість' }).click();
    await expect(page).toHaveURL(/\/zaiavka\?/);
    await expect(page.locator('#f-workType')).toHaveAttribute('data-value', 'kursova');
    await expect(page.locator('#f-pages')).toHaveValue('35');
    await expect(page.locator('#f-deadline')).toHaveAttribute('data-value', deadline);
    await expect(page.locator('#f-comment')).toHaveValue(/Калькулятор: Курсова робота; 35 сторінок; орієнтовно 3100 грн/);
  });

  test('калькулятор: поля змінюються залежно від послуги (знаки, слайди, доопрацювання)', async ({ page }) => {
    await page.goto('/ceny');
    const calc = page.locator('#calculator');
    await pickOption(calc.getByLabel('Вид роботи'), 'pereklad');
    await expect(calc.getByLabel('Обсяг, знаків з пробілами')).toBeVisible();
    await expect(calc.getByLabel('Якість вихідних матеріалів')).toBeVisible();
    await calc.getByLabel('Обсяг, знаків з пробілами').fill('1000');
    await expect(calc.locator('.calc__price')).toHaveText('Орієнтовно 300 грн'); // мінімальне замовлення

    await pickOption(calc.getByLabel('Вид роботи'), 'prezentatsiya');
    await expect(calc.getByLabel(/Кількість, слайдів/)).toHaveValue('10');
    await expect(calc.getByLabel('Підготовка матеріалу')).toBeVisible();
    await expect(calc.getByLabel('Складність')).toHaveCount(0);
    await pickOption(calc.getByLabel('Підготовка матеріалу'), 'write');
    await expect(calc.locator('.calc__price')).toHaveText('Орієнтовно 650 грн');

    await pickOption(calc.getByLabel('Вид роботи'), 'dopratsyuvannya-kursovoi');
    await expect(calc.locator('.calc__result')).toContainText('Оберіть характер правок');
    await pickOption(calc.getByLabel('Характер правок'), 'content');
    await calc.getByLabel('Сторінок, які потрібно змінити').fill('20');
    await expect(calc.locator('.calc__price')).toHaveText('Орієнтовно 1 200 грн');
  });

  test('калькулятор: складні випадки переходять до оцінки менеджером, а не до вигаданої суми', async ({ page }) => {
    await page.goto('/ceny');
    const calc = page.locator('#calculator');
    await pickOption(calc.getByLabel('Вид роботи'), 'dysertatsiya');
    await expect(calc.locator('.calc__price')).toHaveText('Оцінка менеджером');
    await expect(calc.getByRole('link', { name: 'Надіслати вимоги для оцінки' })).toBeVisible();

    await pickOption(calc.getByLabel('Вид роботи'), 'kursova');
    await pickOption(calc.getByLabel('Складність'), 'custom');
    await expect(calc.locator('.calc__price')).toHaveText('Оцінка менеджером');
    await pickOption(calc.getByLabel('Складність'), 'basic');
    const tomorrow = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Kyiv' }).format(new Date(Date.now() + 86_400_000));
    await pickDate(calc.getByLabel(/Дедлайн/), tomorrow);
    await expect(calc.locator('.calc__price')).toHaveText('Оцінка менеджером');

    await calc.getByLabel(/Обсяг, сторінок/).fill('0');
    await expect(calc.locator('.calc__result')).toContainText('Вкажіть обсяг цілим числом');
  });

  test('вид роботи зберігається в заявці й видно в БД; невідомий вид відхиляється сервером', async ({ page, request }) => {
    await page.goto('/zaiavka?type=referat');
    await pickOption(page.locator('#f-discipline'), 'law');
    await page.fill('#f-topic', 'Правові аспекти захисту персональних даних');
    await pickDate(page.locator('#f-deadline'), kyivDatePlus(45));
    await page.getByLabel('Telegram', { exact: true }).check();
    const contact = `@price_${Date.now().toString(36)}`;
    await page.fill('#f-contact', contact);
    await page.locator('#f-privacyConsent').check();
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page).toHaveURL(/\/diakuiemo\?ref=/);
    const rows = await sql<{ workType: string }>('select "workType" from "Request" where contact = $1', [contact]);
    expect(rows[0]!.workType).toBe('referat');

    const bad = await request.post('/api/requests', {
      headers: { Origin: 'http://localhost:3100', 'Idempotency-Key': `bad-${Date.now()}-key`, 'x-forwarded-for': '10.7.7.7' },
      data: {
        service: 'plan', workType: 'ekzamen', discipline: 'law', topic: 'Тема для перевірки', deadline: '2999-01-01',
        contactMethod: 'telegram', contact: '@bad_worktype', privacyConsent: true,
      },
    });
    expect(bad.status()).toBe(422);
  });

  test('прайс не ламає мобільну верстку (320px)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 800 });
    await page.goto('/ceny');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test('пункт меню «Вартість» (header і footer) відкриває сторінку прайсу', async ({ page }) => {
  await page.goto('/');
  const header = page.getByRole('navigation', { name: 'Основна навігація' }).getByRole('link', { name: 'Вартість' });
  await expect(header).toHaveAttribute('href', '/ceny');
  const footer = page.getByRole('navigation', { name: 'Навігація у футері' }).getByRole('link', { name: 'Вартість' });
  await expect(footer).toHaveAttribute('href', '/ceny');
  await header.click();
  await expect(page).toHaveURL(/\/ceny$/);
  await expect(page.locator('h1')).toHaveText('Вартість і послуги');
});
