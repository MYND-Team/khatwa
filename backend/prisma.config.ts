/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

// Use SQLite for local dev when DATABASE_URL is not a real PostgreSQL URL
const dbUrl = process.env.DATABASE_URL ?? "";
const isSqlite =
  !dbUrl || dbUrl === "postgresql://user:password@localhost:5432/khatwa";

export default defineConfig({
  schema: isSqlite
    ? "./prisma/schema.sqlite.prisma"
    : "./prisma/schema.prisma",
  datasource: {
    url: isSqlite ? "file:./dev.db" : (process.env.DIRECT_URL || dbUrl),
  },
});
