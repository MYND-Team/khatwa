/**
 * /student/* — STUDENT role only
 *
 * Every route is behind requireStudent middleware.
 * Identity is ALWAYS the JWT sub (database userId) — NOT IP, NOT device, NOT localStorage.
 *
 * Students can:
 * - View own profile + points + wallet balance
 * - Browse and enroll in courses
 * - View enrolled courses as folder cards
 * - Access course chapters and lessons
 * - Submit assignment (required before exam)
 * - Take exam (required before lesson content)
 * - Access lesson video/PDF (only after assignment + exam)
 * - Redeem access codes for points
 * - Submit wallet recharge requests
 * - View own notifications
 */

import { Router } from 'express';
import { requireStudent } from '../middleware/requireStudent';
import * as LessonsController from '../modules/lessons/lessons.controller';
import * as PointsController from '../modules/points/points.controller';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import * as QuizController from '../modules/quizEngine/quizEngine.controller';
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

// ─── Course Discovery (public teachers/courses) ───────────────────────────────

router.get(
  '/discover/teachers',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.teacherProfile.findMany({
      where: { user: { isActive: true } },
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
          where: { isPublished: true },
          select: {
            id: true,
            title: true,
            subject: true,
            academicStage: true,
            imageUrl: true,
            pointCost: true,
            price: true,
            _count: { select: { chapters: true, enrollments: true } },
          },
        },
        user: { select: { id: true, username: true } },
      },
    });
    res.status(200).json({ success: true, data: teachers });
  })
);

router.get(
  '/discover/courses',
  asyncHandler(async (req, res) => {
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
        _count: { select: { chapters: true, enrollments: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: courses });
  })
);

// ─── Course Enrollment ────────────────────────────────────────────────────────

router.get(
  '/courses/enrolled',
  asyncHandler(async (req, res) => {
    const enrollments = await prisma.courseEnrollment.findMany({
      where: { studentId: req.user!.sub },
      orderBy: { enrolledAt: 'desc' },
      include: {
        course: {
          include: {
            teacherProfile: {
              select: { id: true, displayName: true, avatarUrl: true, subject: true, rating: true },
            },
            _count: { select: { chapters: true, lessons: true } },
          },
        },
      },
    });

    res.status(200).json({ success: true, data: enrollments });
  })
);

router.post(
  '/courses/:courseId/enroll',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const courseId = req.params.courseId;

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: { teacherProfile: { select: { displayName: true } } },
    });
    if (!course || !course.isPublished) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Course not found' } });
      return;
    }

    const existing = await prisma.courseEnrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (existing) {
      res.status(409).json({ success: false, error: { code: 'ALREADY_ENROLLED', message: 'Already enrolled in this course' } });
      return;
    }

    // Deduct points if required
    if (course.pointCost > 0) {
      try {
        await prisma.$transaction(async (tx: any) => {
          const inTxExisting = await tx.courseEnrollment.findUnique({
            where: { studentId_courseId: { studentId, courseId } },
          });
          if (inTxExisting) {
            throw Object.assign(new Error('Already enrolled in this course'), { statusCode: 409, code: 'ALREADY_ENROLLED' });
          }

          const updated = await tx.user.updateMany({
            where: { id: studentId, pointsBalance: { gte: course.pointCost } },
            data: { pointsBalance: { decrement: course.pointCost } },
          });

          if (updated.count === 0) {
            throw Object.assign(new Error('Not enough points to enroll'), { statusCode: 402, code: 'INSUFFICIENT_POINTS' });
          }

          await tx.pointsTransaction.create({
            data: {
              studentId,
              type: 'DEBIT',
              amount: course.pointCost,
              reason: `تسجيل في كورس: ${course.title}`,
              actorId: studentId,
            },
          });

          // Calculate expiresAt for time-limited courses
          let expiresAt: Date | null = null;
          if ((course as any).accessType === 'LIMITED' && (course as any).accessDurationDays) {
            expiresAt = new Date();
            expiresAt.setDate(expiresAt.getDate() + (course as any).accessDurationDays);
          }

          await tx.courseEnrollment.create({
            data: { studentId, courseId, ...(expiresAt ? { expiresAt } : {}) },
          });
        });
      } catch (err: any) {
        if (err.code === 'ALREADY_ENROLLED' || err.statusCode === 409) {
          res.status(409).json({ success: false, error: { code: 'ALREADY_ENROLLED', message: err.message || 'Already enrolled in this course' } });
          return;
        }
        if (err.code === 'INSUFFICIENT_POINTS' || err.statusCode === 402) {
          res.status(402).json({ success: false, error: { code: 'INSUFFICIENT_POINTS', message: err.message || 'Not enough points to enroll' } });
          return;
        }
        if (err?.code === 'P2002') {
          res.status(409).json({ success: false, error: { code: 'ALREADY_ENROLLED', message: 'Already enrolled in this course' } });
          return;
        }
        throw err;
      }
    } else {
      try {
        // Calculate expiresAt for time-limited courses
        let expiresAt: Date | null = null;
        if ((course as any).accessType === 'LIMITED' && (course as any).accessDurationDays) {
          expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + (course as any).accessDurationDays);
        }
        await prisma.courseEnrollment.create({ data: { studentId, courseId, ...(expiresAt ? { expiresAt } : {}) } });
      } catch (err: any) {
        if (err?.code === 'P2002') {
          res.status(409).json({ success: false, error: { code: 'ALREADY_ENROLLED', message: 'Already enrolled in this course' } });
          return;
        }
        throw err;
      }
    }

    res.status(201).json({ success: true, message: `Enrolled in ${course.title}` });
  })
);

// ─── Course Content ───────────────────────────────────────────────────────────

router.get(
  '/courses/:courseId',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const courseId = req.params.courseId;

    // Check enrollment and expiration
    const enrollment = await prisma.courseEnrollment.findUnique({
      where: { studentId_courseId: { studentId, courseId } },
    });
    if (!enrollment) {
      res.status(403).json({ success: false, error: { code: 'NOT_ENROLLED', message: 'You are not enrolled in this course' } });
      return;
    }
    // Enforce time-limited access
    if ((enrollment as any).expiresAt && new Date() > new Date((enrollment as any).expiresAt)) {
      res.status(403).json({ success: false, error: { code: 'ACCESS_EXPIRED', message: 'Your access to this course has expired' } });
      return;
    }

    const course = await prisma.course.findUnique({
      where: { id: courseId },
      include: {
        teacherProfile: { select: { id: true, displayName: true, avatarUrl: true, subject: true } },
        chapters: {
          orderBy: { orderIndex: 'asc' },
          include: {
            lessons: {
              orderBy: { orderIndex: 'asc' },
              select: {
                id: true,
                title: true,
                description: true,
                orderIndex: true,
                pointCost: true,
                isPublished: true,
                assignmentQuizId: true,
                examQuizId: true,
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

// ─── Lesson Access (Assignment → Exam → Lesson) ───────────────────────────────

// Check lesson access status
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
      },
    });

    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
      return;
    }

    // Check course enrollment
    let isEnrolled = true;
    if (lesson.courseId) {
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId: lesson.courseId } },
      });
      isEnrolled = !!enrollment;
    }

    if (!isEnrolled) {
      res.status(200).json({
        success: true,
        data: { canAccess: false, reason: 'NOT_ENROLLED', step: 'enrollment' },
      });
      return;
    }

    // Check assignment submission
    let assignmentSubmitted = true;
    if (lesson.assignmentQuizId) {
      const assignmentAttempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: lesson.assignmentQuizId } },
      });
      assignmentSubmitted = !!assignmentAttempt;
    }

    if (!assignmentSubmitted) {
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

    // Check exam completion
    let examPassed = true;
    if (lesson.examQuizId) {
      const examAttempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: lesson.examQuizId } },
      });
      examPassed = !!(examAttempt && examAttempt.passed);
    }

    if (!examPassed) {
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

    // Check if lesson requires point unlock
    if (lesson.pointCost > 0) {
      const unlocked = await prisma.unlockedLesson.findUnique({
        where: { studentId_lessonId: { studentId, lessonId } },
      });
      if (!unlocked) {
        res.status(200).json({
          success: true,
          data: {
            canAccess: false,
            reason: 'LESSON_LOCKED',
            step: 'unlock',
            pointCost: lesson.pointCost,
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

// Get lesson content (enforces full gating: enrollment + assignment + exam)
router.get(
  '/lessons/:lessonId/content',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const lessonId = req.params.lessonId;

    const lesson = await prisma.lesson.findUnique({
      where: { id: lessonId },
      select: {
        id: true,
        title: true,
        description: true,
        courseId: true,
        chapterId: true,
        assignmentQuizId: true,
        examQuizId: true,
        videoUrl: true,
        driveFileId: true,
        driveFileName: true,
        pdfUrl: true,
        pdfFileName: true,
        pointCost: true,
      },
    });

    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
      return;
    }

    // 1. Check enrollment
    if (lesson.courseId) {
      const enrollment = await prisma.courseEnrollment.findUnique({
        where: { studentId_courseId: { studentId, courseId: lesson.courseId } },
      });
      if (!enrollment) {
        res.status(403).json({ success: false, error: { code: 'NOT_ENROLLED', message: 'You must enroll in this course first' } });
        return;
      }
    }

    // 2. Check assignment submitted
    if (lesson.assignmentQuizId) {
      const attempt = await prisma.quizAttempt.findUnique({
        where: { studentId_quizId: { studentId, quizId: lesson.assignmentQuizId } },
      });
      if (!attempt) {
        res.status(403).json({
          success: false,
          error: { code: 'ASSIGNMENT_REQUIRED', message: 'You must submit the assignment before accessing this lesson' },
        });
        return;
      }
    }

    // 4. Check if lesson requires point unlock
    if (lesson.pointCost > 0) {
      const unlocked = await prisma.unlockedLesson.findUnique({
        where: { studentId_lessonId: { studentId, lessonId } },
      });
      if (!unlocked) {
        res.status(403).json({
          success: false,
          error: { code: 'LESSON_LOCKED', message: `This lesson costs ${lesson.pointCost} points and must be unlocked first` },
        });
        return;
      }
    }

    // All gates cleared — return content
    res.status(200).json({
      success: true,
      data: {
        id: lesson.id,
        title: lesson.title,
        description: lesson.description,
        videoUrl: lesson.videoUrl,
        driveFileId: lesson.driveFileId,
        driveFileName: lesson.driveFileName,
        pdfUrl: lesson.pdfUrl,
        pdfFileName: lesson.pdfFileName,
      },
    });
  })
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
      // Store screenshot as base64
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
    const [user, attempts, enrollments] = await Promise.all([
      prisma.user.findUnique({
        where: { id: studentId },
        select: { pointsBalance: true, walletBalance: true },
      }),
      prisma.quizAttempt.findMany({
        where: { studentId },
        include: { quiz: { select: { id: true, title: true, type: true } } },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.courseEnrollment.count({ where: { studentId } }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        pointsBalance: user?.pointsBalance || 0,
        walletBalance: user?.walletBalance || 0,
        enrolledCourses: enrollments,
        quizAttempts: attempts,
        totalQuizzes: attempts.length,
        passedQuizzes: attempts.filter((a: any) => a.passed).length,
      },
    });
  })
);

export default router;
