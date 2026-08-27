import { env } from './env';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';

// ─── Dual-mode Prisma Client ────────────────────────────────────────────────
// • Production / Vercel: PostgreSQL via Supabase connection string
// • Local Development: PostgreSQL or SQLite
// ────────────────────────────────────────────────────────────────────────────

const defaultDbUrl = 'postgresql://postgres.wdkpifcohsivvpgjiubl:zfz7TlcY75SKA17C@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true';
const connectionString = process.env.DATABASE_URL || env.DATABASE_URL || defaultDbUrl;

if (!process.env.DATABASE_URL) {
  process.env.DATABASE_URL = connectionString;
}

function createPrismaClient() {
  try {
    const adapter = new PrismaPg({ connectionString });
    return new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  } catch (err) {
    console.error('❌ Failed to initialize PrismaClient:', err);
    throw err;
  }
}

const prismaInstance = createPrismaClient();

declare global {
  // eslint-disable-next-line no-var
  var __prisma: typeof prismaInstance | undefined;
}

export const prisma: typeof prismaInstance = global.__prisma ?? prismaInstance;

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
