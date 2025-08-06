/**
 * Error handling utilities for TypeScript strict mode
 * Provides type-safe error handling for unknown error types
 */

/**
 * Type guard to check if an error is an Error instance
 */
export function isError(error: unknown): error is Error {
  return error instanceof Error;
}

/**
 * Type guard to check if an error has a message property
 */
export function hasMessage(error: unknown): error is { message: string } {
  return typeof error === 'object' && error !== null && 'message' in error;
}

/**
 * Type guard to check if an error has a code property
 */
export function hasCode(error: unknown): error is { code: string | number } {
  return typeof error === 'object' && error !== null && 'code' in error;
}

/**
 * Type guard to check if an error has a stack property
 */
export function hasStack(error: unknown): error is { stack: string } {
  return typeof error === 'object' && error !== null && 'stack' in error;
}

/**
 * Safely extract error message from unknown error
 */
export function getErrorMessage(error: unknown): string {
  if (isError(error)) {
    return error.message;
  }
  if (hasMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

/**
 * Safely extract error code from unknown error
 */
export function getErrorCode(error: unknown): string | number | undefined {
  if (hasCode(error)) {
    return error.code;
  }
  return undefined;
}

/**
 * Safely extract error stack from unknown error
 */
export function getErrorStack(error: unknown): string | undefined {
  if (isError(error)) {
    return error.stack;
  }
  if (hasStack(error)) {
    return error.stack;
  }
  return undefined;
}

/**
 * Convert unknown error to a structured error object
 */
export interface StructuredError {
  message: string;
  code?: string | number | undefined;
  stack?: string | undefined;
  originalError: unknown;
}

export function structureError(error: unknown): StructuredError {
  return {
    message: getErrorMessage(error),
    code: getErrorCode(error),
    stack: getErrorStack(error),
    originalError: error,
  };
}

/**
 * Enhanced error class with additional context
 */
export class EnhancedError extends Error {
  public readonly code?: string | number | undefined;
  public readonly context?: Record<string, any> | undefined;
  public readonly originalError?: unknown;

  constructor(
    message: string,
    options: {
      code?: string | number | undefined;
      context?: Record<string, any> | undefined;
      originalError?: unknown;
      cause?: Error;
    } = {}
  ) {
    super(message);
    this.name = 'EnhancedError';
    this.code = options.code;
    this.context = options.context;
    this.originalError = options.originalError;
    
    if (options.cause) {
      this.cause = options.cause;
    }

    // Maintain proper stack trace
    if (Error.captureStackTrace) {
      Error.captureStackTrace(this, EnhancedError);
    }
  }
}

/**
 * Wrap unknown error in EnhancedError for better error handling
 */
export function wrapError(
  error: unknown,
  message?: string,
  context?: Record<string, any>
): EnhancedError {
  const structuredError = structureError(error);
  
  const options: {
    code?: string | number | undefined;
    context?: Record<string, any> | undefined;
    originalError?: unknown;
    cause?: Error;
  } = {
    originalError: error,
  };

  if (structuredError.code !== undefined) {
    options.code = structuredError.code;
  }

  if (context !== undefined) {
    options.context = context;
  }

  if (isError(error)) {
    options.cause = error;
  }

  return new EnhancedError(
    message || structuredError.message,
    options
  );
}
