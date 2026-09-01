/**
 * /student/* — STUDENT role only
 *
 * Every route is behind requireStudent middleware.
 * Identity is ALWAYS the JWT sub (database userId) — NOT IP, NOT device, NOT localStorage.
 *
 * Features:
 * - Stage-restricted Course & Lesson Catalog
 * - Lesson-level Subscriptions & Purchases (EGP / Points)
 * - Hierarchical "My Subscriptions" Overview (Teacher -> Course -> Lesson)
 * - Traceable Payment Ledger
 * - Quiz & Homework Engine
 * - Wallet & Points Recharge
 */

import { Router } from 'express';
import { requireStudent } from '../middleware/requireStudent';
import * as LessonsController from '../modules/lessons/lessons.controller';
import * as PointsController from '../modules/points/points.controller';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import * as QuizController from '../modules/quizEngine/quizEngine.controller';
import * as SubscriptionService from '../services/subscription.service';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import multer from 'multer';

const router = Router();
router.use(requireStudent);

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// ─── Profile ──────────────────────────────────────────────────────────────────

router.get(
  '/profile',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        username: true,
        role: true,
        pointsBalance: true,
        walletBalance: true,
        createdAt: true,
        studentProfile: {
          select: {
            studentPhoneNumber: true,
            academicStage: true,
            parentInfo: {
              select: {
                parentPhoneNumber: true,
                parentEmail: true,
                fatherJob: true,
              },
            },
          },
        },
      },
    });
    res.status(200).json({ success: true, data: user });
  })
);

router.put(
  '/profile',
  asyncHandler(async (req, res) => {
    const { studentPhoneNumber, academicStage, parentPhoneNumber, parentEmail, fatherJob } = req.body;
    const validStages = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'SECONDARY_3'];

    let studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { parentInfo: true },
    });

    if (!studentProfile) {
      studentProfile = await prisma.studentProfile.create({
        data: {
          userId: req.user!.sub,
          studentPhoneNumber: studentPhoneNumber || '',
          academicStage: (academicStage && validStages.includes(academicStage)) ? academicStage : 'SECONDARY_1',
          parentInfo: {
            create: {
              parentPhoneNumber: parentPhoneNumber || '',
              parentEmail: parentEmail || null,
              fatherJob: fatherJob || '',
              parentStatus: 'BOTH_ALIVE',
            },
          },
        },
        include: { parentInfo: true },
      });
    } else {
      const profileUpdates: any = {};
      if (studentPhoneNumber !== undefined) profileUpdates.studentPhoneNumber = studentPhoneNumber;
      if (academicStage && validStages.includes(academicStage)) profileUpdates.academicStage = academicStage;
      if (Object.keys(profileUpdates).length > 0) {
        await prisma.studentProfile.update({
          where: { id: studentProfile.id },
          data: profileUpdates,
        });
      }

      if (studentProfile.parentInfo) {
        await prisma.parentInfo.update({
          where: { id: studentProfile.parentInfo.id },
          data: {
            ...(parentPhoneNumber !== undefined ? { parentPhoneNumber } : {}),
            ...(parentEmail !== undefined ? { parentEmail } : {}),
            ...(fatherJob !== undefined ? { fatherJob } : {}),
          },
        });
      } else if (parentPhoneNumber || fatherJob || parentEmail) {
        await prisma.parentInfo.create({
          data: {
            studentProfileId: studentProfile.id,
            parentPhoneNumber: parentPhoneNumber || '',
            parentEmail: parentEmail || null,
            fatherJob: fatherJob || '',
            parentStatus: 'BOTH_ALIVE',
          },
        });
      }
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      select: {
        id: true,
        username: true,
        role: true,
        pointsBalance: true,
        walletBalance: true,
        createdAt: true,
        studentProfile: {
          select: {
            studentPhoneNumber: true,
            academicStage: true,
            parentInfo: {
              select: { parentPhoneNumber: true, parentEmail: true, fatherJob: true },
            },
          },
        },
      },
    });

    res.status(200).json({ success: true, data: updatedUser });
  })
);

// ─── Stage-Filtered Course & Lesson Catalog (Requirement 4) ──────────────────

/**
 * Returns subjects, courses, and lessons filtered strictly by student's academic stage.
 */
router.get(
  '/catalog',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { studentProfile: true },
    });

    const studentStage = student?.studentProfile?.academicStage || 'SECONDARY_1';

    const courses = await prisma.course.findMany({
      where: {
        isPublished: true,
        academicStage: studentStage as any,
      },
      include: {
        teacherProfile: {
          select: {
            id: true,
            displayName: true,
            subject: true,
            avatarUrl: true,
            rating: true,
            bio: true,
          },
        },
        chapters: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                price: true,
                pointCost: true,
                orderIndex: true,
                accessType: true,
                accessDurationDays: true,
                assignmentQuizId: true,
                examQuizId: true,
                subscriptions: {
                  where: { studentId: req.user!.sub, status: 'ACTIVE' },
                  select: { id: true, subscribedAt: true, expiresAt: true },
                },
                unlockedBy: {
                  where: { studentId: req.user!.sub },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    const formatted = courses.map((c: any) => ({
      id: c.id,
      title: c.title,
      subject: c.subject,
      academicStage: c.academicStage,
      description: c.description,
      imageUrl: c.imageUrl,
      teacher: c.teacherProfile,
      chapters: c.chapters.map((ch: any) => ({
        id: ch.id,
        title: ch.title,
        description: ch.description,
        orderIndex: ch.orderIndex,
        lessons: ch.lessons.map((l: any) => ({
          id: l.id,
          title: l.title,
          description: l.description,
          price: l.price,
          pointCost: l.pointCost,
          orderIndex: l.orderIndex,
          isSubscribed: l.subscriptions.length > 0 || l.unlockedBy.length > 0,
          subscriptionDetails: l.subscriptions[0] || null,
        })),
      })),
    }));

    res.status(200).json({
      success: true,
      data: {
        academicStage: studentStage,
        courses: formatted,
      },
    });
  })
);

router.get(
  '/discover/teachers',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { studentProfile: true },
    });
    const studentStage = student?.studentProfile?.academicStage || 'SECONDARY_1';

    const teachers = await prisma.teacherProfile.findMany({
      where: {
        user: { isActive: true },
        courses: { some: { academicStage: studentStage as any, isPublished: true } },
      },
      select: {
        id: true,
        displayName: true,
        bio: true,
        subject: true,
        avatarUrl: true,
        rating: true,
        ratingCount: true,
        academicStages: true,
        courses: {
          where: { isPublished: true, academicStage: studentStage as any },
          select: {
            id: true,
            title: true,
            subject: true,
            academicStage: true,
            imageUrl: true,
            pointCost: true,
            price: true,
            _count: { select: { chapters: true, lessons: true } },
          },
        },
      },
    });
    res.status(200).json({ success: true, data: teachers });
  })
);

router.get(
  '/discover/courses',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({
      where: { id: req.user!.sub },
      include: { studentProfile: true },
    });
    const studentStage = student?.studentProfile?.academicStage || 'SECONDARY_1';

    const { search } = req.query as Record<string, string>;
    const where: any = { isPublished: true, academicStage: studentStage as any };
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
        id: true,
        title: true,
        subject: true,
        academicStage: true,
        imageUrl: true,
        description: true,
        pointCost: true,
        price: true,
        teacherProfile: {
          select: { id: true, displayName: true, avatarUrl: true, rating: true, subject: true },
        },
        _count: { select: { chapters: true, lessons: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: courses });
  })
);

// ─── Lesson-Level Subscriptions & Purchases (Requirements 3, 6, 7, 8) ────────

/**
 * Purchase a lesson with Wallet EGP or Points.
 */
router.post(
  '/lessons/:lessonId/purchase',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const lessonId = req.params.lessonId;
    const { paymentMethod = 'WALLET_EGP' } = req.body;

    const result = await SubscriptionService.purchaseLesson({
      studentId,
      lessonId,
      paymentMethod,
    });

    res.status(200).json({
      success: true,
      message: result.message,
      data: result,
    });
  })
);

// ─── Student Stats ────────────────────────────────────────────────────────────

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const [user, subsCount, passedQuizzes] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { walletBalance: true, pointsBalance: true },
      }),
      prisma.lessonSubscription.count({
        where: { studentId, status: 'ACTIVE' },
      }),
      prisma.quizAttempt.count({
        where: { userId: studentId, passed: true },
      }),
    ]);
    res.status(200).json({
      success: true,
      data: {
        walletBalance: user?.walletBalance ?? 0,
        pointsBalance: user?.pointsBalance ?? 0,
        enrolledCourses: subsCount,
        passedQuizzes,
      },
    });
  })
);

/**
 * Returns student subscriptions structured hierarchically:
 * Teacher -> Course -> Lessons with immediate direct access.
 * Supports optional ?stage= filter for per-stage view.
 */
router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const stage = req.query.stage as string | undefined;
    const subscriptions = await SubscriptionService.getStudentSubscriptions(studentId, stage);
    res.status(200).json({ success: true, data: subscriptions });
  })
);

router.get(
  '/subscriptions/flat',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const subscriptions = await SubscriptionService.getStudentSubscriptionsFlat(studentId);
    res.status(200).json({ success: true, data: subscriptions });
  })
);

/**
 * Traceable payment history for student.
 */
router.get(
  '/payments/history',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const payments = await prisma.paymentTransaction.findMany({
      where: { studentId },
      orderBy: { createdAt: 'desc' },
      include: {
        teacherProfile: { select: { displayName: true } },
        course: { select: { title: true, subject: true } },
        lesson: { select: { title: true } },
      },
    });

    res.status(200).json({ success: true, data: payments });
  })
);

// ─── Legacy Course Enrollment (Maintained for Backwards Compatibility) ──────

router.get(
  '/courses/enrolled',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    // Map to hierarchical subscriptions for rich client UI
    const subscriptions = await SubscriptionService.getStudentSubscriptions(studentId);
    res.status(200).json({ success: true, data: subscriptions });
  })
);

router.post(
  '/courses/:courseId/enroll',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const courseId = req.params.courseId;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { lessons: { where: { isPublished: true } } },
    });

    if (!course || !course.isPublished) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الكورس غير موجود' } });
      return;
    }

    // Auto-subscribe student to all lessons in course
    for (const lesson of course.lessons) {
      try {
        await SubscriptionService.purchaseLesson({
          studentId,
          lessonId: lesson.id,
          paymentMethod: 'WALLET_EGP',
        });
      } catch (_) {}
    }

    res.status(201).json({ success: true, message: `تم تفعيل اشتراك المحاضرات في كورس ${course.title}` });
  })
);

// ─── Course Content ───────────────────────────────────────────────────────────

router.get(
  '/courses/:courseId',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const courseId = req.params.courseId;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacherProfile: { select: { id: true, displayName: true, avatarUrl: true, subject: true, bio: true } },
        chapters: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              where: { isPublished: true },
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                orderIndex: true,
                pointCost: true,
                price: true,
                isPublished: true,
                assignmentQuizId: true,
                examQuizId: true,
                subscriptions: {
                  where: { studentId, status: 'ACTIVE' },
                  select: { id: true, status: true, pricePaid: true, pointsPaid: true },
                },
                unlockedBy: {
                  where: { studentId },
                  select: { id: true },
                },
              },
            },
          },
        },
      },
    });

    if (!course) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Course not found' } });
      return;
    }

    res.status(200).json({ success: true, data: course });
  })
);

// ─── Lesson Access (Subscription → Assignment → Exam → Lesson) ───────────────

router.get(
  '/lessons/:lessonId/access-check',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const lessonId = req.params.lessonId;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        courseId: true,
        assignmentQuizId: true,
        examQuizId: true,
        pointCost: true,
        price: true,
      },
    });

    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
      return;
    }

    const isFree = lesson.price === 0 && lesson.pointCost === 0;

    // 1. Check active subscription
    if (!isFree) {
      const subscription = await prisma.lessonSubscription.findUnique({
        where: { studentId_lessonId: { studentId, lessonId } },
      });
      const legacyUnlocked = await prisma.unlockedLesson.findUnique({
        where: { studentId_lessonId: { studentId, lessonId } },
      });

      if ((!subscription || subscription.status !== 'ACTIVE') && !legacyUnlocked) {
        res.status(200).json({
          success: true,
          data: {
            canAccess: false,
            reason: 'LESSON_LOCKED',
            step: 'purchase',
            price: lesson.price,
            pointCost: lesson.pointCost,
          },
        });
        return;
      }
    }

    // 2. Check assignment submission
    if (lesson.assignmentQuizId) {
      const assignmentAttempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: lesson.assignmentQuizId } },
      });
      if (!assignmentAttempt) {
        res.status(200).json({
          success: true,
          data: {
            canAccess: false,
            reason: 'ASSIGNMENT_REQUIRED',
            step: 'assignment',
            quizId: lesson.assignmentQuizId,
          },
        });
        return;
      }
    }

    // 3. Check exam completion
    if (lesson.examQuizId) {
      const examAttempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: lesson.examQuizId } },
      });
      if (!examAttempt || !examAttempt.passed) {
        res.status(200).json({
          success: true,
          data: {
            canAccess: false,
            reason: 'EXAM_REQUIRED',
            step: 'exam',
            quizId: lesson.examQuizId,
          },
        });
        return;
      }
    }

    // All gates passed
    res.status(200).json({
      success: true,
      data: { canAccess: true, reason: 'ALL_CLEAR', step: 'lesson' },
    });
  })
);

// Get lesson content
router.get(
  '/lessons/:id/content',
  LessonsController.getLessonContent
);
router.get(
  '/lessons/:lessonId/content',
  (req: any, res, next) => {
    if (!req.params.id && req.params.lessonId) {
      req.params.id = req.params.lessonId;
    }
    return LessonsController.getLessonContent(req, res, next);
  }
);

// Legacy lesson endpoints
router.get('/lessons', LessonsController.listLessons);
router.post('/lessons/:id/unlock', LessonsController.unlockLesson);
router.get('/lessons/:id/stream', LessonsController.streamLesson);
router.post('/lessons/:id/homework/submit', LessonsController.submitHomework);

// ─── Quiz / Exam Submission ───────────────────────────────────────────────────

router.get('/quizzes/:id', QuizController.getQuiz);
router.post('/quizzes/:id/attempt', QuizController.submitAttempt);
router.get('/quizzes/:id/attempt', QuizController.getAttempt);

// ─── Wallet (EGP) ─────────────────────────────────────────────────────────────

router.get(
  '/wallet',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const [user, transactions] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { id: true, username: true, walletBalance: true, pointsBalance: true },
      }),
      prisma.walletTransaction.findMany({
        where: { studentId },
        orderBy: { createdAt: 'desc' },
        take: 50,
        select: {
          id: true,
          type: true,
          amount: true,
          balanceAfter: true,
          reason: true,
          createdAt: true,
          actor: { select: { username: true } },
        },
      }),
    ]);

    res.status(200).json({ success: true, data: { ...user, walletTransactions: transactions } });
  })
);

// ─── Point Requests (Recharge) ────────────────────────────────────────────────

router.get(
  '/point-requests',
  asyncHandler(async (req, res) => {
    const requests = await prisma.pointRequest.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: requests });
  })
);

router.post(
  '/point-requests',
  upload.single('screenshot'),
  asyncHandler(async (req, res) => {
    const { amount, code, notes } = req.body;

    if (!amount || !code) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'amount and code are required' } });
      return;
    }

    let screenshotUrl: string | undefined;
    if (req.file) {
      screenshotUrl = `data:${req.file.mimetype};base64,${req.file.buffer.toString('base64')}`;
    }

    const numAmount = parseFloat(amount);
    const parsedPoints = Math.max(1, Math.round(isNaN(numAmount) ? 0 : numAmount));

    const request = await prisma.pointRequest.create({
      data: {
        userId: req.user!.sub,
        amount: isNaN(numAmount) ? 0 : numAmount,
        requestedPoints: parsedPoints,
        code,
        notes: notes || null,
        screenshotUrl: screenshotUrl || null,
        status: 'PENDING',
      },
    });

    res.status(201).json({ success: true, data: request });
  })
);

// ─── Points / Access Codes ────────────────────────────────────────────────────

router.get('/balance', PointsController.getBalance);
router.post('/access-codes/redeem', AccessCodesController.redeemCode);
router.get('/points/transactions', PointsController.getMyTransactions);

// ─── Notifications ────────────────────────────────────────────────────────────

router.get(
  '/notifications',
  asyncHandler(async (req, res) => {
    const notifications = await prisma.notification.findMany({
      where: { userId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
    res.status(200).json({ success: true, data: notifications });
  })
);

router.patch(
  '/notifications/:id/read',
  asyncHandler(async (req, res) => {
    await prisma.notification.update({
      where: { id: req.params.id, userId: req.user!.sub },
      data: { isRead: true },
    });
    res.status(200).json({ success: true });
  })
);

// ─── Performance Stats ────────────────────────────────────────────────────────

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const [user, attempts, subscriptionsCount] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { pointsBalance: true, walletBalance: true },
      }),
      prisma.quizAttempt.findMany({
        where: { studentId },
        include: { quiz: { select: { id: true, title: true, type: true } } },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.lessonSubscription.count({ where: { studentId, status: 'ACTIVE' } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        pointsBalance: user?.pointsBalance || 0,
        walletBalance: user?.walletBalance || 0,
        enrolledCourses: subscriptionsCount,
        quizAttempts: attempts,
        totalQuizzes: attempts.length,
        passedQuizzes: attempts.filter((a: any) => a.passed).length,
      },
    });
  })
);

export default router;
