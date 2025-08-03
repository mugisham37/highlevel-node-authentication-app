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
  CorrelationUtils,
} from '../tracing/correlation-id';
import {
  BaseError,
  InternalServerError,
  ValidationError,
  isOperationalError,
  getCorrelationId,
} from '../../application/errors/base.errors';

export interface ErrorResponse {
  error: {
    code: string;
    message: string;
    timestamp: string;
    correlationId?: string;
    requestId?: string;
    details?: any;
  };
  meta?: {
    version?: string;
    environment?: string;
    support?: string;
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
      includeStackTrace: process.env.NODE_ENV === 'development',
      includeErrorDetails: process.env.NODE_ENV !== 'production',
      logErrors: true,
      enableMetrics: true,
      supportContact: process.env.SUPPORT_EMAIL || 'support@example.com',
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
      CorrelationUtils.extractCorrelationId(request.headers);

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
      CorrelationUtils.extractCorrelationId(request.headers);

    const error = new BaseError(
      `Route ${request.method} ${request.url} not found`,
      { correlationId, operation: 'route_not_found' }
    );
    error.code = 'NOT_FOUND';
    error.statusCode = 404;

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
        headers: this.sanitizeHeaders(request.headers),
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
    request: FastifyRequest
  ): ErrorResponse {
    const response: ErrorResponse = {
      error: {
        code: error.code,
        message: error.message,
        timestamp: error.timestamp.toISOString(),
        correlationId: error.correlationId,
        requestId: error.context.requestId,
      },
    };

    // Add error details in non-production environments
    if (this.options.includeErrorDetails && error.statusCode < 500) {
      const errorJson = error.toJSON();
      if (
        errorJson.details ||
        errorJson.reason ||
        errorJson.requiredPermission
      ) {
        response.error.details = {
          details: errorJson.details,
          reason: errorJson.reason,
          requiredPermission: errorJson.requiredPermission,
          userPermissions: errorJson.userPermissions,
          resource: errorJson.resource,
          resourceId: errorJson.resourceId,
        };
      }
    }

    // Add metadata
    response.meta = {
      version: process.env.APP_VERSION,
      environment: process.env.NODE_ENV,
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
   * Sanitize headers for logging (remove sensitive data)
   */
  private sanitizeHeaders(headers: Record<string, any>): Record<string, any> {
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'x-access-token',
    ];

    const sanitized = { ...headers };

    for (const header of sensitiveHeaders) {
      if (sanitized[header]) {
        sanitized[header] = '[REDACTED]';
      }
    }

    return sanitized;
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
      async (request: FastifyRequest, reply: FastifyReply) => {
        const correlationId = correlationIdManager.getCorrelationId();

        const errorStats = Array.from(this.errorCounts.entries()).map(
          ([key, count]) => {
            const [code, statusCode] = key.split('_');
            return { code, statusCode: parseInt(statusCode), count };
          }
        );

        const recentErrors = Array.from(this.errorRates.entries())
          .filter(([_, rate]) => rate.timestamp > Date.now() - 5 * 60 * 1000)
          .map(([key, rate]) => {
            const [code, statusCode] = key.split('_');
            return {
              code,
              statusCode: parseInt(statusCode),
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
        const [code, statusCode] = key.split('_');
        return { code, statusCode: parseInt(statusCode), count };
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
