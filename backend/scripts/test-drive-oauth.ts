import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { google } from 'googleapis';
import {
  loadOAuthClientCredentials,
  hasStoredTokens,
  loadStoredTokens,
  getDriveClient,
} from '../src/services/googleDriveAuth';
import { env } from '../src/config/env';

const RESET = '\x1b[0m';
const GREEN = '\x1b[32m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const BOLD = '\x1b[1m';
const CYAN = '\x1b[36m';

type Status = 'PASS' | 'FAIL' | 'SKIP';

interface CheckItem {
  label: string;
  status: Status;
  detail?: string;
}

const checks: CheckItem[] = [];

function record(label: string, status: Status, detail?: string) {
  const icon =
    status === 'PASS'
      ? `${GREEN}✅ PASS${RESET}`
      : status === 'FAIL'
      ? `${RED}❌ FAIL${RESET}`
      : `${YELLOW}⚠️  SKIP${RESET}`;
  const detailStr = detail ? `\n     ${YELLOW}↳ ${detail}${RESET}` : '';
  console.log(`  ${icon}  ${label}${detailStr}`);
  checks.push({ label, status, detail });
}

function safeMsg(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  return msg
    .replace(/client_secret=[^&]+/g, 'client_secret=[REDACTED]')
    .replace(/refresh_token=[^&]+/g, 'refresh_token=[REDACTED]')
    .replace(/access_token=[^&]+/g, 'access_token=[REDACTED]');
}

async function main() {
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Khatwa — Google Drive OAuth 2.0 Real E2E Verification Test${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════${RESET}\n`);

  // ── 1. OAuth Credentials ──────────────────────────────────────────────────
  console.log(`${BOLD}[1] OAuth 2.0 Web Application Credentials${RESET}`);
  let oauthCreds: { clientId: string; clientSecret: string; redirectUri: string } | null = null;
  try {
    oauthCreds = loadOAuthClientCredentials();
    record('OAuth 2.0 Web Application client loaded', 'PASS', `Redirect: ${oauthCreds.redirectUri}`);
  } catch (err: any) {
    record('OAuth 2.0 Web Application client loaded', 'FAIL', safeMsg(err));
  }

  // ── 2. Refresh Token / Stored Tokens ──────────────────────────────────────
  console.log(`\n${BOLD}[2] Stored Refresh Token${RESET}`);
  const tokensPresent = hasStoredTokens();
  if (tokensPresent) {
    const tokens = loadStoredTokens();
    const hasRefresh = !!tokens?.refresh_token;
    record('Refresh token securely loaded from storage', hasRefresh ? 'PASS' : 'FAIL');
  } else {
    record(
      'Refresh token securely loaded from storage',
      'FAIL',
      'Tokens not found. Please run "npm run google-drive:auth" first.'
    );
  }

  if (!oauthCreds || !tokensPresent) {
    console.log(`\n${RED}Cannot proceed with live API test without valid OAuth credentials and tokens.${RESET}\n`);
    printSummary();
    process.exit(1);
  }

  // ── 3. Drive API Client Authentication ────────────────────────────────────
  console.log(`\n${BOLD}[3] Drive API Client Authentication${RESET}`);
  let drive: ReturnType<typeof google.drive>;
  try {
    drive = getDriveClient();
    // Test API call to verify credentials validity
    const about = await drive.about.get({
      fields: 'user(displayName, emailAddress), storageQuota',
    });
    const userEmail = about.data.user?.emailAddress || 'unknown';
    const userName = about.data.user?.displayName || 'User';
    const quotaLimit = about.data.storageQuota?.limit;
    const quotaUsed = about.data.storageQuota?.usage;

    record(
      'Google Drive OAuth2 client authenticated successfully',
      'PASS',
      `Authenticated User: ${userName} (${userEmail})`
    );
    if (quotaLimit && quotaUsed) {
      const gbUsed = (parseInt(quotaUsed, 10) / (1024 * 1024 * 1024)).toFixed(2);
      const gbTotal = (parseInt(quotaLimit, 10) / (1024 * 1024 * 1024)).toFixed(2);
      console.log(`     ${CYAN}Storage Quota:${RESET} ${gbUsed} GB used of ${gbTotal} GB`);
    }
  } catch (err: any) {
    record('Google Drive OAuth2 client authenticated', 'FAIL', safeMsg(err));
    printSummary();
    process.exit(1);
  }

  // ── 4. Root Folder Access ─────────────────────────────────────────────────
  console.log(`\n${BOLD}[4] Root Folder Access${RESET}`);
  const rootFolderId = env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
  if (!rootFolderId) {
    record('GOOGLE_DRIVE_ROOT_FOLDER_ID configured', 'FAIL', 'Missing from environment');
    printSummary();
    process.exit(1);
  }

  let rootFolderName = '';
  try {
    const meta = await drive.files.get({
      fileId: rootFolderId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });
    const isFolder = meta.data.mimeType === 'application/vnd.google-apps.folder';
    rootFolderName = meta.data.name || '(unnamed)';
    record(`Root folder "${rootFolderName}" accessible`, isFolder ? 'PASS' : 'FAIL');
  } catch (err: any) {
    record('Root folder accessible', 'FAIL', safeMsg(err));
    printSummary();
    process.exit(1);
  }

  // ── 5. Teacher Folder Creation ────────────────────────────────────────────
  console.log(`\n${BOLD}[5] Teacher Folder Creation${RESET}`);
  const testTeacherId = `oauth-test-${Date.now()}`;
  const teacherFolderName = `teacher-${testTeacherId}`;
  let teacherFolderId = '';
  try {
    const folder = await drive.files.create({
      requestBody: {
        name: teacherFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [rootFolderId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    teacherFolderId = folder.data.id!;
    record(`Teacher folder "${teacherFolderName}" created under root`, 'PASS');
  } catch (err: any) {
    record(`Teacher folder creation`, 'FAIL', safeMsg(err));
    printSummary();
    process.exit(1);
  }

  // ── 6. Lesson Folder Creation ─────────────────────────────────────────────
  console.log(`\n${BOLD}[6] Lesson Folder Creation${RESET}`);
  const testLessonId = `lesson-test-${Date.now()}`;
  const lessonFolderName = `lesson-${testLessonId}`;
  let lessonFolderId = '';
  try {
    const folder = await drive.files.create({
      requestBody: {
        name: lessonFolderName,
        mimeType: 'application/vnd.google-apps.folder',
        parents: [teacherFolderId],
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });
    lessonFolderId = folder.data.id!;
    record(`Lesson folder "${lessonFolderName}" created under teacher folder`, 'PASS');
  } catch (err: any) {
    record(`Lesson folder creation`, 'FAIL', safeMsg(err));
  }

  // ── 7. Real File Upload (Personal Storage) ─────────────────────────────────
  console.log(`\n${BOLD}[7] Real File Upload (Personal Google Account Quota)${RESET}`);
  const testFileName = `test-video-${Date.now()}.mp4`;
  const testContent = Buffer.from('Khatwa real video upload test using Google OAuth 2.0 Web Application');
  let uploadedFileId = '';

  const uploadTargetFolder = lessonFolderId || teacherFolderId;

  try {
    const body = Readable.from([testContent]);
    const uploadRes = await drive.files.create({
      requestBody: {
        name: testFileName,
        parents: [uploadTargetFolder],
      },
      media: {
        mimeType: 'video/mp4',
        body,
      },
      fields: 'id, name, mimeType, size, owners(displayName, emailAddress)',
      supportsAllDrives: true,
    });
    uploadedFileId = uploadRes.data.id!;
    const owner = uploadRes.data.owners?.[0];
    record(
      `Real file "${testFileName}" uploaded successfully`,
      'PASS',
      `Size: ${uploadRes.data.size} bytes | Owned by: ${owner?.displayName || 'Personal Account'} (${owner?.emailAddress || 'Google Account'})`
    );
  } catch (err: any) {
    record('Real file upload', 'FAIL', safeMsg(err));
  }

  // ── 8. Uploaded File Verification ─────────────────────────────────────────
  console.log(`\n${BOLD}[8] Uploaded File Verification${RESET}`);
  if (uploadedFileId) {
    try {
      const getRes = await drive.files.get({
        fileId: uploadedFileId,
        fields: 'id, name, mimeType, size, trashed',
        supportsAllDrives: true,
      });
      const exists = !getRes.data.trashed && getRes.data.name === testFileName;
      record('Uploaded file verified in Google Drive', exists ? 'PASS' : 'FAIL');
    } catch (err: any) {
      record('Uploaded file verification', 'FAIL', safeMsg(err));
    }
  } else {
    record('Uploaded file verification', 'SKIP', 'Upload failed');
  }

  // ── 9. File Permissions / Privacy Check ───────────────────────────────────
  console.log(`\n${BOLD}[9] Privacy & Permission Check${RESET}`);
  if (uploadedFileId) {
    try {
      const perms = await drive.permissions.list({
        fileId: uploadedFileId,
        fields: 'permissions(id, role, type)',
        supportsAllDrives: true,
      });
      const publicPerms = (perms.data.permissions || []).filter(
        (p) => p.type === 'anyone' || p.type === 'domain'
      );
      const isPrivate = publicPerms.length === 0;
      record('Uploaded file is fully private (no public sharing)', isPrivate ? 'PASS' : 'FAIL');
    } catch (err: any) {
      record('Privacy & permission check', 'FAIL', safeMsg(err));
    }
  } else {
    record('Privacy & permission check', 'SKIP');
  }

  // ── 10. File & Folder Cleanup ─────────────────────────────────────────────
  console.log(`\n${BOLD}[10] Cleanup Operations${RESET}`);
  if (uploadedFileId) {
    try {
      await drive.files.delete({ fileId: uploadedFileId, supportsAllDrives: true });
      record(`Test file "${testFileName}" deleted`, 'PASS');
    } catch (err: any) {
      record('Test file deletion', 'FAIL', safeMsg(err));
    }
  }

  if (lessonFolderId) {
    try {
      await drive.files.delete({ fileId: lessonFolderId, supportsAllDrives: true });
      record(`Lesson folder "${lessonFolderName}" deleted`, 'PASS');
    } catch (err: any) {
      record('Lesson folder deletion', 'FAIL', safeMsg(err));
    }
  }

  if (teacherFolderId) {
    try {
      await drive.files.delete({ fileId: teacherFolderId, supportsAllDrives: true });
      record(`Teacher folder "${teacherFolderName}" deleted`, 'PASS');
    } catch (err: any) {
      record('Teacher folder deletion', 'FAIL', safeMsg(err));
    }
  }

  printSummary();
  const anyFail = checks.some((c) => c.status === 'FAIL');
  process.exit(anyFail ? 1 : 0);
}

function printSummary() {
  const pass = checks.filter((c) => c.status === 'PASS').length;
  const fail = checks.filter((c) => c.status === 'FAIL').length;
  const skip = checks.filter((c) => c.status === 'SKIP').length;

  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Summary: ${GREEN}${pass} PASSED${RESET}, ${RED}${fail} FAILED${RESET}, ${YELLOW}${skip} SKIPPED${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════${RESET}\n`);
}

main().catch((err) => {
  console.error('\nUnexpected error during test execution:', err);
  process.exit(1);
});
