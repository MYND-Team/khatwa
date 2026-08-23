/**
 * /teacher/* — TEACHER role only
 *
 * Every route is behind requireTeacher middleware.
 * STUDENT, STAFF, and ADMIN tokens are structurally rejected by this router.
 *
 * TEACHER can:
 * - Upload/manage their own lessons and videos
 * - Create/manage quizzes and homework for their lessons
 * - View student performance dashboards (own enrolled students only)
 */

import { Router } from 'express';
import { requireTeacher } from '../middleware/requireTeacher';
import * as LessonsController from '../modules/lessons/lessons.controller';
import * as QuizController from '../modules/quizEngine/quizEngine.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import * as LessonsService from '../modules/lessons/lessons.service';

const router = Router();

// All routes require TEACHER role
router.use(requireTeacher);

// ─── Profile ─────────────────────────────────────────────────────────────────

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { user: { select: { id: true, username: true, role: true } } },
    });
    res.status(200).json({ success: true, data: profile });
  })
);

// ─── Lessons — TEACHER only ──────────────────────────────────────────────────

router.post('/lessons', LessonsController.createLesson);
router.patch('/lessons/:id', LessonsController.updateLesson);
router.get('/lessons/:id', LessonsController.getLessonDetail);
router.get('/lessons', LessonsController.listLessons);

// Video upload — TEACHER only
router.post(
  '/lessons/:id/video',
  LessonsController.upload.single('video'),
  LessonsController.uploadVideo
);

router.post(
  '/upload-video',
  LessonsController.upload.single('video'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No video file provided' } });
      return;
    }

    const { uploadVideo } = await import('../services/googleDrive');
    const teacherId = req.user?.sub || 'teacher-default';
    const lessonId = (req.body.lessonId as string) || `lec-${Date.now()}`;

    const { fileId, fileName, isGoogleDrive } = await uploadVideo({
      buffer: req.file.buffer,
      filename: req.file.originalname,
      mimeType: req.file.mimetype,
      teacherId,
      lessonId,
    });

    res.status(200).json({
      success: true,
      data: {
        message: isGoogleDrive
          ? 'تم رفع الفيديو وحفظه في Google Drive الخاص بالمنصة'
          : 'تم رفع الفيديو وحفظه في مساحة المنصة',
        driveFileId: fileId,
        fileName,
        isGoogleDrive,
      },
    });
  })
);

// ─── Quiz engine ─────────────────────────────────────────────────────────────

router.post('/quizzes', QuizController.createQuiz);
router.post('/quizzes/:id/questions', QuizController.addQuestion);
router.get('/quizzes/:id', QuizController.getQuizWithAnswers); // includes correct answers

// ─── Student dashboards (own students only) ───────────────────────────────────

router.get(
  '/students/:studentId/performance',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.sub },
    });

    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const data = await LessonsService.getStudentProgress(req.params.studentId as string, teacherProfile.id);
    res.status(200).json({ success: true, data });
  })
);

router.get(
  '/students',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.sub },
    });
    if (!teacherProfile) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const lessons = await prisma.lesson.findMany({
      where: { teacherProfileId: teacherProfile.id },
      select: { id: true },
    });
    const lessonIds = lessons.map((l: any) => l.id);

    const unlocks = await prisma.unlockedLesson.findMany({
      where: { lessonId: { in: lessonIds } },
      include: {
        student: { select: { id: true, username: true, pointsBalance: true } },
      },
      distinct: ['studentId'],
    });

    res.status(200).json({ success: true, data: unlocks.map((u: any) => u.student) });
  })
);

export default router;
