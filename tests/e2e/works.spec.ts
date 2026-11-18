import { test, expect } from '@playwright/test';

test.describe('«Останні виконані студентські роботи»', () => {
  test('блок на головній: 8 карточок із видом, предметом, обсягом і ціною, без імен, тем і відсотків уникальності', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#works');
    await expect(section.getByRole('heading', { name: 'Останні виконані студентські роботи' })).toBeVisible();
    await expect(section.getByText('Приклади замовлень за останні місяці, без імен і тем')).toBeVisible();
    const cards = section.locator('.work-card');
    await expect(cards).toHaveCount(8);
    await expect(cards.first()).toContainText('Курсова');
    await expect(cards.first()).toContainText('право');
    await expect(cards.first()).toContainText('15 с.');
    await expect(cards.first()).toContainText('1 850 грн');
    await expect(cards.nth(3)).toContainText('Дипломна');
    await expect(cards.nth(3)).toContainText('обсяг за вимогами'); // у джерелі обсяг не вказано
    await expect(cards.nth(3)).toContainText('6 420 грн');
    const text = await section.innerText();
    expect(text).toContain('тема конфіденційна');
    expect(text).not.toMatch(/\d+\s?%/);
    expect(text).not.toMatch(/унікальн/i);
  });

  test('розташування: після прайсу й перед заявкою; посилання на калькулятор', async ({ page }) => {
    await page.goto('/');
    const order = await page.locator('main h2').allInnerTexts();
    const iPricing = order.findIndex((t) => t.includes('Що впливає на вартість'));
    const iWorks = order.findIndex((t) => t.includes('Останні виконані'));
    const iCta = order.findIndex((t) => t.includes('Готові розпочати'));
    expect(iPricing).toBeGreaterThan(-1);
    expect(iWorks).toBeGreaterThan(iPricing);
    expect(iCta).toBeGreaterThan(iWorks);
    await page.locator('#works').getByRole('link', { name: 'Розрахувати вартість' }).click();
    await expect(page).toHaveURL(/\/ceny$/);
  });

  test('стрілки прокручують стрічку, на краях вимикаються; область прокрутки доступна з клавіатури', async ({ page }) => {
    await page.goto('/');
    const prev = page.getByRole('button', { name: 'Попередні роботи' });
    const next = page.getByRole('button', { name: 'Наступні роботи' });
    const track = page.locator('.works__track');
    await expect(prev).toBeDisabled();
    await expect(next).toBeEnabled();
    await expect(track).toHaveAttribute('tabindex', '0');
    await next.click();
    await expect.poll(async () => track.evaluate((el) => el.scrollLeft)).toBeGreaterThan(100);
    await expect(prev).toBeEnabled();
    for (let i = 0; i < 6; i++) if (await next.isEnabled()) await next.click();
    await expect(next).toBeDisabled();
    await prev.click();
    await expect(next).toBeEnabled();
  });

  test('телефон: стрічка прокручується свайпом, сторінка не отримує горизонтального скролу', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 800 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: 'Наступні роботи' })).toBeHidden(); // стрілки лише на ширших екранах
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const canScroll = await page.locator('.works__track').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(canScroll).toBe(true);
  });
});
