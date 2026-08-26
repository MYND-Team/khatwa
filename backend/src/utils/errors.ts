import { Request, Response, NextFunction } from 'express';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly isOperational: boolean;

  constructor(
    message: string,
    statusCode: number = 500,
    code: string = 'INTERNAL_ERROR',
    isOperational: boolean = true
  ) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = isOperational;
    Object.setPrototypeOf(this, AppError.prototype);
    Error.captureStackTrace(this, this.constructor);
  }
}

// Common error factories
export const NotFoundError = (resource: string) =>
  new AppError(`${resource} not found`, 404, 'NOT_FOUND');

export const UnauthorizedError = (msg = 'Unauthorized') =>
  new AppError(msg, 401, 'UNAUTHORIZED');

export const ForbiddenError = (msg = 'Forbidden') =>
  new AppError(msg, 403, 'FORBIDDEN');

export const BadRequestError = (msg: string, code = 'BAD_REQUEST') =>
  new AppError(msg, 400, code);

export const ConflictError = (msg: string) =>
  new AppError(msg, 409, 'CONFLICT');

export const PaymentRequiredError = (msg = 'Insufficient points') =>
  new AppError(msg, 402, 'INSUFFICIENT_POINTS');

// ─── Centralized error handler middleware ───

export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: {
        code: err.code,
        message: err.message,
      },
    });
    return;
  }

  // Prisma errors
  if ((err as any).code === 'P2002') {
    res.status(409).json({
      success: false,
      error: {
        code: 'CONFLICT',
        message: 'A record with this value already exists.',
      },
    });
    return;
  }

  if ((err as any).code === 'P2025') {
    res.status(404).json({
      success: false,
      error: {
        code: 'NOT_FOUND',
        message: 'Record not found.',
      },
    });
    return;
  }

  // Unknown errors
  console.error('Unhandled error:', err);
  const message = (err && err.message) ? err.message : 'An unexpected error occurred.';
  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: message,
    },
  });
}
