/**
 * /staff/* — STAFF and ADMIN roles
 *
 * Dedicated router for staff operations:
 * - Student management (search, list, profiles, transactions, performance)
 * - Points access codes management (generate, list, revoke, regenerate)
 */

import { Router } from 'express';
import { requireStaff } from '../middleware/requireStaff';
import * as AccessCodesController from '../modules/accessCodes/accessCodes.controller';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';
import { validate } from '../utils/validate';
import { z } from 'zod';

const router = Router();

// All routes require STAFF or ADMIN
router.use(requireStaff);

// ─── Student Management ──────────────────────────────────────────────────────

const listStudentsSchema = z.object({
  query: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
    search: z.string().optional(),
    isActive: z
      .enum(['true', 'false'])
      .transform((val) => val === 'true')
      .optional(),
  }),
});

const studentIdSchema = z.object({
  params: z.object({ id: z.string() }),
});

router.get(
  '/students',
  asyncHandler(async (req, res) => {
    const { query } = validate(listStudentsSchema, req);
    const skip = (query.page - 1) * query.limit;

    const whereClause: any = {
      role: 'STUDENT',
      ...(query.isActive !== undefined ? { isActive: query.isActive } : {}),
      ...(query.search
        ? {
            OR: [
              { username: { contains: query.search, mode: 'insensitive' } },
              {
                studentProfile: {
                  studentPhoneNumber: { contains: query.search },
                },
              },
            ],
          }
        : {}),
    };

    const [students, total] = await Promise.all([
      prisma.user.findMany({
        where: whereClause,
        select: {
          id: true,
          username: true,
          pointsBalance: true,
          isActive: true,
          createdAt: true,
          studentProfile: {
            select: {
              studentPhoneNumber: true,
              parentInfo: {
                select: {
                  parentPhoneNumber: true,
                  parentEmail: true,
                  fatherJob: true,
                  // parentStatus is EXCLUDED
                },
              },
            },
          },
        },
        skip,
        take: query.limit,
        orderBy: { createdAt: 'desc' },
      }),
      prisma.user.count({ where: whereClause }),
    ]);

    res.status(200).json({
      success: true,
      data: students,
      pagination: {
        page: query.page,
        limit: query.limit,
        total,
        totalPages: Math.ceil(total / query.limit),
      },
    });
  })
);

router.get(
  '/students/:id',
  asyncHandler(async (req, res) => {
    const { params } = validate(studentIdSchema, req);
    const student = await prisma.user.findUnique({
      where: { id: params.id, role: 'STUDENT' },
      select: {
        id: true,
        username: true,
        pointsBalance: true,
        isActive: true,
        createdAt: true,
        studentProfile: {
          select: {
            studentPhoneNumber: true,
            parentInfo: {
              select: {
                parentPhoneNumber: true,
                parentEmail: true,
                fatherJob: true,
                // parentStatus excluded
              },
            },
          },
        },
        unlockedLessons: {
          include: {
            lesson: {
              select: {
                id: true,
                title: true,
                pointCost: true,
                teacherProfile: { select: { displayName: true } },
              },
            },
          },
          orderBy: { unlockedAt: 'desc' },
        },
        pointsTransactions: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        redeemedAccessCodes: {
          select: {
            id: true,
            points: true,
            redeemedAt: true,
            status: true,
          },
          orderBy: { redeemedAt: 'desc' },
        },
        quizAttempts: {
          include: {
            quiz: { select: { id: true, title: true, type: true } },
          },
          orderBy: { submittedAt: 'desc' },
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
  '/students/:id/performance',
  asyncHandler(async (req, res) => {
    const { params } = validate(studentIdSchema, req);
    const student = await prisma.user.findUnique({
      where: { id: params.id, role: 'STUDENT' },
      select: { id: true, username: true },
    });

    if (!student) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'Student not found' } });
      return;
    }

    const [unlocked, quizAttempts, homeworks] = await Promise.all([
      prisma.unlockedLesson.findMany({
        where: { studentId: params.id },
        include: {
          lesson: {
            select: {
              id: true,
              title: true,
              pointCost: true,
              orderIndex: true,
              teacherProfile: { select: { displayName: true } },
            },
          },
        },
        orderBy: { unlockedAt: 'desc' },
      }),
      prisma.quizAttempt.findMany({
        where: { studentId: params.id },
        include: {
          quiz: { select: { id: true, title: true, type: true } },
        },
        orderBy: { submittedAt: 'desc' },
      }),
      prisma.homeworkSubmission.findMany({
        where: { studentId: params.id },
        orderBy: { submittedAt: 'desc' },
      }),
    ]);

    res.status(200).json({
      success: true,
      data: {
        student,
        unlockedLessons: unlocked,
        quizAttempts,
        homeworkSubmissions: homeworks,
      },
    });
  })
);

// ─── Points Access Codes Management ──────────────────────────────────────────

router.post('/access-codes', AccessCodesController.createCode);
router.get('/access-codes', AccessCodesController.listCodes);
router.patch('/access-codes/:id/revoke', AccessCodesController.revokeCode);
router.post('/access-codes/:id/regenerate', AccessCodesController.regenerateCode);

export default router;
