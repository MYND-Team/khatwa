import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ForbiddenError } from '../utils/errors';

/**
 * Guard: TEACHER or ADMIN role.
 * Rejects any token that is not TEACHER or ADMIN.
 */
export function requireTeacher(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'TEACHER' && req.user?.role !== 'ADMIN') {
      return next(ForbiddenError('Access restricted to teachers and platform administrators'));
    }
    next();
  });
}

// Backward compatibility aliases
export const requireTeacherOnly = requireTeacher;
export const requireTeacherOrAssistant = requireTeacher;
export const requireTeacherOrEditableAssistant = requireTeacher;
