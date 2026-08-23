import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../utils/validate';
import * as BrandingService from './branding.service';
import { z } from 'zod';

const updateSchema = z.object({
  body: BrandingService.updateBrandingSchema,
});

export const getSettings = asyncHandler(async (_req: Request, res: Response) => {
  const data = await BrandingService.getSettings();
  res.status(200).json({ success: true, data });
});

export const updateSettings = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(updateSchema, req);
  const data = await BrandingService.updateSettings(body, req.user!.sub);
  res.status(200).json({ success: true, data });
});
