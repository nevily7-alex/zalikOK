import { test, expect } from '@playwright/test';
import { kyivDatePlus, uniqueIp } from './helpers';

test.beforeEach(async ({ context }) => {
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': uniqueIp() });
});

test.describe('власні елементи керування', () => {
  test('на публічних сторінках немає нативних select і input[type=date]', async ({ page }) => {
    for (const path of ['/', '/zaiavka', '/ceny']) {
      await page.goto(path);
      await expect(page.locator('select, input[type="date"]'), path).toHaveCount(0);
    }
  });

  test('Select: клавіатура (↓ ↓ Enter), Esc, повернення фокуса, aria', async ({ page }) => {
    await page.goto('/zaiavka');
    const btn = page.locator('#f-discipline');
    await expect(btn).toHaveAttribute('role', 'combobox');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await btn.focus();
    await page.keyboard.press('ArrowDown');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    await expect(btn).toHaveAttribute('data-value', 'management'); // 0-й за замовчуванням, ↓ → 1-й
    await expect(btn).toBeFocused();

    await page.keyboard.press('Enter');
    await expect(page.getByRole('option', { name: 'Менеджмент' })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await expect(btn).toBeFocused();
    expect(await page.locator('.ui-popup').count()).toBe(0);
  });

  test('Select: пошук літерами, клік поза списком закриває, миша вибирає', async ({ page }) => {
    await page.goto('/zaiavka');
    const btn = page.locator('#f-discipline');
    await btn.focus();
    // Playwright вводить кирилицю без keydown, тому надсилаємо події клавіш напряму
    for (const key of ['п', 'р']) await btn.dispatchEvent('keydown', { key });
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('data-value', 'law'); // «Право»
    await btn.click();
    await expect(page.getByRole('listbox')).toBeVisible();
    await page.mouse.click(5, 5);
    await expect(page.getByRole('listbox')).toHaveCount(0);
    await btn.click();
    await page.getByRole('option', { name: 'Психологія' }).click();
    await expect(btn).toHaveAttribute('data-value', 'psychology');
    await expect(btn).toContainText('Психологія');
  });

  test('Select: групи у виборі виду роботи', async ({ page }) => {
    await page.goto('/ceny');
    await page.locator('#calculator [role="combobox"]').first().click();
    await expect(page.getByRole('group', { name: 'Навчальні роботи' })).toBeVisible();
    await expect(page.getByRole('option', { name: 'Курсова робота' })).toBeVisible();
  });

  test('DatePicker: відкриття з клавіатури, стрілки, Enter, Esc, мінімальна дата', async ({ page }) => {
    await page.goto('/zaiavka');
    const btn = page.locator('#f-deadline');
    await expect(btn).toContainText('Оберіть дату');
    await btn.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Оберіть дату' });
    await expect(dialog).toBeVisible();
    const today = kyivDatePlus(0);
    await expect(dialog.locator(`[data-date="${today}"]`)).toBeFocused(); // старт — сьогодні
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowDown'); // +1 +7 днів
    const target = kyivDatePlus(8);
    await expect(dialog.locator(`[data-date="${target}"]`)).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toHaveCount(0);
    await expect(btn).toHaveAttribute('data-value', target);
    await expect(btn).toBeFocused();
    await expect(btn).toContainText(`${target.slice(8)}.${target.slice(5, 7)}.${target.slice(0, 4)}`);

    // Esc закриває без зміни та повертає фокус
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(btn).toBeFocused();
    await expect(btn).toHaveAttribute('data-value', target);
  });

  test('DatePicker: «Сьогодні», недоступні минулі дати, помилка обов’язкового поля', async ({ page }) => {
    await page.goto('/zaiavka');
    await page.getByRole('button', { name: 'Отримати розрахунок' }).click();
    await expect(page.locator('#deadline-error')).toBeVisible();
    const btn = page.locator('#f-deadline');
    await btn.click();
    const yesterday = kyivDatePlus(-1);
    if (yesterday.slice(0, 7) === kyivDatePlus(0).slice(0, 7)) {
      await expect(page.locator(`.ui-calendar [data-date="${yesterday}"]`)).toBeDisabled();
    }
    await page.getByRole('button', { name: 'Сьогодні' }).click();
    await expect(btn).toHaveAttribute('data-value', kyivDatePlus(0));
  });

  test('чекбокс має власний вигляд і працює з клавіатури', async ({ page }) => {
    await page.goto('/zaiavka');
    const box = page.getByLabel('Тему ще не визначено');
    expect(await box.evaluate((el) => getComputedStyle(el).appearance)).toBe('none');
    await box.focus();
    await page.keyboard.press('Space');
    await expect(box).toBeChecked();
  });

  test('календар і список вміщуються на 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await page.goto('/zaiavka');
    await page.locator('#f-deadline').click();
    const box = await page.locator('.ui-calendar').boundingBox();
    expect(box!.x).toBeGreaterThanOrEqual(0);
    expect(box!.x + box!.width).toBeLessThanOrEqual(320);
    await page.keyboard.press('Escape');
    await page.locator('#f-discipline').click();
    const list = await page.locator('.ui-list').boundingBox();
    expect(list!.x + list!.width).toBeLessThanOrEqual(320);
  });
});
