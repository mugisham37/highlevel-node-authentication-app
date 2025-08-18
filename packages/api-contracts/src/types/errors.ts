import { TRPCError } from '@trpc/server';

/**
 * Custom error codes for the application
 */
export const ERROR_CODES = {
  // Authentication errors
  INVALID_CREDENTIALS: 'INVALID_CREDENTIALS',
  ACCOUNT_LOCKED: 'ACCOUNT_LOCKED',
  EMAIL_NOT_VERIFIED: 'EMAIL_NOT_VERIFIED',
  MFA_REQUIRED: 'MFA_REQUIRED',
  INVALID_MFA_CODE: 'INVALID_MFA_CODE',
  
  // Authorization errors
  INSUFFICIENT_PERMISSIONS: 'INSUFFICIENT_PERMISSIONS',
  RESOURCE_NOT_FOUND: 'RESOURCE_NOT_FOUND',
  
  // Validation errors
  INVALID_INPUT: 'INVALID_INPUT',
  DUPLICATE_EMAIL: 'DUPLICATE_EMAIL',
  WEAK_PASSWORD: 'WEAK_PASSWORD',
  
  // Rate limiting
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  
  // System errors
  DATABASE_ERROR: 'DATABASE_ERROR',
  EXTERNAL_SERVICE_ERROR: 'EXTERNAL_SERVICE_ERROR',
} as const;

export type ErrorCode = typeof ERROR_CODES[keyof typeof ERROR_CODES];

/**
 * Application-specific error class
 */
export class AppError extends TRPCError {
  public readonly appCode: ErrorCode;
  
  constructor(opts: {
    code: TRPCError['code'];
    appCode: ErrorCode;
    message: string;
    cause?: unknown;
  }) {
    super(opts);
    this.appCode = opts.appCode;
  }
}

/**
 * Helper functions to create common errors
 */
export const createAuthError = (appCode: ErrorCode, message: string) =>
  new AppError({
    code: 'UNAUTHORIZED',
    appCode,
    message,
  });

export const createValidationError = (message: string, cause?: unknown) =>
  new AppError({
    code: 'BAD_REQUEST',
    appCode: ERROR_CODES.INVALID_INPUT,
    message,
    cause,
  });

export const createNotFoundError = (resource: string) =>
  new AppError({
    code: 'NOT_FOUND',
    appCode: ERROR_CODES.RESOURCE_NOT_FOUND,
    message: `${resource} not found`,
  });

export const createForbiddenError = (message: string = 'Insufficient permissions') =>
  new AppError({
    code: 'FORBIDDEN',
    appCode: ERROR_CODES.INSUFFICIENT_PERMISSIONS,
    message,
  });

export const createRateLimitError = () =>
  new AppError({
    code: 'TOO_MANY_REQUESTS',
    appCode: ERROR_CODES.RATE_LIMIT_EXCEEDED,
    message: 'Rate limit exceeded. Please try again later.',
  });