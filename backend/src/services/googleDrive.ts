import { google as _google } from 'googleapis';
import * as googleapisModule from 'googleapis';
import { Readable } from 'stream';
import fs from 'fs';
import path from 'path';
import { env } from '../config/env';
import * as GoogleDriveAuth from './googleDriveAuth';

const google: typeof _google = _google || (googleapisModule as any).google || (googleapisModule as any).default?.google || googleapisModule;

let _driveClient: ReturnType<typeof google.drive> | null = null;

const UPLOADS_DIR = path.resolve(process.cwd(), 'uploads', 'videos');

/**
 * Service Account fallback credential loader.
 */
function loadServiceAccountCredentials(): object {
  const raw = env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!raw) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not configured');
  }

  const trimmed = raw.trim();

  if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
    if (trimmed === '.' || trimmed === './' || trimmed === '/' || trimmed === '\\') {
      throw new Error('Invalid GOOGLE_SERVICE_ACCOUNT_KEY_JSON path');
    }
    const resolved = path.resolve(process.cwd(), trimmed);
    if (!fs.existsSync(resolved) || fs.statSync(resolved).isDirectory()) {
      throw new Error(`Service account key file not found at "${resolved}".`);
    }
    return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  }

  return JSON.parse(trimmed);
}

/**
 * Retrieves the Google Drive v3 client.
 * Uses Google OAuth 2.0 Web Application authentication (primary),
 * with fallback to Service Account if OAuth tokens have not yet been initialized.
 */
export function getDriveClientWithDiagnostics(): { drive: ReturnType<typeof google.drive> | null; error?: string } {
  if (_driveClient) return { drive: _driveClient };

  // Primary: OAuth 2.0 Web Application
  if (GoogleDriveAuth.hasStoredTokens()) {
    try {
      _driveClient = GoogleDriveAuth.getDriveClient();
      return { drive: _driveClient };
    } catch (err: any) {
      return { drive: null, error: `Google OAuth initialization failed: ${err.message}` };
    }
  }

  // Fallback: Service Account (if configured)
  const saJson = env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (saJson) {
    try {
      const credentials = loadServiceAccountCredentials();
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      _driveClient = google.drive({ version: 'v3', auth });
      return { drive: _driveClient };
    } catch (err: any) {
      return { drive: null, error: `Google Service Account failed: ${err.message}` };
    }
  }

  const missing: string[] = [];
  if (!env.GOOGLE_OAUTH_CLIENT_JSON && !process.env.GOOGLE_OAUTH_CLIENT_JSON) missing.push('GOOGLE_OAUTH_CLIENT_JSON');
  if (!env.GOOGLE_DRIVE_TOKEN_JSON && !process.env.GOOGLE_DRIVE_TOKEN_JSON) missing.push('GOOGLE_DRIVE_TOKEN_JSON');

  return {
    drive: null,
    error: `لم يتم العثور على المتغيرات (${missing.join(' و ')}). يرجى التأكد من حفظها في Vercel Environment Variables ثم عمل Redeploy.`,
  };
}

export function getDriveClient(): ReturnType<typeof google.drive> | null {
  return getDriveClientWithDiagnostics().drive;
}

// ─── Helper: find or create a folder in Google Drive ──────────────────────────

async function findOrCreateFolder(
  drive: ReturnType<typeof google.drive>,
  name: string,
  parentId: string
): Promise<string> {
  const safeName = name.replace(/'/g, "\\'");

  const existing = await drive.files.list({
    q: `name='${safeName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`,
    fields: 'files(id, name)',
    supportsAllDrives: true,
    includeItemsFromAllDrives: true,
  });

  if (existing.data.files && existing.data.files.length > 0) {
    return existing.data.files[0].id!;
  }

  const folder = await drive.files.create({
    requestBody: {
      name,
      mimeType: 'application/vnd.google-apps.folder',
      parents: [parentId],
    },
    fields: 'id, name',
    supportsAllDrives: true,
  });

  return folder.data.id!;
}

// ─── Ensure teacher folder exists ─────────────────────────────────────────────

export async function ensureTeacherFolder(teacherId: string): Promise<string> {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive client is not available');

  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '10UIthh8w7lzepkyqoHEQN_Ukx_Ih9VKw';
  return findOrCreateFolder(drive, `teacher-${teacherId}`, rootFolderId);
}

// ─── Ensure lesson folder exists inside the teacher folder ────────────────────

export async function ensureLessonFolder(
  teacherId: string,
  lessonId: string
): Promise<string> {
  const drive = getDriveClient();
  if (!drive) throw new Error('Google Drive client is not available');

  const teacherFolderId = await ensureTeacherFolder(teacherId);
  return findOrCreateFolder(drive, `lesson-${lessonId}`, teacherFolderId);
}

/**
 * Initiates a Google Drive Direct Resumable Upload session for the browser.
 * Returns the resumable upload URL where the browser can directly PUT the file bytes.
 */
export async function createResumableUploadSession(input: {
  filename: string;
  mimeType: string;
  fileSize?: number;
  teacherId: string;
  lessonId: string;
  origin?: string;
}): Promise<{ uploadUrl?: string; error?: string }> {
  const { drive, error: driveDiagError } = getDriveClientWithDiagnostics();
  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '10UIthh8w7lzepkyqoHEQN_Ukx_Ih9VKw';

  if (!drive) {
    return { error: driveDiagError || 'Google Drive client is not configured on the server environment.' };
  }

  try {
    const lessonFolderId = await ensureLessonFolder(input.teacherId, input.lessonId);
    
    // ── Obtain a valid access token ───────────────────────────────────────────
    // Strategy 1: OAuth 2.0 (primary — tokens stored in GOOGLE_DRIVE_TOKEN_JSON)
    let accessToken: string | null = null;
    if (GoogleDriveAuth.hasStoredTokens()) {
      try {
        const oauthClient = GoogleDriveAuth.getOAuth2Client();
        const tokenRes = await oauthClient.getAccessToken();
        accessToken = tokenRes.token || null;
      } catch (oauthErr: any) {
        // invalid_grant → refresh token expired/revoked. Reset cached drive client so
        // the next request rebuilds it, then fall through to service account.
        console.warn('OAuth token refresh failed (will try service account):', oauthErr.message);
        _driveClient = null;
      }
    }

    // Strategy 2: Service Account (fallback — used when OAuth is absent or expired)
    if (!accessToken) {
      const saJson = env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON || process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
      if (saJson) {
        try {
          const credentials = loadServiceAccountCredentials();
          const auth = new google.auth.GoogleAuth({
            credentials,
            scopes: ['https://www.googleapis.com/auth/drive'],
          });
          const client = await auth.getClient();
          const tokenRes = await client.getAccessToken();
          accessToken = tokenRes.token || null;
        } catch (saErr: any) {
          console.warn('Service account token also failed:', saErr.message);
        }
      }
    }

    if (!accessToken) {
      return {
        error: 'تعذر الاتصال بـ Google Drive: رمز المصادقة منتهي الصلاحية أو غير صالح. يرجى التواصل مع مدير المنصة لإعادة ربط حساب Google Drive، أو استخدم خيار رابط YouTube أو Drive بدلاً من رفع الملف مباشرة.',
      };
    }

    const metadata = {
      name: input.filename,
      parents: [lessonFolderId],
    };

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json; charset=UTF-8',
      'X-Upload-Content-Type': input.mimeType || 'video/mp4',
    };
    if (input.origin) {
      headers['Origin'] = input.origin;
    }
    if (input.fileSize) {
      headers['X-Upload-Content-Length'] = String(input.fileSize);
    }

    const res = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=resumable&supportsAllDrives=true', {
      method: 'POST',
      headers,
      body: JSON.stringify(metadata),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.warn('Google Drive resumable upload session error:', res.status, errText);
      return { error: `Google Drive API responded with ${res.status}: ${errText}` };
    }

    const uploadUrl = res.headers.get('location') || res.headers.get('Location');
    if (!uploadUrl) {
      return { error: 'Google Drive did not return upload location header.' };
    }

    return { uploadUrl };
  } catch (err: any) {
    console.warn('Failed to create resumable upload session:', err.message);
    return { error: err.message || 'Failed to initialize Google Drive upload session' };
  }
}

/**
 * Queries a Google Drive resumable upload session URL to retrieve the resulting file ID.
 *
 * Protocol: send PUT with Content-Range: bytes star/fileSize and an empty body.
 * - HTTP 200/201 → upload is complete; parse file ID from the JSON response body.
 * - HTTP 308 → upload is still in progress / incomplete; returns null.
 * - Other / error → returns null.
 *
 * NOTE: The session URL is self-authenticating (Google embeds auth in the upload_id).
 * Do NOT add an Authorization header here — it is not needed and can interfere.
 */
export async function queryResumableSessionFileId(
  uploadUrl: string,
  fileSize: number
): Promise<string | null> {
  try {
    const res = await fetch(uploadUrl, {
      method: 'PUT',
      headers: {
        'Content-Range': 'bytes */' + fileSize,
        'Content-Length': '0',
      },
    });

    if (res.status === 200 || res.status === 201) {
      const json: any = await res.json().catch(() => null);
      return json?.id ?? null;
    }

    // 308 = Incomplete; anything else is an error — either way we cannot retrieve the ID here
    return null;
  } catch (err: any) {
    console.warn('queryResumableSessionFileId failed:', err.message);
    return null;
  }
}

/**
 * Last-resort fallback: searches for a file within a specific lesson's Google Drive folder.
 *
 * Scoped to the lesson folder (not the entire Drive), filtered by:
 *   - Exact filename match
 *   - Created within the last 10 minutes (reduces race-condition risk for concurrent uploads)
 *   - Ordered by most-recent creation time
 *
 * This is intentionally conservative: it should only be called when the Drive file ID
 * could not be obtained from the upload response body or session status query.
 */
export async function findFileInLessonFolder(
  teacherId: string,
  lessonId: string,
  filename: string
): Promise<string | null> {
  const drive = getDriveClient();
  if (!drive) return null;

  try {
    const lessonFolderId = await ensureLessonFolder(teacherId, lessonId);
    const safeName = filename.replace(/'/g, "\\'");
    // Only look at files created in the last 10 minutes to avoid stale matches
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();

    const res = await drive.files.list({
      q: "name='" + safeName + "' and '" + lessonFolderId + "' in parents and trashed=false and createdTime>='" + tenMinutesAgo + "'",
      orderBy: 'createdTime desc',
      pageSize: 5,
      fields: 'files(id, name, createdTime)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });

    return res.data.files?.[0]?.id ?? null;
  } catch (err: any) {
    console.warn('findFileInLessonFolder failed:', err.message);
    return null;
  }
}

// ─── Upload a video directly to Google Drive (with local fallback) ───────────

export async function uploadVideo(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  teacherId: string;
  lessonId: string;
}): Promise<{ fileId: string; fileName: string; isGoogleDrive: boolean }> {
  const drive = getDriveClient();

  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID || process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '10UIthh8w7lzepkyqoHEQN_Ukx_Ih9VKw';
  if (drive && rootFolderId) {
    try {
      const driveUploadPromise = (async () => {
        const lessonFolderId = await ensureLessonFolder(input.teacherId, input.lessonId);
        const readableStream = Readable.from(input.buffer);

        const response = await drive.files.create({
          requestBody: {
            name: input.filename,
            parents: [lessonFolderId],
          },
          media: {
            mimeType: input.mimeType,
            body: readableStream,
          },
          fields: 'id, name',
          supportsAllDrives: true,
        });

        const fileId = response.data.id!;
        return { fileId, fileName: response.data.name ?? input.filename, isGoogleDrive: true };
      })();

      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('Google Drive upload timed out')), 6000)
      );

      const result = await Promise.race([driveUploadPromise, timeoutPromise]);
      return result;
    } catch (err: any) {
      console.warn('⚠️  Google Drive upload failed/timed out, saving video locally:', err.message);
    }
  }

  // Local fallback directory: uploads/videos/teacher-{id}/lesson-{id}/
  const targetDir = path.join(UPLOADS_DIR, `teacher-${input.teacherId}`, `lesson-${input.lessonId}`);
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const safeName = `${Date.now()}-${input.filename.replace(/[^a-zA-Z0-9_.-]/g, '_')}`;
  const filePath = path.join(targetDir, safeName);
  fs.writeFileSync(filePath, input.buffer);

  const relativePath = path.relative(process.cwd(), filePath).replace(/\\/g, '/');
  return {
    fileId: `local:${relativePath}`,
    fileName: input.filename,
    isGoogleDrive: false,
  };
}

// ─── Stream video (supports Google Drive proxy & local files) ────────────────

export async function streamVideo(
  fileId: string,
  range?: string
): Promise<{
  stream: Readable;
  mimeType: string;
  contentLength?: number;
  contentRange?: string;
  statusCode?: number;
}> {
  if (fileId.startsWith('local:')) {
    const localRel = fileId.replace(/^local:/, '');
    const absolutePath = path.resolve(process.cwd(), localRel);

    if (!fs.existsSync(absolutePath)) {
      throw new Error(`Video file not found at ${absolutePath}`);
    }

    const stat = fs.statSync(absolutePath);
    const totalSize = stat.size;
    const ext = path.extname(absolutePath).toLowerCase();
    const mimeType = ext === '.webm' ? 'video/webm' : ext === '.mkv' ? 'video/x-matroska' : 'video/mp4';

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : totalSize - 1;
      const chunksize = end - start + 1;
      const stream = fs.createReadStream(absolutePath, { start, end });

      return {
        stream,
        mimeType,
        contentLength: chunksize,
        contentRange: `bytes ${start}-${end}/${totalSize}`,
        statusCode: 206,
      };
    }

    const stream = fs.createReadStream(absolutePath);
    return {
      stream,
      mimeType,
      contentLength: totalSize,
      statusCode: 200,
    };
  }

  const drive = getDriveClient();
  if (!drive) {
    throw new Error('Google Drive client is not initialized');
  }

  const meta = await drive.files.get({
    fileId,
    fields: 'mimeType, size',
    supportsAllDrives: true,
  });

  const response = await drive.files.get(
    { fileId, alt: 'media', supportsAllDrives: true },
    { responseType: 'stream' }
  );

  return {
    stream: response.data as Readable,
    mimeType: meta.data.mimeType ?? 'video/mp4',
    contentLength: meta.data.size ? parseInt(meta.data.size, 10) : undefined,
    statusCode: 200,
  };
}

// ─── Delete a video file from Drive or Local disk ────────────────────────────

export async function deleteVideo(fileId: string): Promise<void> {
  if (fileId.startsWith('local:')) {
    const localRel = fileId.replace(/^local:/, '');
    const absolutePath = path.resolve(process.cwd(), localRel);
    if (fs.existsSync(absolutePath)) {
      try {
        fs.unlinkSync(absolutePath);
      } catch {}
    }
    return;
  }

  const drive = getDriveClient();
  if (drive) {
    try {
      await drive.files.delete({ fileId, supportsAllDrives: true });
    } catch {}
  }
}
