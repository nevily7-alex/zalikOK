import 'dotenv/config';
import { defineConfig } from 'prisma/config';

// Міграції йдуть через DIRECT_URL (пряме підключення, напр. Supabase :5432), застосунок — через DATABASE_URL (може бути пул).
export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: { path: 'prisma/migrations' },
  datasource: {
    url: process.env.DIRECT_URL || process.env.DATABASE_URL || 'postgresql://zalikok:zalikok@localhost:54329/zalikok',
  },
});
