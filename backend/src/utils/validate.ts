import { ZodSchema, ZodError } from 'zod';
import { Request } from 'express';
import { BadRequestError } from './errors';

/**
 * Validates a request against a Zod schema that expects { body, params, query }.
 * Throws a descriptive 400 error if validation fails.
 */
export function validate<T extends { body?: unknown; params?: unknown; query?: unknown }>(
  schema: ZodSchema<T>,
  req: Request
): T {
  const result = schema.safeParse({
    body: req.body,
    params: req.params,
    query: req.query,
  });

  if (!result.success) {
    const details = result.error.issues
      .map((i) => `${i.path.join('.')}: ${i.message}`)
      .join('; ');
    throw BadRequestError(`Validation error: ${details}`, 'VALIDATION_ERROR');
  }

  return result.data;
}
