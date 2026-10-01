import { describe, expect, it } from 'vitest';
import { checkFile } from '@/lib/server/file-checks';
import { kindFromExt } from '@/lib/upload-rules';

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(32)]);
const pdf = (extra = '') => Buffer.from(`%PDF-1.7\n1 0 obj\n<< /Type /Catalog ${extra} >>\nendobj\n%%EOF\n`, 'latin1');

/** Мінімальний ZIP (stored) із заданими іменами; розміри у каталозі налаштовуються. */
function zip(names: string[], uncompressedSize = 10, compressedSize = 10): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const name of names) {
    const nameBuf = Buffer.from(name);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    const central = Buffer.alloc(46 + nameBuf.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt32LE(compressedSize, 20);
    central.writeUInt32LE(uncompressedSize, 24);
    central.writeUInt16LE(nameBuf.length, 28);
    central.writeUInt32LE(offset, 42);
    nameBuf.copy(central, 46);
    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const cd = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(names.length, 8);
  eocd.writeUInt16LE(names.length, 10);
  eocd.writeUInt32LE(cd.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cd, eocd]);
}

describe('checkFile', () => {
  it('приймає PNG, JPEG, PDF і DOCX з правильним вмістом', () => {
    expect(checkFile(PNG, 'png').ok).toBe(true);
    expect(checkFile(JPEG, 'jpeg').ok).toBe(true);
    expect(checkFile(pdf(), 'pdf').ok).toBe(true);
    expect(checkFile(zip(['[Content_Types].xml', 'word/document.xml']), 'docx').ok).toBe(true);
  });

  it('відхиляє невідповідність розширення та вмісту (MIME mismatch)', () => {
    const r = checkFile(PNG, 'pdf');
    expect(r.ok).toBe(false);
  });

  it('відхиляє HTML/SVG/JS/виконувані файли навіть із «правильним» розширенням', () => {
    for (const body of ['<html><script>alert(1)</script></html>', '<svg xmlns="http://www.w3.org/2000/svg"/>', 'alert(1)', 'MZ\x90\x00']) {
      for (const kind of ['pdf', 'png', 'jpeg', 'docx'] as const) {
        expect(checkFile(Buffer.from(body, 'latin1'), kind).ok).toBe(false);
      }
    }
  });

  it('відхиляє PDF зі скриптами та запуском', () => {
    expect(checkFile(pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'), 'pdf').ok).toBe(false);
    expect(checkFile(pdf('/Launch'), 'pdf').ok).toBe(false);
  });

  it('відхиляє ZIP, що не є DOCX, макроси, небезпечні шляхи та zip-бомби', () => {
    expect(checkFile(zip(['a.txt']), 'docx').ok).toBe(false);
    expect(checkFile(zip(['[Content_Types].xml', 'word/document.xml', 'word/vbaProject.bin']), 'docx').ok).toBe(false);
    expect(checkFile(zip(['[Content_Types].xml', 'word/document.xml', '../evil']), 'docx').ok).toBe(false);
    expect(checkFile(zip(['[Content_Types].xml', 'word/document.xml'], 500 * 1024 * 1024, 100), 'docx').ok).toBe(false);
  });
});

describe('kindFromExt', () => {
  it('старий .doc, svg, html, exe не дозволені', () => {
    for (const n of ['a.doc', 'a.svg', 'a.html', 'a.js', 'a.exe', 'a.pdf.exe', 'noext']) {
      expect(kindFromExt(n)).toBeNull();
    }
    expect(kindFromExt('Курсова.DOCX')).toBe('docx');
    expect(kindFromExt('scan.JPG')).toBe('jpeg');
  });
});
