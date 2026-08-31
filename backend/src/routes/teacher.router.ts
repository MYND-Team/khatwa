/**
 * /teacher/* — TEACHER role only (ADMIN can also bypass)
 *
 * Teacher capabilities:
 * - Manage profile & enabled academic stage workspaces
 * - Stage-isolated Workspaces (PREPARATORY, SECONDARY_1, SECONDARY_2, SECONDARY_3)
 * - Stage-isolated courses, chapters, lessons, students, and revenue
 * - Teacher Content Preview (verify own PDFs, video streams, quizzes)
 * - Lesson-level pricing (EGP & Points)
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
        workspaces: true,
        courses: {
          include: {
            chapters: {
              include: {
                lessons: { select: { id: true, title: true, price: true, pointCost: true, isPublished: true } },
              },
            },
            _count: { select: { enrollments: true, lessonSubscriptions: true } },
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

// ─── Stage Workspaces (Requirement 2) ────────────────────────────────────────

const VALID_STAGES = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'SECONDARY_3'];

router.get(
  '/workspaces',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { workspaces: true },
    });

    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    // Auto-create default workspaces from academicStages if empty
    if (teacherProfile.workspaces.length === 0) {
      const stageList = (teacherProfile.academicStages || 'SECONDARY_1,SECONDARY_2,SECONDARY_3')
        .split(',')
        .map((s) => s.trim())
        .filter((s) => VALID_STAGES.includes(s));

      for (const st of stageList) {
        await prisma.teacherStage.upsert({
          where: { teacherProfileId_stage: { teacherProfileId: teacherProfile.id, stage: st as any } },
          create: { teacherProfileId: teacherProfile.id, stage: st as any, isActive: true },
          update: { isActive: true },
        });
      }
    }

    const updated = await prisma.teacherStage.findMany({
      where: { teacherProfileId: teacherProfile.id, isActive: true },
      orderBy: { stage: 'asc' },
    });

    res.status(200).json({ success: true, data: updated });
  })
);

router.post(
  '/workspaces',
  asyncHandler(async (req, res) => {
    const { stage } = req.body;
    if (!stage || !VALID_STAGES.includes(stage)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STAGE', message: 'المرحلة الدراسية غير صالحة' } });
      return;
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const workspace = await prisma.teacherStage.upsert({
      where: { teacherProfileId_stage: { teacherProfileId: teacherProfile.id, stage: stage as any } },
      create: { teacherProfileId: teacherProfile.id, stage: stage as any, isActive: true },
      update: { isActive: true },
    });

    res.status(201).json({ success: true, data: workspace });
  })
);

/**
 * Stage-scoped Overview & Analytics
 */
router.get(
  '/workspace/:stage/overview',
  asyncHandler(async (req, res) => {
    const stage = req.params.stage;
    const isAll = stage === 'ALL';
    if (!isAll && !VALID_STAGES.includes(stage)) {
      res.status(400).json({ success: false, error: { code: 'INVALID_STAGE', message: 'المرحلة الدراسية غير صالحة' } });
      return;
    }

    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const stageFilter = isAll ? {} : { academicStage: stage as any };

    const [coursesCount, lessonsCount, subscriptions, paymentsAgg] = await Promise.all([
      prisma.course.count({
        where: { teacherProfileId: teacherProfile.id, ...stageFilter },
      }),
      prisma.lesson.count({
        where: { teacherProfileId: teacherProfile.id, ...stageFilter },
      }),
      prisma.lessonSubscription.findMany({
        where: { teacherProfileId: teacherProfile.id, ...stageFilter, status: 'ACTIVE' },
        select: { studentId: true, pricePaid: true, pointsPaid: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { teacherProfileId: teacherProfile.id, ...stageFilter, status: 'COMPLETED' },
        _sum: { teacherEarning: true, pointsUsed: true },
      }),
    ]);

    const uniqueStudents = new Set(subscriptions.map((s) => s.studentId)).size;
    const totalRevenueEGP = paymentsAgg._sum.teacherEarning || 0.0;
    const totalPointsEarned = paymentsAgg._sum.pointsUsed || 0;

    res.status(200).json({
      success: true,
      data: {
        stage,
        coursesCount,
        lessonsCount,
        uniqueStudents,
        totalSubscriptions: subscriptions.length,
        totalRevenueEGP: Math.round(totalRevenueEGP * 100) / 100,
        totalPointsEarned,
      },
    });
  })
);

/**
 * Stage-scoped Courses & Lessons
 */
router.get(
  '/workspace/:stage/courses',
  asyncHandler(async (req, res) => {
    const stage = req.params.stage;
    const isAll = stage === 'ALL';
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const stageFilter = isAll ? {} : { academicStage: stage as any };

    const courses = await prisma.course.findMany({
      where: { teacherProfileId: teacherProfile.id, ...stageFilter },
      include: {
        chapters: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              include: {
                _count: { select: { subscriptions: true } },
              },
            },
          },
        },
        _count: { select: { lessonSubscriptions: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: courses });
  })
);

/**
 * Stage-scoped Students
 */
router.get(
  '/workspace/:stage/students',
  asyncHandler(async (req, res) => {
    const stage = req.params.stage;
    const isAll = stage === 'ALL';
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const stageFilter = isAll ? {} : { academicStage: stage as any };

    const subscriptions = await prisma.lessonSubscription.findMany({
      where: { teacherProfileId: teacherProfile.id, ...stageFilter, status: 'ACTIVE' },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            isActive: true,
            studentProfile: {
              select: {
                studentPhoneNumber: true,
                parentInfo: {
                  select: {
                    parentPhoneNumber: true,
                    fatherJob: true,
                  },
                },
              },
            },
          },
        },
        lesson: { select: { id: true, title: true, price: true } },
        course: { select: { id: true, title: true } },
      },
      orderBy: { subscribedAt: 'desc' },
    });

    res.status(200).json({ success: true, data: subscriptions });
  })
);

/**
 * Stage-scoped Revenue Ledger
 */
router.get(
  '/workspace/:stage/revenue',
  asyncHandler(async (req, res) => {
    const stage = req.params.stage;
    const isAll = stage === 'ALL';
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher profile not found' } });
      return;
    }

    const stageFilter = isAll ? {} : { academicStage: stage as any };

    const transactions = await prisma.paymentTransaction.findMany({
      where: { teacherProfileId: teacherProfile.id, ...stageFilter, status: 'COMPLETED' },
      include: {
        student: { select: { username: true } },
        course: { select: { title: true } },
        lesson: { select: { title: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: transactions });
  })
);

// ─── Teacher Content Preview (Requirement 5) ─────────────────────────────────

router.get(
  '/lessons/:lessonId/preview',
  asyncHandler(async (req, res) => {
    const data = await LessonsService.getLessonPreview(
      req.params.lessonId,
      req.user!.sub,
      req.user!.role
    );
    res.status(200).json({ success: true, data });
  })
);

// ─── Global Teacher Revenue & Analytics ──────────────────────────────────────

router.get(
  '/analytics',
  asyncHandler(async (req, res) => {
    const teacherProfile = await prisma.teacherProfile.findUnique({ where: { userId: req.user!.sub } });
    if (!teacherProfile) {
      res.status(200).json({ success: true, data: { totalStudents: 0, totalEnrollments: 0, totalRevenue: 0, totalPoints: 0, courses: [] } });
      return;
    }

    const [courses, subscriptions, payments] = await Promise.all([
      prisma.course.findMany({
        where: { teacherProfileId: teacherProfile.id },
        include: { _count: { select: { lessonSubscriptions: true } } },
      }),
      prisma.lessonSubscription.findMany({
        where: { teacherProfileId: teacherProfile.id, status: 'ACTIVE' },
        select: { studentId: true },
      }),
      prisma.paymentTransaction.aggregate({
        where: { teacherProfileId: teacherProfile.id, status: 'COMPLETED' },
        _sum: { teacherEarning: true, pointsUsed: true },
      }),
    ]);

    const uniqueStudents = new Set(subscriptions.map((s) => s.studentId)).size;
    const totalRevenue = payments._sum.teacherEarning || 0.0;
    const totalPoints = payments._sum.pointsUsed || 0;

    res.status(200).json({
      success: true,
      data: {
        totalStudents: uniqueStudents,
        totalEnrollments: subscriptions.length,
        totalRevenue: Math.round(totalRevenue * 100) / 100,
        totalPoints,
        courses: courses.map((c: any) => ({
          id: c.id,
          title: c.title,
          academicStage: c.academicStage,
          subscriptionsCount: c._count.lessonSubscriptions,
        })),
      },
    });
  })
);

// ─── Courses CRUD ────────────────────────────────────────────────────────────

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
              select: { id: true, title: true, price: true, pointCost: true, orderIndex: true, isPublished: true, pdfUrl: true, videoUrl: true, driveFileId: true },
            },
          },
        },
        _count: { select: { lessonSubscriptions: true } },
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

    if (!VALID_STAGES.includes(academicStage)) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_STAGE', message: `academicStage must be one of: ${VALID_STAGES.join(', ')}` },
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

    // Ensure workspace exists
    await prisma.teacherStage.upsert({
      where: { teacherProfileId_stage: { teacherProfileId: teacherProfile.id, stage: academicStage as any } },
      create: { teacherProfileId: teacherProfile.id, stage: academicStage as any, isActive: true },
      update: { isActive: true },
    });

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
        _count: { select: { lessonSubscriptions: true } },
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
                _count: { select: { subscriptions: true } },
              },
            },
          },
        },
        _count: { select: { lessonSubscriptions: true } },
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

// ─── Chapters CRUD ────────────────────────────────────────────────────────────

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
          select: { id: true, title: true, price: true, pointCost: true, orderIndex: true, isPublished: true },
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

// ─── Lessons CRUD ─────────────────────────────────────────────────────────────

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
    const { title, description, price, pointCost, orderIndex, videoUrl, isPublished } = req.body;

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
        academicStage: chapter.course.academicStage,
        title,
        description: description || null,
        price: price !== undefined ? parseFloat(price) : 0.0,
        pointCost: pointCost !== undefined ? parseInt(pointCost) : 0,
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

// ─── Direct Resumable Upload to Google Drive (Bypasses Vercel payload limits) ─

router.post(
  '/lessons/:id/resumable-upload-url',
  asyncHandler(async (req, res) => {
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

    const { filename, mimeType, fileSize } = req.body;
    if (!filename) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'filename is required' } });
      return;
    }

    const { createResumableUploadSession } = await import('../services/googleDrive');
    const session = await createResumableUploadSession({
      filename,
      mimeType: mimeType || 'video/mp4',
      fileSize: fileSize ? parseInt(fileSize) : undefined,
      teacherId: req.user!.sub,
      lessonId: lesson.id,
    });

    if (!session || !session.uploadUrl) {
      res.status(200).json({
        success: false,
        message: 'Google Drive direct upload not configured or unavailable. Use direct upload fallback or paste YouTube/Drive link.',
      });
      return;
    }

    res.status(200).json({
      success: true,
      data: {
        uploadUrl: session.uploadUrl,
      },
    });
  })
);

router.post(
  '/lessons/:id/direct-upload-complete',
  asyncHandler(async (req, res) => {
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

    const { driveFileId, fileName } = req.body;
    if (!driveFileId) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'driveFileId is required' } });
      return;
    }

    const updated = await prisma.lesson.update({
      where: { id: lesson.id },
      data: {
        driveFileId,
        driveFileName: fileName || 'video.mp4',
      },
    });

    res.status(200).json({
      success: true,
      data: {
        lessonId: updated.id,
        driveFileId: updated.driveFileId,
        message: 'Video linked to lesson successfully in Google Drive',
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

router.patch(
  '/lessons/:lessonId/assign-quiz',
  asyncHandler(async (req, res) => {
    const { quizId, quizRole } = req.body;

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

export default router;
