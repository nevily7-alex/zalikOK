import 'server-only';
import { env } from './env';

export type ScanState = 'pending' | 'clean' | 'rejected';
export type DownloadDecision = 'ok' | 'ok_unscanned' | 'confirm_required' | 'blocked_pending' | 'blocked_rejected';

/** Явний дозвіл власника завантажувати непереперевірені файли (коли автоматичного антивіруса немає). */
export function unscannedDownloadAllowed(): boolean {
  return env('ALLOW_UNSCANNED_DOWNLOAD') === 'true';
}

/**
 * clean — завжди можна; rejected — ніколи; pending — лише при ALLOW_UNSCANNED_DOWNLOAD=true
 * і явному підтвердженні менеджера (?unscanned=1), з записом у журнал.
 */
export function decideDownload(scan: ScanState, confirmedUnscanned: boolean, allowUnscanned = unscannedDownloadAllowed()): DownloadDecision {
  if (scan === 'clean') return 'ok';
  if (scan === 'rejected') return 'blocked_rejected';
  if (!allowUnscanned) return 'blocked_pending';
  return confirmedUnscanned ? 'ok_unscanned' : 'confirm_required';
}
