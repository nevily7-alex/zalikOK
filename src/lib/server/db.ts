import 'server-only';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@/generated/prisma/client';
import { SUPABASE_ROOT_CA } from './supabase-ca';

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function create(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error('Не задано DATABASE_URL');
  // TLS до хмарної БД. DATABASE_SSL: verify = перевірка сертифіката (вбудований Supabase Root CA або DATABASE_SSL_CA),
  // require = шифрування без перевірки (лише як тимчасовий варіант). Не додавайте sslmode у DATABASE_URL.
  const mode = process.env.DATABASE_SSL;
  // PEM у змінній середовища може містити літеральні "\n" замість переносів рядків
  const customCa = process.env.DATABASE_SSL_CA?.replace(/\\n/g, '\n');
  const ssl =
    mode === 'verify'
      ? { ca: customCa || SUPABASE_ROOT_CA, rejectUnauthorized: true }
      : customCa
        ? { ca: customCa, rejectUnauthorized: true }
        : mode === 'require'
          ? { rejectUnauthorized: false }
          : undefined;
  return new PrismaClient({ adapter: new PrismaPg({ connectionString, ssl }) });
}

export const prisma: PrismaClient = globalForPrisma.prisma ?? create();
if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma;
