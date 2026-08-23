/**
 * /student/* — STUDENT role only
 *
 * Every route in this file is behind requireStudent middleware.
 * Tokens from other roles are structurally rejected by this router.
 *
 * Students can:
 * - View own profile + points balance
 * - Redeem access codes for points credit
 * - List/unlock lessons
 * - Take quizzes and submit homework
 * - Stream unlocked lesson videos
 * - View own grades/history
 *
 * Students CANNOT:
 * - See other students' data
 * - See teacher financials
 * - See parentStatus (stripped at service/DTO layer)
 */

import { Router } from 'express';
import { requireStudent } from '../middleware/requireStudent';
import * as LessonsController from '../modules/lessons/lessons.controller';
import * as PointsController from '../modules/points/points.controller';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import * as QuizController from '../modules/quizEngine/quizEngine.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';

const router = Router();

// All routes require STUDENT role
router.use(requireStudent);

// ─── Profile ─────────────────────────────────────────────────────────────────

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
        createdAt: true,
        studentProfile: {
          select: {
            studentPhoneNumber: true,
            parentInfo: {
              select: {
                parentPhoneNumber: true,
                parentEmail: true,
                fatherJob: true,
                // parentStatus is EXCLUDED — sensitive field
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
    const { studentPhoneNumber, parentPhoneNumber, parentEmail, fatherJob } = req.body;

    let studentProfile = await prisma.studentProfile.findUnique({
      where: { userId: req.user!.sub },
      include: { parentInfo: true },
    });

    if (!studentProfile) {
      studentProfile = await prisma.studentProfile.create({
        data: {
          userId: req.user!.sub,
          studentPhoneNumber: studentPhoneNumber || '',
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
      if (studentPhoneNumber !== undefined) {
        await prisma.studentProfile.update({
          where: { id: studentProfile.id },
          data: { studentPhoneNumber },
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
        createdAt: true,
        studentProfile: {
          select: {
            studentPhoneNumber: true,
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

    res.status(200).json({ success: true, data: updatedUser });
  })
);


// ─── Points / Access Codes Redemption ────────────────────────────────────────

router.get('/balance', PointsController.getBalance);
router.post('/access-codes/redeem', AccessCodesController.redeemCode);
router.get('/points/transactions', PointsController.getMyTransactions);

// ─── Performance & Quiz Stats ────────────────────────────────────────────────

router.get(
  '/stats',
  asyncHandler(async (req, res) => {
    const studentId = req.user!.sub;
    const attempts = await prisma.quizAttempt.findMany({
      where: { studentId },
      include: {
        quiz: {
          select: { id: true, title: true, type: true },
        },
      },
      orderBy: { submittedAt: 'desc' },
    });

    const user = await prisma.user.findUnique({
      where: { id: studentId },
      select: { pointsBalance: true },
    });

    res.status(200).json({
      success: true,
      data: {
        pointsBalance: user?.pointsBalance || 0,
        quizAttempts: attempts,
        totalQuizzes: attempts.length,
        passedQuizzes: attempts.filter((a: any) => a.passed).length,
      },
    });
  })
);

// ─── Lessons ──────────────────────────────────────────────────────────────────

router.get('/lessons', LessonsController.listLessons);

// Unlock a lesson (spend points)
router.post('/lessons/:id/unlock', LessonsController.unlockLesson);

// Get lesson content (enforces gating: points → quiz → homework)
router.get('/lessons/:id/content', LessonsController.getLessonContent);

// Stream video (validates single-use playback token)
router.get('/lessons/:id/stream', LessonsController.streamLesson);

// Submit homework for a lesson
router.post('/lessons/:id/homework/submit', LessonsController.submitHomework);

// ─── Quizzes ──────────────────────────────────────────────────────────────────

router.get('/quizzes/:id', QuizController.getQuiz);
router.post('/quizzes/:id/attempt', QuizController.submitAttempt);
router.get('/quizzes/:id/attempt', QuizController.getAttempt);

export default router;
