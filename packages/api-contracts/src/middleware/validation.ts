import { z } from 'zod';
import { createValidationError } from '../types/errors';
import { t } from '../utils/trpc';

/**
 * Input sanitization middleware
 * Sanitizes string inputs to prevent XSS and other attacks
 */
export const sanitizationMiddleware = t.middleware(async ({ next, rawInput }) => {
  // Basic sanitization function
  const sanitizeString = (str: string): string => {
    return str
      .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/on\w+\s*=/gi, '') // Remove event handlers
      .trim();
  };

  // Recursively sanitize object
  const sanitizeObject = (obj: any): any => {
    if (typeof obj === 'string') {
      return sanitizeString(obj);
    }

    if (Array.isArray(obj)) {
      return obj.map(sanitizeObject);
    }

    if (obj && typeof obj === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(obj)) {
        sanitized[key] = sanitizeObject(value);
      }
      return sanitized;
    }

    return obj;
  };

  const sanitizedInput = sanitizeObject(rawInput);

  return next({
    rawInput: sanitizedInput,
  });
});

/**
 * Custom validation middleware for complex business rules
 */
export const businessValidationMiddleware = t.middleware(
  async ({ next, ctx, path, input: _input }) => {
    // Example: Validate user permissions for specific operations
    if (path.includes('admin') && ctx.user && !ctx.user.roles.includes('admin')) {
      throw createValidationError('Insufficient permissions for admin operations');
    }

    // Example: Validate user account status
    if (ctx.user && ctx.user.status !== 'active') {
      throw createValidationError('Account is not active');
    }

    return next();
  }
);

/**
 * File upload validation middleware
 */
export const fileValidationMiddleware = (_options: {
  maxSize?: number; // in bytes
  allowedTypes?: string[];
  maxFiles?: number;
}) => {
  return t.middleware(async ({ next, input: _input }) => {
    // This would be used for file upload endpoints
    // Implementation depends on how files are handled in the input

    return next();
  });
};

/**
 * Data consistency validation middleware
 */
export const consistencyValidationMiddleware = t.middleware(async ({ next, ctx, input, path }) => {
  // Example: Ensure user can only modify their own data
  if (path.includes('user.update') && input && typeof input === 'object' && 'userId' in input) {
    if (ctx.user && input.userId !== ctx.user.id && !ctx.user.roles.includes('admin')) {
      throw createValidationError('Cannot modify other user data');
    }
  }

  return next();
});

/**
 * Schema validation helpers
 */
export const createSchemaValidation = <T extends z.ZodTypeAny>(schema: T) => {
  return t.middleware(async ({ next, rawInput }) => {
    try {
      const validatedInput = schema.parse(rawInput);
      return next({
        rawInput: validatedInput,
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        throw createValidationError('Invalid input data', error);
      }
      throw error;
    }
  });
};

/**
 * Common validation schemas
 */
export const commonValidationSchemas = {
  uuid: z.string().uuid('Invalid UUID format'),
  email: z.string().email('Invalid email format'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number format'),
  url: z.string().url('Invalid URL format'),
  positiveInteger: z.number().int().positive('Must be a positive integer'),
  nonEmptyString: z.string().min(1, 'String cannot be empty'),
};
