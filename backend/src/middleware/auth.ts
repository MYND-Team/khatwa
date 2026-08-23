import { Request, Response, NextFunction } from 'express';
import { verifyAccessToken, AccessTokenPayload } from '../utils/jwt';
import { UnauthorizedError } from '../utils/errors';

// Augment Express Request to include the authenticated user
declare global {
  namespace Express {
    interface Request {
      user?: AccessTokenPayload;
    }
  }
}

/**
 * Verifies the Bearer JWT and attaches the decoded payload to req.user.
 * Does NOT enforce any specific role — use role-specific guards after this.
 */
export function authenticate(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next(UnauthorizedError('No token provided'));
  }

  const token = authHeader.slice(7);

  try {
    req.user = verifyAccessToken(token);
    next();
  } catch {
    next(UnauthorizedError('Invalid or expired token'));
  }
}
