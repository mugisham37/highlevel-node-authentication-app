/**
 * Request Validation Middleware
 * Comprehensive request validation using Zod schemas with security features
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { z, ZodSchema, ZodError } from 'zod';
import { logger } from '../../logging/winston-logger';

export interface ValidationConfig {
  enableSanitization?: boolean;
  enableRateLimitByValidationFailures?: boolean;
  maxValidationFailures?: number;
  validationFailureWindow?: number; // minutes
  onValidationFailure?: (
    request: FastifyRequest,
    reply: FastifyReply,
    errors: ValidationError[]
  ) => void;
  customSanitizers?: Record<string, (value: any) => any>;
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  received?: any;
  expected?: string;
}

export interface ValidationSchemas {
  body?: ZodSchema;
  query?: ZodSchema;
  params?: ZodSchema;
  headers?: ZodSchema;
}

declare module 'fastify' {
  interface FastifyRequest {
    validatedBody?: any;
    validatedQuery?: any;
    validatedParams?: any;
    validatedHeaders?: any;
    validationErrors?: ValidationError[];
  }
}

export class RequestValidationMiddleware {
  private static readonly DEFAULT_CONFIG: Required<ValidationConfig> = {
    enableSanitization: true,
    enableRateLimitByValidationFailures: true,
    maxValidationFailures: 10,
    validationFailureWindow: 15, // 15 minutes
    onValidationFailure: () => {},
    customSanitizers: {},
  };

  private readonly config: Required<ValidationConfig>;
  private readonly validationFailures = new Map<
    string,
    { count: number; resetTime: number }
  >();

  constructor(config: ValidationConfig = {}) {
    this.config = { ...RequestValidationMiddleware.DEFAULT_CONFIG, ...config };

    // Clean up validation failure tracking every 5 minutes
    setInterval(
      () => {
        this.cleanupValidationFailures();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Create validation middleware for specific schemas
   */
  static createValidator(
    schemas: ValidationSchemas,
    config: ValidationConfig = {}
  ): FastifyPluginAsync {
    const middleware = new RequestValidationMiddleware(config);

    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await middleware.validate(request, reply, schemas);
      });
    };
  }

  /**
   * Main validation handler
   */
  async validate(
    request: FastifyRequest,
    reply: FastifyReply,
    schemas: ValidationSchemas
  ): Promise<void> {
    try {
      const errors: ValidationError[] = [];
      const clientKey = this.getClientKey(request);

      // Check if client has exceeded validation failure limit
      if (
        this.config.enableRateLimitByValidationFailures &&
        this.isRateLimited(clientKey)
      ) {
        await this.handleRateLimitExceeded(request, reply);
        return;
      }

      // Validate and sanitize body
      if (schemas.body && request.body !== undefined) {
        const bodyResult = await this.validateAndSanitize(
          request.body,
          schemas.body,
          'body',
          request
        );
        if (bodyResult.success) {
          request.validatedBody = bodyResult.data;
        } else {
          errors.push(...bodyResult.errors);
        }
      }

      // Validate and sanitize query parameters
      if (schemas.query && request.query !== undefined) {
        const queryResult = await this.validateAndSanitize(
          request.query,
          schemas.query,
          'query',
          request
        );
        if (queryResult.success) {
          request.validatedQuery = queryResult.data;
        } else {
          errors.push(...queryResult.errors);
        }
      }

      // Validate and sanitize path parameters
      if (schemas.params && request.params !== undefined) {
        const paramsResult = await this.validateAndSanitize(
          request.params,
          schemas.params,
          'params',
          request
        );
        if (paramsResult.success) {
          request.validatedParams = paramsResult.data;
        } else {
          errors.push(...paramsResult.errors);
        }
      }

      // Validate headers
      if (schemas.headers && request.headers !== undefined) {
        const headersResult = await this.validateAndSanitize(
          request.headers,
          schemas.headers,
          'headers',
          request
        );
        if (headersResult.success) {
          request.validatedHeaders = headersResult.data;
        } else {
          errors.push(...headersResult.errors);
        }
      }

      // Handle validation errors
      if (errors.length > 0) {
        request.validationErrors = errors;
        this.trackValidationFailure(clientKey);
        await this.handleValidationErrors(request, reply, errors);
        return;
      }

      // Log successful validation for monitoring
      logger.debug('Request validation successful', {
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        hasBody: !!schemas.body,
        hasQuery: !!schemas.query,
        hasParams: !!schemas.params,
        hasHeaders: !!schemas.headers,
      });
    } catch (error) {
      logger.error('Error in request validation middleware', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        code: 'VALIDATION_SYSTEM_ERROR',
        error: 'Internal Server Error',
        message: 'Request validation system error',
        statusCode: 500,
      });
    }
  }

  /**
   * Validate and sanitize data against schema
   */
  private async validateAndSanitize(
    data: any,
    schema: ZodSchema,
    context: string,
    request: FastifyRequest
  ): Promise<
    { success: true; data: any } | { success: false; errors: ValidationError[] }
  > {
    try {
      // Pre-sanitization if enabled
      let sanitizedData = data;
      if (this.config.enableSanitization) {
        sanitizedData = await this.sanitizeData(data, context);
      }

      // Validate with Zod
      const result = schema.safeParse(sanitizedData);

      if (result.success) {
        return { success: true, data: result.data };
      } else {
        const errors = this.formatZodErrors(result.error, context);

        // Log validation failures for security monitoring
        logger.warn('Request validation failed', {
          correlationId: request.correlationId,
          context,
          errors: errors.map((e) => ({ field: e.field, message: e.message })),
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });

        return { success: false, errors };
      }
    } catch (error) {
      logger.error('Error during validation and sanitization', {
        correlationId: request.correlationId,
        context,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        errors: [
          {
            field: context,
            message: 'Validation system error',
            code: 'VALIDATION_ERROR',
          },
        ],
      };
    }
  }

  /**
   * Sanitize data to prevent common security issues
   */
  private async sanitizeData(data: any, context: string): Promise<any> {
    if (data === null || data === undefined) {
      return data;
    }

    if (typeof data === 'string') {
      return this.sanitizeString(data);
    }

    if (Array.isArray(data)) {
      return Promise.all(data.map((item) => this.sanitizeData(item, context)));
    }

    if (typeof data === 'object') {
      const sanitized: any = {};
      for (const [key, value] of Object.entries(data)) {
        // Apply custom sanitizer if available
        if (this.config.customSanitizers[key]) {
          sanitized[key] = this.config.customSanitizers[key](value);
        } else {
          sanitized[key] = await this.sanitizeData(value, context);
        }
      }
      return sanitized;
    }

    return data;
  }

  /**
   * Sanitize string values
   */
  private sanitizeString(value: string): string {
    if (typeof value !== 'string') {
      return value;
    }

    // Remove null bytes
    let sanitized = value.replace(/\0/g, '');

    // HTML encode dangerous characters
    sanitized = sanitized
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;')
      .replace(/\//g, '&#x2F;');

    // Remove or escape potentially dangerous patterns
    sanitized = sanitized
      .replace(/<script[^>]*>.*?<\/script>/gi, '') // Remove script tags
      .replace(/javascript:/gi, '') // Remove javascript: protocol
      .replace(/data:text\/html/gi, '') // Remove data URLs with HTML
      .replace(/vbscript:/gi, '') // Remove vbscript: protocol
      .replace(/on\w+\s*=/gi, ''); // Remove event handlers

    // Trim whitespace
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Format Zod validation errors
   */
  private formatZodErrors(error: ZodError, context: string): ValidationError[] {
    return error.errors.map((err) => ({
      field: `${context}.${err.path.join('.')}`,
      message: err.message,
      code: err.code,
      received: err.received,
      expected: this.getExpectedType(err),
    }));
  }

  /**
   * Get expected type from Zod error
   */
  private getExpectedType(error: any): string {
    switch (error.code) {
      case 'invalid_type':
        return error.expected;
      case 'invalid_string':
        return `string (${error.validation})`;
      case 'too_small':
        return `minimum ${error.minimum}`;
      case 'too_big':
        return `maximum ${error.maximum}`;
      case 'invalid_enum_value':
        return `one of: ${error.options.join(', ')}`;
      default:
        return 'valid value';
    }
  }

  /**
   * Get client key for rate limiting
   */
  private getClientKey(request: FastifyRequest): string {
    // Use IP address as primary identifier
    let key = request.ip || 'unknown';

    // Add user ID if authenticated
    if (request.user?.id) {
      key += `:${request.user.id}`;
    }

    return key;
  }

  /**
   * Check if client is rate limited due to validation failures
   */
  private isRateLimited(clientKey: string): boolean {
    const entry = this.validationFailures.get(clientKey);
    if (!entry) return false;

    const now = Date.now();
    if (now > entry.resetTime) {
      this.validationFailures.delete(clientKey);
      return false;
    }

    return entry.count >= this.config.maxValidationFailures;
  }

  /**
   * Track validation failure for rate limiting
   */
  private trackValidationFailure(clientKey: string): void {
    if (!this.config.enableRateLimitByValidationFailures) return;

    const now = Date.now();
    const windowMs = this.config.validationFailureWindow * 60 * 1000;

    let entry = this.validationFailures.get(clientKey);
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + windowMs,
      };
      this.validationFailures.set(clientKey, entry);
    }

    entry.count++;
  }

  /**
   * Handle rate limit exceeded due to validation failures
   */
  private async handleRateLimitExceeded(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const clientKey = this.getClientKey(request);
    const entry = this.validationFailures.get(clientKey);
    const resetTime = entry
      ? Math.ceil((entry.resetTime - Date.now()) / 1000)
      : 0;

    logger.warn('Validation failure rate limit exceeded', {
      correlationId: request.correlationId,
      clientKey,
      failureCount: entry?.count || 0,
      resetTime,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    reply.status(429).send({
      code: 'VALIDATION_RATE_LIMIT_EXCEEDED',
      error: 'Too Many Requests',
      message:
        'Too many validation failures. Please check your request format.',
      statusCode: 429,
      details: {
        resetTime: entry?.resetTime || Date.now(),
        retryAfter: resetTime,
        maxFailures: this.config.maxValidationFailures,
        windowMinutes: this.config.validationFailureWindow,
      },
    });
  }

  /**
   * Handle validation errors
   */
  private async handleValidationErrors(
    request: FastifyRequest,
    reply: FastifyReply,
    errors: ValidationError[]
  ): Promise<void> {
    // Call custom handler if provided
    this.config.onValidationFailure(request, reply, errors);

    // Check for potential security threats
    const securityThreats = this.detectSecurityThreats(errors, request);
    if (securityThreats.length > 0) {
      logger.error('Security threat detected in validation', {
        correlationId: request.correlationId,
        threats: securityThreats,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });
    }

    reply.status(400).send({
      code: 'VALIDATION_FAILED',
      error: 'Bad Request',
      message: 'Request validation failed',
      statusCode: 400,
      details: {
        errors: errors.map((err) => ({
          field: err.field,
          message: err.message,
          code: err.code,
          expected: err.expected,
        })),
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Detect potential security threats in validation errors
   */
  private detectSecurityThreats(
    errors: ValidationError[],
    request: FastifyRequest
  ): string[] {
    const threats: string[] = [];

    for (const error of errors) {
      const value = error.received;
      if (typeof value === 'string') {
        // Check for script injection attempts
        if (/<script|javascript:|data:text\/html/i.test(value)) {
          threats.push('Script injection attempt');
        }

        // Check for SQL injection patterns
        if (
          /(\bUNION\b|\bSELECT\b|\bINSERT\b|\bDELETE\b|\bDROP\b)/i.test(value)
        ) {
          threats.push('SQL injection attempt');
        }

        // Check for path traversal attempts
        if (/\.\.\/|\.\.\\/.test(value)) {
          threats.push('Path traversal attempt');
        }

        // Check for command injection
        if (/[;&|`$(){}[\]]/g.test(value)) {
          threats.push('Command injection attempt');
        }

        // Check for LDAP injection
        if (/[()&|!]/g.test(value) && /\*/.test(value)) {
          threats.push('LDAP injection attempt');
        }
      }
    }

    return threats;
  }

  /**
   * Clean up expired validation failure entries
   */
  private cleanupValidationFailures(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.validationFailures.entries()) {
      if (now > entry.resetTime) {
        this.validationFailures.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired validation failure entries', {
        cleanedCount,
        remainingCount: this.validationFailures.size,
      });
    }
  }

  /**
   * Get validation statistics
   */
  getStats(): {
    trackedClients: number;
    rateLimitedClients: number;
    averageFailures: number;
  } {
    const entries = Array.from(this.validationFailures.values());
    const rateLimitedClients = entries.filter(
      (entry) => entry.count >= this.config.maxValidationFailures
    ).length;
    const averageFailures =
      entries.length > 0
        ? entries.reduce((sum, entry) => sum + entry.count, 0) / entries.length
        : 0;

    return {
      trackedClients: entries.length,
      rateLimitedClients,
      averageFailures: Math.round(averageFailures * 100) / 100,
    };
  }
}

// Common validation schemas
export const commonSchemas = {
  // Email validation
  email: z.string().email().max(254).toLowerCase(),

  // Password validation
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain uppercase, lowercase, number, and special character'
    ),

  // UUID validation
  uuid: z.string().uuid(),

  // Pagination
  pagination: z.object({
    page: z.coerce.number().int().min(1).default(1),
    limit: z.coerce.number().int().min(1).max(100).default(20),
  }),

  // Search query
  search: z.object({
    q: z.string().min(1).max(100).optional(),
    sort: z.enum(['asc', 'desc']).default('desc'),
    sortBy: z.string().max(50).optional(),
  }),

  // Common headers
  authHeaders: z.object({
    authorization: z
      .string()
      .regex(/^Bearer .+/, 'Invalid authorization header format'),
    'x-correlation-id': z.string().uuid().optional(),
    'x-mfa-token': z.string().optional(),
  }),
};

// Export pre-configured validators
export const createAuthValidator = (bodySchema?: ZodSchema) =>
  RequestValidationMiddleware.createValidator({
    body: bodySchema,
    headers: commonSchemas.authHeaders.partial(),
  });

export const createApiValidator = (schemas: ValidationSchemas) =>
  RequestValidationMiddleware.createValidator(schemas, {
    enableSanitization: true,
    enableRateLimitByValidationFailures: true,
    maxValidationFailures: 5,
    validationFailureWindow: 10,
  });

export const createStrictValidator = (schemas: ValidationSchemas) =>
  RequestValidationMiddleware.createValidator(schemas, {
    enableSanitization: true,
    enableRateLimitByValidationFailures: true,
    maxValidationFailures: 3,
    validationFailureWindow: 5,
  });
