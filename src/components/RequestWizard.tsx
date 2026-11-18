'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { DatePicker } from './ui/DatePicker';
import { Select, type SelectItem } from './ui/Select';
import { content } from '@/lib/content';
import { calculate, getTariff } from '@/lib/calc';
import {
  COMPLEXITY_OPTIONS,
  QUALITY_OPTIONS,
  REVISION_OPTIONS,
  defaultVariant,
  extrasFor,
  mapsToPages,
  qtyConfig,
} from '@/lib/estimate';
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
  qty: string;
  complexity: string;
  quality: string;
  variant: string;
  revisionMode: '' | 'proof' | 'content';
  sourceQty: string;
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

const STEPS = [
  { id: 1, label: 'Робота' },
  { id: 2, label: 'Деталі' },
  { id: 3, label: 'Контакт' },
] as const;

const STEP_FIELDS: Record<number, string[]> = {
  1: ['workType', 'discipline', 'disciplineOther', 'topic', 'deadline', 'pages'],
  2: ['service', 'comment', 'files'],
  3: ['contactMethod', 'contact', 'privacyConsent'],
};
const FIELD_ORDER = [...STEP_FIELDS[1]!, ...STEP_FIELDS[2]!, ...STEP_FIELDS[3]!];

const FIELD_LABELS: Record<string, string> = {
  workType: 'Вид роботи',
  service: 'Формат допомоги',
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

const FOCUS_IDS: Record<string, string> = { contactMethod: 'f-contactMethod-telegram' };

const workTypeItems: SelectItem[] = [
  ...prices.groups.map((g) => ({ label: g.title, options: g.items.map((i) => ({ value: i.id, label: i.title })) })),
  { label: 'Інше', options: [{ value: 'other', label: 'Інша робота (немає у списку)' }] },
];

const fmtMoney = (n: number) => `${new Intl.NumberFormat('uk-UA').format(n).replace(/\s/g, ' ')} грн`;

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

const newKey = () => crypto.randomUUID();

export interface WizardInitial {
  service?: string;
  workType?: string;
  qty?: string;
  deadline?: string;
  comment?: string;
  complexity?: string;
  variant?: string;
  revisionMode?: string;
  quality?: string;
  sourceQty?: string;
}

export function RequestWizard({ initial = {}, telegram = null }: { initial?: WizardInitial; telegram?: string | null }) {
  const f = content.form;
  const router = useRouter();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const initType = findPrice(initial.workType) || initial.workType === 'other' ? initial.workType! : '';
  const initCfg = qtyConfig(initType);

  const [values, setValues] = useState<Values>({
    service: isService(initial.service) ? initial.service : 'research-support',
    workType: initType,
    discipline: '',
    disciplineOther: '',
    topic: '',
    topicUnknown: false,
    deadline: initial.deadline ?? '',
    qty: initial.qty ?? (initCfg ? String(initCfg.def) : ''),
    complexity: initial.complexity ?? 'basic',
    quality: initial.quality ?? 'good',
    variant: initial.variant ?? defaultVariant(initType),
    revisionMode: initial.revisionMode === 'proof' || initial.revisionMode === 'content' ? initial.revisionMode : '',
    sourceQty: initial.sourceQty ?? '',
    contactMethod: '',
    contact: '',
    comment: initial.comment ?? '',
    privacyConsent: false,
    honeypot: '',
  });
  const [step, setStep] = useState(1);
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
  const pendingFocus = useRef<string | 'title' | null>(null);

  useEffect(() => {
    filesRef.current = files;
  }, [files]);

  const set = <K extends keyof Values>(key: K, value: Values[K]) => {
    setValues((v) => ({ ...v, [key]: value }));
    const errKey = key === 'qty' ? 'pages' : (key as string);
    if (errors[errKey]) setErrors((e) => ({ ...e, [errKey]: undefined }));
  };

  const onStart = () => {
    if (startedRef.current) return;
    startedRef.current = true;
    track('request_start', { placement: 'wizard', service: values.service });
  };

  // ---------- Орієнтовна ціна ----------
  const cfg = qtyConfig(values.workType);
  const extras = extrasFor(values.workType);
  const estimate = useMemo(() => {
    if (!values.workType) return { status: 'incomplete' as const, reason: 'Оберіть вид роботи, щоб побачити орієнтовну ціну.' };
    if (values.workType === 'other')
      return { status: 'manual' as const, reason: 'Вид роботи, якого немає у прайсі: вартість оцінює менеджер.' };
    return calculate({
      typeId: values.workType,
      qty: values.qty.trim() === '' ? undefined : Number(values.qty),
      complexity: values.complexity,
      quality: values.quality,
      variant: values.variant,
      revisionMode: values.revisionMode || undefined,
      sourceQty: values.sourceQty.trim() === '' ? undefined : Number(values.sourceQty),
      deadline: values.deadline || undefined,
    });
  }, [values]);

  const changeWorkType = (type: string) => {
    const c = qtyConfig(type);
    setValues((v) => ({
      ...v,
      workType: type,
      qty: c ? String(c.def) : v.qty,
      complexity: 'basic',
      quality: 'good',
      variant: defaultVariant(type),
      revisionMode: '',
      sourceQty: '',
    }));
    setErrors((e) => ({ ...e, workType: undefined, pages: undefined }));
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
      const item: FileItem = { key: newKey(), name: file.name, size: file.size, status: 'uploading', progress: 0, controller };
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

  // ---------- Валідація й кроки ----------
  const buildInput = () => {
    const n = values.qty.trim() === '' ? null : Number(values.qty);
    const pages = mapsToPages(values.workType) || !qtyConfig(values.workType) ? n : null;
    return {
      service: values.service,
      workType: values.workType || null,
      discipline: values.discipline || undefined,
      disciplineOther: values.disciplineOther,
      topic: values.topic,
      topicUnknown: values.topicUnknown,
      deadline: values.deadline || undefined,
      pages,
      contactMethod: values.contactMethod || undefined,
      contact: values.contact,
      comment: values.comment,
      privacyConsent: values.privacyConsent ? true : undefined,
      honeypot: values.honeypot,
    };
  };

  /** Усі помилки форми (схема + правила кроку 1). */
  const collectErrors = (): { errors: FieldErrors; data?: ReturnType<typeof validateRequest> } => {
    const parsed = validateRequest(buildInput());
    const errs: FieldErrors = parsed.success ? {} : { ...parsed.errors };
    if (!values.workType) errs.workType = 'Оберіть вид роботи.';
    if (cfg && !errs.pages) {
      const n = Number(values.qty);
      if (values.qty.trim() === '') errs.pages = 'Вкажіть обсяг.';
      else if (!Number.isInteger(n) || n < cfg.min || n > cfg.max) errs.pages = `Вкажіть значення від ${cfg.min} до ${cfg.max}.`;
    }
    return { errors: errs, data: parsed };
  };

  const goToStep = (n: number, focus: string | 'title' = 'title') => {
    pendingFocus.current = focus;
    setStep(n);
  };

  useEffect(() => {
    const target = pendingFocus.current;
    if (!target) return;
    pendingFocus.current = null;
    const el = target === 'title' ? titleRef.current : document.getElementById(FOCUS_IDS[target] ?? `f-${target}`);
    el?.focus();
  }, [step, errors]);

  const stepErrors = (n: number, all: FieldErrors): FieldErrors => {
    const out: FieldErrors = {};
    for (const k of STEP_FIELDS[n]!) if (all[k]) out[k] = all[k];
    return out;
  };

  const next = () => {
    const { errors: all } = collectErrors();
    const mine = stepErrors(step, all);
    if (Object.keys(mine).length) {
      setErrors(mine);
      pendingFocus.current = FIELD_ORDER.find((k) => mine[k]) ?? null;
      track('request_submit_error', { placement: 'wizard', errorCode: `step${step}` });
      return;
    }
    setErrors({});
    setBanner(null);
    goToStep(step + 1);
  };

  const back = () => {
    setErrors({});
    setBanner(null);
    goToStep(Math.max(1, step - 1));
  };

  const submit = async () => {
    if (submittingRef.current) return;
    setBanner(null);
    const { errors: all, data } = collectErrors();
    if (Object.keys(all).length) {
      // Переходимо на перший крок із помилками
      const badStep = [1, 2, 3].find((n) => Object.keys(stepErrors(n, all)).length) ?? step;
      const mine = stepErrors(badStep, all);
      setErrors(mine);
      pendingFocus.current = FIELD_ORDER.find((k) => mine[k]) ?? null;
      if (badStep !== step) setStep(badStep);
      track('request_submit_error', { placement: 'wizard', errorCode: 'validation' });
      return;
    }
    if (files.some((it) => it.status === 'uploading')) {
      setBanner({ kind: 'files', text: 'Зачекайте, поки завантажаться файли, і надішліть заявку ще раз.' });
      return;
    }
    if (files.some((it) => it.status === 'error')) {
      setBanner({ kind: 'files', text: f.states.fileError + ' Видаліть позначені файли або замініть їх.' });
      goToStep(2);
      return;
    }
    if (!data || !data.success) return;

    const parsed = data.data;
    const fileIds = files.map((it) => it.fileId!).filter(Boolean);
    const qtyNum = values.qty.trim() === '' ? undefined : Number(values.qty);
    const payload = {
      ...parsed,
      contact: normalizeContact(parsed.contactMethod, parsed.contact),
      pages: parsed.pages ?? null,
      estimate: {
        qty: qtyNum && Number.isInteger(qtyNum) ? qtyNum : undefined,
        complexity: extras.complexity ? values.complexity : undefined,
        quality: extras.quality ? values.quality : undefined,
        variant: extras.variant ? values.variant || undefined : undefined,
        revisionMode: extras.revision ? values.revisionMode || undefined : undefined,
        sourceQty: extras.source && values.sourceQty.trim() !== '' ? Number(values.sourceQty) : undefined,
      },
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
        track('request_submit_success', { placement: 'wizard', service: parsed.service });
        router.push(`/diakuiemo?ref=${encodeURIComponent(body.reference)}`);
        return; // submitting лишається true до переходу — захист від повторного натискання
      }
      if (res.status === 429) {
        const retry = Number(res.headers.get('Retry-After'));
        const text =
          Number.isFinite(retry) && retry > 0 ? `${f.states.rateLimit} Спробуйте приблизно через ${retry} с.` : f.states.rateLimit;
        setBanner({ kind: 'rate', text });
        track('request_submit_error', { placement: 'wizard', errorCode: '429' });
      } else if (res.status === 422 || res.status === 400) {
        const body = await res.json().catch(() => ({}));
        if (body.errors) {
          const serverErrors = body.errors as FieldErrors;
          const badStep = [1, 2, 3].find((n) => Object.keys(stepErrors(n, serverErrors)).length) ?? step;
          const mine = stepErrors(badStep, serverErrors);
          setErrors(mine);
          pendingFocus.current = FIELD_ORDER.find((k) => mine[k]) ?? null;
          if (badStep !== step) setStep(badStep);
        }
        setBanner({ kind: 'server', text: body.message ?? f.states.validationError });
        track('request_submit_error', { placement: 'wizard', errorCode: String(res.status) });
      } else {
        setBanner({ kind: 'network', text: f.states.networkError });
        track('request_submit_error', { placement: 'wizard', errorCode: String(res.status) });
      }
    } catch {
      setBanner({ kind: 'network', text: f.states.networkError });
      track('request_submit_error', { placement: 'wizard', errorCode: 'network' });
    }
    submittingRef.current = false;
    setSubmitting(false);
  };

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (step < 3) next();
    else void submit();
  };

  // ---------- Розмітка ----------
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

  const errorList = FIELD_ORDER.filter((n) => errors[n]).map((n) => ({ name: n, message: errors[n]! }));
  const focusField = (name: string) => document.getElementById(FOCUS_IDS[name] ?? `f-${name}`)?.focus();

  const primaryLabel =
    step < 3
      ? 'Далі'
      : submitting
        ? f.states.pending
        : banner?.kind === 'network'
          ? 'Спробувати ще раз'
          : f.submit;
  const primaryContent =
    step < 3 ? (
      <>
        {primaryLabel}
        <Icon name="arrow-right" />
      </>
    ) : submitting ? (
      <>
        <span className="spinner" aria-hidden="true" />
        {primaryLabel}
      </>
    ) : banner?.kind === 'network' ? (
      <>
        <Icon name="refresh" />
        {primaryLabel}
      </>
    ) : (
      <>
        {primaryLabel}
        <Icon name="arrow-right" />
      </>
    );

  const shortPrice =
    estimate.status === 'ok' ? `від ${fmtMoney(estimate.total)}`.replace('від ', '≈ ') : estimate.status === 'manual' ? 'оцінка менеджера' : '—';

  const qtyN = parseInt(values.qty, 10);
  const stepQty = (dir: 1 | -1) => {
    const c = cfg ?? { step: 1, min: 1, max: 500, def: 10 };
    const base = Number.isFinite(qtyN) ? qtyN : dir === 1 ? c.def - c.step : c.def + c.step;
    const nextVal = Math.min(c.max, Math.max(c.min, base + dir * c.step));
    set('qty', String(nextVal));
  };

  const showOther = values.discipline === 'other';
  const tariff = getTariff(values.workType);
  const tariffNote = tariff && tariff.kind === 'pages' ? tariff.note : undefined;

  return (
    <div className="wizard-layout">
      <form className="wizard" noValidate aria-busy={submitting} onSubmit={onSubmit} onFocus={onStart}>
        <ol className="wizard-steps" aria-label="Кроки заявки">
          {STEPS.map((s) => (
            <li key={s.id}>
              <button
                type="button"
                className="wizard-steps__btn"
                data-state={s.id < step ? 'done' : s.id === step ? 'current' : 'todo'}
                aria-current={s.id === step ? 'step' : undefined}
                disabled={s.id > step}
                onClick={() => s.id < step && goToStep(s.id)}
              >
                <span className="wizard-steps__num" aria-hidden="true">
                  {s.id < step ? <Icon name="check" /> : s.id}
                </span>
                <span className="wizard-steps__label">
                  <span className="sr-only">Крок {s.id}: </span>
                  {s.label}
                </span>
              </button>
            </li>
          ))}
        </ol>
        <div className="wizard-progress" aria-hidden="true">
          <span style={{ width: `${(step / 3) * 100}%` }} />
        </div>

        {errorList.length > 0 && (
          <div className="form-summary" role="alert">
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
          <div className="form-alert" role="alert">
            <Icon name="warning" />
            <p>{banner.text}</p>
          </div>
        )}

        <h2 id="step-title" ref={titleRef} tabIndex={-1} className="wizard-title">
          {step === 1 && 'Яка робота'}
          {step === 2 && 'Деталі'}
          {step === 3 && 'Куди надіслати відповідь'}
        </h2>

        {step === 1 && (
          <div className="wizard-grid">
            <div className="field field--wide">
              <label htmlFor="f-workType">Вид роботи</label>
              <Select
                id="f-workType"
                name="workType"
                value={values.workType}
                placeholder="Оберіть вид роботи"
                items={workTypeItems}
                invalid={!!err('workType')}
                describedBy={describe('workType')}
                onChange={changeWorkType}
              />
              {errorMsg('workType')}
            </div>

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
              <label htmlFor="f-pages">{cfg?.label ?? 'Орієнтовний обсяг, сторінок'}</label>
              <div className="stepper">
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label="Зменшити"
                  disabled={!!cfg && Number.isFinite(qtyN) && qtyN <= cfg.min}
                  onClick={() => stepQty(-1)}
                >
                  <span aria-hidden="true">−</span>
                </button>
                <input
                  id="f-pages"
                  name="qty"
                  type="number"
                  inputMode="numeric"
                  min={cfg?.min ?? 1}
                  max={cfg?.max ?? 500}
                  step={1}
                  value={values.qty}
                  aria-invalid={!!err('pages')}
                  aria-describedby={describe('pages')}
                  onChange={(e) => set('qty', e.target.value)}
                />
                <button
                  type="button"
                  className="stepper__btn"
                  aria-label="Збільшити"
                  disabled={!!cfg && Number.isFinite(qtyN) && qtyN >= cfg.max}
                  onClick={() => stepQty(1)}
                >
                  <span aria-hidden="true">+</span>
                </button>
              </div>
              {errorMsg('pages')}
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="wizard-grid">
            <div className="field field--wide">
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
                  track('service_select', { placement: 'wizard', service: v });
                }}
              />
              {errorMsg('service')}
            </div>

            {(extras.complexity || extras.variant || extras.revision || extras.quality || extras.source) && (
              <div className="wizard-sub field--wide">
                <p className="wizard-sub__title">Для орієнтовної ціни</p>
                {extras.revision && (
                  <div className="field">
                    <label htmlFor="f-revisionMode">Характер правок</label>
                    <Select
                      id="f-revisionMode"
                      value={values.revisionMode}
                      placeholder="Оберіть"
                      items={REVISION_OPTIONS}
                      onChange={(v) => set('revisionMode', v as Values['revisionMode'])}
                    />
                  </div>
                )}
                {extras.variant && (
                  <div className="field">
                    <label htmlFor="f-variant">{extras.variant.label}</label>
                    <Select
                      id="f-variant"
                      value={values.variant}
                      items={extras.variant.options.map((o) => ({ value: o.id, label: o.label }))}
                      onChange={(v) => set('variant', v)}
                    />
                  </div>
                )}
                {extras.complexity && (
                  <div className="field">
                    <label htmlFor="f-complexity">Складність</label>
                    <Select id="f-complexity" value={values.complexity} items={COMPLEXITY_OPTIONS} onChange={(v) => set('complexity', v)} />
                  </div>
                )}
                {extras.quality && (
                  <div className="field">
                    <label htmlFor="f-quality">Якість вихідних матеріалів</label>
                    <Select id="f-quality" value={values.quality} items={QUALITY_OPTIONS} onChange={(v) => set('quality', v)} />
                  </div>
                )}
                {extras.source && (
                  <div className="field">
                    <label htmlFor="f-sourceQty">{extras.source.label}</label>
                    <input
                      id="f-sourceQty"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={values.sourceQty}
                      onChange={(e) => set('sourceQty', e.target.value)}
                    />
                  </div>
                )}
              </div>
            )}

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
                  <span className="field-hint">Методичка, приклади, фото: PDF, DOCX, PNG, JPG</span>
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

            <div className="field field--wide">
              <label htmlFor="f-comment">
                {f.fields.comment} <span className="optional">({f.optional.toLowerCase()})</span>
              </label>
              <textarea
                id="f-comment"
                name="comment"
                maxLength={3000}
                placeholder="Вимоги керівника, вузу, що вже написано"
                value={values.comment}
                aria-invalid={!!err('comment')}
                aria-describedby={describe('comment')}
                onChange={(e) => set('comment', e.target.value)}
              />
              {errorMsg('comment')}
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="wizard-grid">
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
                type={values.contactMethod === 'email' ? 'email' : values.contactMethod === 'phone' ? 'tel' : 'text'}
                autoComplete={values.contactMethod === 'email' ? 'email' : values.contactMethod === 'phone' ? 'tel' : 'off'}
                maxLength={254}
                placeholder={values.contactMethod ? CONTACT_PLACEHOLDERS[values.contactMethod] : 'Спочатку оберіть спосіб зв’язку'}
                value={values.contact}
                aria-invalid={!!err('contact')}
                aria-describedby={describe('contact')}
                onChange={(e) => set('contact', e.target.value)}
              />
              {errorMsg('contact')}
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

            <p className="wizard-reassure field--wide">
              <Icon name="check-circle" />
              <span>Нічого не платите, поки не погодите ціну.</span>
            </p>
          </div>
        )}

        <div className="wizard-nav">
          {step > 1 && (
            <button type="button" className="btn btn-secondary" onClick={back} disabled={submitting}>
              <Icon name="arrow-left" />
              Назад
            </button>
          )}
          <button type="submit" className="btn btn-primary wizard-nav__primary" disabled={submitting}>
            {primaryContent}
          </button>
        </div>

        {/* Липка панель на телефоні: ціна, Telegram і головна дія */}
        <div className="wizard-bar">
          <div className="wizard-bar__price">
            <span>Орієнтовно</span>
            <strong>{shortPrice}</strong>
          </div>
          {telegram && (
            <a className="wizard-bar__tg" href={telegram} target="_blank" rel="noopener noreferrer">
              <Icon name="telegram" />
              <span className="sr-only">Написати в Telegram</span>
            </a>
          )}
          <button type="submit" className="btn btn-primary" disabled={submitting}>
            {primaryContent}
          </button>
        </div>

        <div className="sr-only" role="status" aria-live="polite">
          {submitting ? f.states.pending : `Крок ${step} з 3`}
        </div>
      </form>

      <aside className="estimate" aria-labelledby="estimate-title">
        <h2 id="estimate-title">Орієнтовна ціна</h2>
        <div role="status" aria-live="polite" className="estimate__body">
          {estimate.status === 'ok' && (
            <>
              <p className="estimate__price" data-testid="estimate-price">
                Орієнтовно {fmtMoney(estimate.total)}
              </p>
              <dl className="estimate__lines">
                {estimate.lines.map((l) => (
                  <div key={l.label}>
                    <dt>{l.label}</dt>
                    <dd>{fmtMoney(Math.round(l.amount))}</dd>
                  </div>
                ))}
              </dl>
              <p className="field-hint">
                Це стартова ціна{tariff ? '' : ''}. Звичайний строк для такого обсягу: близько {estimate.normalDays} дн.
              </p>
            </>
          )}
          {estimate.status === 'manual' && (
            <>
              <p className="estimate__price estimate__price--manual">Оцінка менеджером</p>
              <p className="field-hint">{estimate.reason}</p>
            </>
          )}
          {estimate.status === 'incomplete' && <p className="field-hint">{estimate.reason}</p>}
          {tariffNote && estimate.status !== 'incomplete' && <p className="field-hint">{tariffNote}</p>}
        </div>
        <p className="estimate__note">
          <Icon name="check-circle" />
          <span>Остаточну вартість менеджер погоджує до початку роботи. Нічого не платите, поки не погодите ціну.</span>
        </p>
      </aside>
    </div>
  );
}
