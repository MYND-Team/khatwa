/// <reference types="node" />
import "dotenv/config";
import { defineConfig } from "prisma/config";

const defaultDbUrl = "postgresql://postgres.wdkpifcohsivvpgjiubl:zfz7TlcY75SKA17C@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true";
const dbUrl = process.env.DATABASE_URL || defaultDbUrl;
const isSqlite = process.env.USE_SQLITE === "true";

export default defineConfig({
  schema: isSqlite
    ? "./prisma/schema.sqlite.prisma"
    : "./prisma/schema.prisma",
  datasource: {
    url: isSqlite ? "file:./dev.db" : (process.env.DIRECT_URL || dbUrl),
  },
});
