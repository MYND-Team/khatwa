import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ForbiddenError } from '../utils/errors';

/**
 * Guard: ADMIN role only (Security codes — full access).
 * Rejects any token that is not ADMIN.
 */
export function requireAdmin(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'ADMIN') {
      return next(ForbiddenError('Access restricted to administrators'));
    }
    next();
  });
}

export const requireAdminOnly = requireAdmin;

