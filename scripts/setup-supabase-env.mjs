// Интерактивная настройка .env для Supabase. Запуск: npm run setup:supabase
// Значения вводятся в терминале (секреты скрыты) и пишутся только в локальный .env. Никуда не отправляются.
import fs from 'node:fs';
import readline from 'node:readline';

const ENV_PATH = process.env.ENV_PATH ?? '.env';
const DEFAULTS = { ref: 'srqynqtgvietqjijrzda', region: 'eu-west-2', poolerHost: 'aws-0-eu-west-2.pooler.supabase.com' };

// Один readline на весь сеанс (иначе при вводе из канала теряются строки)
const tty = Boolean(process.stdin.isTTY);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
let muted = false;
let currentPrompt = '';
const origWrite = rl._writeToOutput ? rl._writeToOutput.bind(rl) : (s) => rl.output.write(s);
rl._writeToOutput = (str) => {
  if (!muted) return origWrite(str);
  if (/[\r\n]/.test(str) || str.startsWith(currentPrompt)) return rl.output.write(str);
  return rl.output.write('*');
};
let closed = false;
rl.on('close', () => {
  closed = true;
});

// Для ввода из канала (не TTY) строки приходят пачкой — складываем их в очередь
const queue = [];
const waiters = [];
if (!tty) {
  rl.on('line', (line) => (waiters.length ? waiters.shift()(line) : queue.push(line)));
  rl.on('close', () => waiters.splice(0).forEach((w) => w('')));
}

function ask(query, { secret = false, def = '' } = {}) {
  return new Promise((resolve) => {
    currentPrompt = def ? `${query} [${def}]: ` : `${query}: `;
    const done = (answer) => resolve((answer.trim() || def).trim());
    if (!tty) {
      console.log(currentPrompt);
      return queue.length ? done(queue.shift()) : closed ? done('') : waiters.push(done);
    }
    muted = secret;
    rl.question(currentPrompt, (answer) => {
      muted = false;
      done(answer);
    });
  });
}

console.log('Настройка Supabase для ЗалікОк. Пустое значение пропускает пункт (оставит как есть).\n');

const ref = await ask('Project ref', { def: DEFAULTS.ref });
const host = await ask('Host пулера', { def: DEFAULTS.poolerHost });
const password = await ask('Пароль базы данных (скрыт)', { secret: true });

const set = {};
if (password) {
  const enc = encodeURIComponent(password);
  set.DATABASE_URL = `postgresql://postgres.${ref}:${enc}@${host}:6543/postgres`;
  set.DATABASE_SSL = 'verify';
  set.DIRECT_URL = `postgresql://postgres.${ref}:${enc}@${host}:5432/postgres?sslmode=require`;
}

const wantS3 = (await ask('Настроить файлы (S3)? y/n', { def: 'y' })).toLowerCase().startsWith('y');
if (wantS3) {
  const region = await ask('S3 Region', { def: DEFAULTS.region });
  const endpoint = await ask('S3 Endpoint', { def: `https://${ref}.storage.supabase.co/storage/v1/s3` });
  const bucket = await ask('Название bucket (приватного)');
  const keyId = await ask('Access key ID');
  const secret = await ask('Secret access key (скрыт)', { secret: true });
  if (bucket && keyId && secret) {
    Object.assign(set, {
      STORAGE_DRIVER: 's3',
      S3_ENDPOINT: endpoint,
      S3_REGION: region,
      S3_BUCKET: bucket,
      S3_ACCESS_KEY_ID: keyId,
      S3_SECRET_ACCESS_KEY: secret,
      S3_FORCE_PATH_STYLE: 'true',
    });
  } else {
    console.log('S3: не все поля заполнены, пункт пропущен.');
  }
}

if (Object.keys(set).length === 0) {
  console.log('Нечего записывать.');
  rl.close();
  process.exit(0);
}

const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
if (current) fs.writeFileSync(`${ENV_PATH}.backup`, current); // копия локальных настроек, чтобы вернуться к локальной БД
const kept = current.split(/\r?\n/).filter((l) => !Object.keys(set).some((k) => l.startsWith(`${k}=`)));
while (kept.length && kept[kept.length - 1] === '') kept.pop();
kept.push('', '# --- Supabase (создано scripts/setup-supabase-env.mjs) ---', ...Object.entries(set).map(([k, v]) => `${k}=${v}`), '');
fs.writeFileSync(ENV_PATH, kept.join('\n'));
rl.close();

console.log(`\nГотово: записано ${Object.keys(set).length} переменных в ${ENV_PATH}. Предыдущая версия: ${ENV_PATH}.backup`);
console.log('Секреты на экран не выводились. Скажите ассистенту «готово», и он применит миграции и проверит подключение.');
