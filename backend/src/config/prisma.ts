import { env } from './env';
import path from 'path';

// ─── Dual-mode Prisma Client ────────────────────────────────────────────────
// • SQLite     — DATABASE_URL is the default placeholder → uses dev.db locally
// • PostgreSQL — any real DATABASE_URL (staging / production)
// ────────────────────────────────────────────────────────────────────────────

const IS_SQLITE =
  !env.DATABASE_URL ||
  env.DATABASE_URL === 'postgresql://user:password@localhost:5432/khatwa';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let prismaInstance: any;

if (IS_SQLITE) {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('../generated/client-sqlite');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaBetterSqlite3 } = require('@prisma/adapter-better-sqlite3');
  const dbPath = path.resolve(__dirname, '../../dev.db');
  const adapter = new PrismaBetterSqlite3({ url: 'file:' + dbPath });

  prismaInstance = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });
  console.log('ℹ️  Using SQLite (dev.db) — set DATABASE_URL for PostgreSQL in production.');
} else {
  // PostgreSQL path — use pg adapter
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaClient } = require('../generated/client');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { PrismaPg } = require('@prisma/adapter-pg');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { Pool } = require('pg');
  const pool = new Pool({ connectionString: env.DATABASE_URL });
  const adapter = new PrismaPg(pool);
  prismaInstance = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  });
}

declare global {
  // eslint-disable-next-line no-var
  var __prisma: typeof prismaInstance | undefined;
}

export const prisma: typeof prismaInstance = global.__prisma ?? prismaInstance;

if (process.env.NODE_ENV !== 'production') {
  global.__prisma = prisma;
}

