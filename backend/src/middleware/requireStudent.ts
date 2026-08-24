import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ForbiddenError } from '../utils/errors';

/**
 * Guard: STUDENT or ADMIN role.
 * Rejects tokens for any other role structurally.
 */
export function requireStudent(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'STUDENT' && req.user?.role !== 'ADMIN') {
      return next(ForbiddenError('Access restricted to students and platform administrators'));
    }
    next();
  });
}
