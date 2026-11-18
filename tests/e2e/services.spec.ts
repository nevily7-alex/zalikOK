import { test, expect } from '@playwright/test';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const services = JSON.parse(readFileSync(path.join(process.cwd(), 'content/services/pages.json'), 'utf8')) as { slug: string; title: string; priceId: string | null }[];

test.describe('розділ «Послуги»', () => {
  test('список містить усі послуги і веде на сторінки', async ({ page }) => {
    await page.goto('/poslugy');
    await expect(page.getByRole('heading', { level: 1, name: 'Послуги' })).toBeVisible();
    await expect(page.locator('.svc-card')).toHaveCount(services.length);
    await page.getByRole('link', { name: /Курсові роботи/ }).click();
    await expect(page).toHaveURL(/\/poslugy\/kursovi-roboty$/);
  });

  test('усі сторінки відкриваються, мають один h1 і не містять старих брендів, цін і заборонених блоків', async ({ page }) => {
    for (const s of services) {
      const res = await page.goto(`/poslugy/${s.slug}`);
      expect(res?.status(), s.slug).toBe(200);
      await expect(page.locator('h1')).toHaveCount(1);
      const text = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      expect(text, s.slug).not.toMatch(/dipservis/i);
      expect(text, s.slug).not.toMatch(/Отримати консультацію|Хто пише|Хто пишуть|Відгуки студентів|дата кожного етапу/);
      expect(text, s.slug).not.toMatch(/унікальн|антиплагіат/i);
      await expect(page.locator('a[href*="dipservis"]')).toHaveCount(0);
    }
  });

  test('курсова: ціна з нашого прайсу, калькулятор відкритий на цій послузі', async ({ page }) => {
    await page.goto('/poslugy/kursovi-roboty');
    await expect(page.locator('.svc-price')).toContainText('від 1 000 грн');
    await expect(page.locator('.calc__price')).toHaveText('Орієнтовно 1 000 грн');
    await page.locator('main').getByRole('link', { name: 'Дізнатися вартість' }).first().click();
    await expect(page).toHaveURL(/\/zaiavka\?type=kursova$/);
  });

  test('послуга без тарифу показує «після перегляду вимог» без калькулятора', async ({ page }) => {
    await page.goto('/poslugy/dyplom-mba');
    await expect(page.locator('.svc-price')).toContainText('після перегляду вимог');
    await expect(page.locator('.calc')).toHaveCount(0);
  });

  test('FAQ розгортається клавіатурою', async ({ page }) => {
    await page.goto('/poslugy/kursovi-roboty');
    const first = page.locator('.svc-faq__item summary').first();
    await first.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('.svc-faq__item').first()).toHaveAttribute('open', '');
  });
});
