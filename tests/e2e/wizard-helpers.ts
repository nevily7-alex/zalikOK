import type { Page } from '@playwright/test';
import { kyivDatePlus, pickDate, pickOption } from './helpers';

/** Крок 1 «Робота»: заповнює обов'язкові поля. */
export async function fillStep1(
  page: Page,
  o: { type?: string; topic?: string; discipline?: string; days?: number; skipType?: boolean } = {},
) {
  if (!o.skipType) await pickOption(page.locator('#f-workType'), o.type ?? 'referat');
  await pickOption(page.locator('#f-discipline'), o.discipline ?? 'law');
  await page.fill('#f-topic', o.topic ?? 'Правові аспекти захисту персональних даних');
  await pickDate(page.locator('#f-deadline'), kyivDatePlus(o.days ?? 45));
}

export const clickNext = (page: Page) => page.getByRole('button', { name: 'Далі' }).click();

/** Крок 3 «Контакт»: заповнює контакт і згоду. */
export async function fillStep3(page: Page, contact = `@form_${Date.now().toString(36)}`) {
  await page.getByLabel('Telegram', { exact: true }).check();
  await page.fill('#f-contact', contact);
  await page.locator('#f-privacyConsent').check();
  return contact;
}

/** Проходить кроки 1 → 3 і зупиняється на кроці «Контакт». */
export async function toStep3(page: Page, o: Parameters<typeof fillStep1>[1] = {}) {
  await fillStep1(page, o);
  await clickNext(page);
  await clickNext(page);
}

export const SUBMIT_NAME = 'Отримати розрахунок';
