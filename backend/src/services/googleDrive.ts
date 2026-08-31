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
    const resolved = path.resolve(process.cwd(), trimmed);
    if (!fs.existsSync(resolved)) {
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
export function getDriveClient(): ReturnType<typeof google.drive> | null {
  if (_driveClient) return _driveClient;

  // Primary: OAuth 2.0 Web Application
  if (GoogleDriveAuth.hasStoredTokens()) {
    try {
      _driveClient = GoogleDriveAuth.getDriveClient();
      return _driveClient;
    } catch {
      // Fall through to fallback
    }
  }

  // Fallback: Service Account (if configured)
  if (env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON) {
    try {
      const credentials = loadServiceAccountCredentials();
      const auth = new google.auth.GoogleAuth({
        credentials,
        scopes: ['https://www.googleapis.com/auth/drive'],
      });
      _driveClient = google.drive({ version: 'v3', auth });
      return _driveClient;
    } catch {
      // Fall through to null
    }
  }

  return null;
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

  if (!env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
    throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID is not configured in .env');
  }

  return findOrCreateFolder(drive, `teacher-${teacherId}`, env.GOOGLE_DRIVE_ROOT_FOLDER_ID);
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

// ─── Upload a video directly to Google Drive (with local fallback) ───────────

export async function uploadVideo(input: {
  buffer: Buffer;
  filename: string;
  mimeType: string;
  teacherId: string;
  lessonId: string;
}): Promise<{ fileId: string; fileName: string; isGoogleDrive: boolean }> {
  const drive = getDriveClient();

  if (drive && env.GOOGLE_DRIVE_ROOT_FOLDER_ID) {
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
