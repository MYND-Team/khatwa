/**
 * /teacher/* — TEACHER role only (ADMIN can also bypass)
 *
 * Teacher capabilities:
 * - Manage their own profile
 * - Courses organized by Academic Year (PREPARATORY, SECONDARY_1, SECONDARY_2, SECONDARY_3)
 * - Create/manage Chapters inside courses
 * - Create/manage Lessons inside chapters
 * - Upload PDFs and videos for lessons
 * - Create quizzes (Assignment, Exam) with Multiple Choice, Essay, and Equation questions
 * - View own students and their performance
 */

import { Router } from 'express';
import { requireTeacher } from '../middleware/requireTeacher';
import * as LessonsController from '../modules/lessons/lessons.controller';
import * as QuizController from '../modules/quizEngine/quizEngine.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import * as LessonsService from '../modules/lessons/lessons.service';
import multer from 'multer';

const router = Router();
router.use(requireTeacher);

// Multer for file uploads (kept in memory)
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 100 * 1024 * 1024 } });

// ─── Profile ──────────────────────────────────────────────────────────────────

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const profile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.sub },
      include: {
        user: { select: { id: true, username: true, role: true, createdAt: true } },
        courses: {
          include: {
            chapters: {
              include: {
                lessons: { select: { id: true, title: true, orderIndex: true, isPublished: true } },
              },
            },
            _count: { select: { enrollments: true } },
          },
        },
      },
    });

    if (!profile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    res.status(200).json({ success: true, data: profile });
  })
);

router.patch(
  '/profile',
  asyncHandler(async (req, res) => {
    const { displayName, bio, subject, avatarUrl, academicStages } = req.body;
    const updated = await prisma.teacherProfile.update({
      where: { userId: req.user!.sub },
      data: {
        ...(displayName && { displayName }),
        ...(bio !== undefined && { bio }),
        ...(subject !== undefined && { subject }),
        ...(avatarUrl !== undefined && { avatarUrl }),
        ...(academicStages !== undefined && {
          academicStages: Array.isArray(academicStages) ? academicStages.join(',') : academicStages,
        }),
      },
    });
    res.status(200).json({ success: true, data: updated });
  })
);

// ─── Teacher Revenue & Analytics ─────────────────────────────────────────────

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(200).json({ success: true, data: { totalStudents: 0, totalEnrollments: 0, totalRevenue: 0, totalPoints: 0, freeEnrollments: 0, paidEnrollments: 0, courses: [] } });
      return;
    }

    const courses = await prisma.course.findMany({
      where: { teacherProfileId: teacherProfile.id },
      include: { _count: { select: { enrollments: true } } },
    });

    const enrollments = await prisma.courseEnrollment.findMany({
      where: { course: { teacherProfileId: teacherProfile.id } },
      include: { course: { select: { price: true, pointCost: true, title: true, id: true } } },
    });

    const uniqueStudents = new Set(enrollments.map((e: any) => e.studentId));
    const paidEnrollments = enrollments.filter((e: any) => e.course.price > 0 || e.course.pointCost > 0);
    const freeEnrollments = enrollments.filter((e: any) => e.course.price === 0 && e.course.pointCost === 0);
    const totalRevenue = enrollments.reduce((sum: number, e: any) => sum + (e.course.price || 0), 0);
    const totalPoints = enrollments.reduce((sum: number, e: any) => sum + (e.course.pointCost || 0), 0);

    const courseBreakdown = courses.map((c: any) => ({
      id: c.id,
      title: c.title,
      price: c.price,
      pointCost: c.pointCost,
      accessType: c.accessType,
      enrollmentCount: c._count.enrollments,
      revenueEGP: Math.round(c.price * c._count.enrollments * 100) / 100,
      revenuePoints: c.pointCost * c._count.enrollments,
    }));

    res.status(200).json({
      success: true,
      data: {
        totalStudents: uniqueStudents.size,
        totalEnrollments: enrollments.length,
        paidEnrollments: paidEnrollments.length,
        freeEnrollments: freeEnrollments.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPoints,
        courses: courseBreakdown,
      },
    });
  })
);

// ─── Courses (Academic Year Folder Structure) ─────────────────────────────────

router.get(
  '/courses',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const courses = await prisma.course.findMany({
      where: { teacherProfileId: teacherProfile.id },
      include: {
        chapters: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: { id: true, title: true, orderIndex: true, isPublished: true, pdfUrl: true, videoUrl: true, driveFileId: true },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: courses });
  })
);

router.post(
  '/courses',
  asyncHandler(async (req, res) => {
    const { title, subject, academicStage, imageUrl, description, pointCost, price, accessType, accessDurationDays } = req.body;

    if (!title || !subject || !academicStage) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_FIELDS', message: 'title, subject, and academicStage are required' },
      });
      return;
    }

    const validStages = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'SECONDARY_3'];
    if (!validStages.includes(academicStage)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAGE', message: `academicStage must be one of: ${validStages.join(', ')}` },
      });
      return;
    }

    const resolvedAccessType = accessType === 'LIMITED' ? 'LIMITED' : 'PERMANENT';
    const resolvedDays = resolvedAccessType === 'LIMITED' && accessDurationDays ? parseInt(accessDurationDays) : null;

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Teacher profile not found' } });
      return;
    }

    const course = await prisma.course.create({
      data: {
        teacherProfileId: teacherProfile.id,
        title,
        subject,
        academicStage,
        imageUrl: imageUrl || null,
        description: description || null,
        pointCost: parseInt(pointCost) || 0,
        price: parseFloat(price) || 0.0,
        accessType: resolvedAccessType,
        accessDurationDays: resolvedDays,
      },
      include: {
        chapters: true,
        _count: { select: { enrollments: true } },
      },
    });

    res.status(201).json({ success: true, data: course });
  })
);

router.get(
  '/courses/:courseId',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Teacher profile not found' } });
      return;
    }

    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, teacherProfileId: teacherProfile.id },
      include: {
        chapters: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              include: {
                assignmentQuiz: { include: { questions: true } },
                examQuiz: { include: { questions: true } },
              },
            },
          },
        },
        _count: { select: { enrollments: true } },
      },
    });

    if (!course) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Course not found' } });
      return;
    }

    res.status(200).json({ success: true, data: course });
  })
);

router.patch(
  '/courses/:courseId',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Teacher profile not found' } });
      return;
    }

    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, teacherProfileId: teacherProfile.id },
    });
    if (!course) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Course not found' } });
      return;
    }

    const { title, subject, academicStage, imageUrl, description, pointCost, price, isPublished, accessType, accessDurationDays } = req.body;
    const resolvedAccessType = accessType === 'LIMITED' ? 'LIMITED' : (accessType === 'PERMANENT' ? 'PERMANENT' : undefined);
    const resolvedDays = resolvedAccessType === 'LIMITED' && accessDurationDays ? parseInt(accessDurationDays) : (accessType === 'PERMANENT' ? null : undefined);
    const updated = await prisma.course.update({
      where: { id: course.id },
      data: {
        ...(title && { title }),
        ...(subject && { subject }),
        ...(academicStage && { academicStage }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(description !== undefined && { description }),
        ...(pointCost !== undefined && { pointCost: parseInt(pointCost) }),
        ...(price !== undefined && { price: parseFloat(price) }),
        ...(isPublished !== undefined && { isPublished: Boolean(isPublished) }),
        ...(resolvedAccessType !== undefined && { accessType: resolvedAccessType }),
        ...(resolvedDays !== undefined && { accessDurationDays: resolvedDays }),
      },
    });

    res.status(200).json({ success: true, data: updated });
  })
);

router.delete(
  '/courses/:courseId',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Teacher profile not found' } });
      return;
    }

    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, teacherProfileId: teacherProfile.id },
    });
    if (!course) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Course not found' } });
      return;
    }

    await prisma.course.delete({ where: { id: course.id } });
    res.status(200).json({ success: true, message: 'Course deleted' });
  })
);

// ─── Chapters ─────────────────────────────────────────────────────────────────

router.get(
  '/courses/:courseId/chapters',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
      return;
    }

    const chapters = await prisma.chapter.findMany({
      where: { courseId: req.params.courseId, course: { teacherProfileId: teacherProfile.id } },
      orderBy: { orderIndex: 'asc' },
      include: {
        lessons: {
          orderBy: { orderIndex: 'asc' },
          select: { id: true, title: true, orderIndex: true, isPublished: true },
        },
      },
    });

    res.status(200).json({ success: true, data: chapters });
  })
);

router.post(
  '/courses/:courseId/chapters',
  asyncHandler(async (req, res) => {
    const { title, description, imageUrl, orderIndex } = req.body;

    if (!title) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'title is required' } });
      return;
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Teacher profile not found' } });
      return;
    }

    const course = await prisma.course.findFirst({
      where: { id: req.params.courseId, teacherProfileId: teacherProfile.id },
    });
    if (!course) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Course not found' } });
      return;
    }

    const maxOrder = await prisma.chapter.aggregate({
      where: { courseId: course.id },
      _max: { orderIndex: true },
    });
    const nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;

    const chapter = await prisma.chapter.create({
      data: {
        courseId: course.id,
        title,
        description: description || null,
        imageUrl: imageUrl || null,
        orderIndex: orderIndex !== undefined ? parseInt(orderIndex) : nextOrder,
      },
      include: { lessons: true },
    });

    res.status(201).json({ success: true, data: chapter });
  })
);

router.patch(
  '/chapters/:chapterId',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
      return;
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: req.params.chapterId, course: { teacherProfileId: teacherProfile.id } },
    });
    if (!chapter) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chapter not found' } });
      return;
    }

    const { title, description, imageUrl, orderIndex } = req.body;
    const updated = await prisma.chapter.update({
      where: { id: chapter.id },
      data: {
        ...(title && { title }),
        ...(description !== undefined && { description }),
        ...(imageUrl !== undefined && { imageUrl }),
        ...(orderIndex !== undefined && { orderIndex: parseInt(orderIndex) }),
      },
    });

    res.status(200).json({ success: true, data: updated });
  })
);

router.delete(
  '/chapters/:chapterId',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
      return;
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: req.params.chapterId, course: { teacherProfileId: teacherProfile.id } },
    });
    if (!chapter) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chapter not found' } });
      return;
    }

    await prisma.chapter.delete({ where: { id: chapter.id } });
    res.status(200).json({ success: true, message: 'Chapter deleted' });
  })
);

// ─── Lessons ──────────────────────────────────────────────────────────────────

router.get('/lessons', LessonsController.listLessons);

router.get(
  '/chapters/:chapterId/lessons',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
      return;
    }

    const lessons = await prisma.lesson.findMany({
      where: { chapterId: req.params.chapterId, teacherProfileId: teacherProfile.id },
      orderBy: { orderIndex: 'asc' },
      include: {
        assignmentQuiz: { include: { questions: { orderBy: { orderIndex: 'asc' } } } },
        examQuiz: { include: { questions: { orderBy: { orderIndex: 'asc' } } } },
      },
    });

    res.status(200).json({ success: true, data: lessons });
  })
);

router.post(
  '/chapters/:chapterId/lessons',
  asyncHandler(async (req, res) => {
    const { title, description, pointCost, orderIndex, videoUrl, isPublished } = req.body;

    if (!title) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'title is required' } });
      return;
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Teacher profile not found' } });
      return;
    }

    const chapter = await prisma.chapter.findFirst({
      where: { id: req.params.chapterId, course: { teacherProfileId: teacherProfile.id } },
      include: { course: true },
    });
    if (!chapter) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Chapter not found' } });
      return;
    }

    const maxOrder = await prisma.lesson.aggregate({
      where: { chapterId: chapter.id },
      _max: { orderIndex: true },
    });
    const nextOrder = (maxOrder._max.orderIndex ?? -1) + 1;

    const lesson = await prisma.lesson.create({
      data: {
        teacherProfileId: teacherProfile.id,
        courseId: chapter.courseId,
        chapterId: chapter.id,
        title,
        description: description || null,
        pointCost: parseInt(pointCost) || 0,
        orderIndex: orderIndex !== undefined ? parseInt(orderIndex) : nextOrder,
        videoUrl: videoUrl || null,
        isPublished: isPublished !== undefined ? Boolean(isPublished) : true,
      },
    });

    res.status(201).json({ success: true, data: lesson });
  })
);

router.get('/lessons/:id', LessonsController.getLessonDetail);
router.patch('/lessons/:id', LessonsController.updateLesson);

// ─── PDF Upload ───────────────────────────────────────────────────────────────

router.post(
  '/lessons/:id/pdf',
  upload.single('pdf'),
  asyncHandler(async (req, res) => {
    if (!req.file) {
      res.status(400).json({ success: false, error: { code: 'NO_FILE', message: 'No PDF file provided' } });
      return;
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
      return;
    }

    const lesson = await prisma.lesson.findFirst({
      where: { id: req.params.id, teacherProfileId: teacherProfile.id },
    });
    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
      return;
    }

    // Store PDF as base64 data URL (for simple hosting) or use Drive if configured
    let pdfUrl: string;
    let pdfFileName: string;

    try {
      const { uploadVideo } = await import('../services/googleDrive');
      const result = await uploadVideo({
        buffer: req.file.buffer,
        filename: req.file.originalname,
        mimeType: req.file.mimetype,
        teacherId: req.user!.sub,
        lessonId: lesson.id,
      });
      pdfUrl = `drive:${result.fileId}`;
      pdfFileName = result.fileName;
    } catch {
      // Fallback: store as base64
      const b64 = req.file.buffer.toString('base64');
      pdfUrl = `data:${req.file.mimetype};base64,${b64}`;
      pdfFileName = req.file.originalname;
    }

    const updated = await prisma.lesson.update({
      where: { id: lesson.id },
      data: { pdfUrl, pdfFileName },
    });

    res.status(200).json({
      success: true,
      data: { lessonId: updated.id, pdfFileName: updated.pdfFileName, message: 'PDF uploaded successfully' },
    });
  })
);

// ─── Video Upload ─────────────────────────────────────────────────────────────

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
        message: isGoogleDrive ? 'تم رفع الفيديو في Google Drive' : 'تم رفع الفيديو',
        driveFileId: fileId,
        fileName,
        isGoogleDrive,
      },
    });
  })
);

// ─── Quizzes & Exams ──────────────────────────────────────────────────────────

router.post('/quizzes', QuizController.createQuiz);
router.post('/quizzes/:id/questions', QuizController.addQuestion);
router.get('/quizzes/:id', QuizController.getQuizWithAnswers);
router.delete(
  '/quizzes/:id',
  asyncHandler(async (req, res) => {
    await prisma.quiz.delete({ where: { id: req.params.id } });
    res.status(200).json({ success: true, message: 'Quiz deleted' });
  })
);

// Assign quiz to lesson as assignment or exam
router.patch(
  '/lessons/:lessonId/assign-quiz',
  asyncHandler(async (req, res) => {
    const { quizId, quizRole } = req.body; // quizRole: 'assignment' | 'exam'

    if (!quizId || !quizRole) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'quizId and quizRole are required' } });
      return;
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Not authorized' } });
      return;
    }

    const lesson = await prisma.lesson.findFirst({
      where: { id: req.params.lessonId, teacherProfileId: teacherProfile.id },
    });
    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
      return;
    }

    const updateData: any = {};
    if (quizRole === 'assignment') updateData.assignmentQuizId = quizId;
    else if (quizRole === 'exam') updateData.examQuizId = quizId;
    else if (quizRole === 'opening') updateData.openingQuizId = quizId;
    else if (quizRole === 'homework') updateData.homeworkId = quizId;
    else {
      res.status(400).json({ success: false, error: { code: 'INVALID_ROLE', message: 'quizRole must be assignment, exam, opening, or homework' } });
      return;
    }

    const updated = await prisma.lesson.update({ where: { id: lesson.id }, data: updateData });
    res.status(200).json({ success: true, data: updated });
  })
);

// ─── Student dashboards (own students only) ───────────────────────────────────

router.get(
  '/students',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(200).json({ success: true, data: [] });
      return;
    }

    const { stage = '' } = req.query as Record<string, string>;
    const validStages = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'SECONDARY_3'];
    const stageFilter = stage && validStages.includes(stage) ? stage : null;

    const enrollments = await prisma.courseEnrollment.findMany({
      where: {
        course: { teacherProfileId: teacherProfile.id },
        ...(stageFilter ? { student: { studentProfile: { academicStage: stageFilter as any } } } : {}),
      },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            pointsBalance: true,
            walletBalance: true,
            isActive: true,
            createdAt: true,
            studentProfile: { select: { studentPhoneNumber: true, academicStage: true } },
          },
        },
        course: { select: { id: true, title: true, academicStage: true } },
      },
      distinct: ['studentId'],
    });

    res.status(200).json({ success: true, data: enrollments.map((e: any) => ({ ...e.student, enrolledCourse: e.course })) });
  })
);

router.get(
  '/students/:studentId/performance',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const data = await LessonsService.getStudentProgress(req.params.studentId as string, teacherProfile.id);
    res.status(200).json({ success: true, data });
  })
);

// ─── Public Teacher Listing (for students discovering teachers/courses) ───────

export default router;
