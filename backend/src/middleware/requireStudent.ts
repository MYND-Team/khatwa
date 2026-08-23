import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ForbiddenError } from '../utils/errors';

/**
 * Guard: STUDENT role only
 * Rejects tokens for any other role structurally — not just a permission check.
 */
export function requireStudent(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'STUDENT') {
      return next(ForbiddenError('Access restricted to students'));
    }
    next();
  });
}
