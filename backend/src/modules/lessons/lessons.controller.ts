import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../utils/validate';
import * as LessonsService from './lessons.service';
import * as PointsService from '../points/points.service';
import * as DriveService from '../../services/googleDrive';
import * as PlaybackTokenService from '../../services/playbackToken';
import { prisma } from '../../config/prisma';
import { z } from 'zod';
import multer from 'multer';
import { NotFoundError, ForbiddenError } from '../../utils/errors';

// ─── Multer config (memory storage — stream to Drive) ───────────────────────

export const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 * 1024 }, // 2GB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('video/')) {
      cb(null, true);
    } else {
      cb(new Error('Only video files are allowed'));
    }
  },
});

// ─── Schemas ─────────────────────────────────────────────────────────────────

const createLessonSchema = z.object({
  body: z.object({
    title: z.string().min(1),
    description: z.string().optional(),
    pointCost: z.coerce.number().int().min(0),
    orderIndex: z.coerce.number().int().optional(),
  }),
});

const updateLessonSchema = z.object({
  params: z.object({ id: z.string() }),
  body: z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    pointCost: z.coerce.number().int().min(0).optional(),
    orderIndex: z.coerce.number().int().optional(),
    openingQuizId: z.string().optional(),
    homeworkId: z.string().optional(),
    isPublished: z.boolean().optional(),
  }),
});

const lessonIdSchema = z.object({ params: z.object({ id: z.string() }) });

const listSchema = z.object({
  query: z.object({ teacherProfileId: z.string().optional() }),
});

const streamSchema = z.object({
  params: z.object({ id: z.string() }),
  query: z.object({ token: z.string().min(1) }),
});

// ─── Teacher controllers ──────────────────────────────────────────────────────

export const createLesson = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(createLessonSchema, req);

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: req.user!.sub },
  });
  if (!teacherProfile) throw NotFoundError('TeacherProfile');

  const data = await LessonsService.createLesson({
    teacherProfileId: teacherProfile.id,
    ...body,
  });
  res.status(201).json({ success: true, data });
});

export const updateLesson = asyncHandler(async (req: Request, res: Response) => {
  const { params, body } = validate(updateLessonSchema, req);

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: req.user!.sub },
  });
  if (!teacherProfile) throw NotFoundError('TeacherProfile');

  const data = await LessonsService.updateLesson(params.id, teacherProfile.id, body);
  res.status(200).json({ success: true, data });
});

export const getLessonDetail = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(lessonIdSchema, req);
  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: req.user!.sub },
  });
  if (!teacherProfile) throw NotFoundError('TeacherProfile');

  const data = await LessonsService.getLessonDetail(params.id, teacherProfile.id);
  res.status(200).json({ success: true, data });
});

/**
 * Teacher uploads video → backend streams to Google Drive (private).
 * Stores driveFileId on the lesson — never a public URL.
 */
export const uploadVideo = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(lessonIdSchema, req);

  if (!req.file) {
    res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No video file provided' } });
    return;
  }

  const lesson = await prisma.lesson.findUnique({ where: { id: params.id } });
  if (!lesson) throw NotFoundError('Lesson');

  const teacherProfile = await prisma.teacherProfile.findUnique({
    where: { userId: req.user!.sub },
  });
  if (!teacherProfile || lesson.teacherProfileId !== teacherProfile.id) {
    throw ForbiddenError('Not your lesson');
  }

  // Delete old file if exists
  if (lesson.driveFileId) {
    try {
      await DriveService.deleteVideo(lesson.driveFileId);
    } catch {
      // Best-effort cleanup
    }
  }

  // Upload to Google Drive (or local fallback)
  const { fileId, fileName, isGoogleDrive } = await DriveService.uploadVideo({
    buffer: req.file.buffer,
    filename: req.file.originalname,
    mimeType: req.file.mimetype,
    teacherId: req.user!.sub,
    lessonId: params.id,
  });

  // Store fileId (never a raw link) on lesson record
  await prisma.lesson.update({
    where: { id: params.id },
    data: { driveFileId: fileId, driveFileName: fileName },
  });

  res.status(200).json({
    success: true,
    data: {
      message: isGoogleDrive
        ? 'تم رفع الفيديو بنجاح وحفظه في Google Drive الخاص بالمنصة'
        : 'تم رفع الفيديو بنجاح وتخزينه في مساحة المنصة',
      driveFileId: fileId,
      fileName,
      isGoogleDrive,
    },
  });
});

// ─── Student controllers ──────────────────────────────────────────────────────

export const listLessons = asyncHandler(async (req: Request, res: Response) => {
  const { query } = validate(listSchema, req);
  const data = await LessonsService.listLessons(query.teacherProfileId);
  res.status(200).json({ success: true, data });
});

/**
 * Student requests lesson content — enforces all 3 gate checks server-side.
 * Returns metadata + a short-lived playback token for the stream endpoint.
 */
export const getLessonContent = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(lessonIdSchema, req);
  const studentId = req.user!.sub;

  // This throws 403 with reason codes if any gate fails
  const content = await LessonsService.getLessonContent(params.id, studentId);

  // Generate single-use playback token
  let playbackToken: string | undefined;
  if (content.hasVideo) {
    playbackToken = await PlaybackTokenService.generatePlaybackToken(studentId, params.id);
  }

  res.status(200).json({
    success: true,
    data: {
      ...content,
      driveFileId: undefined, // Never expose to client
      playbackToken,
    },
  });
});

/**
 * Streams the video through the backend proxy.
 * Validates the single-use playback token before proxying.
 * The student never sees the Drive file ID or URL.
 */
export const streamLesson = asyncHandler(async (req: Request, res: Response) => {
  const { params, query } = validate(streamSchema, req);

  const { lessonId, studentId } = await PlaybackTokenService.consumePlaybackToken(query.token);

  // Ensure the token belongs to the requesting student (defense-in-depth against token sharing).
  if (studentId !== req.user!.sub) {
    throw ForbiddenError('Playback token does not belong to this user');
  }

  if (lessonId !== params.id) {
    throw ForbiddenError('Token does not match lesson');
  }

  const lesson = await prisma.lesson.findUnique({ where: { id: lessonId } });
  if (!lesson?.driveFileId) throw NotFoundError('Video');

  // Log access (studentId, lessonId, timestamp, IP)
  await prisma.videoAccessLog.create({
    data: {
      studentId,
      lessonId,
      ip: req.ip ?? req.socket.remoteAddress ?? 'unknown',
    },
  });

  const range = req.headers.range;
  const { stream, mimeType, contentLength, contentRange, statusCode } = await DriveService.streamVideo(
    lesson.driveFileId,
    range
  );

  res.status(statusCode ?? 200);
  res.setHeader('Content-Type', mimeType);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Accept-Ranges', 'bytes');
  if (contentLength) res.setHeader('Content-Length', contentLength);
  if (contentRange) res.setHeader('Content-Range', contentRange);

  stream.pipe(res);

  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: { code: 'STREAM_ERROR', message: 'Video stream failed' } });
    }
  });
});

/**
 * Student unlocks a lesson (spends points).
 */
export const unlockLesson = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(lessonIdSchema, req);
  const data = await PointsService.spendPoints(req.user!.sub, params.id);
  res.status(200).json({ success: true, data });
});

export const submitHomework = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(lessonIdSchema, req);
  const data = await LessonsService.submitHomework(req.user!.sub, params.id);
  res.status(200).json({ success: true, data });
});
