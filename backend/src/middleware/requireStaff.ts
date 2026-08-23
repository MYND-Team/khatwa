import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ForbiddenError } from '../utils/errors';

/**
 * Guard: STAFF or ADMIN role.
 * Used for student management and access code generation.
 */
export function requireStaff(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    const role = req.user?.role;
    if (role !== 'STAFF' && role !== 'ADMIN') {
      return next(ForbiddenError('Access restricted to staff and administrators'));
    }
    next();
  });
}
