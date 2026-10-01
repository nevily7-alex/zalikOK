/** Спільні правила вкладень (клієнт + сервер). Старі .doc не приймаємо: немає перевірки OLE/AV. */
export const MAX_FILES = 5;
export const MAX_FILE_BYTES = 10 * 1024 * 1024;
export const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

export const ALLOWED_TYPES = {
  pdf: { mime: 'application/pdf', exts: ['pdf'] },
  docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', exts: ['docx'] },
  png: { mime: 'image/png', exts: ['png'] },
  jpeg: { mime: 'image/jpeg', exts: ['jpg', 'jpeg'] },
} as const;

export type AllowedKind = keyof typeof ALLOWED_TYPES;

export const ACCEPT_ATTR = '.pdf,.docx,.png,.jpg,.jpeg';
export const FILE_HINT =
  'До 5 файлів: PDF, DOCX, PNG або JPG. До 10 МіБ кожен, до 25 МіБ разом. Для документів Word використовуйте DOCX або PDF (старий формат DOC не приймається).';

export function extOf(name: string): string {
  const i = name.lastIndexOf('.');
  return i < 0 ? '' : name.slice(i + 1).toLowerCase();
}

export function kindFromExt(name: string): AllowedKind | null {
  const ext = extOf(name);
  for (const [kind, t] of Object.entries(ALLOWED_TYPES)) {
    if ((t.exts as readonly string[]).includes(ext)) return kind as AllowedKind;
  }
  return null;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n} Б`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} КіБ`;
  return `${(n / 1024 / 1024).toFixed(1)} МіБ`;
}

export function sanitizeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  return base.replace(/[\u0000-\u001f<>:"|?*]/g, '_').slice(0, 120) || 'file';
}
