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

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_ACCESS_SECRET: z.string().min(32, 'JWT_ACCESS_SECRET must be at least 32 chars'),
  JWT_REFRESH_SECRET: z.string().min(32, 'JWT_REFRESH_SECRET must be at least 32 chars'),
  JWT_ACCESS_EXPIRES_IN: z.string().default('15m'),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),

  // Google Drive configuration
  GOOGLE_DRIVE_ROOT_FOLDER_ID: z.string().optional(),
  GOOGLE_OAUTH_CLIENT_JSON_PATH: z.string().default('secrets/google-oauth-client.json'),
  GOOGLE_DRIVE_TOKEN_PATH: z.string().default('secrets/google-drive-token.json'),
  GOOGLE_OAUTH_REDIRECT_URI: z.string().default('http://localhost:3000/auth/google/callback'),
  GOOGLE_SERVICE_ACCOUNT_KEY_JSON: z.string().optional(),

  // NOTE: No default — must be explicitly set. A known literal default would allow token forgery.
  PLAYBACK_TOKEN_SECRET: z.string().min(32).optional(),
  PLAYBACK_TOKEN_TTL_SECONDS: z.coerce.number().default(300),

  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000),
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  AUTH_RATE_LIMIT_MAX: z.coerce.number().default(10),

  // Comma-separated list of allowed CORS origins. Defaults to all (*) in development only.
  // In production, set this explicitly: e.g. "https://app.khatwa.com,https://admin.khatwa.com"
  ALLOWED_ORIGINS: z.string().optional(),

  // Optional custom path to frontend directory (defaults to auto-resolving ../../frontend)
  FRONTEND_PATH: z.string().optional(),
});

const _env = envSchema.safeParse(process.env);

if (!_env.success) {
  console.error('❌ Invalid environment variables:');
  console.error(_env.error.format());
  process.exit(1);
}

export const env = _env.data;
