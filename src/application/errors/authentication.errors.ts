/**
 * Authentication Error Classes
 * Specific error types for authentication operations
 */

export abstract class AuthenticationError extends Error {
  abstract readonly code: string;
  abstract readonly statusCode: number;
  readonly timestamp: Date = new Date();
  readonly correlationId?: string;

  constructor(message: string, correlationId?: string) {
    super(message);
    this.name = this.constructor.name;
    this.correlationId = correlationId;
    Error.captureStackTrace(this, this.constructor);
  }

  toJSON() {
    return {
      name: this.name,
      code: this.code,
      message: this.message,
      statusCode: this.statusCode,
      timestamp: this.timestamp,
      correlationId: this.correlationId,
    };
  }
}

export class InvalidCredentialsError extends AuthenticationError {
  readonly code = 'INVALID_CREDENTIALS';
  readonly statusCode = 401;

  constructor(correlationId?: string) {
    super('Invalid email or password', correlationId);
  }
}

export class AccountLockedError extends AuthenticationError {
  readonly code = 'ACCOUNT_LOCKED';
  readonly statusCode = 423;
  readonly lockedUntil?: Date;
  readonly failedAttempts: number;

  constructor(
    lockedUntil?: Date,
    failedAttempts: number = 0,
    correlationId?: string
  ) {
    super(
      'Account is temporarily locked due to too many failed attempts',
      correlationId
    );
    this.lockedUntil = lockedUntil;
    this.failedAttempts = failedAttempts;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      lockedUntil: this.lockedUntil,
      failedAttempts: this.failedAttempts,
    };
  }
}

export class AccountNotVerifiedError extends AuthenticationError {
  readonly code = 'ACCOUNT_NOT_VERIFIED';
  readonly statusCode = 403;

  constructor(correlationId?: string) {
    super(
      'Account email must be verified before authentication',
      correlationId
    );
  }
}

export class MFARequiredError extends AuthenticationError {
  readonly code = 'MFA_REQUIRED';
  readonly statusCode = 200; // Not an error, but requires additional step
  readonly challengeId: string;
  readonly challengeType: string;

  constructor(
    challengeId: string,
    challengeType: string,
    correlationId?: string
  ) {
    super('Multi-factor authentication is required', correlationId);
    this.challengeId = challengeId;
    this.challengeType = challengeType;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      challengeId: this.challengeId,
      challengeType: this.challengeType,
    };
  }
}

export class HighRiskBlockedError extends AuthenticationError {
  readonly code = 'HIGH_RISK_BLOCKED';
  readonly statusCode = 403;
  readonly riskScore: number;
  readonly recommendations: string[];

  constructor(
    riskScore: number,
    recommendations: string[],
    correlationId?: string
  ) {
    super('Authentication blocked due to security concerns', correlationId);
    this.riskScore = riskScore;
    this.recommendations = recommendations;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      riskScore: this.riskScore,
      recommendations: this.recommendations,
    };
  }
}

export class InvalidTokenError extends AuthenticationError {
  readonly code = 'INVALID_TOKEN';
  readonly statusCode = 401;
  readonly requiresRefresh: boolean;

  constructor(
    message: string = 'Token is invalid',
    requiresRefresh: boolean = false,
    correlationId?: string
  ) {
    super(message, correlationId);
    this.requiresRefresh = requiresRefresh;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      requiresRefresh: this.requiresRefresh,
    };
  }
}

export class InvalidSessionError extends AuthenticationError {
  readonly code = 'INVALID_SESSION';
  readonly statusCode = 401;

  constructor(reason: string = 'Session is invalid', correlationId?: string) {
    super(reason, correlationId);
  }
}

export class SessionExpiredError extends AuthenticationError {
  readonly code = 'SESSION_EXPIRED';
  readonly statusCode = 401;

  constructor(correlationId?: string) {
    super('Session has expired, please log in again', correlationId);
  }
}

export class UserNotFoundError extends AuthenticationError {
  readonly code = 'USER_NOT_FOUND';
  readonly statusCode = 404;

  constructor(correlationId?: string) {
    super('User not found', correlationId);
  }
}

export class ValidationError extends AuthenticationError {
  readonly code = 'VALIDATION_ERROR';
  readonly statusCode = 400;
  readonly details: Record<string, string>;

  constructor(details: Record<string, string>, correlationId?: string) {
    super('Request validation failed', correlationId);
    this.details = details;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      details: this.details,
    };
  }
}

export class InternalAuthenticationError extends AuthenticationError {
  readonly code = 'INTERNAL_ERROR';
  readonly statusCode = 500;

  constructor(
    message: string = 'An internal error occurred during authentication',
    correlationId?: string
  ) {
    super(message, correlationId);
  }
}

export class UnsupportedAuthTypeError extends AuthenticationError {
  readonly code = 'UNSUPPORTED_AUTH_TYPE';
  readonly statusCode = 400;
  readonly authType: string;

  constructor(authType: string, correlationId?: string) {
    super(`Authentication type ${authType} is not supported`, correlationId);
    this.authType = authType;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      authType: this.authType,
    };
  }
}

export class RateLimitExceededError extends AuthenticationError {
  readonly code = 'RATE_LIMIT_EXCEEDED';
  readonly statusCode = 429;
  readonly retryAfter: number;

  constructor(retryAfter: number, correlationId?: string) {
    super('Rate limit exceeded, please try again later', correlationId);
    this.retryAfter = retryAfter;
  }

  toJSON() {
    return {
      ...super.toJSON(),
      retryAfter: this.retryAfter,
    };
  }
}

/**
 * Factory function to create appropriate error from error code
 */
export function createAuthenticationError(
  code: string,
  message?: string,
  details?: any,
  correlationId?: string
): AuthenticationError {
  switch (code) {
    case 'INVALID_CREDENTIALS':
      return new InvalidCredentialsError(correlationId);

    case 'ACCOUNT_LOCKED':
      return new AccountLockedError(
        details?.lockedUntil,
        details?.failedAttempts,
        correlationId
      );

    case 'ACCOUNT_NOT_VERIFIED':
      return new AccountNotVerifiedError(correlationId);

    case 'MFA_REQUIRED':
      return new MFARequiredError(
        details?.challengeId,
        details?.challengeType,
        correlationId
      );

    case 'HIGH_RISK_BLOCKED':
      return new HighRiskBlockedError(
        details?.riskScore || 0,
        details?.recommendations || [],
        correlationId
      );

    case 'INVALID_TOKEN':
      return new InvalidTokenError(
        message,
        details?.requiresRefresh,
        correlationId
      );

    case 'INVALID_SESSION':
      return new InvalidSessionError(message, correlationId);

    case 'SESSION_EXPIRED':
      return new SessionExpiredError(correlationId);

    case 'USER_NOT_FOUND':
      return new UserNotFoundError(correlationId);

    case 'VALIDATION_ERROR':
      return new ValidationError(details || {}, correlationId);

    case 'UNSUPPORTED_AUTH_TYPE':
      return new UnsupportedAuthTypeError(
        details?.authType || 'unknown',
        correlationId
      );

    case 'RATE_LIMIT_EXCEEDED':
      return new RateLimitExceededError(
        details?.retryAfter || 60,
        correlationId
      );

    default:
      return new InternalAuthenticationError(message, correlationId);
  }
}
