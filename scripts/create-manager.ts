// Створення менеджера: ADMIN_EMAIL=... ADMIN_PASSWORD=... [ADMIN_ROLE=manager|admin] npm run admin:create
// Пароль передається лише змінною середовища процесу й не зберігається у файлах.
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { getAuth } from '../src/lib/server/auth';
import { prisma } from '../src/lib/server/db';

const email = process.env.ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.ADMIN_PASSWORD;
const role = process.env.ADMIN_ROLE ?? 'manager';
const name = process.env.ADMIN_NAME ?? 'Менеджер';

if (!email || !password) throw new Error('Потрібні ADMIN_EMAIL і ADMIN_PASSWORD');
if (password.length < 12) throw new Error('Пароль має містити щонайменше 12 символів');
if (!['manager', 'admin', 'user'].includes(role)) throw new Error('ADMIN_ROLE: manager | admin | user');

const ctx = await getAuth().$context;
const existing = await prisma.user.findUnique({ where: { email } });
const hash = await ctx.password.hash(password);

if (existing) {
  await prisma.account.updateMany({ where: { userId: existing.id, providerId: 'credential' }, data: { password: hash } });
  await prisma.user.update({ where: { id: existing.id }, data: { role } });
  await prisma.session.deleteMany({ where: { userId: existing.id } });
  console.log(`Оновлено користувача ${email} (роль ${role}); активні сесії скасовано.`);
} else {
  const id = randomUUID();
  await prisma.user.create({ data: { id, email, name, role, emailVerified: true } });
  await prisma.account.create({ data: { id: randomUUID(), accountId: id, providerId: 'credential', userId: id, password: hash } });
  console.log(`Створено користувача ${email} (роль ${role}).`);
}
await prisma.$disconnect();
