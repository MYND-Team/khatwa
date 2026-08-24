/**
 * /admin/* — ADMIN role only (full platform management)
 *
 * Every route is behind requireAdmin middleware.
 * Full unrestricted platform access for administrator.
 */

import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import * as BrandingController from '../modules/branding/branding.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';

const router = Router();

// All routes require ADMIN role
router.use(requireAdmin);

// ─── Points Access Codes Management ──────────────────────────────────────────

router.post('/access-codes', AccessCodesController.createCode);
router.get('/access-codes', AccessCodesController.listCodes);
router.patch('/access-codes/:id/revoke', AccessCodesController.revokeCode);
router.post('/access-codes/:id/regenerate', AccessCodesController.regenerateCode);

// ─── Student Management (Full access, monitor & edit) ─────────────────────────

router.get(
  '/students',
  asyncHandler(async (_req, res) => {
    const students = await prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: {
        id: true,
        username: true,
        pointsBalance: true,
        isActive: true,
        createdAt: true,
        studentProfile: {
          include: {
            parentInfo: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: students });
  })
);

// Full student profile with parent info, quizzes, points history, and unlocked lessons
router.get(
  '/students/:id/full-profile',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      select: {
        id: true,
        username: true,
        role: true,
        pointsBalance: true,
        isActive: true,
        createdAt: true,
        studentProfile: {
          include: {
            parentInfo: true,
          },
        },
        redeemedAccessCodes: {
          orderBy: { redeemedAt: 'desc' },
          take: 50,
        },
        pointsTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        unlockedLessons: {
          include: {
            lesson: {
              select: { id: true, title: true, pointCost: true },
            },
          },
        },
      },
    });
    if (!student) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }
    res.status(200).json({ success: true, data: student });
  })
);

router.get(
  '/students/:studentId/performance',
  asyncHandler(async (req, res) => {
    const unlocked = await prisma.unlockedLesson.findMany({
      where: { studentId: req.params.studentId as string },
      include: { lesson: { select: { id: true, title: true, pointCost: true, teacherProfile: { select: { displayName: true } } } } },
    });
    res.status(200).json({ success: true, data: unlocked });
  })
);

// Adjust student points directly (Add or Deduct)
router.post(
  '/students/:id/adjust-points',
  asyncHandler(async (req, res) => {
    const { amount, reason = 'تعديل رصيد بواسطة المدير العام' } = req.body;
    const numAmount = Number(amount);

    if (isNaN(numAmount) || numAmount === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be a non-zero number' } });
      return;
    }

    const student = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!student) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }

    const newBalance = Math.max(0, student.pointsBalance + numAmount);

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: student.id },
        data: { pointsBalance: newBalance },
      }),
      prisma.pointsTransaction.create({
        data: {
          userId: student.id,
          amount: Math.abs(numAmount),
          type: numAmount > 0 ? 'CREDIT' : 'DEBIT',
          balanceAfter: newBalance,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        pointsBalance: updatedUser.pointsBalance,
        change: numAmount,
        reason,
      },
    });
  })
);

router.patch(
  '/students/:id/toggle-active',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!student) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'User not found' } });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: student.id },
      data: { isActive: !student.isActive },
      select: { id: true, username: true, isActive: true },
    });
    res.status(200).json({ success: true, data: updated });
  })
);

// ─── Teacher Management & Courses Monitoring ──────────────────────────────────

router.get(
  '/teachers',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: {
        id: true,
        username: true,
        isActive: true,
        createdAt: true,
        teacherProfile: {
          select: {
            id: true,
            displayName: true,
            bio: true,
            lessons: {
              select: {
                id: true,
                title: true,
                pointCost: true,
                isPublished: true,
                createdAt: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: teachers });
  })
);

router.patch(
  '/teachers/:id/toggle-active',
  asyncHandler(async (req, res) => {
    const teacher = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!teacher) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
      return;
    }
    const updated = await prisma.user.update({
      where: { id: teacher.id },
      data: { isActive: !teacher.isActive },
      select: { id: true, username: true, isActive: true },
    });
    res.status(200).json({ success: true, data: updated });
  })
);

// All courses & lessons across all teachers
router.get(
  '/courses',
  asyncHandler(async (_req, res) => {
    const lessons = await prisma.lesson.findMany({
      include: {
        teacherProfile: {
          select: {
            displayName: true,
            user: { select: { username: true } },
          },
        },
        _count: {
          select: {
            unlockedByStudents: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: lessons });
  })
);

// ─── Platform Analytics ──────────────────────────────────────────────────────

router.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const [totalStudents, totalTeachers, totalStaff, totalPointsCredited, activeCodes, totalLessons, totalUnlocked] =
      await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT' } }),
        prisma.user.count({ where: { role: 'TEACHER' } }),
        prisma.user.count({ where: { role: 'STAFF' } }),
        prisma.pointsTransaction.aggregate({
          where: { type: 'CREDIT' },
          _sum: { amount: true },
        }),
        prisma.accessCode.count({ where: { status: 'ACTIVE' } }),
        prisma.lesson.count(),
        prisma.unlockedLesson.count(),
      ]);

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalStaff,
        totalLessons,
        totalUnlockedLessons: totalUnlocked,
        totalPointsCredited: totalPointsCredited._sum.amount ?? 0,
        activeAccessCodes: activeCodes,
      },
    });
  })
);

// ─── Video Access Logs ───────────────────────────────────────────────────────

router.get(
  '/video-access-logs',
  asyncHandler(async (_req, res) => {
    const logs = await prisma.videoAccessLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        student: { select: { id: true, username: true } },
        lesson: { select: { id: true, title: true } },
      },
    });
    res.status(200).json({ success: true, data: logs });
  })
);

// ─── Point Requests Review (Admin & Staff) ────────────────────────────────────

router.get(
  '/point-requests',
  asyncHandler(async (_req, res) => {
    const requests = await prisma.pointRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, username: true, pointsBalance: true } },
      },
    });
    res.status(200).json({ success: true, data: requests });
  })
);

// ─── Branding Settings ───────────────────────────────────────────────────────

router.get('/settings/branding', BrandingController.getSettings);
router.patch('/settings/branding', BrandingController.updateSettings);

export default router;
