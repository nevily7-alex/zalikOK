import { test, expect } from '@playwright/test';
import { BASE, MANAGER, apiContext, kyivDatePlus, pickDate, pickOption, postRequest, sql, uniqueIp, validBody } from './helpers';

test.describe('прихований вхід в адмінку', () => {
  test('остання літера «к» у футері веде в адмінку й нічим не виділена', async ({ page }) => {
    await page.goto('/');
    const link = page.locator('footer a.footer-secret');
    await expect(link).toHaveAttribute('href', '/admin');
    await expect(link).toHaveText('к');
    // той самий колір, шрифт і без підкреслення: як решта тексту
    const same = await link.evaluate((el) => {
      const a = getComputedStyle(el);
      const p = getComputedStyle(el.parentElement!);
      return { color: a.color === p.color, decoration: a.textDecorationLine, weight: a.fontWeight === p.fontWeight };
    });
    expect(same).toEqual({ color: true, decoration: 'none', weight: true });
    await expect(page.locator('footer small')).toContainText('ЗалікОк');
    await link.click({ force: true });
    await expect(page).toHaveURL(/\/admin(\/login)?$/);
  });
});

test.describe('адмінка: заявки, оплата, дедлайн, статистика', () => {
  test('номер 6 цифр, вкладки, клік по рядку, оплата із залишком, дедлайн і пріоритет, «Успішно виконано», статистика', async ({ browser }) => {
    const api = await apiContext();
    const res = await postRequest(api, validBody({ workType: 'kursova', topic: 'Тема для перевірки CRM' }));
    expect(res.status()).toBe(201);
    const { requestId, reference } = (await res.json()) as { requestId: string; reference: string };
    expect(reference).toMatch(/^\d{6}$/);

    const ctx = await browser.newContext({ baseURL: BASE, extraHTTPHeaders: { 'x-forwarded-for': uniqueIp() } });
    const page = await ctx.newPage();
    await page.goto('/admin');
    await page.fill('#email', MANAGER().email);
    await page.fill('#password', MANAGER().password);
    await page.click('button[type=submit]');
    await expect(page.getByRole('heading', { name: /^Заявки/ })).toBeVisible();

    // вкладки з лічильниками; нова заявка у «Нових», є колонки «Контакт» і «Тема»
    const tabs = page.getByRole('navigation', { name: 'Тип заявок' });
    for (const name of ['Усі', 'Нові', 'В роботі', 'Виконані', 'Провалені']) await expect(tabs.getByRole('link', { name: new RegExp(`^${name}`) })).toBeVisible();
    await tabs.getByRole('link', { name: /^Нові/ }).click();
    await expect(page).toHaveURL(/tab=new/);
    await page.fill('#q', reference);
    await page.getByRole('button', { name: 'Застосувати' }).click();
    const row = page.locator('li.admin-rowcard', { hasText: reference });
    // у картці є тема, контакт (із кнопкою копіювання), дедлайн з чіпом і підсумки зверху
    await expect(row).toContainText('Тема для перевірки CRM');
    await expect(row).toContainText('@e2e_');
    await expect(row.getByRole('button', { name: /Скопіювати/ })).toHaveCount(1);
    await expect(row).toContainText(/через \d+ дн\./);
    await expect(page.getByText('Загальний заробіток').first()).toBeVisible();

    // картка відкривається кліком у будь-якому місці, не лише по номеру
    await row.locator('.admin-rowcard__topic').click({ force: true }); // клік потрапляє на розтягнуте посилання картки
    await expect(page).toHaveURL(new RegExp(`/admin/requests/${requestId}$`));

    // вартість, передоплата → залишок
    await page.fill('#price', '2000');
    await page.getByRole('button', { name: 'Зберегти вартість' }).click();
    await page.fill('#prepayment', '500');
    await page.getByRole('button', { name: 'Зберегти передоплату' }).click();
    await expect(page.locator('.admin-money__left dd')).toHaveText('1 500 грн');
    await expect(page.locator('.rq-tile--left strong')).toHaveText('1 500 грн');
    await expect(page.locator('.rq-ring b')).toHaveText('25%');
    await expect(page.getByRole('list', { name: 'Статус заявки' }).getByRole('button')).toHaveCount(5);

    // дедлайн виконання + пріоритет
    const due = kyivDatePlus(10);
    await pickDate(page.locator('#dueDate'), due);
    await pickOption(page.locator('#priority'), '2');
    await page.getByRole('button', { name: 'Зберегти', exact: true }).click();
    await expect(page.getByText('schedule.changed')).toBeVisible();
    const [saved] = await sql<{ due: string; priority: number; prepayment: string }>(
      'select "dueDate"::text as due, priority, prepayment::text from "Request" where id = $1',
      [requestId],
    );
    expect(saved.due).toBe(due);
    expect(saved.priority).toBe(2);
    expect(saved.prepayment).toBe('500.00');

    // крок статусу в шапці: клік ставить статус «У роботі»
    await page.getByRole('list', { name: 'Статус заявки' }).getByRole('button', { name: /У роботі/ }).click();
    await expect(page.getByText('Поточний статус:')).toContainText('У роботі');
    const [stepped] = await sql<{ status: string }>('select status from "Request" where id = $1', [requestId]);
    expect(stepped.status).toBe('in_progress');

    // успішно виконано
    await page.getByRole('button', { name: '✅ Успішно виконано' }).click();
    await expect(page.getByText('Поточний статус:')).toContainText('Виконано');
    const [done] = await sql<{ status: string; closed: boolean }>('select status, "closedAt" is not null as closed from "Request" where id = $1', [requestId]);
    expect(done).toEqual({ status: 'done', closed: true });

    // у списку тепер у «Виконаних»
    await page.goto(`/admin?tab=done&q=${reference}`);
    await expect(page.locator('li.admin-rowcard', { hasText: reference })).toContainText('Виконано');

    // статистика
    await page.goto('/admin/stats');
    await expect(page.getByRole('heading', { name: 'Статистика' })).toBeVisible();
    await expect(page.getByText('Загальний заробіток')).toBeVisible();
    await expect(page.getByText('Залишок до сплати')).toBeVisible();
    await expect(page.getByRole('columnheader', { name: 'Вид роботи' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Воронка заявок' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Заробіток за місяцями' })).toBeVisible();
    // перемикач періоду
    await page.getByRole('navigation', { name: 'Період' }).getByRole('link', { name: '7 днів' }).click();
    await expect(page).toHaveURL(/\/admin\/stats\?p=week$/);
    await expect(page.getByRole('navigation', { name: 'Період' }).getByRole('link', { name: '7 днів' })).toHaveAttribute('aria-current', 'page');
    await expect(page.getByText('Загальний заробіток')).toBeVisible();

    // «Провалено» і повернення в роботу
    await page.goto(`/admin/requests/${requestId}`);
    await page.getByRole('button', { name: '❌ Провалено' }).click();
    await expect(page.getByText('Поточний статус:')).toContainText('Провалено');

    await sql('delete from "Request" where id = $1', [requestId]);
    await ctx.close();
  });
});
