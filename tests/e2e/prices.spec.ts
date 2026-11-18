import { test, expect } from '@playwright/test';
import { pickDate, pickOption, sql, uniqueIp } from './helpers';
import { clickNext, fillStep1, fillStep3 } from './wizard-helpers';

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

  test('головна: прайс за вкладками (макет C), калькулятор збоку; видно лише одну групу', async ({ page }) => {
    await page.goto('/');
    const tabs = page.locator('#pricing [role="tab"]');
    await expect(tabs).toHaveCount(4);
    await expect(tabs.first()).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('#pricing .price-row')).toHaveCount(16); // «Навчальні роботи»
    await expect(page.locator('#pricing #calculator')).toBeVisible();
    await expect(page.getByText('Надішліть тему та вимоги, щоб отримати індивідуальний розрахунок.')).toHaveCount(0);
    // калькулятор праворуч від списку на широкому екрані
    const list = await page.locator('.price-explorer__list').boundingBox();
    const calc = await page.locator('#calculator').boundingBox();
    expect(calc!.x).toBeGreaterThan(list!.x + list!.width - 1);
  });

  test('вкладки: перемикання мишею й клавіатурою (← → Home End), aria', async ({ page }) => {
    await page.goto('/ceny');
    const tabs = page.getByRole('tab');
    await tabs.nth(1).click();
    await expect(tabs.nth(1)).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel')).toContainText('Дисертація');
    await expect(page.locator('.price-row')).toHaveCount(3);
    await page.keyboard.press('ArrowRight');
    await expect(tabs.nth(2)).toBeFocused();
    await expect(tabs.nth(2)).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.price-row')).toHaveCount(7);
    await page.keyboard.press('End');
    await expect(tabs.nth(3)).toBeFocused();
    await page.keyboard.press('ArrowRight'); // з останньої — на першу
    await expect(tabs.nth(0)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowLeft'); // з першої — на останню
    await expect(tabs.nth(3)).toHaveAttribute('aria-selected', 'true');
    const panelId = await tabs.nth(3).getAttribute('aria-controls');
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    // неактивна вкладка поза порядком табуляції (roving tabindex)
    await expect(tabs.nth(0)).toHaveAttribute('tabindex', '-1');
  });

  test('прайс: 31 позиція у чотирьох групах, ціни «від», без виключених послуг і обіцянок уникальності', async ({ page }) => {
    await page.goto('/ceny');
    const tabs = page.getByRole('tab');
    let total = 0;
    let allText = '';
    for (let i = 0; i < 4; i++) {
      await tabs.nth(i).click();
      total += await page.locator('.price-row').count();
      allText += await page.locator('main').innerText();
    }
    expect(total).toBe(31);
    await tabs.nth(0).click();
    await expect(page.locator('.price-row', { hasText: 'Курсова робота' }).first()).toContainText('від 1 200 грн');
    await tabs.nth(1).click();
    await expect(page.locator('.price-row', { hasText: 'Дисертація' }).first()).toContainText('від 50 000 грн');
    for (const banned of ['Підвищення унікальності', 'іспит', 'Тести']) expect(allText).not.toContain(banned);
    expect(allText).not.toMatch(/\d+\s?%/);
  });

  test('рядок прайсу веде до форми з передвибраним видом роботи', async ({ page }) => {
    await page.goto('/ceny');
    await page.getByRole('tab', { name: /Тексти й мови/ }).click();
    await page.locator('.price-row', { hasText: 'Переклад' }).click();
    await expect(page).toHaveURL(/\/zaiavka\?type=pereklad$/);
    await expect(page.locator('#f-workType')).toHaveAttribute('data-value', 'pereklad');
  });

  test('телефон: калькулятор над прайсом, без горизонтального скролу', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/ceny');
    const calc = await page.locator('#calculator').boundingBox();
    const tabs = await page.locator('.price-tabs').boundingBox();
    expect(calc!.y).toBeLessThan(tabs!.y);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
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
    // розрахунок підхоплюється формою: ціна одразу та сама, що в калькуляторі
    await expect(page.getByTestId('estimate-price')).toHaveText('Орієнтовно 3 100 грн');
    await fillStep1(page, { skipType: true });
    await clickNext(page);
    await expect(page.locator('#f-comment')).toHaveValue(/Калькулятор: Курсова робота; 35 сторінок; орієнтовно 3100 грн/);
    await expect(page.locator('#f-complexity')).toHaveAttribute('data-value', 'calc');
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
    await fillStep1(page, { skipType: true });
    await clickNext(page);
    await clickNext(page);
    const contact = await fillStep3(page, `@price_${Date.now().toString(36)}`);
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
