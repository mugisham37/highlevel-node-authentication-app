/**
 * Base Error Classes and Error Hierarchy
 * Comprehensive error handling system with proper HTTP status codes
 */

export interface ErrorDetails {
  [key: string]: any;
}

export interface ErrorContext {
  correlationId?: string | undefined;
  userId?: string | undefined;
  requestId?: string | undefined;
  operation?: string | undefined;
  timestamp?: Date | undefined;
  metadata?: Record<string, any> | undefined;
}

/**
 * Base application error class
 * All application errors should extend from this class
 */
export abstract class BaseError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: Date;
  readonly correlationId: string | undefined;
  readonly context: ErrorContext;
  readonly isOperational: boolean = true;

  constructor(
    message: string,
    context: ErrorContext = {},
    isOperational: boolean = true
  ) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date();
    this.correlationId = context.correlationId;
    this.context = { ...context, timestamp: this.timestamp };
    this.isOperational = isOperational;

    // Maintain proper stack trace
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Serialize error for logging and API responses
   */
  toJSON(): Record<string, any> {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
      isOperational: this.isOperational,
      context: this.context,
    };
  }

  /**
   * Get safe error response for API clients
   */
  toApiResponse(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        timestamp: this.timestamp,
        correlationId: this.correlationId,
      },
    };
  }
}

/**
 * Validation Error - 400 Bad Request
 */
export class ValidationError extends BaseError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly details: ErrorDetails;

  constructor(
    details: ErrorDetails,
    message: string = 'Request validation failed',
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.details = details;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }

  override toApiResponse(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        timestamp: this.timestamp,
        correlationId: this.correlationId,
      },
    };
  }
}

/**
 * Authentication Error - 401 Unauthorized
 */
export class AuthenticationError extends BaseError {
  readonly code = 'AUTHENTICATION_ERROR';
  readonly statusCode = 401;
  readonly reason: string | undefined;

  constructor(
    message: string = 'Authentication failed',
    reason?: string,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.reason = reason;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      reason: this.reason,
    };
  }
}

/**
 * Authorization Error - 403 Forbidden
 */
export class AuthorizationError extends BaseError {
  readonly code = 'AUTHORIZATION_ERROR';
  readonly statusCode = 403;
  readonly requiredPermission: string | undefined;
  readonly userPermissions: string[] | undefined;

  constructor(
    message: string = 'Access denied',
    requiredPermission?: string,
    userPermissions?: string[],
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.requiredPermission = requiredPermission;
    this.userPermissions = userPermissions;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      requiredPermission: this.requiredPermission,
      userPermissions: this.userPermissions,
    };
  }
}

/**
 * Not Found Error - 404 Not Found
 */
export class NotFoundError extends BaseError {
  readonly code = 'NOT_FOUND';
  readonly statusCode = 404;
  readonly resource: string | undefined;
  readonly resourceId: string | undefined;

  constructor(
    message: string = 'Resource not found',
    resource?: string,
    resourceId?: string,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.resource = resource;
    this.resourceId = resourceId;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      resource: this.resource,
      resourceId: this.resourceId,
    };
  }
}

/**
 * Conflict Error - 409 Conflict
 */
export class ConflictError extends BaseError {
  readonly code = 'CONFLICT';
  readonly statusCode = 409;
  readonly conflictingResource: string | undefined;

  constructor(
    message: string = 'Resource conflict',
    conflictingResource?: string,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.conflictingResource = conflictingResource;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      conflictingResource: this.conflictingResource,
    };
  }
}

/**
 * Rate Limit Error - 429 Too Many Requests
 */
export class RateLimitError extends BaseError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly retryAfter: number;
  readonly limit: number;
  readonly remaining: number;

  constructor(
    retryAfter: number,
    limit: number,
    remaining: number = 0,
    message: string = 'Rate limit exceeded',
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.retryAfter = retryAfter;
    this.limit = limit;
    this.remaining = remaining;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
      limit: this.limit,
      remaining: this.remaining,
    };
  }

  override toApiResponse(): Record<string, any> {
    return {
      error: {
        code: this.code,
        message: this.message,
        retryAfter: this.retryAfter,
        limit: this.limit,
        remaining: this.remaining,
        timestamp: this.timestamp,
        correlationId: this.correlationId,
      },
    };
  }
}

/**
 * Internal Server Error - 500 Internal Server Error
 */
export class InternalServerError extends BaseError {
  readonly code = 'INTERNAL_SERVER_ERROR';
  readonly statusCode = 500;
  readonly originalError: Error | undefined;

  constructor(
    message: string = 'Internal server error',
    originalError?: Error,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.originalError = originalError;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
            stack: this.originalError.stack,
          }
        : undefined,
    };
  }

  override toApiResponse(): Record<string, any> {
    // Don't expose internal error details in production
    return {
      error: {
        code: this.code,
        message: 'An internal error occurred',
        timestamp: this.timestamp,
        correlationId: this.correlationId,
      },
    };
  }
}

/**
 * Service Unavailable Error - 503 Service Unavailable
 */
export class ServiceUnavailableError extends BaseError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
  readonly service: string | undefined;
  readonly retryAfter: number | undefined;

  constructor(
    message: string = 'Service temporarily unavailable',
    service?: string,
    retryAfter?: number,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.service = service;
    this.retryAfter = retryAfter;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      service: this.service,
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * External Service Error - For circuit breaker and external service failures
 */
export class ExternalServiceError extends BaseError {
  readonly code = 'EXTERNAL_SERVICE_ERROR';
  readonly statusCode = 502;
  readonly service: string;
  readonly operation: string | undefined;
  readonly originalError: Error | undefined;

  constructor(
    service: string,
    message: string = 'External service error',
    operation?: string,
    originalError?: Error,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.service = service;
    this.operation = operation;
    this.originalError = originalError;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      service: this.service,
      operation: this.operation,
      originalError: this.originalError
        ? {
            name: this.originalError.name,
            message: this.originalError.message,
          }
        : undefined,
    };
  }
}

/**
 * Database Error - For database-related failures
 */
export class DatabaseError extends BaseError {
  readonly code = 'DATABASE_ERROR';
  readonly statusCode = 500;
  readonly operation: string | undefined;
  readonly table: string | undefined;

  constructor(
    message: string = 'Database operation failed',
    operation?: string,
    table?: string,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.operation = operation;
    this.table = table;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      operation: this.operation,
      table: this.table,
    };
  }
}

/**
 * Cache Error - For cache-related failures
 */
export class CacheError extends BaseError {
  readonly code = 'CACHE_ERROR';
  readonly statusCode = 500;
  readonly operation: string | undefined;
  readonly key: string | undefined;

  constructor(
    message: string = 'Cache operation failed',
    operation?: string,
    key?: string,
    context: ErrorContext = {}
  ) {
    super(message, context);
    this.operation = operation;
    this.key = key;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      operation: this.operation,
      key: this.key,
    };
  }
}

/**
 * Configuration Error - For configuration-related failures
 */
export class ConfigurationError extends BaseError {
  readonly code = 'CONFIGURATION_ERROR';
  readonly statusCode = 500;
  readonly configKey: string | undefined;

  constructor(
    message: string = 'Configuration error',
    configKey?: string,
    context: ErrorContext = {}
  ) {
    super(message, context, false); // Configuration errors are not operational
    this.configKey = configKey;
  }

  override toJSON(): Record<string, any> {
    return {
      ...super.toJSON(),
      configKey: this.configKey,
    };
  }
}

/**
 * Error factory function to create appropriate error instances
 */
export function createError(
  type: string,
  message?: string,
  details?: any,
  context?: ErrorContext
): BaseError {
  switch (type) {
    case 'VALIDATION_ERROR':
      return new ValidationError(details || {}, message, context);
    case 'AUTHENTICATION_ERROR':
      return new AuthenticationError(message, details?.reason, context);
    case 'AUTHORIZATION_ERROR':
      return new AuthorizationError(
        message,
        details?.requiredPermission,
        details?.userPermissions,
        context
      );
    case 'NOT_FOUND':
      return new NotFoundError(
        message,
        details?.resource,
        details?.resourceId,
        context
      );
    case 'CONFLICT':
      return new ConflictError(message, details?.conflictingResource, context);
    case 'RATE_LIMIT_EXCEEDED':
      return new RateLimitError(
        details?.retryAfter || 60,
        details?.limit || 100,
        details?.remaining || 0,
        message,
        context
      );
    case 'SERVICE_UNAVAILABLE':
      return new ServiceUnavailableError(
        message,
        details?.service,
        details?.retryAfter,
        context
      );
    case 'EXTERNAL_SERVICE_ERROR':
      return new ExternalServiceError(
        details?.service || 'unknown',
        message,
        details?.operation,
        details?.originalError,
        context
      );
    case 'DATABASE_ERROR':
      return new DatabaseError(
        message,
        details?.operation,
        details?.table,
        context
      );
    case 'CACHE_ERROR':
      return new CacheError(message, details?.operation, details?.key, context);
    case 'CONFIGURATION_ERROR':
      return new ConfigurationError(message, details?.configKey, context);
    default:
      return new InternalServerError(message, details?.originalError, context);
  }
}

/**
 * Type guard to check if error is operational
 */
export function isOperationalError(error: Error): boolean {
  if (error instanceof BaseError) {
    return error.isOperational;
  }
  return false;
}

/**
 * Extract correlation ID from error
 */
export function getCorrelationId(error: Error): string | undefined {
  if (error instanceof BaseError) {
    return error.correlationId;
  }
  return undefined;
}
