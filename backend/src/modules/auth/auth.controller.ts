import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../utils/validate';
import {
  registerStudentSchema,
  registerWithCodeSchema,
  loginSchema,
  refreshTokenSchema,
} from './auth.schema';
import * as AuthService from './auth.service';
import { authenticate } from '../../middleware/auth';
import { prisma } from '../../config/prisma';

// ─── Cookie config ────────────────────────────────────────────────────────────
const REFRESH_COOKIE = 'khatwa_rt';
const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
  path: '/',
};

function setRefreshCookie(res: Response, token: string) {
  res.cookie(REFRESH_COOKIE, token, COOKIE_OPTIONS);
}

function clearRefreshCookie(res: Response) {
  res.clearCookie(REFRESH_COOKIE, { path: '/', sameSite: 'strict', httpOnly: true, secure: process.env.NODE_ENV === 'production' });
}

// ─── Register Student ─────────────────────────────────────────────────────────
export const registerStudent = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(registerStudentSchema, req);
  const result = await AuthService.registerStudent(body);
  // Set refresh token as HttpOnly cookie
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      // refreshToken intentionally NOT returned in body anymore
    },
  });
});

// ─── Register with Code (Teacher / Staff / Admin) ────────────────────────────
export const registerWithCode = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(registerWithCodeSchema, req);
  const result = await AuthService.registerWithCode(body);
  setRefreshCookie(res, result.refreshToken);
  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
    },
  });
});

// ─── Login ────────────────────────────────────────────────────────────────────
export const login = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(loginSchema, req);
  const result = await AuthService.login(body);
  // Set refresh token as HttpOnly cookie
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.accessToken,
      // refreshToken intentionally NOT returned in body anymore
    },
  });
});

// ─── Refresh ──────────────────────────────────────────────────────────────────
// Accepts refresh token from either HttpOnly cookie OR request body (backward compat)
export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const rawToken =
    (req.cookies as Record<string, string>)?.[REFRESH_COOKIE] ||
    req.body?.refreshToken;

  if (!rawToken) {
    res.status(401).json({ success: false, error: { code: 'MISSING_REFRESH_TOKEN', message: 'No refresh token provided' } });
    return;
  }

  const tokens = await AuthService.refreshAccessToken(rawToken);
  // Rotate cookie
  setRefreshCookie(res, tokens.refreshToken);
  res.status(200).json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      // refreshToken intentionally NOT returned in body
    },
  });
});

// ─── Logout ───────────────────────────────────────────────────────────────────
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const rawToken =
    (req.cookies as Record<string, string>)?.[REFRESH_COOKIE] ||
    req.body?.refreshToken;

  if (rawToken) {
    await AuthService.logout(rawToken);
  }
  clearRefreshCookie(res);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

// ─── /auth/me — Get current user from DB ─────────────────────────────────────
export const me = [
  authenticate,
  asyncHandler(async (req: Request, res: Response) => {
    const userId = req.user!.sub;
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        pointsBalance: true,
        walletBalance: true,
        createdAt: true,
        studentProfile: {
          select: {
            studentPhoneNumber: true,
            parentInfo: { select: { parentPhoneNumber: true, fatherJob: true } },
          },
        },
        teacherProfile: {
          select: { id: true, displayName: true, avatarUrl: true, subject: true },
        },
      },
    });

    if (!user || !user.isActive) {
      res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'User not found or inactive' } });
      return;
    }

    res.status(200).json({ success: true, data: user });
  }),
];
