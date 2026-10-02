import { test, expect } from '@playwright/test';

test.describe('головна', () => {
  test('семантика: один H1, бренд ЗалікОк, логотип з SVG, без «Курсові»', async ({ page }) => {
    const errors: string[] = [];
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto('/');
    await expect(page.locator('h1')).toHaveCount(1);
    await expect(page.locator('h1')).toHaveText('Курсова без зайвого стресу');
    await expect(page.locator('header img[alt="ЗалікОк"]').first()).toHaveAttribute('src', '/assets/brand/logo-primary.svg');
    const text = await page.locator('body').innerText();
    expect(text).not.toMatch(/Курсові/);
    expect(text).toContain('ЗалікОк');
    expect(await page.title()).toBe('ЗалікОк — допомога з курсовими роботами');
    expect(errors).toEqual([]);
  });

  test('усі секції присутні, якорі й посилання реальні, фальшивих # немає', async ({ page }) => {
    await page.goto('/');
    for (const id of ['services', 'pricing', 'process', 'samples', 'request', 'faq', 'contacts']) {
      await expect(page.locator(`#${id}`)).toHaveCount(1);
    }
    const hrefs = await page.locator('a[href]').evaluateAll((els) => els.map((e) => e.getAttribute('href')!));
    expect(hrefs.filter((h) => h === '#' || h === '' || h.startsWith('javascript:'))).toEqual([]);
    // Telegram власника налаштовано: лише його реальне посилання, відкривається в новій вкладці безпечно
    const tg = hrefs.filter((h) => /t\.me|telegram/i.test(h));
    expect(new Set(tg)).toEqual(new Set(['https://t.me/zalikOK_ua']));
    const hero = page.getByRole('link', { name: 'Написати в Telegram' });
    await expect(hero).toHaveAttribute('target', '_blank');
    await expect(hero).toHaveAttribute('rel', /noopener/);
    await expect(page.locator('footer a[href="mailto:zalikok.ua@gmail.com"]')).toBeVisible();
    // картки послуг ведуть на форму з передвибором
    await expect(page.locator('a[href="/zaiavka?service=editing"]')).toBeVisible();
  });

  test('усі внутрішні посилання відповідають 200', async ({ page, request }) => {
    await page.goto('/');
    const hrefs = new Set(
      await page.locator('a[href^="/"]').evaluateAll((els) => els.map((e) => (e.getAttribute('href') as string).split('#')[0] || '/')),
    );
    for (const h of hrefs) {
      const res = await request.get(h);
      expect(res.status(), h).toBe(200);
    }
  });

  for (const width of [320, 360, 390, 768, 1024, 1440]) {
    test(`немає горизонтального скролу на ${width}px`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      for (const path of ['/', '/zaiavka', '/privacy', '/umovy']) {
        await page.goto(path);
        await page.evaluate(() => document.fonts.ready);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
        expect(overflow, `${path} @${width}`).toBeLessThanOrEqual(0);
      }
    });
  }

  test('200% zoom (еквівалент 640px): header не перекриває заголовок', async ({ page }) => {
    await page.setViewportSize({ width: 640, height: 450 });
    await page.goto('/');
    const header = await page.locator('header.site-header').boundingBox();
    const h1 = await page.locator('h1').boundingBox();
    expect(h1!.y).toBeGreaterThanOrEqual(header!.y + header!.height - 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('skip-link перший у порядку табуляції та веде до main', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', { name: 'Перейти до змісту' });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#main$/);
  });

  test('hero: eager-зображення з резервом місця; інші зображення lazy', async ({ page }) => {
    await page.goto('/');
    const hero = page.locator('.hero__art img');
    await expect(hero).toHaveAttribute('fetchpriority', 'high');
    expect(await hero.getAttribute('loading')).toBeNull();
    const box = await hero.boundingBox();
    expect(Math.abs(box!.width / box!.height - 1.5)).toBeLessThan(0.05);
    const lazy = await page.locator('.sample-card__preview img').evaluateAll((els) => els.map((e) => e.getAttribute('loading')));
    expect(lazy.every((l) => l === 'lazy')).toBe(true);
  });
});

test.describe('мобільна навігація', () => {
  test.use({ viewport: { width: 390, height: 800 } });

  test('drawer: відкривається, Esc закриває, фокус повертається на кнопку', async ({ page }) => {
    await page.goto('/');
    await expect(page.locator('.site-nav')).toBeHidden(); // меню не відкрите постійно
    const button = page.getByRole('button', { name: 'Відкрити меню' });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('dialog.drawer');
    await expect(dialog).toBeVisible();
    // фокус усередині діалогу
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
  });

  test('drawer: «Вартість» відкриває прайс, «Послуги» веде до секції; меню закривається', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    await page.getByRole('navigation', { name: 'Мобільна навігація' }).getByRole('link', { name: 'Послуги' }).click();
    await expect(page.locator('dialog.drawer')).toBeHidden();
    await expect(page).toHaveURL(/#services$/);
    const top = await page.locator('#services-title').evaluate((el) => el.getBoundingClientRect().top);
    expect(top).toBeGreaterThanOrEqual(60); // не ховається під sticky header

    await page.getByRole('button', { name: 'Відкрити меню' }).click();
    await page.getByRole('navigation', { name: 'Мобільна навігація' }).getByRole('link', { name: 'Вартість' }).click();
    await expect(page).toHaveURL(/\/ceny$/);
    await expect(page.locator('dialog.drawer')).toBeHidden();
  });
});

test.describe('FAQ і приклади', () => {
  test('FAQ: aria-expanded та керована область, клавіатура', async ({ page }) => {
    await page.goto('/');
    const btn = page.getByRole('button', { name: 'Як визначається вартість?' });
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    const panelId = (await btn.getAttribute('aria-controls'))!;
    await expect(page.locator(`#${panelId}`)).toBeHidden();
    await btn.focus();
    await page.keyboard.press('Enter');
    await expect(btn).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator(`#${panelId}`)).toBeVisible();
    await page.keyboard.press('Space');
    await expect(btn).toHaveAttribute('aria-expanded', 'false');
    // немає обіцянок гарантованої оцінки/унікальності
    const faq = await page.locator('#faq').innerText();
    expect(faq).not.toMatch(/100\s?%|гарантуємо.*оцінк/i);
  });

  test('приклад: модальне вікно, фокус, Esc, клік поза вікном, кнопка закриття', async ({ page }) => {
    await page.goto('/');
    const open = page.getByRole('button', { name: 'Переглянути приклад' }).first();
    await open.focus();
    await page.keyboard.press('Enter');
    const dialog = page.locator('dialog.modal');
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('Демонстраційний матеріал')).toBeVisible();
    await expect(dialog.getByRole('img')).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Закрити' })).toBeFocused();
    // фокус залишається у вікні
    for (let i = 0; i < 5; i++) await page.keyboard.press('Tab');
    expect(await page.evaluate(() => !!document.activeElement?.closest('dialog'))).toBe(true);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(open).toBeFocused();

    await open.click();
    await expect(dialog).toBeVisible();
    await page.mouse.click(5, 5); // поза вікном
    await expect(dialog).toBeHidden();

    await open.click();
    await dialog.getByRole('button', { name: 'Закрити' }).click();
    await expect(dialog).toBeHidden();
  });
});

test.describe('SEO та службові сторінки', () => {
  test('robots, sitemap, noindex для службових сторінок', async ({ request, page }) => {
    const robots = await (await request.get('/robots.txt')).text();
    expect(robots).toContain('Disallow: /admin');
    expect(robots).toContain('Disallow: /diakuiemo');
    const sitemap = await (await request.get('/sitemap.xml')).text();
    expect(sitemap).not.toContain('/admin');
    expect(sitemap).not.toContain('/diakuiemo');

    for (const path of ['/privacy', '/umovy']) {
      await page.goto(path);
      await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content', /noindex/);
      await expect(page.getByText('очікує юридичного перегляду')).toBeVisible();
      await expect(page.locator('h1')).toHaveCount(1);
    }
    await page.goto('/');
    // canonical лише після вказаного домену
    await expect(page.locator('link[rel="canonical"]')).toHaveCount(0);
    const ld = await page.locator('script[type="application/ld+json"]').innerText();
    expect(ld).toContain('FAQPage');
    expect(ld).not.toContain('AggregateRating');
  });

  test('сторінка /diakuiemo без реальної заявки перенаправляє на форму', async ({ page }) => {
    await page.goto('/diakuiemo');
    await expect(page).toHaveURL(/\/zaiavka$/);
    await page.goto('/diakuiemo?ref=ZO-AAAAA-BBBBB');
    await expect(page).toHaveURL(/\/zaiavka$/);
  });
});
