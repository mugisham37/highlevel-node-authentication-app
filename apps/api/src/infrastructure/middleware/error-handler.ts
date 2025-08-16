/**
 * Comprehensive Error Handler Middleware
 * Integrates all error handling components for consistent error responses
 */

import {
  FastifyInstance,
  FastifyRequest,
  FastifyReply,
  FastifyError,
} from 'fastify';
import { logger } from '../logging/winston-logger';
import {
  correlationIdManager,
} from '../tracing/correlation-id';
import {
  BaseError,
  InternalServerError,
  ValidationError,
  NotFoundError,
  isOperationalError,
} from '../../application/errors/base.errors';
import {
  getSafeCorrelationId,
  sanitizeHeaders,
} from '../utils/request-utils';
import { ENV, isDevelopment, isProduction } from '../utils/env-utils';
import { createErrorContext, safeGet } from '../utils/type-utils';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: string;
    correlationId?: string | undefined;
    requestId?: string | undefined;
    details?: any;
  };
  meta?: {
    version?: string | undefined;
    environment?: string | undefined;
    support?: string | undefined;
  };
}

export interface ErrorHandlerOptions {
  includeStackTrace: boolean;
  includeErrorDetails: boolean;
  logErrors: boolean;
  enableMetrics: boolean;
  supportContact?: string;
}

/**
 * Error Handler Middleware
 */
export class ErrorHandler {
  private readonly options: Required<ErrorHandlerOptions>;
  private readonly errorCounts = new Map<string, number>();
  private readonly errorRates = new Map<
    string,
    { count: number; timestamp: number }
  >();

  constructor(options: Partial<ErrorHandlerOptions> = {}) {
    this.options = {
      includeStackTrace: isDevelopment(),
      includeErrorDetails: !isProduction(),
      logErrors: true,
      enableMetrics: true,
      supportContact: ENV.SUPPORT_EMAIL,
      ...options,
    };
  }

  /**
   * Register error handler with Fastify
   */
  register(fastify: FastifyInstance): void {
    // Set error handler
    fastify.setErrorHandler(this.handleError.bind(this));

    // Set not found handler
    fastify.setNotFoundHandler(this.handleNotFound.bind(this));

    // Add error metrics endpoint if enabled
    if (this.options.enableMetrics) {
      this.registerMetricsEndpoint(fastify);
    }

    logger.info('Error handler middleware registered', {
      options: this.options,
    });
  }

  /**
   * Main error handling function
   */
  private async handleError(
    error: FastifyError | Error,
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const correlationId =
      correlationIdManager.getCorrelationId() ||
      getSafeCorrelationId(request.headers);

    const startTime = Date.now();

    try {
      // Determine if this is an operational error
      const isOperational = isOperationalError(error);

      // Convert to BaseError if needed
      const baseError = this.normalizeError(error, correlationId);

      // Log the error
      if (this.options.logErrors) {
        this.logError(baseError, request, isOperational);
      }

      // Update metrics
      if (this.options.enableMetrics) {
        this.updateErrorMetrics(baseError);
      }

      // Create error response
      const errorResponse = this.createErrorResponse(baseError, request);

      // Set response headers
      this.setErrorHeaders(reply, baseError, correlationId);

      // Send response
      reply.code(baseError.statusCode).send(errorResponse);

      // Log response time
      const responseTime = Date.now() - startTime;
      logger.debug('Error response sent', {
        correlationId,
        statusCode: baseError.statusCode,
        responseTime,
        errorCode: baseError.code,
      });
    } catch (handlerError) {
      // Error in error handler - this is bad
      logger.error('Error in error handler', {
        originalError: error.message,
        handlerError: (handlerError as Error).message,
        correlationId,
      });

      // Send minimal error response
      reply.code(500).send({
        error: {
          code: 'INTERNAL_SERVER_ERROR',
          message: 'An unexpected error occurred',
          timestamp: new Date().toISOString(),
          correlationId,
        },
      });
    }
  }

  /**
   * Handle 404 Not Found errors
   */
  private async handleNotFound(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const correlationId =
      correlationIdManager.getCorrelationId() ||
      getSafeCorrelationId(request.headers);

    // Use proper NotFoundError class
    const error = new NotFoundError(
      `Route ${request.method} ${request.url} not found`,
      'route',
      `${request.method} ${request.url}`,
      createErrorContext({ correlationId, operation: 'route_not_found' })
    );

    if (this.options.logErrors) {
      logger.warn('Route not found', {
        method: request.method,
        url: request.url,
        correlationId,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
    }

    const errorResponse = this.createErrorResponse(error, request);
    this.setErrorHeaders(reply, error, correlationId);

    reply.code(404).send(errorResponse);
  }

  /**
   * Normalize error to BaseError
   */
  private normalizeError(error: Error, correlationId?: string): BaseError {
    if (error instanceof BaseError) {
      return error;
    }

    // Handle Fastify validation errors
    if ((error as any).validation) {
      const validationDetails = (error as any).validation.reduce(
        (acc: any, err: any) => {
          const field = err.instancePath || err.dataPath || 'unknown';
          acc[field] = err.message;
          return acc;
        },
        {}
      );

      return new ValidationError(
        validationDetails,
        'Request validation failed',
        { correlationId, operation: 'validation' }
      );
    }

    // Handle other known error types
    if (error.name === 'ValidationError') {
      return new ValidationError({ validation: error.message }, error.message, {
        correlationId,
      });
    }

    // Default to internal server error
    return new InternalServerError(error.message, error, {
      correlationId,
      operation: 'unknown',
    });
  }

  /**
   * Log error with appropriate level
   */
  private logError(
    error: BaseError,
    request: FastifyRequest,
    isOperational: boolean
  ): void {
    const logLevel = this.getLogLevel(error, isOperational);
    const logData = {
      error: {
        name: error.name,
        code: error.code,
        message: error.message,
        statusCode: error.statusCode,
        isOperational,
        stack: this.options.includeStackTrace ? error.stack : undefined,
      },
      request: {
        method: request.method,
        url: request.url,
        headers: sanitizeHeaders(request.headers),
        query: request.query,
        params: request.params,
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      },
      context: error.context,
      correlationId: error.correlationId,
    };

    logger[logLevel]('Request error occurred', logData);
  }

  /**
   * Determine appropriate log level for error
   */
  private getLogLevel(
    error: BaseError,
    isOperational: boolean
  ): 'error' | 'warn' | 'info' {
    if (!isOperational || error.statusCode >= 500) {
      return 'error';
    }

    if (error.statusCode >= 400) {
      return 'warn';
    }

    return 'info';
  }

  /**
   * Create error response object
   */
  private createErrorResponse(
    error: BaseError,
    _request: FastifyRequest
  ): ErrorResponse {
    const response: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp.toISOString(),
        correlationId: error.correlationId || undefined,
        requestId: error.context.requestId || undefined,
      },
    };

    // Add error details in non-production environments
    if (this.options.includeErrorDetails && error.statusCode < 500) {
      const errorJson = error.toJSON();
      if (
        safeGet(errorJson, 'details') ||
        safeGet(errorJson, 'reason') ||
        safeGet(errorJson, 'requiredPermission')
      ) {
        response.error.details = {
          details: safeGet(errorJson, 'details'),
          reason: safeGet(errorJson, 'reason'),
          requiredPermission: safeGet(errorJson, 'requiredPermission'),
          userPermissions: safeGet(errorJson, 'userPermissions'),
          resource: safeGet(errorJson, 'resource'),
          resourceId: safeGet(errorJson, 'resourceId'),
        };
      }
    }

    // Add metadata
    response.meta = {
      version: ENV.APP_VERSION || undefined,
      environment: ENV.NODE_ENV,
      support: this.options.supportContact,
    };

    return response;
  }

  /**
   * Set error response headers
   */
  private setErrorHeaders(
    reply: FastifyReply,
    error: BaseError,
    correlationId?: string
  ): void {
    // Set correlation ID header
    if (correlationId) {
      reply.header('x-correlation-id', correlationId);
    }

    // Set retry-after header for rate limit errors
    if (error.code === 'RATE_LIMIT_EXCEEDED') {
      const retryAfter = (error as any).retryAfter || 60;
      reply.header('retry-after', retryAfter.toString());
    }

    // Set cache control for error responses
    reply.header('cache-control', 'no-cache, no-store, must-revalidate');

    // Set content type
    reply.header('content-type', 'application/json; charset=utf-8');
  }

  /**
   * Update error metrics
   */
  private updateErrorMetrics(error: BaseError): void {
    const errorKey = `${error.code}_${error.statusCode}`;

    // Update error counts
    const currentCount = this.errorCounts.get(errorKey) || 0;
    this.errorCounts.set(errorKey, currentCount + 1);

    // Update error rates (per minute)
    const now = Date.now();
    const rateKey = `${errorKey}_${Math.floor(now / 60000)}`;
    const currentRate = this.errorRates.get(rateKey) || {
      count: 0,
      timestamp: now,
    };
    this.errorRates.set(rateKey, {
      count: currentRate.count + 1,
      timestamp: now,
    });

    // Clean old rate data (keep only last 10 minutes)
    const tenMinutesAgo = now - 10 * 60 * 1000;
    for (const [key, rate] of this.errorRates.entries()) {
      if (rate.timestamp < tenMinutesAgo) {
        this.errorRates.delete(key);
      }
    }
  }

  /**
   * Register error metrics endpoint
   */
  private registerMetricsEndpoint(fastify: FastifyInstance): void {
    fastify.get(
      '/health/errors',
      {
        schema: {
          description: 'Error metrics and statistics',
          tags: ['health', 'errors'],
        },
      },
      async (_request: FastifyRequest, reply: FastifyReply) => {
        const correlationId = correlationIdManager.getCorrelationId();

        const errorStats = Array.from(this.errorCounts.entries()).map(
          ([key, count]) => {
            const parts = key.split('_');
            const code = parts[0] || 'UNKNOWN';
            const statusCode = parts[1] ? parseInt(parts[1], 10) : 500;
            return { code, statusCode, count };
          }
        );

        const recentErrors = Array.from(this.errorRates.entries())
          .filter(([_, rate]) => rate.timestamp > Date.now() - 5 * 60 * 1000)
          .map(([key, rate]) => {
            const parts = key.split('_');
            const code = parts[0] || 'UNKNOWN';
            const statusCode = parts[1] ? parseInt(parts[1], 10) : 500;
            return {
              code,
              statusCode,
              count: rate.count,
              timestamp: new Date(rate.timestamp),
            };
          });

        reply.code(200).send({
          timestamp: new Date(),
          errorCounts: errorStats,
          recentErrors,
          summary: {
            totalErrors: Array.from(this.errorCounts.values()).reduce(
              (sum, count) => sum + count,
              0
            ),
            uniqueErrorTypes: this.errorCounts.size,
            recentErrorCount: recentErrors.reduce(
              (sum, err) => sum + err.count,
              0
            ),
          },
          correlationId,
        });
      }
    );
  }

  /**
   * Get error statistics
   */
  getErrorStats(): {
    totalErrors: number;
    uniqueErrorTypes: number;
    errorCounts: Array<{ code: string; statusCode: number; count: number }>;
  } {
    const errorStats = Array.from(this.errorCounts.entries()).map(
      ([key, count]) => {
        const parts = key.split('_');
        const code = parts[0] || 'UNKNOWN';
        const statusCode = parts[1] ? parseInt(parts[1], 10) : 500;
        return { code, statusCode, count };
      }
    );

    return {
      totalErrors: Array.from(this.errorCounts.values()).reduce(
        (sum, count) => sum + count,
        0
      ),
      uniqueErrorTypes: this.errorCounts.size,
      errorCounts: errorStats,
    };
  }

  /**
   * Reset error metrics
   */
  resetMetrics(): void {
    this.errorCounts.clear();
    this.errorRates.clear();

    logger.info('Error metrics reset');
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();
