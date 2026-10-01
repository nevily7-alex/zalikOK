import { describe, expect, it } from 'vitest';
import { validateRequest, normalizeContact } from '@/lib/validation';
import { todayInKyiv, isValidDateString } from '@/lib/kyiv-date';

const base = {
  service: 'plan',
  discipline: 'law',
  topic: 'Правові аспекти захисту даних',
  deadline: '2999-01-01',
  contactMethod: 'telegram',
  contact: '@zalik_user',
  privacyConsent: true,
};

const errorsFor = (patch: Record<string, unknown>) => {
  const r = validateRequest({ ...base, ...patch });
  return r.success ? {} : r.errors;
};

describe('requestSchema', () => {
  it('приймає коректну заявку', () => {
    expect(validateRequest(base).success).toBe(true);
  });

  it('вимагає згоду на обробку даних', () => {
    expect(errorsFor({ privacyConsent: false }).privacyConsent).toBeTruthy();
    expect(errorsFor({ privacyConsent: undefined }).privacyConsent).toBeTruthy();
  });

  it('тема: мінімум 5 символів, якщо вона відома; порожня — лише з topicUnknown', () => {
    expect(errorsFor({ topic: 'ab' }).topic).toBeTruthy();
    expect(errorsFor({ topic: '' }).topic).toBeTruthy();
    expect(errorsFor({ topic: '', topicUnknown: true }).topic).toBeUndefined();
    expect(errorsFor({ topic: 'x'.repeat(501) }).topic).toBeTruthy();
  });

  it('«Інше» вимагає дисципліну до 120 символів', () => {
    expect(errorsFor({ discipline: 'other' }).disciplineOther).toBeTruthy();
    expect(errorsFor({ discipline: 'other', disciplineOther: 'Культурологія' }).disciplineOther).toBeUndefined();
    expect(errorsFor({ discipline: 'other', disciplineOther: 'a'.repeat(121) }).disciplineOther).toBeTruthy();
  });

  it('дедлайн: не раніше сьогодні за Києвом', () => {
    expect(errorsFor({ deadline: todayInKyiv() }).deadline).toBeUndefined();
    expect(errorsFor({ deadline: '2000-01-01' }).deadline).toBeTruthy();
    expect(errorsFor({ deadline: '2999-02-31' }).deadline).toBeTruthy();
    expect(errorsFor({ deadline: 'завтра' }).deadline).toBeTruthy();
  });

  it('сторінки: ціле 1–500', () => {
    expect(errorsFor({ pages: 0 }).pages).toBeTruthy();
    expect(errorsFor({ pages: 501 }).pages).toBeTruthy();
    expect(errorsFor({ pages: 1.5 }).pages).toBeTruthy();
    expect(errorsFor({ pages: 30 }).pages).toBeUndefined();
    expect(errorsFor({ pages: null }).pages).toBeUndefined();
  });

  it('контакт валідується за обраним способом', () => {
    expect(errorsFor({ contactMethod: 'email', contact: '@zalik_user' }).contact).toBeTruthy();
    expect(errorsFor({ contactMethod: 'email', contact: 'a@b.ua' }).contact).toBeUndefined();
    expect(errorsFor({ contactMethod: 'phone', contact: '12345' }).contact).toBeTruthy();
    expect(errorsFor({ contactMethod: 'phone', contact: '+38 (050) 123-45-67' }).contact).toBeUndefined();
    expect(errorsFor({ contactMethod: 'telegram', contact: 'ab' }).contact).toBeTruthy();
    expect(errorsFor({ contactMethod: 'telegram', contact: 'https://t.me/zalik_user' }).contact).toBeUndefined();
  });

  it('перехресні помилки показуються разом з помилками інших полів', () => {
    const r = validateRequest({ service: 'plan', discipline: 'other', topic: '', contactMethod: 'email', contact: 'x', privacyConsent: false });
    expect(r.success).toBe(false);
    if (!r.success) expect(Object.keys(r.errors).sort()).toEqual(['contact', 'deadline', 'disciplineOther', 'privacyConsent', 'topic']);
  });

  it('honeypot має бути порожнім', () => {
    expect(validateRequest({ ...base, honeypot: 'bot' }).success).toBe(false);
  });

  it('коментар до 3000 символів', () => {
    expect(errorsFor({ comment: 'a'.repeat(3001) }).comment).toBeTruthy();
  });
});

describe('normalizeContact', () => {
  it('нормалізує значення', () => {
    expect(normalizeContact('telegram', 't.me/zalik_user')).toBe('@zalik_user');
    expect(normalizeContact('telegram', 'https://t.me/zalik_user')).toBe('@zalik_user');
    expect(normalizeContact('email', ' A@B.UA ')).toBe('a@b.ua');
    expect(normalizeContact('phone', '380501234567')).toBe('+380501234567');
  });
});

describe('Київський час', () => {
  it('використовує Europe/Kyiv, а не UTC', () => {
    // 22:30 UTC 31 грудня = 00:30 1 січня за Києвом (зима, UTC+2)
    expect(todayInKyiv(new Date('2026-12-31T22:30:00Z'))).toBe('2027-01-01');
    expect(todayInKyiv(new Date('2026-12-31T21:30:00Z'))).toBe('2026-12-31');
    // літо UTC+3: 21:30 UTC = 00:30 наступного дня
    expect(todayInKyiv(new Date('2026-07-10T21:30:00Z'))).toBe('2026-07-11');
  });
  it('перевіряє календарні дати', () => {
    expect(isValidDateString('2028-02-29')).toBe(true);
    expect(isValidDateString('2027-02-29')).toBe(false);
  });
});
