import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../utils/validate';
import * as AccessCodesService from './accessCodes.service';
import { z } from 'zod';

const createAccessCodeSchema = z.object({
  body: z.object({
    points: z.coerce.number().int().min(1, 'Points must be at least 1'),
    expiresInHours: z.coerce.number().min(1).optional(),
  }),
});

const redeemAccessCodeSchema = z.object({
  body: z.object({
    code: z.string().min(1, 'Access code is required'),
  }),
});

const idParamSchema = z.object({
  params: z.object({ id: z.string() }),
});

const listAccessCodesSchema = z.object({
  query: z.object({
    status: z.enum(['ACTIVE', 'REDEEMED', 'REVOKED', 'EXPIRED']).optional(),
  }),
});

// ─── Staff & Admin Handlers ──────────────────────────────────────────────────

export const createCode = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(createAccessCodeSchema, req);
  const data = await AccessCodesService.createAccessCode({
    points: body.points,
    expiresInHours: body.expiresInHours,
    createdById: req.user!.sub,
  });
  res.status(201).json({ success: true, data });
});

export const listCodes = asyncHandler(async (req: Request, res: Response) => {
  const { query } = validate(listAccessCodesSchema, req);
  const data = await AccessCodesService.listAccessCodes(query as any);
  res.status(200).json({ success: true, data });
});

export const revokeCode = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(idParamSchema, req);
  const data = await AccessCodesService.revokeAccessCode(params.id);
  res.status(200).json({ success: true, data });
});

export const regenerateCode = asyncHandler(async (req: Request, res: Response) => {
  const { params } = validate(idParamSchema, req);
  const data = await AccessCodesService.regenerateAccessCode(params.id, req.user!.sub);
  res.status(201).json({ success: true, data });
});

// ─── Student Handlers ────────────────────────────────────────────────────────

export const redeemCode = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(redeemAccessCodeSchema, req);
  const data = await AccessCodesService.redeemAccessCode(body.code, req.user!.sub);
  res.status(200).json({
    success: true,
    message: `Successfully redeemed ${data.pointsAdded} points!`,
    data,
  });
});
