import { test, expect } from '@playwright/test';

test.describe('юридичні тексти', () => {
  test('Умови: рендеряться з Markdown без «сирих» зірочок, з потрібними розділами і реальними контактами', async ({ page }) => {
    await page.goto('/umovy');
    await expect(page.locator('h1')).toHaveText('Умови замовлення та надання послуг «ЗалікОк»');
    await expect(page.getByText('Редакція: 2 жовтня 2026 року. Версія: terms-2026-10-02-v1.')).toBeVisible();
    for (const h of ['1. Хто надає послуги', '6. Три безкоштовні звернення з правками', '8. Скасування та повернення']) {
      await expect(page.getByRole('heading', { name: h })).toBeVisible();
    }
    const text = await page.locator('article').innerText();
    expect(text).not.toContain('**');
    expect(text).not.toMatch(/\]\(https?:/); // розмітка посилань не лишається в тексті
    await expect(page.locator('article a[href="mailto:zalikok.ua@gmail.com"]')).toBeVisible();
    const tg = page.locator('article a[href="https://t.me/zalikOK_ua"]').first();
    await expect(tg).toHaveAttribute('rel', /noopener/);
    // приклади з Умов відображаються повністю
    await expect(page.getByText('договірне повернення становить 500 грн')).toBeVisible();
  });

  test('Політика: типографські апострофи, список, версія редакції збігається з тією, що зберігається в заявці', async ({ page }) => {
    await page.goto('/privacy');
    await expect(page.locator('h1')).toHaveText('Політика конфіденційності «ЗалікОк»');
    await expect(page.getByText('Версія: privacy-2026-10-02-v1.')).toBeVisible();
    const text = await page.locator('article').innerText();
    expect(text).toMatch(/Обов’язкові/); // прямий апостроф замінено на типографський між літерами
    expect(text).not.toMatch(/\p{L}'\p{L}/u);
    await expect(page.locator('article ul li').first()).toBeVisible();
    await expect(page.locator('article a[href="https://policies.google.com/privacy"]')).toBeVisible();
  });

  test('незаповнені поля виділені, є попередження, сторінки під noindex і поза sitemap', async ({ page, request }) => {
    for (const path of ['/umovy', '/privacy']) {
      await page.goto(path);
      const marks = page.locator('mark.legal-placeholder');
      expect(await marks.count()).toBeGreaterThan(0);
      await expect(marks.first()).toContainText('заповнити');
      await expect(page.getByText(/залишилися поля, які потрібно заповнити/)).toBeVisible();
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
    }
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('/umovy');
    expect(sitemap).not.toContain('/privacy');
  });

  test('форма посилається на політику, а FAQ про правки збігається з Умовами (три безкоштовні звернення)', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('#request').getByRole('link', { name: 'політикою конфіденційності' })).toHaveAttribute('href', '/privacy');
    await page.getByRole('button', { name: 'Чи можна внести правки?' }).click();
    await expect(page.locator('#faq')).toContainText('три безкоштовні звернення');
  });
});
