import { env } from './env';
import path from 'path';

// ─── Dual-mode Prisma Client ────────────────────────────────────────────────
// • Production / Vercel: PostgreSQL via @prisma/adapter-pg & generated/client
// • Local Development: SQLite via dev.db or PostgreSQL when DATABASE_URL is set
// ────────────────────────────────────────────────────────────────────────────

const isVercel = Boolean(process.env.VERCEL || process.env.AWS_LAMBDA_FUNCTION_NAME);
const hasPgUrl = Boolean(
  env.DATABASE_URL &&
  !env.DATABASE_URL.includes('sqlite') &&
  env.DATABASE_URL !== 'postgresql://user:password@localhost:5432/khatwa'
);

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaInstance: any;

function createPrismaClient() {
  // 1. PostgreSQL path (Preferred in production and Vercel)
  if (hasPgUrl || isVercel || env.NODE_ENV === 'production') {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require('../generated/client');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaPg } = require('@prisma/adapter-pg');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg');

      const connectionString = env.DATABASE_URL;
      const isSsl = connectionString?.includes('sslmode=require') || connectionString?.includes('supabase') || connectionString?.includes('neon.tech');
      const pool = new Pool({
        connectionString,
        ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      });
      const adapter = new PrismaPg(pool);
      return new PrismaClient({
        adapter,
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
      });
    } catch (pgErr) {
      console.warn('⚠️ Could not initialize PrismaPg client with adapter:', pgErr);
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PrismaClient } = require('../generated/client');
        return new PrismaClient();
      } catch (clientErr) {
        console.error('⚠️ Could not load standard PrismaClient:', clientErr);
      }
    }
  }

  // 2. Local SQLite path
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('../generated/client-sqlite');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
    const dbPath = path.resolve(__dirname, '../../dev.db');
    const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });

    return new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  } catch (_sqliteErr) {
    // 3. Fallback to generated client
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require('../generated/client');
      return new PrismaClient();
    } catch (fallbackErr) {
      console.error('❌ Failed to initialize PrismaClient (DB operations will fail gracefully):', fallbackErr);
      return new Proxy({}, {
        get: (_target, prop) => {
          if (prop === '$connect' || prop === '$disconnect') {
            return () => Promise.resolve();
          }
          return new Proxy({}, {
            get: () => () => Promise.reject(new Error('DATABASE_URL not configured. Please add DATABASE_URL to your environment variables.')),
          });
        },
      });
    }
  }
}

prismaInstance = createPrismaClient();

declare global {
  // eslint-disable-next-line no-var
  var __prisma: typeof prismaInstance | undefined;
}

export const prisma: typeof prismaInstance = global.__prisma ?? prismaInstance;

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}
