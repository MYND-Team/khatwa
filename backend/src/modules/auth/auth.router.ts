import { Router } from 'express';
import * as AuthController from './auth.controller';

const router = Router();

// POST /auth/register/student
router.post('/register/student', AuthController.registerStudent);

// POST /auth/register  (TEACHER / ASSISTANT / EDITOR / ADMIN via access code)
router.post('/register', AuthController.registerWithCode);

// POST /auth/login
router.post('/login', AuthController.login);

// POST /auth/refresh  — reads refresh token from HttpOnly cookie (or body for backward compat)
router.post('/refresh', AuthController.refresh);

// POST /auth/logout   — clears HttpOnly cookie and revokes DB token
router.post('/logout', AuthController.logout);

// GET /auth/me        — returns live user data from DB using access token
router.get('/me', ...AuthController.me);

// POST /auth/dev/staff-login (Quick login/switch for staff testing)
router.post('/dev/staff-login', async (_req, res) => {
  const { prisma } = await import('../../config/prisma');
  const { signAccessToken, signRefreshToken } = await import('../../utils/jwt');
  const crypto = await import('crypto');

  let user = await prisma.user.findFirst({
    where: { role: { in: ['STAFF', 'ADMIN'] } }
  });

  if (!user) {
    user = await prisma.user.create({
      data: {
        username: 'staff_admin',
        passwordHash: 'dev_mock_hash',
        role: 'ADMIN',
        pointsBalance: 1000
      }
    });
  }

  const jti = crypto.randomUUID();
  const accessToken = signAccessToken({ sub: user.id, username: user.username, role: user.role as any });
  const refreshToken = signRefreshToken({ sub: user.id, jti });

  res.status(200).json({
    success: true,
    data: {
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
        pointsBalance: user.pointsBalance
      },
      accessToken,
      refreshToken
    }
  });
});

// GET /auth/google/callback — Google OAuth 2.0 Web Application callback
router.get('/google/callback', async (req, res) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send('<h1>Authorization Failed</h1><p>Missing authorization code.</p>');
    return;
  }
  try {
    const { handleAuthCallback } = await import('../../services/googleDriveAuth');
    await handleAuthCallback(code);
    res.status(200).send(`
      <!DOCTYPE html>
      <html>
        <head><title>Google Drive Authorization</title></head>
        <body style="font-family: sans-serif; text-align: center; padding: 50px;">
          <h1 style="color: #2e7d32;">Google Drive authorization successful.</h1>
          <p>You may close this window and return to the backend.</p>
        </body>
      </html>
    `);
  } catch (err: any) {
    res.status(500).send(`<h1>Authorization Error</h1><p>Failed to exchange authorization code: ${err.message}</p>`);
  }
});

export default router;
