import { z } from 'zod';
import { isValidDateString, todayInKyiv } from './kyiv-date';
import { PRICE_IDS } from './prices';

export const SERVICES = ['plan', 'editing', 'formatting', 'research-support', 'presentation'] as const;
export const DISCIPLINES = [
  'economics',
  'management',
  'marketing',
  'law',
  'pedagogy',
  'psychology',
  'philology',
  'it',
  'technical',
  'other',
] as const;
export const CONTACT_METHODS = ['telegram', 'email', 'phone'] as const;

export type Service = (typeof SERVICES)[number];
export type Discipline = (typeof DISCIPLINES)[number];
export type ContactMethod = (typeof CONTACT_METHODS)[number];

export const DISCIPLINE_LABELS: Record<Discipline, string> = {
  economics: 'Економіка',
  management: 'Менеджмент',
  marketing: 'Маркетинг',
  law: 'Право',
  pedagogy: 'Педагогіка',
  psychology: 'Психологія',
  philology: 'Філологія',
  it: 'ІТ',
  technical: 'Технічні дисципліни',
  other: 'Інше',
};
export const SERVICE_LABELS: Record<Service, string> = {
  'research-support': 'Допомога з дослідженням',
  plan: 'План і структура',
  editing: 'Редагування',
  formatting: 'Оформлення',
  presentation: 'Підготовка до захисту',
};
export const CONTACT_LABELS: Record<ContactMethod, string> = {
  telegram: 'Telegram',
  email: 'E-mail',
  phone: 'Телефон',
};
export const CONTACT_PLACEHOLDERS: Record<ContactMethod, string> = {
  telegram: '@username або t.me/username',
  email: 'name@example.com',
  phone: '+380XXXXXXXXX',
};

export function normalizeTelegram(v: string): string | null {
  const s = v
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?(t|telegram)\.me\//i, '')
    .replace(/^@/, '')
    .replace(/\/$/, '');
  return /^[A-Za-z][A-Za-z0-9_]{4,31}$/.test(s) ? `@${s}` : null;
}
export function normalizePhone(v: string): string | null {
  const s = v.replace(/[\s\-().]/g, '');
  return /^\+?\d{10,15}$/.test(s) ? (s.startsWith('+') ? s : `+${s}`) : null;
}
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeContact(method: ContactMethod, value: string): string | null {
  const v = value.trim();
  if (method === 'telegram') return normalizeTelegram(v);
  if (method === 'phone') return normalizePhone(v);
  return v.length <= 254 && EMAIL_RE.test(v) ? v.toLowerCase() : null;
}

const CONTACT_ERRORS: Record<ContactMethod, string> = {
  telegram: 'Вкажіть Telegram у форматі @username (від 5 символів) або посилання t.me.',
  email: 'Вкажіть коректну адресу e-mail.',
  phone: 'Вкажіть телефон у міжнародному форматі, наприклад +380501234567.',
};

export const requestSchema = z.object({
  service: z.enum(SERVICES, { error: 'Оберіть вид допомоги.' }),
  workType: z.enum(PRICE_IDS).nullish(),
  discipline: z.enum(DISCIPLINES, { error: 'Оберіть дисципліну.' }),
  disciplineOther: z.string().trim().max(120, 'Не більше 120 символів.').optional().default(''),
  topic: z.string().trim().max(500, 'Не більше 500 символів.').optional().default(''),
  topicUnknown: z.boolean().optional().default(false),
  deadline: z.string({ error: 'Вкажіть дедлайн.' }).refine(isValidDateString, 'Вкажіть коректну дату.'),
  pages: z
    .number({ error: 'Вкажіть число.' })
    .int('Вкажіть ціле число.')
    .min(1, 'Від 1 до 500.')
    .max(500, 'Від 1 до 500.')
    .nullable()
    .optional(),
  contactMethod: z.enum(CONTACT_METHODS, { error: 'Оберіть спосіб зв’язку.' }),
  contact: z.string().trim().min(1, 'Вкажіть контакт.').max(254, 'Занадто довгий контакт.'),
  comment: z.string().trim().max(3000, 'Не більше 3000 символів.').optional().default(''),
  privacyConsent: z.literal(true, { error: 'Потрібна згода на обробку даних для розгляду заявки.' }),
  honeypot: z.string().max(0).optional().default(''),
});

export type RequestInput = z.input<typeof requestSchema>;
export type RequestData = z.output<typeof requestSchema>;
export type FieldErrors = Partial<Record<string, string>>;

export function flattenErrors(error: z.ZodError): FieldErrors {
  const out: FieldErrors = {};
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? 'form');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}

export type ValidationResult = { success: true; data: RequestData } | { success: false; errors: FieldErrors };

/**
 * Єдина валідація для клієнта й сервера. Перехресні правила (тема, «Інше», дедлайн за Києвом, формат контакту)
 * перевіряються незалежно від помилок в інших полях, щоб користувач бачив усі проблеми одразу.
 */
export function validateRequest(input: unknown): ValidationResult {
  const parsed = requestSchema.safeParse(input);
  const errors: FieldErrors = parsed.success ? {} : flattenErrors(parsed.error);
  const raw = (input && typeof input === 'object' ? input : {}) as Record<string, unknown>;
  const str = (k: string) => (typeof raw[k] === 'string' ? (raw[k] as string).trim() : '');

  if (!errors.topic && raw.topicUnknown !== true && str('topic').length < 5) {
    errors.topic = 'Вкажіть тему (мінімум 5 символів) або позначте, що тему ще не визначено.';
  }
  if (!errors.disciplineOther && raw.discipline === 'other' && str('disciplineOther').length < 2) {
    errors.disciplineOther = 'Вкажіть вашу дисципліну (до 120 символів).';
  }
  const deadline = str('deadline');
  if (!errors.deadline && deadline && isValidDateString(deadline) && deadline < todayInKyiv()) {
    errors.deadline = 'Дедлайн не може бути у минулому.';
  }
  const method = raw.contactMethod;
  if (!errors.contact && (CONTACT_METHODS as readonly string[]).includes(method as string) && str('contact')) {
    if (!normalizeContact(method as ContactMethod, str('contact'))) errors.contact = CONTACT_ERRORS[method as ContactMethod];
  }

  if (Object.keys(errors).length > 0 || !parsed.success) return { success: false, errors };
  return { success: true, data: parsed.data };
}
