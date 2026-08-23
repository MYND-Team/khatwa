/**
 * Point Requests — Student submits payment screenshot, Staff/Admin approves & credits points.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import { requireStudent } from '../middleware/requireStudent';
import { requireStaff } from '../middleware/requireStaff';
import { asyncHandler } from '../utils/asyncHandler';
import { prisma } from '../config/prisma';

const router = Router();

// ─── Screenshot upload storage ────────────────────────────────────────────────
const uploadDir = path.join(process.cwd(), 'uploads', 'payment-screenshots');
fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => {
    const ts = Date.now();
    const ext = path.extname(file.originalname) || '.jpg';
    cb(null, `receipt-${ts}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: (_req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('يُسمح فقط برفع صور (JPEG, PNG, GIF, WebP)'));
  },
});

// ─── Student: Submit a point request ─────────────────────────────────────────
//  POST /point-requests
//  Body: multipart/form-data { requestedPoints, notes?, screenshot (file) }

router.post(
  '/',
  requireStudent,
  upload.single('screenshot'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: { code: 'NO_SCREENSHOT', message: 'يجب رفع صورة إثبات التحويل' },
      });
      return;
    }

    const requestedPoints = parseInt(req.body.requestedPoints as string, 10);
    if (!requestedPoints || requestedPoints < 1) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_POINTS', message: 'يجب تحديد عدد نقاط صحيح' },
      });
      return;
    }

    const pr = await prisma.pointRequest.create({
      data: {
        studentId: req.user!.sub,
        requestedPoints,
        screenshotPath: req.file.filename,
        screenshotName: req.file.originalname,
        notes: (req.body.notes as string) || null,
        status: 'PENDING',
      },
    });

    res.status(201).json({
      success: true,
      data: {
        id: pr.id,
        requestedPoints: pr.requestedPoints,
        status: pr.status,
        createdAt: pr.createdAt,
        message: 'تم استلام طلبك بنجاح! ستتم مراجعته وشحن النقاط فور التأكيد.',
      },
    });
  })
);

// ─── Student: My point requests ───────────────────────────────────────────────
//  GET /point-requests/mine

router.get(
  '/mine',
  requireStudent,
  asyncHandler(async (req: Request, res: Response) => {
    const requests = await prisma.pointRequest.findMany({
      where: { studentId: req.user!.sub },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        requestedPoints: true,
        grantedPoints: true,
        status: true,
        notes: true,
        rejectionReason: true,
        createdAt: true,
        reviewedAt: true,
      },
    });

    res.status(200).json({ success: true, data: requests });
  })
);

// ─── Staff/Admin: List all requests ───────────────────────────────────────────
//  GET /point-requests/admin?status=PENDING

router.get(
  '/admin',
  requireStaff,
  asyncHandler(async (req: Request, res: Response) => {
    const status = (req.query.status as string) || 'PENDING';

    const requests = await prisma.pointRequest.findMany({
      where: status === 'ALL' ? {} : { status },
      orderBy: { createdAt: 'desc' },
      include: {
        student: {
          select: {
            id: true,
            username: true,
            pointsBalance: true,
            studentProfile: {
              select: {
                studentPhoneNumber: true,
                parentInfo: { select: { parentPhoneNumber: true } },
              },
            },
          },
        },
      },
    });

    res.status(200).json({ success: true, data: requests });
  })
);

// ─── Staff/Admin: Get screenshot image ────────────────────────────────────────
//  GET /point-requests/:id/screenshot

router.get(
  '/:id/screenshot',
  requireStaff,
  asyncHandler(async (req: Request, res: Response) => {
    const pr = await prisma.pointRequest.findUnique({ where: { id: req.params.id } });

    if (!pr) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود' } });
      return;
    }

    const filePath = path.join(uploadDir, pr.screenshotPath);
    if (!fs.existsSync(filePath)) {
      res.status(404).json({ success: false, error: { code: 'FILE_NOT_FOUND', message: 'ملف الصورة غير موجود' } });
      return;
    }

    res.sendFile(filePath);
  })
);

// ─── Staff/Admin: Approve & credit points ────────────────────────────────────
//  PATCH /point-requests/:id/approve
//  Body: { grantedPoints: number }

router.patch(
  '/:id/approve',
  requireStaff,
  asyncHandler(async (req: Request, res: Response) => {
    const grantedPoints = parseInt(req.body.grantedPoints as string, 10);
    if (!grantedPoints || grantedPoints < 1) {
      res.status(400).json({
        success: false,
        error: { code: 'INVALID_POINTS', message: 'يجب تحديد عدد نقاط صحيح للشحن' },
      });
      return;
    }

    const pr = await prisma.pointRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود' } });
      return;
    }

    if (pr.status !== 'PENDING') {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: `الطلب تمت مراجعته مسبقًا (${pr.status})` },
      });
      return;
    }

    // Use a transaction: update request + credit points + record transaction atomically
    await prisma.$transaction(async (tx: any) => {
      await tx.pointRequest.update({
        where: { id: pr.id },
        data: {
          status: 'APPROVED',
          grantedPoints,
          reviewedById: req.user!.sub,
          reviewedAt: new Date(),
        },
      });

      await tx.user.update({
        where: { id: pr.studentId },
        data: { pointsBalance: { increment: grantedPoints } },
      });

      await tx.pointsTransaction.create({
        data: {
          studentId: pr.studentId,
          type: 'CREDIT',
          amount: grantedPoints,
          reason: `شحن نقاط مراجع (طلب #${pr.id.slice(-6)})`,
          actorId: req.user!.sub,
        },
      });
    });

    const updatedStudent = await prisma.user.findUnique({
      where: { id: pr.studentId },
      select: { id: true, username: true, pointsBalance: true },
    });

    res.status(200).json({
      success: true,
      data: {
        message: `تم شحن ${grantedPoints} نقطة للطالب بنجاح`,
        student: updatedStudent,
        grantedPoints,
      },
    });
  })
);

// ─── Staff/Admin: Reject request ─────────────────────────────────────────────
//  PATCH /point-requests/:id/reject
//  Body: { reason?: string }

router.patch(
  '/:id/reject',
  requireStaff,
  asyncHandler(async (req: Request, res: Response) => {
    const pr = await prisma.pointRequest.findUnique({ where: { id: req.params.id } });
    if (!pr) {
      res.status(404).json({ success: false, error: { code: 'NOT_FOUND', message: 'الطلب غير موجود' } });
      return;
    }

    if (pr.status !== 'PENDING') {
      res.status(409).json({
        success: false,
        error: { code: 'ALREADY_REVIEWED', message: `الطلب تمت مراجعته مسبقًا (${pr.status})` },
      });
      return;
    }

    await prisma.pointRequest.update({
      where: { id: pr.id },
      data: {
        status: 'REJECTED',
        rejectionReason: (req.body.reason as string) || 'لم يتم قبول الطلب',
        reviewedById: req.user!.sub,
        reviewedAt: new Date(),
      },
    });

    res.status(200).json({
      success: true,
      data: { message: 'تم رفض الطلب وإبلاغ الطالب' },
    });
  })
);

export default router;
