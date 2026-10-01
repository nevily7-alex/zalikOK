'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { DatePicker } from './ui/DatePicker';
import { Select, type SelectItem } from './ui/Select';
import { content } from '@/lib/content';
import { findPrice, prices } from '@/lib/prices';
import { track } from '@/lib/analytics';
import { todayInKyiv } from '@/lib/kyiv-date';
import {
  CONTACT_LABELS,
  CONTACT_METHODS,
  CONTACT_PLACEHOLDERS,
  DISCIPLINES,
  DISCIPLINE_LABELS,
  SERVICES,
  normalizeContact,
  validateRequest,
  type ContactMethod,
  type FieldErrors,
  type Service,
} from '@/lib/validation';
import {
  ACCEPT_ATTR,
  FILE_HINT,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  formatBytes,
  kindFromExt,
} from '@/lib/upload-rules';
import {
  ApiError,
  completeFile,
  createUploadSession,
  putFile,
  removeFile,
  requestSlot,
  type UploadSessionInfo,
} from '@/lib/client-uploads';

interface Values {
  service: Service;
  workType: string;
  discipline: string;
  disciplineOther: string;
  topic: string;
  topicUnknown: boolean;
  deadline: string;
  pages: string;
  contactMethod: ContactMethod | '';
  contact: string;
  comment: string;
  privacyConsent: boolean;
  honeypot: string;
}

type FileStatus = 'uploading' | 'done' | 'error';
interface FileItem {
  key: string;
  name: string;
  size: number;
  status: FileStatus;
  progress: number;
  error?: string;
  fileId?: string;
  controller?: AbortController;
}

const FIELD_ORDER = [
  'service',
  'discipline',
  'disciplineOther',
  'topic',
  'deadline',
  'pages',
  'contactMethod',
  'contact',
  'comment',
  'files',
  'privacyConsent',
];

const FIELD_LABELS: Record<string, string> = {
  service: 'Вид допомоги',
  discipline: 'Дисципліна',
  disciplineOther: 'Ваша дисципліна',
  topic: 'Тема роботи',
  deadline: 'Дедлайн',
  pages: 'Обсяг',
  contactMethod: 'Спосіб зв’язку',
  contact: 'Контакт',
  comment: 'Додаткові вимоги',
  privacyConsent: 'Згода на обробку даних',
};

const workTypeItems: SelectItem[] = [
  { value: '', label: 'Не обрано' },
  ...prices.groups.map((g) => ({ label: g.title, options: g.items.map((i) => ({ value: i.id, label: i.title })) })),
];

function isService(v: string | undefined): v is Service {
  return !!v && (SERVICES as readonly string[]).includes(v);
}

function readUtm(): Record<string, string> | undefined {
  const out: Record<string, string> = {};
  const params = new URLSearchParams(window.location.search);
  for (const k of ['utm_source', 'utm_medium', 'utm_campaign']) {
    const v = params.get(k);
    if (v) out[k] = v.slice(0, 100);
  }
  return Object.keys(out).length ? out : undefined;
}

function newKey(): string {
  return crypto.randomUUID();
}

export function RequestForm({
  initialService,
  initialWorkType,
  initialPages,
  initialDeadline,
  initialComment,
}: {
  initialService?: string;
  initialWorkType?: string;
  initialPages?: string;
  initialDeadline?: string;
  initialComment?: string;
}) {
  const f = content.form;
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const summaryRef = useRef<HTMLDivElement>(null);

  const [values, setValues] = useState<Values>({
    service: isService(initialService) ? initialService : 'research-support',
    workType: findPrice(initialWorkType) ? initialWorkType! : '',
    discipline: '',
    disciplineOther: '',
    topic: '',
    topicUnknown: false,
    deadline: initialDeadline ?? '',
    pages: initialPages ?? '',
    contactMethod: '',
    contact: '',
    comment: initialComment ?? '',
    privacyConsent: false,
    honeypot: '',
  });
  const [errors, setErrors] = useState<FieldErrors>({});
  const [files, setFiles] = useState<FileItem[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [banner, setBanner] = useState<{ kind: 'network' | 'rate' | 'server' | 'files'; text: string } | null>(null);
  const [minDate] = useState<string>(() => todayInKyiv());
  const [fileMessages, setFileMessages] = useState<string[]>([]);

  const submittingRef = useRef(false);
  const startedRef = useRef(false);
  const sessionRef = useRef<Promise<UploadSessionInfo> | null>(null);
  const sessionInfoRef = useRef<UploadSessionInfo | null>(null);
  const idemRef = useRef<{ sig: string; key: string } | null>(null);
  const filesRef = useRef<FileItem[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const focusAfterErrors = useRef(false);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    if (errors[key as string]) setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const onStart = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('request_start', { placement: 'form', service: values.service });
  };

  // ---------- Файли ----------
  const patchFile = useCallback((key: string, patch: Partial<FileItem>) => {
    setFiles((list) => list.map((it) => (it.key === key ? { ...it, ...patch } : it)));
  }, []);

  const ensureSession = useCallback((): Promise<UploadSessionInfo> => {
    if (!sessionRef.current) {
      sessionRef.current = createUploadSession().then((s) => {
        sessionInfoRef.current = s;
        return s;
      });
      sessionRef.current.catch(() => {
        sessionRef.current = null;
      });
    }
    return sessionRef.current;
  }, []);

  const uploadOne = useCallback(
    async (key: string, file: File, controller: AbortController) => {
      try {
        const session = await ensureSession();
        const slot = await requestSlot(session, file.name, file.size);
        patchFile(key, { fileId: slot.fileId });
        await putFile(slot, file, (pct) => patchFile(key, { progress: pct }), controller.signal);
        await completeFile(session, slot.fileId);
        patchFile(key, { status: 'done', progress: 100 });
      } catch (err) {
        if (err instanceof ApiError && err.code === 'aborted') return;
        const message =
          err instanceof ApiError && err.status >= 400 && err.status < 500 && err.status !== 429
            ? err.message
            : err instanceof ApiError && err.status === 429
              ? f.states.rateLimit
              : 'Не вдалося завантажити файл. Видаліть його та спробуйте ще раз.';
        patchFile(key, { status: 'error', error: message });
      }
    },
    [ensureSession, patchFile, f.states.rateLimit],
  );

  const addFiles = (incoming: FileList | null) => {
    if (!incoming || incoming.length === 0) return;
    onStart();
    const messages: string[] = [];
    let accepted = filesRef.current.filter((it) => it.status !== 'error');
    let total = accepted.reduce((s, it) => s + it.size, 0);
    const toUpload: { item: FileItem; file: File }[] = [];

    for (const file of Array.from(incoming)) {
      if (!kindFromExt(file.name)) {
        messages.push(`«${file.name}»: формат не підходить. Дозволено PDF, DOCX, PNG, JPG.`);
        continue;
      }
      if (file.size === 0) {
        messages.push(`«${file.name}»: файл порожній.`);
        continue;
      }
      if (file.size > MAX_FILE_BYTES) {
        messages.push(`«${file.name}»: файл більший за ${formatBytes(MAX_FILE_BYTES)}.`);
        continue;
      }
      if (accepted.some((it) => it.name === file.name && it.size === file.size)) {
        messages.push(`«${file.name}»: цей файл уже додано.`);
        continue;
      }
      if (accepted.length >= MAX_FILES) {
        messages.push(`Можна додати не більше ${MAX_FILES} файлів.`);
        break;
      }
      if (total + file.size > MAX_TOTAL_BYTES) {
        messages.push(`«${file.name}»: перевищено загальний ліміт ${formatBytes(MAX_TOTAL_BYTES)}.`);
        continue;
      }
      const controller = new AbortController();
      const item: FileItem = {
        key: newKey(),
        name: file.name,
        size: file.size,
        status: 'uploading',
        progress: 0,
        controller,
      };
      accepted = [...accepted, item];
      total += file.size;
      toUpload.push({ item, file });
    }

    setFileMessages(messages);
    if (toUpload.length) {
      setFiles((list) => [...list, ...toUpload.map((t) => t.item)]);
      setErrors((e) => ({ ...e, files: undefined }));
      for (const { item, file } of toUpload) void uploadOne(item.key, file, item.controller!);
    }
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const dropFile = (item: FileItem) => {
    item.controller?.abort();
    setFiles((list) => list.filter((it) => it.key !== item.key));
    setFileMessages([]);
    if (item.fileId && sessionInfoRef.current) void removeFile(sessionInfoRef.current, item.fileId);
  };

  // ---------- Надсилання ----------
  const focusField = (name: string) => {
    const idMap: Record<string, string> = { contactMethod: 'f-contactMethod-telegram' };
    const el = document.getElementById(idMap[name] ?? `f-${name}`);
    el?.focus();
  };

  useEffect(() => {
    if (focusAfterErrors.current && Object.keys(errors).length) {
      focusAfterErrors.current = false;
      const first = FIELD_ORDER.find((n) => errors[n]);
      if (first) focusField(first);
    }
  }, [errors]);

  const errorList = useMemo(
    () => FIELD_ORDER.filter((n) => errors[n]).map((n) => ({ name: n, message: errors[n]! })),
    [errors],
  );

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingRef.current) return;
    setBanner(null);

    const parsed = validateRequest({
      service: values.service,
      workType: values.workType || null,
      discipline: values.discipline || undefined,
      disciplineOther: values.disciplineOther,
      topic: values.topic,
      topicUnknown: values.topicUnknown,
      deadline: values.deadline || undefined,
      pages: values.pages.trim() === '' ? null : Number(values.pages),
      contactMethod: values.contactMethod || undefined,
      contact: values.contact,
      comment: values.comment,
      privacyConsent: values.privacyConsent ? true : undefined,
      honeypot: values.honeypot,
    });

    if (!parsed.success) {
      setErrors(parsed.errors);
      focusAfterErrors.current = true;
      track('request_submit_error', { placement: 'form', errorCode: 'validation' });
      return;
    }

    if (files.some((it) => it.status === 'uploading')) {
      setBanner({ kind: 'files', text: 'Зачекайте, поки завантажаться файли, і надішліть заявку ще раз.' });
      return;
    }
    if (files.some((it) => it.status === 'error')) {
      setBanner({ kind: 'files', text: f.states.fileError + ' Видаліть позначені файли або замініть їх.' });
      return;
    }

    const data = parsed.data;
    const fileIds = files.map((it) => it.fileId!).filter(Boolean);
    const payload = {
      ...data,
      contact: normalizeContact(data.contactMethod, data.contact),
      pages: data.pages ?? null,
      uploadSessionId: fileIds.length ? sessionInfoRef.current?.sessionId : undefined,
      uploadSecret: fileIds.length ? sessionInfoRef.current?.secret : undefined,
      fileIds,
      utm: readUtm(),
    };
    const sig = JSON.stringify(payload);
    // Той самий Idempotency-Key для повтору тієї самої заявки; нові дані — новий ключ
    if (!idemRef.current || idemRef.current.sig !== sig) idemRef.current = { sig, key: newKey() };

    submittingRef.current = true;
    setSubmitting(true);
    setErrors({});
    try {
      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Idempotency-Key': idemRef.current.key },
        body: sig,
      });
      if (res.status === 201 || res.status === 200) {
        const body = (await res.json()) as { reference: string };
        track('request_submit_success', { placement: 'form', service: data.service });
        router.push(`/diakuiemo?ref=${encodeURIComponent(body.reference)}`);
        return; // submitting лишається true до переходу — захист від повторного натискання
      }
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After'));
        const text = Number.isFinite(retry) && retry > 0 ? `${f.states.rateLimit} Спробуйте приблизно через ${retry} с.` : f.states.rateLimit;
        setBanner({ kind: 'rate', text });
        track('request_submit_error', { placement: 'form', errorCode: '429' });
      } else if (res.status === 422 || res.status === 400) {
        const body = await res.json().catch(() => ({}));
        if (body.errors) {
          setErrors(body.errors as FieldErrors);
          focusAfterErrors.current = true;
        }
        setBanner({ kind: 'server', text: body.message ?? f.states.validationError });
        track('request_submit_error', { placement: 'form', errorCode: String(res.status) });
      } else {
        setBanner({ kind: 'network', text: f.states.networkError });
        track('request_submit_error', { placement: 'form', errorCode: String(res.status) });
      }
    } catch {
      setBanner({ kind: 'network', text: f.states.networkError });
      track('request_submit_error', { placement: 'form', errorCode: 'network' });
    }
    submittingRef.current = false;
    setSubmitting(false);
  };

  const showOther = values.discipline === 'other';
  const contactMethod = values.contactMethod;

  const err = (name: string) => errors[name];
  const describe = (name: string, hint?: string) =>
    [err(name) ? `${name}-error` : null, hint ?? null].filter(Boolean).join(' ') || undefined;
  const errorMsg = (name: string) =>
    err(name) ? (
      <p id={`${name}-error`} className="field-error">
        <Icon name="warning" />
        <span>{err(name)}</span>
      </p>
    ) : null;

  return (
    <form
      ref={formRef}
      className="request-form"
      noValidate
      aria-busy={submitting}
      onSubmit={onSubmit}
      onFocus={onStart}
    >
      {errorList.length > 0 && (
        <div ref={summaryRef} className="form-summary field--wide" role="alert">
          <Icon name="warning" />
          <div>
            <strong>{f.states.validationError}</strong>
            <ul>
              {errorList.map((item) => (
                <li key={item.name}>
                  <a
                    href={`#f-${item.name}`}
                    onClick={(ev) => {
                      ev.preventDefault();
                      focusField(item.name);
                    }}
                  >
                    {FIELD_LABELS[item.name] ?? item.name}
                  </a>
                  : {item.message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      {banner && (
        <div className="form-alert field--wide" role="alert">
          <Icon name="warning" />
          <p>{banner.text}</p>
        </div>
      )}

      <div className="field">
        <label htmlFor="f-service">{f.fields.service}</label>
        <Select
          id="f-service"
          name="service"
          value={values.service}
          invalid={!!err('service')}
          describedBy={describe('service')}
          items={content.serviceOptions}
          onChange={(v) => {
            set('service', v as Service);
            track('service_select', { placement: 'form', service: v });
          }}
        />
        {errorMsg('service')}
      </div>

      <div className="field field--wide">
        <label htmlFor="f-workType">
          Вид роботи <span className="optional">({f.optional.toLowerCase()})</span>
        </label>
        <Select
          id="f-workType"
          name="workType"
          value={values.workType}
          items={workTypeItems}
          onChange={(v) => set('workType', v)}
        />
      </div>

      <div className="field">
        <label htmlFor="f-discipline">{f.fields.discipline}</label>
        <Select
          id="f-discipline"
          name="discipline"
          value={values.discipline}
          placeholder="Оберіть дисципліну"
          invalid={!!err('discipline')}
          describedBy={describe('discipline')}
          items={DISCIPLINES.map((d) => ({ value: d, label: DISCIPLINE_LABELS[d] }))}
          onChange={(v) => set('discipline', v)}
        />
        {errorMsg('discipline')}
      </div>

      {showOther && (
        <div className="field field--wide">
          <label htmlFor="f-disciplineOther">Вкажіть дисципліну</label>
          <input
            id="f-disciplineOther"
            name="disciplineOther"
            type="text"
            maxLength={120}
            autoComplete="off"
            value={values.disciplineOther}
            aria-invalid={!!err('disciplineOther')}
            aria-describedby={describe('disciplineOther')}
            onChange={(e) => set('disciplineOther', e.target.value)}
          />
          {errorMsg('disciplineOther')}
        </div>
      )}

      <div className="field field--wide">
        <label htmlFor="f-topic">{f.fields.topic}</label>
        <input
          id="f-topic"
          name="topic"
          type="text"
          maxLength={500}
          autoComplete="off"
          placeholder="Вкажіть тему або коротко опишіть завдання"
          value={values.topic}
          aria-invalid={!!err('topic')}
          aria-describedby={describe('topic')}
          onChange={(e) => set('topic', e.target.value)}
        />
        {errorMsg('topic')}
        <label className="check">
          <input
            id="f-topicUnknown"
            type="checkbox"
            checked={values.topicUnknown}
            onChange={(e) => {
              set('topicUnknown', e.target.checked);
              if (e.target.checked) setErrors((er) => ({ ...er, topic: undefined }));
            }}
          />
          <span>{f.fields.topicUnknown}</span>
        </label>
      </div>

      <div className="field">
        <label htmlFor="f-deadline">{f.fields.deadline}</label>
        <DatePicker
          id="f-deadline"
          name="deadline"
          min={minDate}
          value={values.deadline}
          invalid={!!err('deadline')}
          describedBy={describe('deadline')}
          onChange={(v) => set('deadline', v)}
        />
        {errorMsg('deadline')}
      </div>

      <div className="field">
        <label htmlFor="f-pages">
          {f.fields.pages} <span className="optional">({f.optional.toLowerCase()})</span>
        </label>
        <input
          id="f-pages"
          name="pages"
          type="number"
          inputMode="numeric"
          min={1}
          max={500}
          value={values.pages}
          aria-invalid={!!err('pages')}
          aria-describedby={describe('pages')}
          onChange={(e) => set('pages', e.target.value)}
        />
        {errorMsg('pages')}
      </div>

      <fieldset className="field segmented field--wide" aria-describedby={describe('contactMethod')}>
        <legend>{f.fields.contactMethod}</legend>
        {CONTACT_METHODS.map((m) => (
          <label key={m}>
            <input
              id={`f-contactMethod-${m}`}
              type="radio"
              name="contactMethod"
              value={m}
              checked={values.contactMethod === m}
              onChange={() => {
                set('contactMethod', m);
                setErrors((er) => ({ ...er, contact: undefined }));
              }}
            />
            {CONTACT_LABELS[m]}
          </label>
        ))}
        {errorMsg('contactMethod')}
      </fieldset>

      <div className="field field--wide">
        <label htmlFor="f-contact">{f.fields.contact}</label>
        <input
          id="f-contact"
          name="contact"
          type={contactMethod === 'email' ? 'email' : contactMethod === 'phone' ? 'tel' : 'text'}
          autoComplete={contactMethod === 'email' ? 'email' : contactMethod === 'phone' ? 'tel' : 'off'}
          maxLength={254}
          placeholder={contactMethod ? CONTACT_PLACEHOLDERS[contactMethod] : 'Спочатку оберіть спосіб зв’язку'}
          value={values.contact}
          aria-invalid={!!err('contact')}
          aria-describedby={describe('contact')}
          onChange={(e) => set('contact', e.target.value)}
        />
        {errorMsg('contact')}
      </div>

      <div className="field field--wide">
        <label htmlFor="f-comment">
          {f.fields.comment} <span className="optional">({f.optional.toLowerCase()})</span>
        </label>
        <textarea
          id="f-comment"
          name="comment"
          maxLength={3000}
          value={values.comment}
          aria-invalid={!!err('comment')}
          aria-describedby={describe('comment')}
          onChange={(e) => set('comment', e.target.value)}
        />
        {errorMsg('comment')}
      </div>

      <div className="field field--wide">
        <span className="field-label" id="files-label">
          {f.fields.files} <span className="optional">({f.optional.toLowerCase()})</span>
        </span>
        <input
          ref={fileInputRef}
          id="f-files-input"
          type="file"
          multiple
          accept={ACCEPT_ATTR}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(e) => addFiles(e.target.files)}
        />
        <button
          type="button"
          id="f-files"
          className="dropzone"
          aria-describedby="files-hint"
          aria-labelledby="files-label"
          onClick={() => fileInputRef.current?.click()}
        >
          <span className="icon-circle" aria-hidden="true">
            <Icon name="paperclip" />
          </span>
          <span>
            <strong>Додати файли</strong>
            <span className="field-hint">PDF, DOCX, PNG, JPG</span>
          </span>
        </button>
        <p id="files-hint" className="field-hint">
          {FILE_HINT}
        </p>
        {fileMessages.length > 0 && (
          <ul className="field-error-list" role="alert">
            {fileMessages.map((m) => (
              <li key={m} className="field-error">
                <Icon name="warning" />
                <span>{m}</span>
              </li>
            ))}
          </ul>
        )}
        {files.length > 0 && (
          <ul className="file-list" aria-label="Додані файли">
            {files.map((it) => (
              <li key={it.key} className={`file-item${it.status === 'error' ? ' file-item--error' : ''}`}>
                <div>
                  <div className="file-item__name">{it.name}</div>
                  <div className="file-item__meta">
                    {formatBytes(it.size)} ·{' '}
                    {it.status === 'done' ? 'Завантажено' : it.status === 'uploading' ? `Завантаження ${it.progress}%` : 'Помилка'}
                  </div>
                  {it.error && <div className="field-error">{it.error}</div>}
                </div>
                <button type="button" className="icon-btn" onClick={() => dropFile(it)}>
                  <Icon name="close" />
                  <span className="sr-only">Видалити файл {it.name}</span>
                </button>
                {it.status === 'uploading' && <progress max={100} value={it.progress} aria-label={`Завантаження ${it.name}`} />}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="check-row field--wide">
        <label className="check">
          <input
            id="f-privacyConsent"
            name="privacyConsent"
            type="checkbox"
            checked={values.privacyConsent}
            aria-invalid={!!err('privacyConsent')}
            aria-describedby={describe('privacyConsent')}
            onChange={(e) => set('privacyConsent', e.target.checked)}
          />
          <span>
            Я ознайомився/-лася з{' '}
            <Link href="/privacy" target="_blank">
              політикою конфіденційності
            </Link>{' '}
            та погоджуюся на обробку даних для розгляду заявки.
          </span>
        </label>
        {errorMsg('privacyConsent')}
      </div>

      {/* Антиспам-приманка: поза екраном, недоступна з клавіатури та скрінрідерам */}
      <div className="hp-field" aria-hidden="true">
        <label>
          Не заповнюйте це поле
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={values.honeypot}
            onChange={(e) => set('honeypot', e.target.value)}
          />
        </label>
      </div>

      <button type="submit" className="btn btn-primary btn-block field--wide" disabled={submitting}>
        {submitting ? (
          <>
            <span className="spinner" aria-hidden="true" />
            {f.states.pending}
          </>
        ) : banner?.kind === 'network' ? (
          <>
            <Icon name="refresh" />
            Спробувати ще раз
          </>
        ) : (
          <>
            {f.submit}
            <Icon name="arrow-right" />
          </>
        )}
      </button>
      <div className="sr-only" role="status" aria-live="polite">
        {submitting ? f.states.pending : ''}
      </div>
    </form>
  );
}
