import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { Readable } from 'stream';
import { google } from 'googleapis';

async function runLiveTest() {
  const result: Record<string, 'PASS' | 'FAIL'> = {
    auth: 'FAIL',
    rootAccess: 'FAIL',
    fileUpload: 'FAIL',
    fileDeletion: 'FAIL',
    credSecurity: 'FAIL',
  };

  try {
    // 1. Credentials security & loading
    const rawKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_JSON;
    const rootFolderId = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;

    if (!rawKey || !rootFolderId) {
      throw new Error('Missing environment variables');
    }

    let creds: any;
    const trimmed = rawKey.trim();
    if (trimmed.startsWith('./') || trimmed.startsWith('../') || trimmed.startsWith('/') || trimmed.startsWith('\\')) {
      const resolved = path.resolve(process.cwd(), trimmed);
      creds = JSON.parse(fs.readFileSync(resolved, 'utf-8'));
    } else {
      creds = JSON.parse(trimmed);
    }

    if (creds.type === 'service_account' && creds.client_email && creds.private_key) {
      result.credSecurity = 'PASS';
    }

    // 2. Authentication
    const auth = new google.auth.GoogleAuth({
      credentials: creds,
      scopes: ['https://www.googleapis.com/auth/drive'],
    });
    const drive = google.drive({ version: 'v3', auth });
    await auth.getAccessToken();
    result.auth = 'PASS';

    // 3. Root folder access & type verification
    const rootMeta = await drive.files.get({
      fileId: rootFolderId,
      fields: 'id, name, mimeType',
      supportsAllDrives: true,
    });

    if (rootMeta.data.mimeType === 'application/vnd.google-apps.folder') {
      result.rootAccess = 'PASS';
    }

    // 4. Create temporary test file inside the root folder
    const fileName = `test-temp-${Date.now()}.txt`;
    const uploadRes = await drive.files.create({
      requestBody: {
        name: fileName,
        parents: [rootFolderId],
        mimeType: 'text/plain',
      },
      media: {
        mimeType: 'text/plain',
        body: Readable.from(['Khatwa verification test']),
      },
      fields: 'id, name',
      supportsAllDrives: true,
    });

    const fileId = uploadRes.data.id;
    if (fileId) {
      // Verify file exists
      const verifyRes = await drive.files.get({
        fileId,
        fields: 'id, name, trashed',
        supportsAllDrives: true,
      });

      if (verifyRes.data.name === fileName && !verifyRes.data.trashed) {
        result.fileUpload = 'PASS';
      }

      // 5. Delete temporary test file
      await drive.files.delete({
        fileId,
        supportsAllDrives: true,
      });

      // Verify deletion
      try {
        const checkRes = await drive.files.get({
          fileId,
          fields: 'id, trashed',
          supportsAllDrives: true,
        });
        if (checkRes.data.trashed) {
          result.fileDeletion = 'PASS';
        }
      } catch (err: any) {
        if (err.status === 404 || err.code === 404) {
          result.fileDeletion = 'PASS';
        }
      }
    }
  } catch (error: any) {
    console.error('API Error:', error?.message || error);
  }

  console.log('---RESULTS---');
  console.log(JSON.stringify(result, null, 2));
}

runLiveTest();
