import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';

// Try loading .env from multiple probable locations (root or backend)
const envLocations = [
  path.resolve(process.cwd(), '.env'),
  path.resolve(process.cwd(), 'backend/.env'),
  path.resolve(__dirname, '../../.env'),
  path.resolve(__dirname, '../.env'),
];

for (const loc of envLocations) {
  if (fs.existsSync(loc)) {
    dotenv.config({ path: loc });
    break;
  }
}

// ─── Google Drive OAuth & Service Account Configuration ──────────────────────
//
// Google Drive integration supports:
//   1. OAuth 2.0 Web Application (Primary — uploads consume personal Google Drive storage):
//        GOOGLE_OAUTH_CLIENT_JSON_PATH=secrets/google-oauth-client.json
//        GOOGLE_DRIVE_TOKEN_PATH=secrets/google-drive-token.json
//        GOOGLE_OAUTH_REDIRECT_URI=http://localhost:3000/auth/google/callback
//
//   2. Service Account (Fallback / Rollback):
//        GOOGLE_SERVICE_ACCOUNT_KEY_JSON=./secrets/service-account.json
//
//   3. Root folder ID:
//        GOOGLE_DRIVE_ROOT_FOLDER_ID=10UIthh8w7lzepkyqoHEQN_Ukx_Ih9VKw
//

const envSchema = z.object({
  PORT: z.coerce.number().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),

  DATABASE_URL: z.string().default('postgresql://postgres.wdkpifcohsivvpgjiubl:zfz7TlcY75SKA17C@aws-1-eu-west-3.pooler.supabase.com:6543/postgres?pgbouncer=true'),

  JWT_ACCESS_SECRET: z.string().default('khatwa_default_jwt_access_secret_key_32_chars_min_2026'),
  JWT_REFRESH_SECRET: z.string().default('khatwa_default_jwt_refresh_secret_key_32_chars_min_2026'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Google Drive configuration
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_JSON_PATH: z.string().default('secrets/google-oauth-client.json'),
  GOOGLE_DRIVE_TOKEN_PATH: z.string().default('secrets/google-drive-token.json'),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default('http://localhost:3000/auth/google/callback'),
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: z.string().optional(),

  PLAYBACK_TOKEN_SECRET: z.string().default('khatwa_default_playback_token_secret_key_32_chars'),
  PLAYBACK_TOKEN_TTL_SECONDS: z.coerce.number().default(300),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),

  // Comma-separated list of allowed CORS origins. Defaults to all (*) in development only.
  ALLOWED_ORIGINS: z.string().optional(),

  // Optional custom path to frontend directory (defaults to auto-resolving ../../frontend)
  FRONTEND_PATH: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.warn('⚠️ Some environment variables are not configured or invalid (using safe defaults):');
  console.warn(_env.error.format());
}

export const env = _env.success ? _env.data : envSchema.parse({});
