import 'server-only';
import net from 'node:net';
import type { ScanStatus } from '@/generated/prisma/enums';
import { env, intEnv, isProd } from './env';
import { storage } from './storage';

/**
 * Антивірусна перевірка. Режими UPLOAD_SCAN_MODE:
 *  off       — движок не налаштовано: файл лишається pending і НЕ позначається «перевіреним»
 *  clamav    — потокова перевірка через clamd (INSTREAM)
 *  dev-trust — лише для розробки: після перевірки сигнатур файл вважається clean
 */
export function scanMode(): 'off' | 'clamav' | 'dev-trust' {
  const m = env('UPLOAD_SCAN_MODE');
  if (m === 'clamav') return 'clamav';
  if (m === 'dev-trust' && !isProd) return 'dev-trust';
  return 'off';
}

async function clamScan(key: string): Promise<'clean' | 'infected' | 'error'> {
  const host = env('CLAMAV_HOST');
  if (!host) return 'error';
  const port = intEnv('CLAMAV_PORT', 3310);
  const body = await (await storage().stream(key)).getReader();
  return new Promise((resolve) => {
    const socket = net.connect({ host, port });
    let answer = '';
    socket.setTimeout(30_000, () => {
      socket.destroy();
      resolve('error');
    });
    socket.on('error', () => resolve('error'));
    socket.on('data', (d) => (answer += d.toString()));
    socket.on('close', () => resolve(/OK\s*$/.test(answer.trim()) ? 'clean' : /FOUND/.test(answer) ? 'infected' : 'error'));
    socket.write('zINSTREAM\0');
    (async () => {
      for (;;) {
        const { done, value } = await body.read();
        if (done) break;
        const len = Buffer.alloc(4);
        len.writeUInt32BE(value.byteLength);
        socket.write(len);
        socket.write(value);
      }
      socket.write(Buffer.alloc(4));
    })().catch(() => socket.destroy());
  });
}

export async function scanObject(key: string): Promise<ScanStatus> {
  const mode = scanMode();
  if (mode === 'dev-trust') return 'clean';
  if (mode === 'clamav') {
    const r = await clamScan(key);
    if (r === 'clean') return 'clean';
    if (r === 'infected') return 'rejected';
    return 'pending'; // движок недоступний — не вважаємо файл перевіреним
  }
  return 'pending';
}
