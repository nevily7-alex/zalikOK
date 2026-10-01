// Перевірка: у схемі public усі таблиці мають увімкнений RLS, а ролі anon/authenticated не мають прав.
// Запуск після кожної міграції: npm run db:check-rls
import 'dotenv/config';
import { prisma } from '../src/lib/server/db';

const noRls = await prisma.$queryRaw<{ tablename: string }[]>`
  SELECT c.relname AS tablename
  FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
  WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity`;

const grants = await prisma.$queryRaw<{ grantee: string; table_name: string; privilege_type: string }[]>`
  SELECT grantee, table_name, privilege_type FROM information_schema.role_table_grants
  WHERE table_schema = 'public' AND grantee IN ('anon', 'authenticated')`;

const ok = noRls.length === 0 && grants.length === 0;
console.log(JSON.stringify({ ok, tablesWithoutRls: noRls.map((r) => r.tablename), publicGrants: grants.length }));
await prisma.$disconnect();
process.exit(ok ? 0 : 1);
