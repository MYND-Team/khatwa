import { Request, Response, NextFunction } from 'express';

/**
 * Wraps an async route handler to automatically forward errors to next().
 * Eliminates try/catch boilerplate in controllers.
 */
export const asyncHandler =
  (fn: (req: Request, res: Response, next: NextFunction) => Promise<any>) =>
  (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
