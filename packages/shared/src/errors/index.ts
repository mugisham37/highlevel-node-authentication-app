// Base error classes
export abstract class DomainError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  public readonly timestamp: string;
  public readonly requestId?: string;

  constructor(message: string, requestId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.timestamp = new Date().toISOString();
    this.requestId = requestId;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      requestId: this.requestId,
      stack: this.stack,
    };
  }
}

// Authentication errors
export class AuthenticationError extends DomainError {
  readonly code = 'AUTHENTICATION_FAILED';
  readonly statusCode = 401;
}

export class AuthorizationError extends DomainError {
  readonly code = 'AUTHORIZATION_FAILED';
  readonly statusCode = 403;
}

export class InvalidCredentialsError extends AuthenticationError {
  readonly code = 'INVALID_CREDENTIALS';
}

export class TokenExpiredError extends AuthenticationError {
  readonly code = 'TOKEN_EXPIRED';
}

export class InvalidTokenError extends AuthenticationError {
  readonly code = 'INVALID_TOKEN';
}

// Validation errors
export class ValidationError extends DomainError {
  readonly code = 'VALIDATION_FAILED';
  readonly statusCode = 400;
  public readonly field?: string;
  public readonly details?: Record<string, any>;

  constructor(message: string, field?: string, details?: Record<string, any>, requestId?: string) {
    super(message, requestId);
    this.field = field;
    this.details = details;
  }
}

// Resource errors
export class NotFoundError extends DomainError {
  readonly code = 'RESOURCE_NOT_FOUND';
  readonly statusCode = 404;
}

export class ConflictError extends DomainError {
  readonly code = 'RESOURCE_CONFLICT';
  readonly statusCode = 409;
}

export class DuplicateResourceError extends ConflictError {
  readonly code = 'DUPLICATE_RESOURCE';
}

// Business logic errors
export class BusinessLogicError extends DomainError {
  readonly code = 'BUSINESS_LOGIC_ERROR';
  readonly statusCode = 422;
}

export class InsufficientPermissionsError extends AuthorizationError {
  readonly code = 'INSUFFICIENT_PERMISSIONS';
}

// System errors
export class InternalServerError extends DomainError {
  readonly code = 'INTERNAL_SERVER_ERROR';
  readonly statusCode = 500;
}

export class ServiceUnavailableError extends DomainError {
  readonly code = 'SERVICE_UNAVAILABLE';
  readonly statusCode = 503;
}

// Rate limiting errors
export class RateLimitError extends DomainError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
}

// Error factory
export class ErrorFactory {
  static authentication(message: string, requestId?: string): AuthenticationError {
    return new AuthenticationError(message, requestId);
  }

  static authorization(message: string, requestId?: string): AuthorizationError {
    return new AuthorizationError(message, requestId);
  }

  static validation(message: string, field?: string, details?: Record<string, any>, requestId?: string): ValidationError {
    return new ValidationError(message, field, details, requestId);
  }

  static notFound(message: string, requestId?: string): NotFoundError {
    return new NotFoundError(message, requestId);
  }

  static conflict(message: string, requestId?: string): ConflictError {
    return new ConflictError(message, requestId);
  }

  static businessLogic(message: string, requestId?: string): BusinessLogicError {
    return new BusinessLogicError(message, requestId);
  }

  static internal(message: string, requestId?: string): InternalServerError {
    return new InternalServerError(message, requestId);
  }
}