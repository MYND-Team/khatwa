import { google as _google } from 'googleapis';
import * as googleapisModule from 'googleapis';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';

const google: typeof _google = _google || (googleapisModule as any).google || (googleapisModule as any).default?.google || googleapisModule;

interface OAuthWebClientJson {
  web?: {
    client_id: string;
    client_secret: string;
    redirect_uris?: string[];
    auth_uri?: string;
    token_uri?: string;
  };
  installed?: {
    client_id: string;
    client_secret: string;
  };
}

export interface StoredTokens {
  access_token?: string | null;
  refresh_token?: string | null;
  scope?: string;
  token_type?: string | null;
  expiry_date?: number | null;
  id_token?: string | null;
}

let _oauth2Client: InstanceType<typeof google.auth.OAuth2> | null = null;
let _driveClient: ReturnType<typeof google.drive> | null = null;

/**
 * Resolves the path to the OAuth 2.0 Web Application credentials JSON file.
 */
function resolveOAuthClientPath(): string {
  const configured = env.GOOGLE_OAUTH_CLIENT_JSON_PATH;
  const resolved = path.resolve(process.cwd(), configured);
  if (fs.existsSync(resolved)) {
    return resolved;
  }

  // Fallback: search secrets/ directory for client_secret_*.json
  const secretsDir = path.resolve(process.cwd(), 'secrets');
  if (fs.existsSync(secretsDir)) {
    const files = fs.readdirSync(secretsDir);
    const clientSecretFile = files.find(f => f.startsWith('client_secret_') && f.endsWith('.json'));
    if (clientSecretFile) {
      return path.join(secretsDir, clientSecretFile);
    }
  }

  throw new Error(
    `OAuth client configuration file not found at "${resolved}". ` +
    'Please ensure secrets/google-oauth-client.json exists.'
  );
}

/**
 * Resolves the path to the stored OAuth token file.
 */
function resolveTokenPath(): string {
  return path.resolve(process.cwd(), env.GOOGLE_DRIVE_TOKEN_PATH);
}

/**
 * Loads and validates the OAuth 2.0 Web Application client credentials.
 * Ensures the credentials file is of type WEB APPLICATION.
 */
export function loadOAuthClientCredentials(): { clientId: string; clientSecret: string; redirectUri: string } {
  let parsed: OAuthWebClientJson;

  if (env.GOOGLE_OAUTH_CLIENT_JSON) {
    try {
      parsed = JSON.parse(env.GOOGLE_OAUTH_CLIENT_JSON.trim());
    } catch (err: any) {
      throw new Error(`Failed to parse GOOGLE_OAUTH_CLIENT_JSON env var: ${err.message}`);
    }
  } else {
    const filePath = resolveOAuthClientPath();
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      parsed = JSON.parse(content);
    } catch (err: any) {
      throw new Error(`Failed to read or parse OAuth client file at "${filePath}": ${err.message}`);
    }
  }

  if (parsed.installed && !parsed.web) {
    throw new Error(
      'OAuth Client JSON is configured as an "installed" (Desktop) application. ' +
      'Khatwa requires a "web" (Web Application) OAuth client.'
    );
  }

  if (!parsed.web || !parsed.web.client_id || !parsed.web.client_secret) {
    throw new Error(
      'Invalid OAuth client JSON: missing "web.client_id" or "web.client_secret". ' +
      'Ensure the credentials file is a Google Cloud OAuth 2.0 Web Application client.'
    );
  }

  const redirectUri = env.GOOGLE_OAUTH_REDIRECT_URI || parsed.web.redirect_uris?.[0] || 'http://localhost:3000/auth/google/callback';

  return {
    clientId: parsed.web.client_id,
    clientSecret: parsed.web.client_secret,
    redirectUri,
  };
}

/**
 * Checks if a valid refresh token exists on disk or in env.
 */
export function hasStoredTokens(): boolean {
  if (env.GOOGLE_DRIVE_TOKEN_JSON) {
    try {
      const data = JSON.parse(env.GOOGLE_DRIVE_TOKEN_JSON.trim());
      return typeof data.refresh_token === 'string' && data.refresh_token.length > 0;
    } catch {
      return false;
    }
  }
  const tokenPath = resolveTokenPath();
  if (!fs.existsSync(tokenPath)) return false;
  try {
    const data = JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
    return typeof data.refresh_token === 'string' && data.refresh_token.length > 0;
  } catch {
    return false;
  }
}

/**
 * Loads stored tokens from disk or env.
 */
export function loadStoredTokens(): StoredTokens | null {
  if (env.GOOGLE_DRIVE_TOKEN_JSON) {
    try {
      return JSON.parse(env.GOOGLE_DRIVE_TOKEN_JSON.trim());
    } catch {
      return null;
    }
  }
  const tokenPath = resolveTokenPath();
  if (!fs.existsSync(tokenPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(tokenPath, 'utf-8'));
  } catch {
    return null;
  }
}

/**
 * Saves refresh token to the secure token file.
 * Only the long-lived refresh token is persisted; access tokens remain ephemeral in memory.
 */
export function saveStoredTokens(tokens: StoredTokens): void {
  const tokenPath = resolveTokenPath();
  const dir = path.dirname(tokenPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const existing = loadStoredTokens();
  const refreshToken = tokens.refresh_token || existing?.refresh_token;

  if (refreshToken) {
    fs.writeFileSync(
      tokenPath,
      JSON.stringify({ refresh_token: refreshToken }, null, 2),
      'utf-8'
    );
  }
}

/**
 * Creates or retrieves the singleton Google OAuth2 client.
 */
export function getOAuth2Client(): InstanceType<typeof google.auth.OAuth2> {
  if (_oauth2Client) return _oauth2Client;

  const { clientId, clientSecret, redirectUri } = loadOAuthClientCredentials();
  const oauth2Client = new google.auth.OAuth2(clientId, clientSecret, redirectUri);

  // Load stored tokens if available
  const stored = loadStoredTokens();
  if (stored) {
    oauth2Client.setCredentials(stored);
  }

  // Automatically persist refreshed tokens
  oauth2Client.on('tokens', (tokens) => {
    saveStoredTokens(tokens);
  });

  _oauth2Client = oauth2Client;
  return _oauth2Client;
}

/**
 * Generates the Google OAuth 2.0 Web Application authorization URL.
 */
export function getAuthUrl(customRedirectUri?: string): string {
  const { clientId, clientSecret, redirectUri } = loadOAuthClientCredentials();
  const effectiveRedirect = customRedirectUri || redirectUri;
  const client = new google.auth.OAuth2(clientId, clientSecret, effectiveRedirect);

  return client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/drive'],
  });
}

/**
 * Handles the OAuth authorization code exchange.
 */
export async function handleAuthCallback(code: string, customRedirectUri?: string): Promise<StoredTokens> {
  const { clientId, clientSecret, redirectUri } = loadOAuthClientCredentials();
  const effectiveRedirect = customRedirectUri || redirectUri;
  const client = new google.auth.OAuth2(clientId, clientSecret, effectiveRedirect);

  const { tokens } = await client.getToken(code);
  if (!tokens.refresh_token) {
    const existing = loadStoredTokens();
    if (!existing?.refresh_token) {
      console.warn('⚠️  No refresh token returned by Google. Re-authenticating with prompt=consent may be required.');
    }
  }

  saveStoredTokens(tokens);

  // Update in-memory client credentials
  const currentClient = getOAuth2Client();
  currentClient.setCredentials(tokens);

  return tokens;
}

/**
 * Returns an authenticated Google Drive API v3 client using OAuth2.
 */
export function getDriveClient(): ReturnType<typeof google.drive> {
  if (_driveClient) return _driveClient;

  if (!hasStoredTokens()) {
    throw new Error(
      'Google Drive OAuth tokens are not configured or missing refresh token. ' +
      'Please run "npm run google-drive:auth" to authorize your personal Google account.'
    );
  }

  const auth = getOAuth2Client();
  _driveClient = google.drive({ version: 'v3', auth });
  return _driveClient;
}
