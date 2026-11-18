import { afterEach, describe, expect, it, vi } from 'vitest';
import { buildRequestButtons, buildRequestMessage, type NotifyRequest } from '@/lib/server/notify';

const base: NotifyRequest = {
  id: '11111111-1111-1111-1111-111111111111',
  publicReference: 'ZO-ABCDE-FGHJK',
  service: 'plan',
  workType: 'kursova',
  discipline: 'law',
  disciplineOther: null,
  pages: 30,
  deadline: new Date('2026-12-05T00:00:00Z'),
  contactMethod: 'telegram',
  contact: '@student_ua',
};
const now = new Date('2026-11-20T10:00:00Z');

describe('текст сповіщення про заявку', () => {
  it('структурований емодзі, дедлайн з лишком днів, контакт копіюється й має посилання', () => {
    const t = buildRequestMessage(base, now);
    expect(t).toContain('🆕 <b>Нова заявка</b> <code>ZO-ABCDE-FGHJK</code>');
    expect(t).toContain('📌 <b>Послуга:</b> План і структура');
    expect(t).toContain('📚 <b>Предмет:</b> Право');
    expect(t).toContain('📄 <b>Обсяг:</b> 30 стор.');
    expect(t).toContain('📅 <b>Дедлайн:</b> 05.12.2026 (через 15 дн.)');
    expect(t).toContain('<code>@student_ua</code>');
    expect(t).not.toContain('Написати в Telegram'); // для Telegram-контакту це тепер кнопка
    expect(t).toContain('/admin/requests/11111111-1111-1111-1111-111111111111');
  });

  it('e-mail: код для копіювання й mailto; телефон: лише код', () => {
    const mail = buildRequestMessage({ ...base, contactMethod: 'email', contact: 'a@b.ua' }, now);
    expect(mail).toContain('<code>a@b.ua</code>');
    expect(mail).toContain('href="mailto:a@b.ua"');
    const tel = buildRequestMessage({ ...base, contactMethod: 'phone', contact: '+380501234567' }, now);
    expect(tel).toContain('<code>+380501234567</code>');
  });

  it('HTML у користувацьких полях екранується', () => {
    const t = buildRequestMessage({ ...base, discipline: 'other', disciplineOther: '<b>x</b> & y', contactMethod: 'email', contact: 'a@b.ua' }, now);
    expect(t).toContain('&lt;b&gt;x&lt;/b&gt; &amp; y');
    expect(t).not.toContain('<b>x</b>');
  });

  describe('кнопки під повідомленням', () => {
    afterEach(() => vi.unstubAllEnvs());

    it('публічний https: кнопка адмінки й кнопка «написати клієнту», у тексті без дублюючого посилання', () => {
      vi.stubEnv('APP_URL', 'https://zalikok.example');
      const rows = buildRequestButtons(base);
      expect(rows).toEqual([
        [{ text: '🔗 Відкрити заявку в адмінці', url: 'https://zalikok.example/admin/requests/11111111-1111-1111-1111-111111111111' }],
        [{ text: '✈️ Написати клієнту в Telegram', url: 'https://t.me/student_ua' }],
      ]);
      expect(buildRequestMessage(base, now)).not.toContain('Відкрити заявку в адмінці');
    });

    it('localhost: Telegram відхиляє такі кнопки, тож лишається текстове посилання', () => {
      vi.stubEnv('APP_URL', 'http://localhost:3000');
      expect(buildRequestButtons({ ...base, contactMethod: 'email', contact: 'a@b.ua' })).toEqual([]);
      expect(buildRequestMessage(base, now)).toContain('Відкрити заявку в адмінці');
    });
  });
});
