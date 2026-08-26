import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import path from 'path';
import fs from 'fs';

import { env } from './config/env';
import { errorHandler } from './utils/errors';

// Routers
import authRouter from './modules/auth/auth.router';
import studentRouter from './routes/student.router';
import teacherRouter from './routes/teacher.router';
import staffRouter from './routes/staff.router';
import adminRouter from './routes/admin.router';
import pointRequestsRouter from './routes/pointRequests.router';

// Public branding (no auth required)
import * as BrandingController from './modules/branding/branding.controller';
import { prisma } from './config/prisma';
import { asyncHandler } from './utils/asyncHandler';

const app = express();

// ─── Frontend directory resolution ───────────────────────────────────────────
const candidateFrontendPaths = [
  env.FRONTEND_PATH,
  path.resolve(__dirname, '../../frontend'),
  path.resolve(__dirname, '../frontend'),
  path.resolve(process.cwd(), '../frontend'),
  path.resolve(process.cwd(), 'frontend'),
].filter(Boolean) as string[];

const resolvedFrontendPath = candidateFrontendPaths.find((p) => fs.existsSync(p));

// ─── Security + parsing ───────────────────────────────────────────────────────

app.disable('x-powered-by');

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    frameguard: { action: 'sameorigin' },
    noSniff: true,
  })
);

// ─── CORS ────────────────────────────────────────────────────────────────────
// In production, set ALLOWED_ORIGINS to a comma-separated list of trusted origins.
// Without it in production, CORS defaults to the same-origin policy (no cross-origin).
const allowedOrigins: string[] | undefined = env.ALLOWED_ORIGINS
  ? env.ALLOWED_ORIGINS.split(',').map((o) => o.trim()).filter(Boolean)
  : undefined;

if (env.NODE_ENV === 'production' && !allowedOrigins) {
  console.warn('⚠️  [CORS] ALLOWED_ORIGINS is not set in production — cross-origin requests will be blocked.');
}

app.use(
  cors({
    origin:
      env.NODE_ENV !== 'production'
        ? true // allow all in development
        : allowedOrigins && allowedOrigins.length > 0
          ? allowedOrigins
          : false, // block all cross-origin in production if not configured
    credentials: true,
  })
);

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(morgan(env.NODE_ENV === 'production' ? 'combined' : 'dev'));

// ─── Static Frontend Serving ──────────────────────────────────────────────────
if (resolvedFrontendPath) {
  app.use(
    express.static(resolvedFrontendPath, {
      extensions: ['html', 'htm'],
      index: 'index.html',
    })
  );
}

// ─── Rate limiting ────────────────────────────────────────────────────────────

const globalLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many requests, please slow down.' } },
});

// In development/test, skip auth rate limiting so repeated E2E test runs don't hit limits.
// Production always enforces full rate limiting.
const authLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.NODE_ENV === 'production' ? env.AUTH_RATE_LIMIT_MAX : 9999,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: { code: 'RATE_LIMITED', message: 'Too many auth attempts.' } },
});

app.use(globalLimiter);

// ─── Public routes ────────────────────────────────────────────────────────────

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Public branding endpoint (frontend consumes this without auth)
app.get('/settings/branding', BrandingController.getSettings);

// ─── Public course/teacher discovery (no auth needed) ────────────────────────

app.get('/courses', asyncHandler(async (req, res) => {
  const { stage, search } = req.query as Record<string, string>;
  const where: any = { isPublished: true };
  if (stage) where.academicStage = stage;
  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { subject: { contains: search, mode: 'insensitive' } },
      { teacherProfile: { displayName: { contains: search, mode: 'insensitive' } } },
    ];
  }
  const courses = await prisma.course.findMany({
    where,
    select: {
      id: true, title: true, subject: true, academicStage: true,
      imageUrl: true, description: true, pointCost: true, price: true,
      teacherProfile: { select: { id: true, displayName: true, avatarUrl: true, rating: true, subject: true } },
      _count: { select: { chapters: true, enrollments: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
  res.status(200).json({ success: true, data: courses });
}));

app.get('/teachers', asyncHandler(async (_req, res) => {
  const teachers = await prisma.teacherProfile.findMany({
    where: { user: { isActive: true } },
    select: {
      id: true, displayName: true, bio: true, subject: true,
      avatarUrl: true, rating: true, ratingCount: true, academicStages: true,
      courses: {
        where: { isPublished: true },
        select: {
          id: true, title: true, subject: true, academicStage: true,
          imageUrl: true, pointCost: true, price: true,
          _count: { select: { chapters: true, enrollments: true } },
        },
      },
      user: { select: { id: true, username: true } },
    },
  });
  res.status(200).json({ success: true, data: teachers });
}));

app.get('/teachers/:id', asyncHandler(async (req, res) => {
  const profile = await prisma.teacherProfile.findUnique({
    where: { id: req.params.id },
    include: {
      courses: {
        where: { isPublished: true },
        include: {
          chapters: {
            orderBy: { orderIndex: 'asc' },
            select: { id: true, title: true, imageUrl: true, orderIndex: true, _count: { select: { lessons: true } } },
          },
          _count: { select: { enrollments: true } },
        },
      },
      user: { select: { id: true, username: true } },
    },
  });
  if (!profile) {
    res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
    return;
  }
  res.status(200).json({ success: true, data: profile });
}));

// ─── Auth routes (rate-limited in production) ─────────────────────────────────

app.use('/auth', authLimiter, authRouter);

// ─── Role-isolated route groups ───────────────────────────────────────────────
// Each group has its own auth middleware — structurally separated, not just role-checked.
// A STUDENT token will be structurally rejected by /teacher/* and /admin/* routes.

app.use('/student', studentRouter);
app.use('/teacher', teacherRouter);
app.use('/staff', staffRouter);
app.use('/admin', adminRouter);
app.use('/point-requests', pointRequestsRouter);

// ─── 404 handler ─────────────────────────────────────────────────────────────

app.use((req, res) => {
  const isApiRoute =
    req.path.startsWith('/auth') ||
    req.path.startsWith('/student') ||
    req.path.startsWith('/teacher') ||
    req.path.startsWith('/staff') ||
    req.path.startsWith('/admin') ||
    req.path.startsWith('/point-requests') ||
    req.path.startsWith('/settings') ||
    req.path.startsWith('/health');

  if (isApiRoute || !req.accepts('html')) {
    return res.status(404).json({
      success: false,
      error: { code: 'NOT_FOUND', message: 'Route not found' },
    });
  }

  if (resolvedFrontendPath) {
    const notFoundHtml = path.join(resolvedFrontendPath, '404.html');
    if (fs.existsSync(notFoundHtml)) {
      return res.status(404).sendFile(notFoundHtml);
    }
  }

  res.status(404).json({
    success: false,
    error: { code: 'NOT_FOUND', message: 'Route not found' },
  });
});

// ─── Centralized error handler ────────────────────────────────────────────────

app.use(errorHandler);

export default app;
