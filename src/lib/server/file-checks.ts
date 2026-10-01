import 'server-only';
import { ALLOWED_TYPES, type AllowedKind } from '@/lib/upload-rules';

export type CheckResult = { ok: true; kind: AllowedKind; mime: string } | { ok: false; reason: string };

const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

// Ліміти для DOCX (ми не розпаковуємо вміст, лише читаємо центральний каталог ZIP)
const MAX_ZIP_ENTRIES = 2000;
const MAX_UNCOMPRESSED_TOTAL = 200 * 1024 * 1024;
const MAX_RATIO = 200;

function sniff(head: Buffer): AllowedKind | null {
  if (head.subarray(0, 5).toString('latin1') === '%PDF-') return 'pdf';
  if (head.length >= 8 && head.subarray(0, 8).equals(PNG_SIG)) return 'png';
  if (head.length >= 3 && head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'jpeg';
  if (head.length >= 4 && head[0] === 0x50 && head[1] === 0x4b && head[2] === 0x03 && head[3] === 0x04) return 'docx';
  return null;
}

/** Мінімальний розбір ZIP: EOCD + центральний каталог. Нічого не розпаковує. */
function inspectDocx(buf: Buffer): string | null {
  const minEocd = 22;
  let eocd = -1;
  for (let i = buf.length - minEocd; i >= Math.max(0, buf.length - minEocd - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return 'Файл DOCX пошкоджений.';
  const total = buf.readUInt16LE(eocd + 10);
  const cdSize = buf.readUInt32LE(eocd + 12);
  const cdOffset = buf.readUInt32LE(eocd + 16);
  if (total > MAX_ZIP_ENTRIES) return 'Занадто багато елементів у DOCX.';
  if (cdOffset + cdSize > buf.length) return 'Файл DOCX пошкоджений.';

  let p = cdOffset;
  let uncompressed = 0;
  let compressed = 0;
  const names: string[] = [];
  for (let n = 0; n < total; n++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== 0x02014b50) return 'Файл DOCX пошкоджений.';
    const cSize = buf.readUInt32LE(p + 20);
    const uSize = buf.readUInt32LE(p + 24);
    const nameLen = buf.readUInt16LE(p + 28);
    const extraLen = buf.readUInt16LE(p + 30);
    const commentLen = buf.readUInt16LE(p + 32);
    const name = buf.subarray(p + 46, p + 46 + nameLen).toString('utf8');
    if (name.includes('..') || name.startsWith('/')) return 'Файл DOCX містить небезпечні шляхи.';
    names.push(name);
    uncompressed += uSize;
    compressed += cSize;
    p += 46 + nameLen + extraLen + commentLen;
  }
  if (!names.includes('[Content_Types].xml') || !names.includes('word/document.xml')) {
    return 'Файл не є документом DOCX.';
  }
  if (names.some((x) => /vbaProject\.bin$/i.test(x))) return 'Документи з макросами не приймаються.';
  if (uncompressed > MAX_UNCOMPRESSED_TOTAL) return 'DOCX занадто великий після розпакування.';
  if (compressed > 0 && uncompressed / compressed > MAX_RATIO) return 'Підозріле стиснення у DOCX.';
  return null;
}

function inspectPdf(buf: Buffer): string | null {
  const text = buf.toString('latin1');
  if (!text.includes('%%EOF')) return 'PDF пошкоджений або неповний.';
  if (/\/(JavaScript|JS|Launch|EmbeddedFile)\b/.test(text)) {
    return 'PDF із вбудованими скриптами чи файлами не приймається. Надішліть PDF без них або DOCX.';
  }
  return null;
}

/** Перевірка за вмістом (сигнатура), а не за MIME чи розширенням браузера. */
export function checkFile(buf: Buffer, expectedKind: AllowedKind): CheckResult {
  const detected = sniff(buf);
  if (!detected) return { ok: false, reason: 'Вміст файлу не відповідає дозволеним форматам.' };
  if (detected !== expectedKind) return { ok: false, reason: 'Розширення файлу не збігається з його вмістом.' };

  const problem = detected === 'docx' ? inspectDocx(buf) : detected === 'pdf' ? inspectPdf(buf) : null;
  if (problem) return { ok: false, reason: problem };
  return { ok: true, kind: detected, mime: ALLOWED_TYPES[detected].mime };
}
