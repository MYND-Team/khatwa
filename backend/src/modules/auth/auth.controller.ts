import { Request, Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { validate } from '../../utils/validate';
import {
  registerStudentSchema,
  registerWithCodeSchema,
  loginSchema,
  refreshTokenSchema,
} from './auth.schema';
import * as AuthService from './auth.service';

export const registerStudent = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(registerStudentSchema, req);
  const result = await AuthService.registerStudent(body);
  res.status(201).json({ success: true, data: result });
});

export const registerWithCode = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(registerWithCodeSchema, req);
  const result = await AuthService.registerWithCode(body);
  res.status(201).json({ success: true, data: result });
});

export const login = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(loginSchema, req);
  const result = await AuthService.login(body);
  res.status(200).json({ success: true, data: result });
});

export const refresh = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(refreshTokenSchema, req);
  const tokens = await AuthService.refreshAccessToken(body.refreshToken);
  res.status(200).json({ success: true, data: tokens });
});

export const logout = asyncHandler(async (req: Request, res: Response) => {
  const { body } = validate(refreshTokenSchema, req);
  await AuthService.logout(body.refreshToken);
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});
