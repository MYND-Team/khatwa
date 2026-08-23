import { Request, Response, NextFunction } from 'express';
import { authenticate } from './auth';
import { ForbiddenError } from '../utils/errors';

/**
 * Guard: TEACHER role only.
 * Rejects any token that is not TEACHER.
 */
export function requireTeacher(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  authenticate(req, res, (err) => {
    if (err) return next(err);
    if (req.user?.role !== 'TEACHER') {
      return next(ForbiddenError('Access restricted to teachers'));
    }
    next();
  });
}

// Backward compatibility alias if needed
export const requireTeacherOnly = requireTeacher;
export const requireTeacherOrAssistant = requireTeacher;
export const requireTeacherOrEditableAssistant = requireTeacher;

