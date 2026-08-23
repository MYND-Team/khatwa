/**
 * /admin/* — ADMIN role only (full platform management)
 *
 * Every route is behind requireAdmin middleware.
 * STUDENT, TEACHER, and STAFF tokens are structurally rejected by this router.
 *
 * ADMIN can:
 * - Generate/manage points access codes (generate, list, revoke, regenerate)
 * - View full student profiles (including sensitive parentInfo/parentStatus)
 * - Deactivate accounts
 * - View platform analytics
 * - Manage teachers
 * - View video access logs
 * - Manage branding settings
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

// ─── Student Management (ADMIN only — full profile including parentStatus) ────

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
          select: {
            studentPhoneNumber: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: students });
  })
);

// Full profile including sensitive parentStatus — ADMIN only
router.get(
  '/students/:id/full-profile',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({
      where: { id: req.params.id as string, role: 'STUDENT' },
      select: {
        id: true,
        username: true,
        pointsBalance: true,
        isActive: true,
        createdAt: true,
        studentProfile: {
          include: {
            parentInfo: true, // parentStatus included here (admin-only endpoint)
          },
        },
        redeemedAccessCodes: {
          orderBy: { redeemedAt: 'desc' },
          take: 20,
        },
        pointsTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
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
      include: { lesson: { select: { id: true, title: true, pointCost: true } } },
    });
    res.status(200).json({ success: true, data: unlocked });
  })
);

router.patch(
  '/students/:id/deactivate',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.update({
      where: { id: req.params.id as string },
      data: { isActive: false },
      select: { id: true, username: true, isActive: true },
    });
    res.status(200).json({ success: true, data: user });
  })
);

// ─── Teacher Management ──────────────────────────────────────────────────────

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
        teacherProfile: { select: { displayName: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: teachers });
  })
);

// ─── Platform Analytics ──────────────────────────────────────────────────────

router.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const [totalStudents, totalTeachers, totalStaff, totalPointsCredited, activeCodes] =
      await Promise.all([
        prisma.user.count({ where: { role: 'STUDENT' } }),
        prisma.user.count({ where: { role: 'TEACHER' } }),
        prisma.user.count({ where: { role: 'STAFF' } }),
        prisma.pointsTransaction.aggregate({
          where: { type: 'CREDIT' },
          _sum: { amount: true },
        }),
        prisma.accessCode.count({ where: { status: 'ACTIVE' } }),
      ]);

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalStaff,
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

// ─── Branding Settings ───────────────────────────────────────────────────────

router.get('/settings/branding', BrandingController.getSettings);
router.patch('/settings/branding', BrandingController.updateSettings);

export default router;
