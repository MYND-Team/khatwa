/**
 * /admin/* — ADMIN role only (full platform management)
 *
 * Full unrestricted platform access for administrator.
 * - Platform Appearance & Theme Customizer (Primary/Secondary/Accent Colors, Logos, Platform Name)
 * - Academic Stages Platform Oversight
 * - Full Traceable Payments Ledger (Student -> Teacher -> Stage -> Course -> Lesson -> Amount)
 * - Full Subscriptions Monitor (Grant / Revoke / Filter)
 * - Teacher & Student Accounts Management
 * - Content Inspection & Controls
 * - Access Codes & Points Audit
 */

import { Router } from 'express';
import crypto from 'crypto';
import { requireAdmin } from '../middleware/requireAdmin';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import * as BrandingController from '../modules/branding/branding.controller';
import * as LessonsService from '../modules/lessons/lessons.service';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import bcrypt from 'bcryptjs';

const router = Router();
router.use(requireAdmin);

// ─── Platform Appearance & General Settings (Requirement 1) ─────────────────

router.get('/settings/general', BrandingController.getSettings);
router.patch('/settings/general', BrandingController.updateSettings);

// Branding alias
router.get('/settings/branding', BrandingController.getSettings);
router.patch('/settings/branding', BrandingController.updateSettings);

// ─── Academic Stages Platform Oversight ──────────────────────────────────────

router.get(
  '/stages',
  asyncHandler(async (_req, res) => {
    const stages = [
      { code: 'PREPARATORY', nameAr: 'الصف الثالث الإعدادي', nameEn: '3rd Preparatory', order: 1 },
      { code: 'SECONDARY_1', nameAr: 'الصف الأول الثانوي', nameEn: 'First Secondary', order: 2 },
      { code: 'SECONDARY_2', nameAr: 'الصف الثاني الثانوي', nameEn: 'Second Secondary', order: 3 },
      { code: 'BACCALAUREATE_2', nameAr: 'الصف الثاني باكلوريا', nameEn: 'Second Baccalaureate', order: 4 },
      { code: 'SECONDARY_3', nameAr: 'الصف الثالث الثانوي', nameEn: 'Third Secondary', order: 5 },
      { code: 'BACCALAUREATE_3', nameAr: 'الصف الثالث باكلوريا', nameEn: 'Third Baccalaureate', order: 6 },
    ];

    const [coursesCounts, studentsCounts, subscriptionsCounts] = await Promise.all([
      prisma.course.groupBy({ by: ['academicStage'], _count: { id: true } }),
      prisma.studentProfile.groupBy({ by: ['academicStage'], _count: { id: true } }),
      prisma.lessonSubscription.groupBy({ by: ['academicStage'], _count: { id: true } }),
    ]);

    const result = stages.map((st) => {
      const courses = coursesCounts.find((c: any) => c.academicStage === st.code)?._count.id || 0;
      const students = studentsCounts.find((s: any) => s.academicStage === st.code)?._count.id || 0;
      const subscriptions = subscriptionsCounts.find((sub: any) => sub.academicStage === st.code)?._count.id || 0;
      return {
        ...st,
        coursesCount: courses,
        studentsCount: students,
        subscriptionsCount: subscriptions,
      };
    });

    res.status(200).json({ success: true, data: result });
  })
);

// ─── Full Traceable Payments Ledger (Requirement 6) ──────────────────────────

router.get(
  '/payments',
  asyncHandler(async (req, res) => {
    const { studentId, teacherId, stage, page = '1', limit = '100' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (teacherId) {
      where.OR = [
        { teacherProfileId: teacherId },
        { teacherProfile: { userId: teacherId } },
      ];
    }
    if (stage) where.academicStage = stage as any;

    const [payments, total, sumAgg] = await Promise.all([
      prisma.paymentTransaction.findMany({
        where,
        include: {
          student: {
            select: {
              id: true,
              username: true,
              studentProfile: {
                select: {
                  studentPhoneNumber: true,
                  academicStage: true,
                  parentInfo: { select: { parentPhoneNumber: true } },
                },
              },
            },
          },
          teacherProfile: {
            select: {
              id: true,
              displayName: true,
              commissionPct: true,
              user: { select: { username: true } },
            },
          },
          course: { select: { id: true, title: true, subject: true } },
          lesson: { select: { id: true, title: true } },
        },
        orderBy: { createdAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.paymentTransaction.count({ where }),
      prisma.paymentTransaction.aggregate({
        where: { ...where, status: 'COMPLETED' },
        _sum: { amount: true, teacherEarning: true, platformFee: true, pointsUsed: true },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: payments,
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        totalAmountEGP: sumAgg._sum.amount ?? 0,
        totalTeacherEarnings: sumAgg._sum.teacherEarning ?? 0,
        totalPlatformFees: sumAgg._sum.platformFee ?? 0,
        totalPointsUsed: sumAgg._sum.pointsUsed ?? 0,
      },
    });
  })
);

// ─── Platform-Wide Subscriptions Management (Requirements 1, 3, 7, 8) ────────

router.get(
  '/subscriptions',
  asyncHandler(async (req, res) => {
    const { studentId, teacherId, stage, status, page = '1', limit = '50' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const where: any = {};
    if (studentId) where.studentId = studentId;
    if (teacherId) where.teacherProfileId = teacherId;
    if (stage) where.academicStage = stage as any;
    if (status) where.status = status;

    const [subscriptions, total] = await Promise.all([
      prisma.lessonSubscription.findMany({
        where,
        include: {
          student: { select: { id: true, username: true, studentProfile: { select: { studentPhoneNumber: true } } } },
          teacherProfile: { select: { id: true, displayName: true } },
          course: { select: { id: true, title: true, subject: true } },
          lesson: { select: { id: true, title: true, price: true, pointCost: true } },
        },
        orderBy: { subscribedAt: 'desc' },
        skip,
        take: parseInt(limit),
      }),
      prisma.lessonSubscription.count({ where }),
    ]);

    res.status(200).json({
      success: true,
      data: subscriptions,
      meta: { total, page: parseInt(page), limit: parseInt(limit) },
    });
  })
);

router.post(
  '/subscriptions/grant',
  asyncHandler(async (req, res) => {
    const { studentId, lessonId } = req.body;
    if (!studentId || !lessonId) {
      res.status(400).json({ success: false, error: { code: 'MISSING_FIELDS', message: 'studentId and lessonId are required' } });
      return;
    }

    const [student, lesson] = await Promise.all([
      prisma.user.findUnique({ where: { id: studentId } }),
      prisma.lesson.findUnique({
        where: { id: lessonId },
        include: { course: true, teacherProfile: true },
      }),
    ]);

    if (!student || student.role !== 'STUDENT') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }
    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Lesson not found' } });
      return;
    }

    const subscription = await prisma.lessonSubscription.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      create: {
        studentId,
        lessonId,
        courseId: lesson.courseId,
        teacherProfileId: lesson.teacherProfileId,
        academicStage: lesson.academicStage || lesson.course?.academicStage || 'SECONDARY_1',
        status: 'ACTIVE',
        paymentMethod: 'ADMIN_GRANT',
        pricePaid: 0.0,
        pointsPaid: 0,
      },
      update: {
        status: 'ACTIVE',
        paymentMethod: 'ADMIN_GRANT',
      },
    });

    await prisma.unlockedLesson.upsert({
      where: { studentId_lessonId: { studentId, lessonId } },
      create: { studentId, lessonId },
      update: {},
    });

    res.status(201).json({ success: true, data: subscription, message: 'تم منح اشتراك المحاضرة للطالب بنجاح' });
  })
);

router.patch(
  '/subscriptions/:id/revoke',
  asyncHandler(async (req, res) => {
    const sub = await prisma.lessonSubscription.findUnique({ where: { id: req.params.id } });
    if (!sub) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Subscription not found' } });
      return;
    }

    const updated = await prisma.lessonSubscription.update({
      where: { id: sub.id },
      data: { status: 'REVOKED' },
    });

    // Also remove from unlocked lessons
    await prisma.unlockedLesson.deleteMany({
      where: { studentId: sub.studentId, lessonId: sub.lessonId },
    });

    res.status(200).json({ success: true, data: updated, message: 'تم إلغاء اشتراك الطالب في المحاضرة' });
  })
);

// ─── Points Access Codes Management ──────────────────────────────────────────

router.post('/access-codes', AccessCodesController.createCode);
router.get('/access-codes', AccessCodesController.listCodes);
router.patch('/access-codes/:id/revoke', AccessCodesController.revokeCode);
router.post('/access-codes/:id/regenerate', AccessCodesController.regenerateCode);

// ─── Student Management ──────────────────────────────────────────────────────

router.get(
  '/students',
  asyncHandler(async (req, res) => {
    const { search = '', page = '1', limit = '50', stage = '' } = req.query as Record<string, string>;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const validStages = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'BACCALAUREATE_2', 'SECONDARY_3', 'BACCALAUREATE_3'];
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
        lessonSubscriptions: {
          where: { status: 'ACTIVE' },
          include: {
            lesson: { select: { id: true, title: true, price: true, pointCost: true } },
            course: { select: { id: true, title: true, subject: true } },
            teacherProfile: { select: { displayName: true } },
          },
          orderBy: { subscribedAt: 'desc' },
        },
        paymentTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 20,
          include: {
            teacherProfile: { select: { displayName: true } },
            lesson: { select: { title: true } },
          },
        },
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

// ─── Wallet & Points Adjustments ─────────────────────────────────────────────

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

router.delete(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id as string },
      include: { studentProfile: { include: { parentInfo: true } } },
    });

    if (!user || user.role !== 'STUDENT') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'حساب الطالب غير موجود' } });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      // 1. Delete student notes
      await tx.studentNote.deleteMany({ where: { studentId: user.id } });

      // 2. Delete quiz attempts and answers
      const attempts = await tx.quizAttempt.findMany({ where: { studentId: user.id }, select: { id: true } });
      const attemptIds = attempts.map((a: any) => a.id);
      if (attemptIds.length > 0) {
        await tx.studentAnswer.deleteMany({ where: { attemptId: { in: attemptIds } } });
      }
      await tx.quizAttempt.deleteMany({ where: { studentId: user.id } });

      // 3. Delete subscriptions & unlocks & enrollments
      await tx.lessonSubscription.deleteMany({ where: { studentId: user.id } });
      await tx.unlockedLesson.deleteMany({ where: { studentId: user.id } });
      await tx.courseEnrollment.deleteMany({ where: { studentId: user.id } });

      // 4. Delete payments & transactions
      await tx.paymentTransaction.deleteMany({ where: { studentId: user.id } });
      await tx.walletTransaction.deleteMany({ where: { studentId: user.id } });
      await tx.pointsTransaction.deleteMany({ where: { studentId: user.id } });
      await tx.pointRequest.deleteMany({ where: { userId: user.id } });

      // 5. Video access logs & notifications & access codes redeemed
      await tx.videoAccessLog.deleteMany({ where: { studentId: user.id } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await tx.accessCode.updateMany({ where: { redeemedById: user.id }, data: { redeemedById: null } });

      // 6. Delete parent info & student profile
      if (user.studentProfile?.parentInfo) {
        await tx.parentInfo.deleteMany({ where: { studentProfileId: user.studentProfile.id } });
      }
      await tx.studentProfile.deleteMany({ where: { userId: user.id } });

      // 7. Delete user
      await tx.user.delete({ where: { id: user.id } });
    });

    res.status(200).json({
      success: true,
      message: 'تم حذف حساب الطالب وكافة بياناته وسجلاته من قاعدة البيانات بنجاح',
    });
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
        _count: { select: { lessonSubscriptions: true, chapters: true, lessons: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
    res.status(200).json({ success: true, data: courses });
  })
);

router.get(
  '/lessons/:id/preview',
  asyncHandler(async (req, res) => {
    const data = await LessonsService.getLessonPreview(req.params.id, req.user!.sub, 'ADMIN');
    res.status(200).json({ success: true, data });
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
      totalSubscriptions,
      paymentsSummary,
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
      prisma.lessonSubscription.count({ where: { status: 'ACTIVE' } }),
      prisma.paymentTransaction.aggregate({
        where: { status: 'COMPLETED' },
        _sum: { amount: true, teacherEarning: true, platformFee: true },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        totalStudents,
        totalTeachers,
        totalStaff,
        totalLessons,
        totalCourses,
        totalSubscriptions,
        totalRevenueEGP: paymentsSummary._sum.amount ?? 0,
        totalTeacherEarnings: paymentsSummary._sum.teacherEarning ?? 0,
        totalPlatformFees: paymentsSummary._sum.platformFee ?? 0,
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

    const amountToCredit = req.body?.points
      ? parseFloat(req.body.points)
      : (pr.amount > 0 ? pr.amount : (pr.requestedPoints > 0 ? pr.requestedPoints : 0));

    const userBefore = await prisma.user.findUnique({
      where: { id: pr.userId },
      select: { walletBalance: true },
    });
    const newBal = Math.round(((userBefore?.walletBalance || 0) + amountToCredit) * 100) / 100;

    await prisma.$transaction([
      prisma.user.update({
        where: { id: pr.userId },
        data: { walletBalance: newBal },
      }),
      prisma.walletTransaction.create({
        data: {
          studentId: pr.userId,
          actorId: req.user!.sub,
          type: 'CREDIT',
          amount: amountToCredit,
          balanceAfter: newBal,
          reason: `اعتماد طلب شحن رصيد المحفظة (كود: ${pr.code || pr.id.slice(-6)})`,
        },
      }),
      prisma.pointRequest.update({
        where: { id: pr.id },
        data: {
          status: 'APPROVED',
          amount: amountToCredit,
          requestedPoints: Math.round(amountToCredit),
          processedById: req.user!.sub,
          processedAt: new Date(),
        },
      }),
      prisma.notification.create({
        data: {
          userId: pr.userId,
          title: 'تمت الموافقة على طلب الشحن 🎉',
          message: `تم اعتماد إيصال التحويل وشحن ${amountToCredit} ج.م إلى محفظتك بنجاح!`,
          type: 'SUCCESS',
        },
      }),
    ]);

    // Sync voucher/access code status if code matches an active AccessCode
    if (pr.code) {
      try {
        const formattedCode = pr.code.trim().toUpperCase();
        const codeHash = crypto.createHash('sha256').update(formattedCode).digest('hex');
        await prisma.accessCode.updateMany({
          where: {
            OR: [{ codeHash }, { code: formattedCode }],
            status: 'ACTIVE',
          },
          data: {
            status: 'REDEEMED',
            redeemedById: pr.userId,
            redeemedAt: new Date(),
          },
        });
      } catch (_) {}
    }

    const updatedUser = await prisma.user.findUnique({
      where: { id: pr.userId },
      select: { id: true, username: true, pointsBalance: true, walletBalance: true },
    });

    res.status(200).json({
      success: true,
      message: `تم شحن ${amountToCredit} ج.م للطالب بنجاح`,
      data: {
        id: updatedUser?.id,
        username: updatedUser?.username,
        walletBalance: updatedUser?.walletBalance,
        creditedAmount: amountToCredit,
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

// ─── Teachers Management ──────────────────────────────────────────────────────

router.get(
  '/teachers',
  asyncHandler(async (_req, res) => {
    const teachers = await prisma.user.findMany({
      where: { role: 'TEACHER' },
      select: {
        id: true,
        username: true,
        isActive: true,
        walletBalance: true,
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
            commissionPct: true,
            workspaces: true,
            courses: {
              select: {
                id: true,
                title: true,
                academicStage: true,
                isPublished: true,
                _count: { select: { chapters: true, lessons: true, lessonSubscriptions: true } },
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
    const { username, password, displayName, subject, avatarUrl, bio, academicStages, commissionPct } = req.body;
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
    const stagesString = academicStages || 'SECONDARY_1,SECONDARY_2,BACCALAUREATE_2,SECONDARY_3,BACCALAUREATE_3';
    const stageList = stagesString.split(',').map((s: string) => s.trim()).filter(Boolean);
    const parsedCommission = commissionPct !== undefined && commissionPct !== '' && !isNaN(Number(commissionPct)) ? Number(commissionPct) : null;

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
            academicStages: stagesString,
            commissionPct: parsedCommission,
            rating: 5.0,
            ratingCount: 1,
            workspaces: {
              create: stageList.map((stage: string) => ({
                stage: stage as any,
                isActive: true,
              })),
            },
          },
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        createdAt: true,
        teacherProfile: { include: { workspaces: true } },
      },
    });

    res.status(201).json({ success: true, data: newTeacher, message: 'تم إنشاء حساب المدرس بنجاح' });
  })
);

router.patch(
  '/teachers/:id',
  asyncHandler(async (req, res) => {
    const { displayName, subject, avatarUrl, bio, academicStages, commissionPct, password, isActive } = req.body;
    let user = await prisma.user.findUnique({ where: { id: req.params.id as string } });
    if (!user || user.role !== 'TEACHER') {
      const tp = await prisma.teacherProfile.findUnique({ where: { id: req.params.id as string }, include: { user: true } });
      if (tp && tp.user) {
        user = tp.user;
      }
    }
    if (!user || user.role !== 'TEACHER') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Teacher not found' } });
      return;
    }

    let passwordHash: string | undefined = undefined;
    if (password && password.trim().length >= 6) {
      passwordHash = await bcrypt.hash(password.trim(), 12);
    }

    let resolvedCommission: number | null | undefined = undefined;
    if (commissionPct !== undefined) {
      resolvedCommission = (commissionPct === null || commissionPct === '' || isNaN(Number(commissionPct))) ? null : Number(commissionPct);
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
            ...(resolvedCommission !== undefined && { commissionPct: resolvedCommission }),
          },
        },
      },
      select: {
        id: true,
        username: true,
        role: true,
        isActive: true,
        teacherProfile: { include: { workspaces: true } },
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
      include: { teacherProfile: { include: { lessons: true, courses: true } } },
    });

    if (!user || user.role !== 'TEACHER') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'المدرس غير موجود' } });
      return;
    }

    const lessonIds = user.teacherProfile?.lessons?.map((l: { id: string }) => l.id) || [];

    await prisma.$transaction(async (tx: any) => {
      if (lessonIds.length > 0) {
        await tx.pointsTransaction.updateMany({
          where: { relatedLessonId: { in: lessonIds } },
          data: { relatedLessonId: null },
        });
      }
      await tx.accessCode.updateMany({ where: { createdById: user.id }, data: { createdById: null } });
      await tx.accessCode.updateMany({ where: { redeemedById: user.id }, data: { redeemedById: null } });
      await tx.notification.deleteMany({ where: { userId: user.id } });
      await tx.refreshToken.deleteMany({ where: { userId: user.id } });
      await tx.user.delete({ where: { id: user.id } });
    });

    res.status(200).json({
      success: true,
      message: 'تم حذف حساب المدرس واسم المستخدم وكلمة المرور وكافة بياناته من قاعدة البيانات بنجاح',
    });
  })
);

// ─── Teacher Settlement / Payout ─────────────────────────────────────────────

router.post(
  '/teachers/:id/settle',
  asyncHandler(async (req, res) => {
    const teacherId = req.params.id as string;
    const { amount, notes } = req.body;

    let teacher = await prisma.user.findUnique({
      where: { id: teacherId },
      include: { teacherProfile: true },
    });

    if (!teacher || teacher.role !== 'TEACHER') {
      const tp = await prisma.teacherProfile.findUnique({ where: { id: teacherId }, include: { user: true } });
      if (tp && tp.user) {
        teacher = { ...tp.user, teacherProfile: tp } as any;
      }
    }

    if (!teacher || teacher.role !== 'TEACHER') {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'حساب المدرس غير موجود' } });
      return;
    }

    const resolvedUserId = teacher.id;
    const currentBalance = Number(teacher.walletBalance || 0);
    if (currentBalance <= 0) {
      res.status(400).json({ success: false, error: { code: 'NO_BALANCE', message: 'رصيد محفظة المدرس 0 ج.م ولا توجد مستحقات معلقة للتسوية' } });
      return;
    }

    const payoutAmount = amount !== undefined && amount !== null && !isNaN(Number(amount)) && Number(amount) > 0
      ? Math.min(Number(amount), currentBalance)
      : currentBalance;

    const newBalance = Math.round((currentBalance - payoutAmount) * 100) / 100;

    await prisma.$transaction(async (tx) => {
      await tx.user.update({
        where: { id: resolvedUserId },
        data: { walletBalance: newBalance },
      });

      await tx.walletTransaction.create({
        data: {
          studentId: resolvedUserId,
          type: 'DEBIT',
          amount: payoutAmount,
          balanceAfter: newBalance,
          reason: notes || `تسوية وتسليم أرباح ومستحقات نقدية من إدارة المنصة (${payoutAmount} ج.م)`,
          actorId: req.user!.sub,
        },
      });

      await tx.notification.create({
        data: {
          userId: resolvedUserId,
          title: 'تسوية أرباح ومستحقات مالية 💵',
          message: `تم تسليمك وتسوية مبلغ ${payoutAmount.toLocaleString('ar-EG')} ج.م من أرباحك بواسطة الإدارة. الرصيد المتبقي بمحفظتك: ${newBalance.toLocaleString('ar-EG')} ج.م.`,
          type: 'PAYMENT',
        },
      });
    });

    res.status(200).json({
      success: true,
      message: `تمت تسوية مبلغ ${payoutAmount} ج.م للمدرس بنجاح`,
      data: {
        settledAmount: payoutAmount,
        remainingBalance: newBalance,
      },
    });
  })
);

router.get(
  '/teachers/:id/financial-summary',
  asyncHandler(async (req, res) => {
    const teacherId = req.params.id as string;

    let profile = await prisma.teacherProfile.findUnique({
      where: { id: teacherId },
      include: { user: true, courses: true, lessons: true },
    });

    if (!profile) {
      const user = await prisma.user.findUnique({
        where: { id: teacherId },
        include: { teacherProfile: { include: { user: true, courses: true, lessons: true } } },
      });
      if (user?.teacherProfile) {
        profile = user.teacherProfile as any;
      }
    }

    if (!profile) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'حساب المدرس غير موجود' } });
      return;
    }

    // 1. Total distinct students and subscriptions across lesson subscriptions & course enrollments
    const [activeSubs, courseEnrollments] = await Promise.all([
      prisma.lessonSubscription.findMany({
        where: { teacherProfileId: profile.id, status: 'ACTIVE' },
        select: { studentId: true, academicStage: true },
      }),
      prisma.courseEnrollment.findMany({
        where: { course: { teacherProfileId: profile.id } },
        select: { studentId: true, course: { select: { academicStage: true } } },
      }),
    ]);

    const distinctStudents = new Set<string>();
    const stageStudentsMap = new Map<string, Set<string>>();
    const stageSubsMap = new Map<string, number>();

    // Process Lesson Subscriptions
    activeSubs.forEach((sub: any) => {
      distinctStudents.add(sub.studentId);
      const stage = sub.academicStage || 'UNKNOWN';
      if (!stageStudentsMap.has(stage)) {
        stageStudentsMap.set(stage, new Set<string>());
      }
      stageStudentsMap.get(stage)!.add(sub.studentId);
      stageSubsMap.set(stage, (stageSubsMap.get(stage) || 0) + 1);
    });

    // Process Course Enrollments
    courseEnrollments.forEach((ce: any) => {
      distinctStudents.add(ce.studentId);
      const stage = ce.course?.academicStage || 'UNKNOWN';
      if (!stageStudentsMap.has(stage)) {
        stageStudentsMap.set(stage, new Set<string>());
      }
      stageStudentsMap.get(stage)!.add(ce.studentId);
    });

    // Format breakdown: accurate distinct student count per stage & subscription count
    const stageBreakdown: Record<string, { studentsCount: number; subscriptionsCount: number }> = {};
    for (const [stg, studentSet] of stageStudentsMap.entries()) {
      if (stg !== 'UNKNOWN') {
        stageBreakdown[stg] = {
          studentsCount: studentSet.size,
          subscriptionsCount: stageSubsMap.get(stg) || 0,
        };
      }
    }

    // 2. Financial totals from PaymentTransaction
    const [finAgg, transactionsCount] = await Promise.all([
      prisma.paymentTransaction.aggregate({
        where: { teacherProfileId: profile.id, status: 'COMPLETED' },
        _sum: { amount: true, teacherEarning: true, platformFee: true, pointsUsed: true },
      }),
      prisma.paymentTransaction.count({
        where: { teacherProfileId: profile.id },
      }),
    ]);

    const totalSales = Number(finAgg._sum.amount ?? 0);
    const teacherNetBalance = Number(finAgg._sum.teacherEarning ?? 0);
    const platformFee = Number(finAgg._sum.platformFee ?? 0);

    res.status(200).json({
      success: true,
      data: {
        teacherId: profile.id,
        userId: profile.userId,
        displayName: profile.displayName,
        subject: profile.subject,
        teacher: {
          id: profile.id,
          displayName: profile.displayName,
          subject: profile.subject,
        },
        commissionPct: profile.commissionPct ?? 80,
        walletBalance: profile.user?.walletBalance ?? 0,
        totalStudentsEnrolled: distinctStudents.size,
        totalSubscriptionsCount: activeSubs.length + courseEnrollments.length,
        stageBreakdown,
        totalSales,
        teacherNetBalance,
        platformFee,
        transactionsCount,
      },
    });
  })
);

// ─── Student Profile Requests (Approval Workflow) ─────────────────────────────

router.get(
  '/profile-requests',
  asyncHandler(async (req, res) => {
    const status = (req.query.status as string) || undefined;
    const requests = await prisma.studentProfileRequest.findMany({
      where: status ? { status } : undefined,
      include: {
        student: {
          select: {
            id: true,
            username: true,
            role: true,
            studentProfile: {
              include: { parentInfo: true },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    res.status(200).json({ success: true, data: requests });
  })
);

router.patch(
  '/profile-requests/:id/approve',
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const requestItem = await prisma.studentProfileRequest.findUnique({
      where: { id: id as string },
      include: {
        student: {
          include: {
            studentProfile: {
              include: { parentInfo: true },
            },
          },
        },
      },
    });

    if (!requestItem) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'طلب التعديل غير موجود' } });
      return;
    }

    if (requestItem.status !== 'PENDING') {
      res.status(400).json({ success: false, error: { code: 'ALREADY_PROCESSED', message: 'تمت معالجة هذا الطلب مسبقاً' } });
      return;
    }

    const reqData = (requestItem.requestedData as any) || {};
    const validStages = ['PREPARATORY', 'SECONDARY_1', 'SECONDARY_2', 'BACCALAUREATE_2', 'SECONDARY_3', 'BACCALAUREATE_3'];

    await prisma.$transaction(async (tx: any) => {
      // 1. Update Student Profile & Stage
      let studentProfile = requestItem.student.studentProfile;
      if (!studentProfile) {
        studentProfile = await tx.studentProfile.create({
          data: {
            userId: requestItem.studentId,
            studentPhoneNumber: reqData.studentPhoneNumber || '',
            academicStage: reqData.academicStage && validStages.includes(reqData.academicStage) ? reqData.academicStage : 'SECONDARY_1',
            parentInfo: {
              create: {
                parentPhoneNumber: reqData.parentPhoneNumber || '',
                parentEmail: reqData.parentEmail || null,
                fatherJob: reqData.fatherJob || '',
                parentStatus: 'BOTH_ALIVE',
              },
            },
          },
          include: { parentInfo: true },
        });
      } else {
        const profUpdates: any = {};
        if (reqData.studentPhoneNumber !== undefined) profUpdates.studentPhoneNumber = reqData.studentPhoneNumber;
        if (reqData.academicStage && validStages.includes(reqData.academicStage)) profUpdates.academicStage = reqData.academicStage;
        if (Object.keys(profUpdates).length > 0) {
          await tx.studentProfile.update({
            where: { id: studentProfile.id },
            data: profUpdates,
          });
        }

        if (studentProfile.parentInfo) {
          await tx.parentInfo.update({
            where: { id: studentProfile.parentInfo.id },
            data: {
              ...(reqData.parentPhoneNumber !== undefined ? { parentPhoneNumber: reqData.parentPhoneNumber } : {}),
              ...(reqData.parentEmail !== undefined ? { parentEmail: reqData.parentEmail } : {}),
              ...(reqData.fatherJob !== undefined ? { fatherJob: reqData.fatherJob } : {}),
            },
          });
        } else if (reqData.parentPhoneNumber || reqData.fatherJob || reqData.parentEmail) {
          await tx.parentInfo.create({
            data: {
              studentProfileId: studentProfile.id,
              parentPhoneNumber: reqData.parentPhoneNumber || '',
              parentEmail: reqData.parentEmail || null,
              fatherJob: reqData.fatherJob || '',
              parentStatus: 'BOTH_ALIVE',
            },
          });
        }
      }

      // 2. Mark request as APPROVED
      await tx.studentProfileRequest.update({
        where: { id: requestItem.id },
        data: {
          status: 'APPROVED',
          processedAt: new Date(),
        },
      });

      // 3. Send notification to student
      await tx.notification.create({
        data: {
          userId: requestItem.studentId,
          type: 'SYSTEM',
          title: 'تم قبول طلب تعديل بياناتك',
          message: 'وافقت إدارة المنصة على طلب تعديل بيانات حسابك وتم تطبيق التغييرات بنجاح.',
        },
      });
    });

    res.status(200).json({
      success: true,
      message: 'تمت الموافقة على طلب تعديل البيانات وتطبيق التغييرات بنجاح',
    });
  })
);

router.patch(
  '/profile-requests/:id/reject',
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { reason } = req.body;

    const requestItem = await prisma.studentProfileRequest.findUnique({
      where: { id: id as string },
    });

    if (!requestItem) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'طلب التعديل غير موجود' } });
      return;
    }

    if (requestItem.status !== 'PENDING') {
      res.status(400).json({ success: false, error: { code: 'ALREADY_PROCESSED', message: 'تمت معالجة هذا الطلب مسبقاً' } });
      return;
    }

    await prisma.$transaction(async (tx: any) => {
      await tx.studentProfileRequest.update({
        where: { id: requestItem.id },
        data: {
          status: 'REJECTED',
          adminNote: reason || 'تم رفض الطلب بواسطة إدارة المنصة',
          processedAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: requestItem.studentId,
          type: 'SYSTEM',
          title: 'تم رفض طلب تعديل البيانات',
          message: reason ? `تم رفض طلبك بالسبب: ${reason}` : 'نعتذر، تم رفض طلب تعديل بيانات حسابك من قبل إدارة المنصة.',
        },
      });
    });

    res.status(200).json({
      success: true,
      message: 'تم رفض طلب التعديل بنجاح',
    });
  })
);

// ─── Offline Session Requests (Center to Online Admin Controls) ──────────────

router.get(
  '/offline-requests',
  asyncHandler(async (req, res) => {
    const { status, search } = req.query as { status?: string; search?: string };
    const where: any = {};
    if (status && status !== 'ALL') {
      where.status = status;
    }
    if (search && search.trim()) {
      const q = search.trim();
      where.OR = [
        { studentName: { contains: q, mode: 'insensitive' } },
        { phoneNumber: { contains: q, mode: 'insensitive' } },
        { centerLocation: { contains: q, mode: 'insensitive' } },
        { teacherName: { contains: q, mode: 'insensitive' } },
        { student: { username: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const requests = await prisma.offlineSessionRequest.findMany({
      where,
      include: {
        student: {
          select: {
            id: true,
            username: true,
            walletBalance: true,
            studentProfile: {
              select: {
                studentPhoneNumber: true,
                academicStage: true,
              },
            },
          },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            course: { select: { id: true, title: true } },
            teacherProfile: { select: { displayName: true } },
          },
        },
        processedBy: {
          select: { id: true, username: true },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });

    res.status(200).json({ success: true, data: requests });
  })
);

router.patch(
  '/offline-requests/:id/approve-unlock',
  asyncHandler(async (req, res) => {
    const adminId = req.user!.sub;
    const { id } = req.params;
    const { lessonId: overrideLessonId } = req.body || {};

    const reqRecord = await prisma.offlineSessionRequest.findUnique({
      where: { id: id as string },
      include: { student: true, lesson: true },
    });

    if (!reqRecord) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود' } });
      return;
    }

    const targetLessonId = overrideLessonId || reqRecord.lessonId;
    if (!targetLessonId) {
      res.status(400).json({
        success: false,
        error: { code: 'MISSING_LESSON', message: 'يرجى تحديد المحاضرة المراد فتحها للطالب' },
      });
      return;
    }

    const lesson = await prisma.lesson.findUnique({
      where: { id: targetLessonId },
      include: { teacherProfile: true },
    });

    if (!lesson) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'المحاضرة المحددة غير موجودة' } });
      return;
    }

    // Direct unlock: Upsert active LessonSubscription and UnlockedLesson
    await prisma.$transaction(async (tx: any) => {
      await tx.lessonSubscription.upsert({
        where: {
          studentId_lessonId: {
            studentId: reqRecord.studentId,
            lessonId: targetLessonId,
          },
        },
        update: {
          status: 'ACTIVE',
          paymentMethod: 'ADMIN_OFFLINE_GRANT',
          pricePaid: 0,
        },
        create: {
          studentId: reqRecord.studentId,
          lessonId: targetLessonId,
          courseId: lesson.courseId,
          teacherProfileId: lesson.teacherProfileId,
          academicStage: lesson.academicStage,
          status: 'ACTIVE',
          paymentMethod: 'ADMIN_OFFLINE_GRANT',
          pricePaid: 0,
        },
      });

      await tx.unlockedLesson.upsert({
        where: {
          studentId_lessonId: {
            studentId: reqRecord.studentId,
            lessonId: targetLessonId,
          },
        },
        update: {},
        create: {
          studentId: reqRecord.studentId,
          lessonId: targetLessonId,
        },
      });

      await tx.offlineSessionRequest.update({
        where: { id: reqRecord.id },
        data: {
          status: 'APPROVED',
          actionTaken: 'DIRECT_UNLOCK',
          lessonId: targetLessonId,
          processedById: adminId,
          processedAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: reqRecord.studentId,
          title: '🔓 تم تفعيل وفتح المحاضرة بنجاح!',
          message: `تم قبول طلب حضورك الأوفلاين (${reqRecord.centerLocation}) وتم فتح محاضرة "${lesson.title}" لك على المنصة مباشرة.`,
          type: 'SUCCESS',
        },
      });
    });

    res.status(200).json({ success: true, message: 'تم فتح المحاضرة وتفعيل الاشتراك للطالب بنجاح' });
  })
);

router.patch(
  '/offline-requests/:id/send-code',
  asyncHandler(async (req, res) => {
    const adminId = req.user!.sub;
    const { id } = req.params;
    const { code: customCode, points } = req.body || {};

    const reqRecord = await prisma.offlineSessionRequest.findUnique({
      where: { id: id as string },
      include: { student: true, lesson: true },
    });

    if (!reqRecord) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود' } });
      return;
    }

    // Generate or use custom code
    let plainCode = (customCode || '').trim().toUpperCase();
    if (!plainCode) {
      const rnd = Math.random().toString(36).substring(2, 6).toUpperCase();
      const rnd2 = Math.random().toString(36).substring(2, 6).toUpperCase();
      plainCode = `OFF-${rnd}-${rnd2}`;
    }

    const codeHash = crypto.createHash('sha256').update(plainCode).digest('hex');

    // Create AccessCode record so it can also be redeemed via platform redeem codes
    const codePoints = Number(points) > 0 ? Number(points) : (reqRecord.lesson?.price || 50);

    await prisma.$transaction(async (tx: any) => {
      // Create active access code
      await tx.accessCode.create({
        data: {
          code: plainCode,
          codeHash,
          points: codePoints,
          status: 'ACTIVE',
          createdById: adminId,
        },
      });

      await tx.offlineSessionRequest.update({
        where: { id: reqRecord.id },
        data: {
          status: 'APPROVED',
          actionTaken: 'CODE_SENT',
          accessCode: plainCode,
          processedById: adminId,
          processedAt: new Date(),
        },
      });

      await tx.notification.create({
        data: {
          userId: reqRecord.studentId,
          title: '🎟️ كود تفعيل المحاضرات الأوفلاين',
          message: `تم قبول طلبك الأوفلاين! كود التفعيل الخاص بك هو: ${plainCode} (يمكنك استخدامه لتفعيل المحاضرة أو شحن رصيدك).`,
          type: 'SUCCESS',
        },
      });
    });

    res.status(200).json({ success: true, accessCode: plainCode, message: 'تم إنشاء وإرسال كود التفعيل للطالب بنجاح' });
  })
);

router.patch(
  '/offline-requests/:id/reject',
  asyncHandler(async (req, res) => {
    const adminId = req.user!.sub;
    const { id } = req.params;
    const { reason } = req.body || {};

    const reqRecord = await prisma.offlineSessionRequest.findUnique({
      where: { id: id as string },
    });

    if (!reqRecord) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود' } });
      return;
    }

    await prisma.offlineSessionRequest.update({
      where: { id: reqRecord.id },
      data: {
        status: 'REJECTED',
        rejectionReason: reason ? String(reason).trim() : 'لم يتم استيفاء شروط الحضور الأوفلاين',
        processedById: adminId,
        processedAt: new Date(),
      },
    });

    await prisma.notification.create({
      data: {
        userId: reqRecord.studentId,
        title: '❌ بخصوص طلب السيشن الأوفلاين',
        message: `تم رفض طلب السيشن الأوفلاين (${reqRecord.centerLocation}): ${reason || 'يرجى مراجعة إدارة السنتر للتأكد من بيانات الحضور'}.`,
        type: 'WARNING',
      },
    });

    res.status(200).json({ success: true, message: 'تم رفض الطلب وإشعار الطالب' });
  })
);

router.get(
  '/security-logs',
  asyncHandler(async (_req, res) => {
    const logs = await prisma.videoAccessLog.findMany({
      take: 100,
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            studentProfile: {
              select: {
                studentPhoneNumber: true,
              },
            },
          },
        },
        lesson: {
          select: {
            id: true,
            title: true,
            course: {
              select: {
                id: true,
                title: true,
              },
            },
          },
        },
      },
    });

    res.status(200).json({ success: true, data: logs });
  })
);

export default router;


