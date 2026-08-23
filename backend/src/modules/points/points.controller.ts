import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import * as PointsService from './points.service';

export const getBalance = asyncHandler(async (req: Request, res: Response) => {
  const data = await PointsService.getBalance(req.user!.sub);
  res.status(200).json({ success: true, data });
});

export const getMyTransactions = asyncHandler(async (req: Request, res: Response) => {
  const data = await PointsService.getTransactionHistory(req.user!.sub);
  res.status(200).json({ success: true, data });
});
