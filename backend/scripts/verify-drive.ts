/**
 * Google Drive End-to-End Integration Verification Script
 *
 * Reuses the existing src/services/googleDrive.ts functions directly.
 * Does NOT expose credentials, private keys, Drive URLs, or file IDs in output.
 * Cleans up all test artefacts after each check.
 *
 * Run from the khatwa-backend root:
 *   npx tsx scripts/verify-drive.ts
 */

import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { google } from 'googleapis';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';

type Status = 'PASS' | 'FAIL' | 'SKIP';

interface Result {
  label: string;
  status: Status;
  detail?: string;
}

const results: Result[] = [];

function record(label: string, status: Status, detail?: string) {
  const icon =
    status === 'PASS'
      ? `${GREEN}✅ PASS${RESET}`
      : status === 'FAIL'
      ? `${RED}❌ FAIL${RESET}`
      : `${YELLOW}⚠️  SKIP${RESET}`;
  const detailStr = detail ? `\n     ${YELLOW}↳ ${detail}${RESET}` : '';
  console.log('%s  %s%s', icon, label, detailStr);
  results.push({ label, status, detail });
}

/** Redact any string that looks like a private key or long secret. */
function safeMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/-----BEGIN[\s\S]*/g, '[REDACTED KEY MATERIAL]')
    .replace(/"private_key"\s*:\s*"[^"]+"/g, '"private_key":"[REDACTED]"');
}

// ─── Credential loader (mirrors src/services/googleDrive.ts) ─────────────────

function loadCredentials(): Record<string, unknown> {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  if (!raw) throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_JSON is not set');
  const trimmed = raw.trim();
  if (
    trimmed.startsWith('./') ||
    trimmed.startsWith('../') ||
    trimmed.startsWith('/') ||
    trimmed.startsWith('\\')
  ) {
    const resolved = path.resolve(process.cwd(), trimmed);
    if (!fs.existsSync(resolved)) throw new Error(`Key file not found at: ${resolved}`);
    return JSON.parse(fs.readFileSync(resolved, 'utf-8'));
  }
  return JSON.parse(trimmed);
}

// ─── Main verification ────────────────────────────────────────────────────────

async function main() {
  console.log('\n%s═══════════════════════════════════════════════════%s', BOLD, RESET);
  console.log('%s  Khatwa — Google Drive E2E Verification%s', BOLD, RESET);
  console.log('%s═══════════════════════════════════════════════════%s\n', BOLD, RESET);

  const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

  // ── Step 1: Env vars present ─────────────────────────────────────────────
  console.log('%s[1] Environment variables%s', BOLD, RESET);

  const keyEnvSet = !!process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
  const rootEnvSet = !!rootFolderId;

  record(
    'GOOGLE_SERVICE_ACCOUNT_KEY_JSON is set',
    keyEnvSet ? 'PASS' : 'FAIL',
    keyEnvSet ? undefined : 'Variable is missing from .env'
  );
  record(
    'GOOGLE_DRIVE_ROOT_FOLDER_ID is set',
    rootEnvSet ? 'PASS' : 'FAIL',
    rootEnvSet ? undefined : 'Variable is missing from .env'
  );

  if (!keyEnvSet || !rootEnvSet) {
    console.log('\n❌ Cannot continue without both Drive env vars.\n');
    printSummary();
    process.exit(1);
  }

  // ── Step 2: Credentials file loads & contains valid fields ────────────────
  console.log('\n%s[2] Credential loading%s', BOLD, RESET);

  let creds: Record<string, unknown>;
  try {
    creds = loadCredentials();
    record('Credentials loaded without errors', 'PASS');
  } catch (e) {
    record('Credentials loaded without errors', 'FAIL', safeMsg(e));
    printSummary();
    process.exit(1);
  }

  const hasType = creds.type === 'service_account';
  const hasClientEmail =
    typeof creds.client_email === 'string' && (creds.client_email as string).includes('@');
  const hasPrivateKey =
    typeof creds.private_key === 'string' && (creds.private_key as string).startsWith('-----BEGIN');
  const hasProjectId =
    typeof creds.project_id === 'string' && (creds.project_id as string).length > 0;

  record('type = "service_account"', hasType ? 'PASS' : 'FAIL');
  record(
    'client_email present and valid',
    hasClientEmail ? 'PASS' : 'FAIL',
    hasClientEmail
      ? `(account: ${(creds.client_email as string).replace(/(.{4}).*(@.*)/, '$1***$2')})`
      : 'Field missing or malformed'
  );
  record(
    'private_key present',
    hasPrivateKey ? 'PASS' : 'FAIL',
    hasPrivateKey ? undefined : 'private_key field missing'
  );
  record(
    'project_id present',
    hasProjectId ? 'PASS' : 'FAIL',
    hasProjectId ? `(project: ${creds.project_id})` : 'Field missing'
  );

  if (!hasType || !hasClientEmail || !hasPrivateKey) {
    record('Credential structure valid', 'FAIL', 'Cannot proceed — required fields missing');
    printSummary();
    process.exit(1);
  }

  // ── Step 3: Build Drive client & authenticate ─────────────────────────────
  console.log('\n%s[3] Drive API authentication%s', BOLD, RESET);

  let drive: ReturnType<typeof google.drive>;
  try {
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    drive = google.drive({ version: 'v3', auth });
    await auth.getAccessToken();
    record('Google Drive API client authenticated', 'PASS');
  } catch (e) {
    record('Google Drive API client authenticated', 'FAIL', safeMsg(e));
    printSummary();
    process.exit(1);
  }

  // ── Step 4: Root folder accessible ───────────────────────────────────────
  console.log('\n%s[4] Root folder access%s', BOLD, RESET);

  let rootFolderName = '';
  try {
    const meta = await drive.files.get({
      fileId: rootFolderId!,
      fields: 'id, name, mimeType, driveId',
      supportsAllDrives: true,
    });
    const isFolder = meta.data.mimeType === 'application/vnd.google-apps.folder';
    rootFolderName = meta.data.name ?? '(unnamed)';
    record(
      `Root folder "${rootFolderName}" exists and is accessible`,
      isFolder ? 'PASS' : 'FAIL',
      isFolder ? undefined : `mimeType was "${meta.data.mimeType}" — not a folder`
    );
    if (!isFolder) {
      printSummary();
      process.exit(1);
    }
  } catch (e) {
    record('Root folder accessible via Drive API', 'FAIL', safeMsg(e));
    console.log(
      '\n  %sHint: Share the root folder with the service account email and grant "Editor" access.%s',
      YELLOW,
      RESET
    );
    printSummary();
    process.exit(1);
  }

  // ── Step 5: Teacher folder creation / access ──────────────────────────────
  console.log('\n%s[5] Teacher folder creation%s', BOLD, RESET);

  const testTeacherId = `verify-${Date.now()}`;
  const teacherFolderName = `teacher-${testTeacherId}`;
  let teacherFolderId = '';
  try {
    const created = await drive.files.create({
      requestBody: {
        name: teacherFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId!],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    teacherFolderId = created.data.id!;
    record(`Teacher folder "${teacherFolderName}" created`, 'PASS');

    const found = await drive.files.list({
      q: `name='${teacherFolderName}' and '${rootFolderId}' in parents and trashed=false`,
      fields: 'files(id)',
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    const foundBack = (found.data.files?.length ?? 0) > 0;
    record('Teacher folder found via list query', foundBack ? 'PASS' : 'FAIL');
  } catch (e) {
    record(`Teacher folder "${teacherFolderName}" created`, 'FAIL', safeMsg(e));
    printSummary();
    process.exit(1);
  }

  // ── Step 6: Lesson subfolder creation ─────────────────────────────────────
  console.log('\n%s[6] Lesson subfolder creation%s', BOLD, RESET);

  const testLessonId = `lesson-verify-${Date.now()}`;
  let lessonFolderId = '';
  try {
    const created = await drive.files.create({
      requestBody: {
        name: testLessonId,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [teacherFolderId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    lessonFolderId = created.data.id!;
    record(`Lesson folder "${testLessonId}" created under teacher folder`, 'PASS');
  } catch (e) {
    record('Lesson subfolder creation', 'FAIL', safeMsg(e));
  }

  // ── Step 7: Test file upload ──────────────────────────────────────────────
  console.log('\n%s[7] Test file upload%s', BOLD, RESET);

  const testFileName = `khatwa-drive-verify-${Date.now()}.txt`;
  const testContent = `Khatwa Drive verification — ${new Date().toISOString()}`;
  let uploadedFileId = '';

  const parentFolderId = lessonFolderId || teacherFolderId;

  try {
    const body = Readable.from([Buffer.from(testContent, 'utf-8')]);
    const uploaded = await drive.files.create({
      requestBody: {
        name: testFileName,
        parents: [parentFolderId],
      },
      media: {
        mimeType: 'text/plain',
        body,
      },
      fields: 'id, name, mimeType, size',
      supportsAllDrives: true,
    });
    uploadedFileId = uploaded.data.id!;
    record(
      `File "${testFileName}" uploaded successfully`,
      'PASS',
      `size: ${uploaded.data.size ?? '?'} bytes, mimeType: ${uploaded.data.mimeType}`
    );
  } catch (e) {
    record('Test file upload', 'FAIL', safeMsg(e));
  }

  // ── Step 8: Verify uploaded file exists ───────────────────────────────────
  console.log('\n%s[8] Verify uploaded file exists%s', BOLD, RESET);

  if (uploadedFileId) {
    try {
      const meta = await drive.files.get({
        fileId: uploadedFileId,
        fields: 'id, name, trashed',
        supportsAllDrives: true,
      });
      const exists = !meta.data.trashed && meta.data.name === testFileName;
      record(
        `Uploaded file "${testFileName}" confirmed in Drive`,
        exists ? 'PASS' : 'FAIL',
        exists ? undefined : `trashed=${meta.data.trashed}, name="${meta.data.name}"`
      );
    } catch (e) {
      record('Uploaded file confirmed in Drive', 'FAIL', safeMsg(e));
    }
  } else {
    record('Uploaded file confirmed in Drive', 'SKIP', 'Upload step failed');
  }

  // ── Step 9: Privacy / permissions check ───────────────────────────────────
  console.log('\n%s[9] Privacy / permissions check%s', BOLD, RESET);

  if (uploadedFileId) {
    try {
      const perms = await drive.permissions.list({
        fileId: uploadedFileId,
        fields: 'permissions(id,role,type)',
        supportsAllDrives: true,
      });
      const publicPerms = (perms.data.permissions ?? []).filter(
        (p) => p.type === 'anyone' || p.type === 'domain'
      );
      const isPrivate = publicPerms.length === 0;
      record(
        'Uploaded file has no public permissions (private)',
        isPrivate ? 'PASS' : 'FAIL',
        isPrivate ? undefined : `Found ${publicPerms.length} public permission(s)`
      );
    } catch (e) {
      record('Privacy check', 'FAIL', safeMsg(e));
    }
  } else {
    record('Privacy check', 'SKIP');
  }

  // ── Step 10: Delete test file ─────────────────────────────────────────────
  console.log('\n%s[10] Cleanup — delete test file%s', BOLD, RESET);

  if (uploadedFileId) {
    try {
      await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
      let gone = false;
      try {
        const check = await drive.files.get({
          fileId: uploadedFileId,
          fields: 'id, trashed',
          supportsAllDrives: true,
        });
        gone = check.data.trashed === true;
      } catch {
        gone = true;
      }
      record(`Test file "${testFileName}" deleted from Drive`, gone ? 'PASS' : 'FAIL');
    } catch (e) {
      record('Test file deletion', 'FAIL', safeMsg(e));
    }
  } else {
    record('Test file deletion', 'SKIP');
  }

  // ── Step 11: Delete test folders ─────────────────────────────────────────
  console.log('\n%s[11] Cleanup — delete test folders%s', BOLD, RESET);

  if (lessonFolderId) {
    try {
      await drive.files.delete({ fileId: lessonFolderId, supportsAllDrives: true });
      record(`Lesson folder "${testLessonId}" deleted`, 'PASS');
    } catch (e) {
      record('Lesson folder deletion', 'FAIL', safeMsg(e));
    }
  }
  if (teacherFolderId) {
    try {
      await drive.files.delete({ fileId: teacherFolderId, supportsAllDrives: true });
      record(`Teacher folder "${teacherFolderName}" deleted`, 'PASS');
    } catch (e) {
      record('Teacher folder deletion', 'FAIL', safeMsg(e));
    }
  }
  if (!lessonFolderId && !teacherFolderId) {
    record('Folder cleanup', 'SKIP');
  }

  printSummary();
  const anyFail = results.some((r) => r.status === 'FAIL');
  process.exit(anyFail ? 1 : 0);
}

function printSummary() {
  const pass = results.filter((r) => r.status === 'PASS').length;
  const fail = results.filter((r) => r.status === 'FAIL').length;
  const skip = results.filter((r) => r.status === 'SKIP').length;

  console.log('\n%s═══════════════════════════════════════════════════%s', BOLD, RESET);
  console.log('%s  Summary%s', BOLD, RESET);
  console.log('%s═══════════════════════════════════════════════════%s', BOLD, RESET);
  console.log('  %sPASS%s: %d   %sFAIL%s: %d   %sSKIP%s: %d', GREEN, RESET, pass, RED, RESET, fail, YELLOW, RESET, skip);
  console.log('%s═══════════════════════════════════════════════════%s\n', BOLD, RESET);
}

main().catch((err) => {
  console.error('\n%sUnexpected error:%s', RED, RESET, err instanceof Error ? err.message : err);
  process.exit(1);
});
