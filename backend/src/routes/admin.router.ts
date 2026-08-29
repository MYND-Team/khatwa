/**
 * /admin/* — ADMIN role only (full platform management)
 *
 * Full unrestricted platform access for administrator.
 * - Student management (DB-backed, persistent)
 * - Teacher creation
 * - Wallet (EGP) atomic transfers
 * - Points atomic adjustments
 * - Student notes
 * - Platform analytics
 */

import { Router } from 'express';
import { requireAdmin } from '../middleware/requireAdmin';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import * as BrandingController from '../modules/branding/branding.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';

const router = Router();

// All routes require ADMIN role
router.use(requireAdmin);

// ─── Points Access Codes Management ──────────────────────────────────────────

router.post('/access-codes', AccessCodesController.createCode);
router.get('/access-codes', AccessCodesController.listCodes);
router.patch('/access-codes/:id/revoke', AccessCodesController.revokeCode);
router.post('/access-codes/:id/regenerate', AccessCodesController.regenerateCode);

// ─── Student Management (Full DB-backed, IP-independent) ─────────────────────

router.get(
  '/students',
  asyncHandler(async (req, res) => {
    const { search = '', page = '1', limit = '50', stage = '' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const validStages = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'SECONDARY_3'];
    const stageFilter = stage && validStages.includes(stage) ? stage : null;

    const where: any = { role: 'STUDENT' };
    if (stageFilter) {
      where.studentProfile = { academicStage: stageFilter };
    }
    if (search) {
      where.OR = [
        { username: { contains: search, mode: 'insensitive' } },
        { studentProfile: { studentPhoneNumber: { contains: search } } },
      ];
    }

    const [students, total] = await Promise.all([
      prisma.user.findMany({
        where,
        select: {
          id: true,
          username: true,
          pointsBalance: true,
          walletBalance: true,
          isActive: true,
          createdAt: true,
          studentProfile: {
            include: { parentInfo: true },
          },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.user.count({ where }),
    ]);

    res.status(200).json({ success: true, data: students, meta: { total, page: parseInt(page), limit: parseInt(limit) } });
  })
);

// Full student profile with notes, wallet, points, enrollments
router.get(
  '/students/:id/full-profile',
  asyncHandler(async (req, res) => {
    const student = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        username: true,
        role: true,
        pointsBalance: true,
        walletBalance: true,
        isActive: true,
        createdAt: true,
        studentProfile: { include: { parentInfo: true } },
        pointsTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { actor: { select: { username: true } } },
        },
        walletTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: { actor: { select: { username: true } } },
        },
        studentNotes: {
          orderBy: { createdAt: 'desc' },
          take: 30,
          include: { author: { select: { username: true } } },
        },
        courseEnrollments: {
          include: {
            course: {
              select: {
                id: true,
                title: true,
                subject: true,
                academicStage: true,
                teacherProfile: { select: { displayName: true, avatarUrl: true } },
              },
            },
          },
        },
        unlockedLessons: {
          include: {
            lesson: { select: { id: true, title: true, pointCost: true } },
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

// ─── Student Notes ────────────────────────────────────────────────────────────

router.get(
  '/students/:id/notes',
  asyncHandler(async (req, res) => {
    const notes = await prisma.studentNote.findMany({
      where: { studentId: req.params.id },
      orderBy: { createdAt: 'desc' },
      include: { author: { select: { username: true } } },
    });
    res.status(200).json({ success: true, data: notes });
  })
);

router.post(
  '/students/:id/notes',
  asyncHandler(async (req, res) => {
    const { content } = req.body;
    if (!content || !content.trim()) {
      res.status(400).json({ success: false, error: { code: 'INVALID_INPUT', message: 'Note content is required' } });
      return;
    }

    const student = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!student) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }

    const note = await prisma.studentNote.create({
      data: {
        studentId: req.params.id,
        authorId: req.user!.sub,
        content: content.trim(),
      },
      include: { author: { select: { username: true } } },
    });

    res.status(201).json({ success: true, data: note });
  })
);

router.delete(
  '/students/:studentId/notes/:noteId',
  asyncHandler(async (req, res) => {
    const note = await prisma.studentNote.findUnique({ where: { id: req.params.noteId } });
    if (!note || note.studentId !== req.params.studentId) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Note not found' } });
      return;
    }
    await prisma.studentNote.delete({ where: { id: req.params.noteId } });
    res.status(200).json({ success: true, message: 'Note deleted' });
  })
);

// ─── Wallet (EGP) Management — Atomic ─────────────────────────────────────────

router.post(
  '/students/:id/adjust-wallet',
  asyncHandler(async (req, res) => {
    const { amount, reason = 'تحويل رصيد بواسطة المدير العام' } = req.body;
    const numAmount = parseFloat(amount);

    if (isNaN(numAmount) || numAmount === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be a non-zero number' } });
      return;
    }

    const student = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!student || student.role !== 'STUDENT') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }

    const newBalance = Math.max(0, (student.walletBalance || 0) + numAmount);
    const transactionType = numAmount > 0 ? 'CREDIT' : 'DEBIT';

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: student.id },
        data: { walletBalance: newBalance },
        select: { id: true, username: true, walletBalance: true, pointsBalance: true },
      }),
      prisma.walletTransaction.create({
        data: {
          studentId: student.id,
          type: transactionType,
          amount: Math.abs(numAmount),
          balanceAfter: newBalance,
          reason: reason.trim(),
          actorId: req.user!.sub,
        },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        id: updatedUser.id,
        username: updatedUser.username,
        walletBalance: updatedUser.walletBalance,
        change: numAmount,
        reason,
      },
    });
  })
);

// ─── Points Management — Atomic ───────────────────────────────────────────────

router.post(
  '/students/:id/adjust-points',
  asyncHandler(async (req, res) => {
    const { amount, reason = 'تعديل نقاط بواسطة المدير العام' } = req.body;
    const numAmount = parseInt(amount);

    if (isNaN(numAmount) || numAmount === 0) {
      res.status(400).json({ success: false, error: { code: 'INVALID_AMOUNT', message: 'Amount must be a non-zero integer' } });
      return;
    }

    const student = await prisma.user.findUnique({ where: { id: req.params.id } });
    if (!student || student.role !== 'STUDENT') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }

    const newBalance = Math.max(0, student.pointsBalance + numAmount);
    const transactionType = numAmount > 0 ? 'CREDIT' : 'DEBIT';

    const [updatedUser] = await prisma.$transaction([
      prisma.user.update({
        where: { id: student.id },
        data: { pointsBalance: newBalance },
        select: { id: true, username: true, pointsBalance: true, walletBalance: true },
      }),
      prisma.pointsTransaction.create({
        data: {
          studentId: student.id,
          type: transactionType,
          amount: Math.abs(numAmount),
          reason: reason.trim(),
          actorId: req.user!.sub,
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
    const student = await prisma.user.findUnique({ where: { id: req.params.id } });
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

// ─── Courses & Content Monitoring ────────────────────────────────────────────

router.get(
  '/courses',
  asyncHandler(async (_req, res) => {
    const courses = await prisma.course.findMany({
      include: {
        teacherProfile: {
          select: { displayName: true, avatarUrl: true, user: { select: { username: true } } },
        },
        _count: { select: { enrollments: true, chapters: true, lessons: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: courses });
  })
);

// ─── Platform Analytics ──────────────────────────────────────────────────────

router.get(
  '/analytics',
  asyncHandler(async (_req, res) => {
    const [
      totalStudents,
      totalTeachers,
      totalStaff,
      totalPointsCredited,
      totalWalletCredited,
      pendingPointRequests,
      activeCodes,
      totalLessons,
      totalCourses,
      totalEnrollments,
    ] = await Promise.all([
      prisma.user.count({ where: { role: 'STUDENT' } }),
      prisma.user.count({ where: { role: 'TEACHER' } }),
      prisma.user.count({ where: { role: 'STAFF' } }),
      prisma.pointsTransaction.aggregate({ where: { type: 'CREDIT' }, _sum: { amount: true } }),
      prisma.walletTransaction.aggregate({ where: { type: 'CREDIT' }, _sum: { amount: true } }),
      prisma.pointRequest.count({ where: { status: 'PENDING' } }),
      prisma.accessCode.count({ where: { status: 'ACTIVE' } }),
      prisma.lesson.count(),
      prisma.course.count(),
      prisma.courseEnrollment.count(),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalStaff,
        totalLessons,
        totalCourses,
        totalEnrollments,
        totalPointsCredited: totalPointsCredited._sum.amount ?? 0,
        totalWalletCredited: totalWalletCredited._sum.amount ?? 0,
        pendingPointRequests,
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

// ─── Point Requests Review ────────────────────────────────────────────────────

router.get(
  '/point-requests',
  asyncHandler(async (_req, res) => {
    const requests = await prisma.pointRequest.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
      include: {
        user: { select: { id: true, username: true, pointsBalance: true, walletBalance: true } },
      },
    });
    res.status(200).json({ success: true, data: requests });
  })
);

router.patch(
  '/point-requests/:id/approve',
  asyncHandler(async (req, res) => {
    const pr = await prisma.pointRequest.findUnique({
      where: { id: req.params.id as string },
      include: { user: true },
    });

    if (!pr || pr.status !== 'PENDING') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pending request not found' } });
      return;
    }

    // Determine points to credit: explicit body points > requestedPoints > amount
    const pointsToCredit = req.body?.points
      ? parseInt(req.body.points, 10)
      : (pr.requestedPoints > 0 ? pr.requestedPoints : Math.max(1, Math.round(pr.amount || 0)));

    await prisma.$transaction([
      prisma.user.update({
        where: { id: pr.userId },
        data: { pointsBalance: { increment: pointsToCredit } },
      }),
      prisma.pointsTransaction.create({
        data: {
          studentId: pr.userId,
          type: 'CREDIT',
          amount: pointsToCredit,
          reason: `اعتماد طلب شحن نقاط (كود: ${pr.code || pr.id.slice(-6)})`,
          actorId: req.user!.sub,
        },
      }),
      prisma.pointRequest.update({
        where: { id: pr.id },
        data: {
          status: 'APPROVED',
          requestedPoints: pointsToCredit,
          processedById: req.user!.sub,
          processedAt: new Date(),
        },
      }),
      prisma.notification.create({
        data: {
          userId: pr.userId,
          title: 'تمت الموافقة على طلب الشحن 🎉',
          message: `تم اعتماد إيصال التحويل وشحن ${pointsToCredit} نقطة إلى رصيدك بنجاح!`,
          type: 'SUCCESS',
        },
      }),
    ]);

    const updatedUser = await prisma.user.findUnique({
      where: { id: pr.userId },
      select: { id: true, username: true, pointsBalance: true, walletBalance: true },
    });

    res.status(200).json({
      success: true,
      message: `تم شحن ${pointsToCredit} نقطة للطالب بنجاح`,
      data: {
        pointsCredited: pointsToCredit,
        user: updatedUser,
      },
    });
  })
);

router.patch(
  '/point-requests/:id/reject',
  asyncHandler(async (req, res) => {
    const { reason } = req.body;
    const pr = await prisma.pointRequest.findUnique({ where: { id: req.params.id as string } });
    if (!pr || pr.status !== 'PENDING') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Pending request not found' } });
      return;
    }

    await prisma.$transaction([
      prisma.pointRequest.update({
        where: { id: pr.id },
        data: {
          status: 'REJECTED',
          processedById: req.user!.sub,
          processedAt: new Date(),
          rejectionReason: reason || 'رُفض الطلب من المدير',
        },
      }),
      prisma.notification.create({
        data: {
          userId: pr.userId,
          title: 'تم رفض طلب الشحن',
          message: reason || 'تم رفض طلب الشحن. يرجى التواصل مع الإدارة.',
          type: 'ERROR',
        },
      }),
    ]);

    res.status(200).json({ success: true, message: 'Point request rejected' });
  })
);

// ─── Notifications ────────────────────────────────────────────────────────────

router.post(
  '/notifications',
  asyncHandler(async (req, res) => {
    const { userId, title, message, type = 'INFO' } = req.body;
    if (!userId || !title || !message) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'userId, title, and message are required' } });
      return;
    }

    const notification = await prisma.notification.create({
      data: { userId, title, message, type },
    });

    res.status(201).json({ success: true, data: notification });
  })
);

// ─── Teachers Management (Full DB-backed) ───────────────────────────────────

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
            subject: true,
            avatarUrl: true,
            rating: true,
            ratingCount: true,
            academicStages: true,
            courses: {
              select: {
                id: true,
                title: true,
                isPublished: true,
                _count: { select: { chapters: true, enrollments: true, lessons: true } },
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

router.post(
  '/teachers',
  asyncHandler(async (req, res) => {
    const { username, password, displayName, subject, avatarUrl, bio, academicStages } = req.body;
    if (!username || !password || !displayName) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'Username, password, and display name are required' } });
      return;
    }

    const normalizedUsername = username.trim().replace(/\s+/g, '').toLowerCase();

    const existing = await prisma.user.findUnique({ where: { username: normalizedUsername } });
    if (existing) {
      res.status(409).json({ success: false, error: { code: 'CONFLICT', message: 'اسم المستخدم مسجل بالفعل، يرجى اختيار اسم مستخدم آخر' } });
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);

    const newTeacher = await prisma.user.create({
      data: {
        username: normalizedUsername,
        passwordHash,
        role: 'TEACHER',
        isActive: true,
        teacherProfile: {
          create: {
            displayName: displayName.trim(),
            subject: subject ? subject.trim() : null,
            avatarUrl: avatarUrl ? avatarUrl.trim() : null,
            bio: bio ? bio.trim() : null,
            academicStages: academicStages || 'SECONDARY_1,SECONDARY_2,SECONDARY_3',
            rating: 5.0,
            ratingCount: 1,
          },
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        teacherProfile: true,
      },
    });

    res.status(201).json({ success: true, data: newTeacher, message: 'تم إنشاء حساب المدرس بنجاح' });
  })
);

router.patch(
  '/teachers/:id',
  asyncHandler(async (req, res) => {
    const { displayName, subject, avatarUrl, bio, academicStages, password, isActive } = req.body;
    const user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!user || user.role !== 'TEACHER') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
      return;
    }

    let passwordHash: string | undefined = undefined;
    if (password && password.trim().length >= 6) {
      passwordHash = await bcrypt.hash(password.trim(), 12);
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: {
        ...(passwordHash && { passwordHash }),
        ...(isActive !== undefined && { isActive }),
        teacherProfile: {
          update: {
            ...(displayName !== undefined && { displayName: displayName.trim() }),
            ...(subject !== undefined && { subject: subject ? subject.trim() : null }),
            ...(avatarUrl !== undefined && { avatarUrl: avatarUrl ? avatarUrl.trim() : null }),
            ...(bio !== undefined && { bio: bio ? bio.trim() : null }),
            ...(academicStages !== undefined && { academicStages }),
          },
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        teacherProfile: true,
      },
    });

    res.status(200).json({ success: true, data: updated });
  })
);

router.patch(
  '/teachers/:id/toggle-active',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!user || user.role !== 'TEACHER') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
      return;
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: { isActive: !user.isActive },
      select: { id: true, username: true, isActive: true },
    });

    res.status(200).json({ success: true, data: updated });
  })
);

router.delete(
  '/teachers/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      include: {
        teacherProfile: {
          include: {
            lessons: true,
            courses: true,
          },
        },
      },
    });

    if (!user || user.role !== 'TEACHER') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'المدرس غير موجود' } });
      return;
    }

    const lessonIds = user.teacherProfile?.lessons?.map((l: { id: string }) => l.id) || [];

    // Safely delete and clean up all relations in a database transaction
    await prisma.$transaction(async (tx: any) => {
      // 1. Unlink PointsTransactions that reference lessons belonging to this teacher
      if (lessonIds.length > 0) {
        await tx.pointsTransaction.updateMany({
          where: { relatedLessonId: { in: lessonIds } },
          data: { relatedLessonId: null },
        });
      }

      // 2. Unlink any AccessCodes created or redeemed by this teacher user
      await tx.accessCode.updateMany({
        where: { createdById: user.id },
        data: { createdById: null },
      });
      await tx.accessCode.updateMany({
        where: { redeemedById: user.id },
        data: { redeemedById: null },
      });

      // 3. Delete notifications and refresh tokens
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });

      // 4. Delete the User record completely from DB (cascades TeacherProfile, Courses, Lessons)
      await tx.user.delete({ where: { id: user.id } });
    });

    res.status(200).json({
      success: true,
      message: 'تم حذف حساب المدرس واسم المستخدم وكلمة المرور وكافة بياناته من قاعدة البيانات بنجاح',
    });
  })
);

// ─── Branding Settings ───────────────────────────────────────────────────────

router.get('/settings/branding', BrandingController.getSettings);
router.patch('/settings/branding', BrandingController.updateSettings);

export default router;

