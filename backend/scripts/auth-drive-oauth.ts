import 'dotenv/config';
import http from 'http';
import url from 'url';
import readline from 'readline';
import {
  loadOAuthClientCredentials,
  getAuthUrl,
  handleAuthCallback,
  hasStoredTokens,
} from '../src/services/googleDriveAuth';

const BOLD = '\x1b[1m';
const GREEN = '\x1b[32m';
const YELLOW = '\x1b[33m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

async function main() {
  console.log(`\n${BOLD}═══════════════════════════════════════════════════════════════════${RESET}`);
  console.log(`${BOLD}  Khatwa — Google Drive OAuth 2.0 Web Application Authorization${RESET}`);
  console.log(`${BOLD}═══════════════════════════════════════════════════════════════════${RESET}\n`);

  // 1. Verify OAuth client credentials
  let creds: { clientId: string; clientSecret: string; redirectUri: string };
  try {
    creds = loadOAuthClientCredentials();
    console.log(`  ${GREEN}✅ OAuth 2.0 Web Application credentials loaded successfully.${RESET}`);
    console.log(`  ${CYAN}ℹ️  Redirect URI:${RESET} ${creds.redirectUri}`);
  } catch (err: any) {
    console.error(`  \x1b[31m❌ Error loading OAuth client:${RESET} ${err.message}`);
    process.exit(1);
  }

  // 2. Generate authorization URL
  const authUrl = getAuthUrl();

  const parsedRedirect = new URL(creds.redirectUri);
  const redirectPort = parseInt(parsedRedirect.port || '3000', 10);
  const redirectPath = parsedRedirect.pathname;

  console.log(`\n${BOLD}Please follow these steps to authorize your Personal Google Account:${RESET}\n`);
  console.log(`  ${BOLD}1.${RESET} Open the following authorization link in your web browser:`);
  console.log(`\n  ${CYAN}${BOLD}${authUrl}${RESET}\n`);
  console.log(`  ${BOLD}2.${RESET} Sign in with your ${BOLD}Personal Google Account${RESET} (where "Khatwa Videos" folder lives).`);
  console.log(`  ${BOLD}3.${RESET} Click "Continue" / "Allow" to grant Khatwa access to manage videos.`);
  console.log(`  ${BOLD}4.${RESET} The browser will automatically redirect to ${creds.redirectUri} to finish.\n`);

  // 3. Start a temporary HTTP server on redirectPort to receive the authorization code
  let serverClosed = false;

  const server = http.createServer(async (req, res) => {
    const parsedReq = url.parse(req.url || '', true);
    if (parsedReq.pathname === redirectPath) {
      const code = parsedReq.query.code as string;
      const error = parsedReq.query.error as string;

      if (error) {
        res.writeHead(400, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`
          <!DOCTYPE html>
          <html>
            <head><title>Authorization Cancelled</title></head>
            <body style="font-family: sans-serif; text-align: center; padding: 50px;">
              <h1 style="color: #c62828;">Authorization Cancelled / Failed</h1>
              <p>Google returned error: <strong>${error}</strong></p>
            </body>
          </html>
        `);
        console.error(`\n  \x1b[31m❌ Google returned authorization error:${RESET} ${error}`);
        cleanupAndExit(1);
        return;
      }

      if (code) {
        try {
          await handleAuthCallback(code);
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Google Drive Authorization</title></head>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #2e7d32;">Google Drive authorization successful.</h1>
                <p>You may close this window and return to the terminal.</p>
              </body>
            </html>
          `);
          console.log(`\n  ${GREEN}${BOLD}✅ Google Drive OAuth 2.0 authorization successful!${RESET}`);
          console.log(`  ${GREEN}✅ Tokens stored securely in secrets/google-drive-token.json${RESET}\n`);
          console.log(`  Next step: run ${BOLD}npm run google-drive:test${RESET} to perform end-to-end verification.\n`);
          cleanupAndExit(0);
        } catch (exchangeErr: any) {
          res.writeHead(500, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`
            <!DOCTYPE html>
            <html>
              <head><title>Token Exchange Failed</title></head>
              <body style="font-family: sans-serif; text-align: center; padding: 50px;">
                <h1 style="color: #c62828;">Token Exchange Failed</h1>
                <p>${exchangeErr.message}</p>
              </body>
            </html>
          `);
          console.error(`\n  \x1b[31m❌ Token exchange failed:${RESET} ${exchangeErr.message}`);
          cleanupAndExit(1);
        }
      }
    }
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.log(`  ${YELLOW}⚠️  Port ${redirectPort} is currently in use (e.g. backend server running).${RESET}`);
      console.log(`  ${CYAN}ℹ️  The backend callback route GET /auth/google/callback will receive the code.${RESET}`);
    } else {
      console.warn(`  ${YELLOW}⚠️  Local listener warning:${RESET} ${err.message}`);
    }
  });

  try {
    server.listen(redirectPort, () => {
      console.log(`  ${CYAN}⏳ Waiting for Google authorization callback on port ${redirectPort}...${RESET}`);
    });
  } catch {
    // Port in use
  }

  // Also support manual input in terminal
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  console.log(`  ${YELLOW}Tip: You can also paste the authorization code or full callback URL below:${RESET}`);
  rl.question('  Enter code or redirect URL: ', async (input) => {
    const trimmed = input.trim();
    if (!trimmed) return;

    let code = trimmed;
    if (trimmed.includes('code=')) {
      const match = trimmed.match(/code=([^&]+)/);
      if (match) code = decodeURIComponent(match[1]);
    }

    try {
      await handleAuthCallback(code);
      console.log(`\n  ${GREEN}${BOLD}✅ Google Drive OAuth 2.0 authorization successful!${RESET}`);
      console.log(`  ${GREEN}✅ Tokens stored securely in secrets/google-drive-token.json${RESET}\n`);
      cleanupAndExit(0);
    } catch (manualErr: any) {
      console.error(`\n  \x1b[31m❌ Token exchange failed:${RESET} ${manualErr.message}`);
      cleanupAndExit(1);
    }
  });

  function cleanupAndExit(code: number) {
    if (serverClosed) return;
    serverClosed = true;
    rl.close();
    server.close(() => {
      process.exit(code);
    });
    setTimeout(() => process.exit(code), 1000);
  }
}

main().catch((err) => {
  console.error('\nUnexpected error during OAuth setup:', err);
  process.exit(1);
});
