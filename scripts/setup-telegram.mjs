// Налаштування Telegram-сповіщень менеджеру. Запуск: npm run setup:telegram
// Токен вводиться в терміналі (приховано), перевіряється через Telegram API і пишеться лише у локальний .env.
import fs from 'node:fs';
import readline from 'node:readline';

const ENV_PATH = process.env.ENV_PATH ?? '.env';
const tty = Boolean(process.stdin.isTTY);
const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: tty });
let muted = false;
let prompt = '';
const origWrite = rl._writeToOutput ? rl._writeToOutput.bind(rl) : (s) => rl.output.write(s);
rl._writeToOutput = (str) => {
  if (!muted) return origWrite(str);
  if (/[\r\n]/.test(str) || str.startsWith(prompt)) return rl.output.write(str);
  return rl.output.write('*');
};
const queue = [];
const waiters = [];
let closed = false;
if (!tty) {
  rl.on('line', (line) => (waiters.length ? waiters.shift()(line) : queue.push(line)));
}
rl.on('close', () => {
  closed = true;
  waiters.splice(0).forEach((w) => w(''));
});

function ask(query, { secret = false, def = '' } = {}) {
  return new Promise((resolve) => {
    prompt = def ? `${query} [${def}]: ` : `${query}: `;
    const done = (a) => resolve((a.trim() || def).trim());
    if (!tty) {
      console.log(prompt);
      return queue.length ? done(queue.shift()) : closed ? done('') : waiters.push(done);
    }
    muted = secret;
    rl.question(prompt, (a) => {
      muted = false;
      done(a);
    });
  });
}

async function tg(token, method, body) {
  const res = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body ?? {}),
  });
  const data = await res.json().catch(() => ({}));
  if (!data.ok) throw new Error(`${method}: ${data.description ?? `HTTP ${res.status}`}`);
  return data.result;
}

console.log('Налаштування Telegram-сповіщень для ЗалікОк.\n');
console.log('1) У Telegram знайдіть @BotFather → /newbot → задайте назву й username бота → скопіюйте токен.');
console.log('2) Відкрийте свого бота і натисніть Start (або додайте бота в групу менеджерів і напишіть там будь-яке повідомлення).\n');

const token = await ask('Токен бота (прихований)', { secret: true });
if (!token) {
  console.log('Токен не введено, вихід.');
  rl.close();
  process.exit(0);
}

let me;
try {
  me = await tg(token, 'getMe');
} catch (e) {
  console.log(`Не вдалося перевірити токен: ${e.message}`);
  rl.close();
  process.exit(1);
}
console.log(`Бот знайдено: @${me.username}`);

let updates = [];
try {
  updates = await tg(token, 'getUpdates', { limit: 100, allowed_updates: ['message', 'my_chat_member'] });
} catch (e) {
  console.log(`getUpdates: ${e.message}`);
}
const chats = new Map();
for (const u of updates) {
  const c = u.message?.chat ?? u.my_chat_member?.chat;
  // Не пропонуємо самого бота (його id = число перед двокрапкою в токені) та інших ботів
  if (c && c.id !== me.id && !(c.type === 'private' && u.message?.from?.is_bot)) chats.set(String(c.id), c);
}

let chatId = '';
if (chats.size === 0) {
  console.log('\nЧатів не знайдено: напишіть боту /start (або у групі з ботом будь-яке повідомлення) і запустіть скрипт ще раз.');
  chatId = await ask('Або введіть chat id вручну (Enter, щоб вийти)');
  if (!chatId) {
    rl.close();
    process.exit(0);
  }
} else {
  const list = [...chats.values()];
  console.log('\nЗнайдені чати:');
  list.forEach((c, i) => console.log(`  ${i + 1}) ${c.type === 'private' ? 'особистий' : c.type}: ${c.title ?? c.first_name ?? ''} (id ${c.id})`));
  const pick = Number(await ask('Який чат отримуватиме сповіщення? номер', { def: '1' }));
  chatId = String(list[pick - 1]?.id ?? '');
  if (!chatId) {
    console.log('Невірний вибір.');
    rl.close();
    process.exit(1);
  }
}

if (chatId === String(me.id)) {
  console.log(
    '\nЦе id самого бота (число перед двокрапкою в токені). Потрібен id вашого чату з ботом: відкрийте бота зі СВОГО акаунта, ' +
      'натисніть Start, напишіть будь-яке повідомлення й запустіть скрипт ще раз.',
  );
  rl.close();
  process.exit(1);
}

try {
  await tg(token, 'sendMessage', { chat_id: chatId, text: 'ЗалікОк: тестове сповіщення. Підключення працює ✅' });
  console.log('\nТестове повідомлення надіслано. Перевірте Telegram.');
} catch (e) {
  console.log(`\nНе вдалося надіслати: ${e.message}`);
  rl.close();
  process.exit(1);
}

const dev = (await ask('Надсилати сповіщення і під час `npm run dev` (для тесту)? y/n', { def: 'y' })).toLowerCase().startsWith('y');

const set = {
  TELEGRAM_BOT_TOKEN: token,
  TELEGRAM_MANAGER_CHAT_ID: chatId,
  NOTIFICATIONS_ENABLED: 'true',
  ALLOW_DEV_NOTIFICATIONS: dev ? 'true' : 'false',
};
const current = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
if (current) fs.writeFileSync(`${ENV_PATH}.backup`, current);
const kept = current.split(/\r?\n/).filter((l) => !Object.keys(set).some((k) => l.startsWith(`${k}=`)));
while (kept.length && kept[kept.length - 1] === '') kept.pop();
kept.push('', '# --- Telegram (создано scripts/setup-telegram.mjs) ---', ...Object.entries(set).map(([k, v]) => `${k}=${v}`), '');
fs.writeFileSync(ENV_PATH, kept.join('\n'));
rl.close();
console.log(`\nГотово: записано в ${ENV_PATH}. Токен на екран не виводився. Перезапустіть сайт, щоб застосувати зміни.`);
