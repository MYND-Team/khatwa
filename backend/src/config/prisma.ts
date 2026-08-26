import { env } from './env';
import path from 'path';

// ─── Dual-mode Prisma Client ────────────────────────────────────────────────
// • Production / Vercel: PostgreSQL via Supabase connection string
// • Local Development: PostgreSQL or SQLite
// ────────────────────────────────────────────────────────────────────────────

const connectionString = process.env.DATABASE_URL || env.DATABASE_URL;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaInstance: any;

function createPrismaClient() {
  // 1. PostgreSQL path (Preferred in production, Vercel, and when PG URL is provided)
  if (connectionString && !connectionString.includes('sqlite')) {
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require('../generated/client');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaPg } = require('@prisma/adapter-pg');
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { Pool } = require('pg');

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
      console.warn('⚠️ Could not initialize PrismaPg client with adapter, falling back to direct PrismaClient:', pgErr);
      try {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { PrismaClient } = require('../generated/client');
        return new PrismaClient({
          log: ['error', 'warn'],
        });
      } catch (clientErr) {
        console.error('⚠️ Could not load standard PrismaClient:', clientErr);
      }
    }
  }

  // 2. Local SQLite path fallback
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaClient } = require('../generated/client-sqlite');
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
    const dbPath = path.resolve(__dirname, '../../dev.db');
    const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });

    return new PrismaClient({
      adapter,
      log: ['error', 'warn'],
    });
  } catch (_sqliteErr) {
    // 3. Fallback
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrismaClient } = require('../generated/client');
      return new PrismaClient();
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
