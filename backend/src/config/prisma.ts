import { env } from './env';
import path from 'path';

// ─── Dual-mode Prisma Client ────────────────────────────────────────────────
// • Production / Vercel: PostgreSQL via Supabase connection string
// • Local Development: PostgreSQL or SQLite
// ────────────────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaInstance: any;

import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

function createPrismaClient() {
  try {
    const isSsl = connectionString.includes('sslmode=require') ||
                  connectionString.includes('supabase') ||
                  connectionString.includes('neon.tech') ||
                  connectionString.includes('pooler');

    const pool = new Pool({
      connectionString,
      ssl: isSsl ? { rejectUnauthorized: false } : undefined,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 10000,
    });

    const adapter = new PrismaPg(pool);
    return new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  } catch (pgErr) {
    try {
      return new PrismaClient({
        log: ['error', 'warn'],
      });
    } catch (fallbackErr) {
      console.error('❌ Failed to initialize PrismaClient:', fallbackErr);
      return new Proxy({}, {
        get: (_target, prop) => {
          if (prop === '$connect' || prop === '$disconnect') {
            return () => Promise.resolve();
          }
          return new Proxy({}, {
            get: () => () => Promise.reject(new Error('DATABASE_URL not configured.')),
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
