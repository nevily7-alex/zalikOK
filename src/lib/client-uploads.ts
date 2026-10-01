'use client';

/** Клієнт для upload-session API. Секрет сесії живе лише в пам’яті сторінки. */
export interface UploadSessionInfo {
  sessionId: string;
  secret: string;
}

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public retryAfter?: number,
  ) {
    super(message);
  }
}

async function readError(res: Response): Promise<ApiError> {
  let code = 'error';
  let message = 'Не вдалося виконати запит.';
  try {
    const data = await res.json();
    code = data.code ?? code;
    message = data.message ?? message;
  } catch {
    /* не JSON */
  }
  const retry = Number(res.headers.get('Retry-After'));
  return new ApiError(res.status, code, message, Number.isFinite(retry) && retry > 0 ? retry : undefined);
}

export async function createUploadSession(): Promise<UploadSessionInfo> {
  const res = await fetch('/api/uploads/session', { method: 'POST' });
  if (!res.ok) throw await readError(res);
  return res.json();
}

interface Slot {
  fileId: string;
  url: string;
  headers: Record<string, string>;
}

export async function requestSlot(s: UploadSessionInfo, name: string, size: number): Promise<Slot> {
  const res = await fetch('/api/uploads/files', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Secret': s.secret },
    body: JSON.stringify({ sessionId: s.sessionId, name, size }),
  });
  if (!res.ok) throw await readError(res);
  return res.json();
}

export function putFile(slot: Slot, file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', slot.url);
    for (const [k, v] of Object.entries(slot.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(Math.round((e.loaded / e.total) * 100));
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new ApiError(xhr.status, 'put_failed', 'Не вдалося завантажити файл.'));
    xhr.onerror = () => reject(new ApiError(0, 'network', 'Помилка мережі під час завантаження файлу.'));
    xhr.onabort = () => reject(new ApiError(0, 'aborted', 'Завантаження скасовано.'));
    signal.addEventListener('abort', () => xhr.abort(), { once: true });
    xhr.send(file);
  });
}

export async function completeFile(s: UploadSessionInfo, fileId: string): Promise<void> {
  const res = await fetch('/api/uploads/complete', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Secret': s.secret },
    body: JSON.stringify({ sessionId: s.sessionId, fileId }),
  });
  if (!res.ok) throw await readError(res);
}

export async function removeFile(s: UploadSessionInfo, fileId: string): Promise<void> {
  await fetch('/api/uploads/remove', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Upload-Secret': s.secret },
    body: JSON.stringify({ sessionId: s.sessionId, fileId }),
  }).catch(() => undefined);
}
