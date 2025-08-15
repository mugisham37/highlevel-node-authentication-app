/**
 * Correlation ID System for Request Tracing
 * Provides request correlation and distributed tracing capabilities
 */

import { AsyncLocalStorage } from 'async_hooks';
import { randomUUID } from 'crypto';
import { logger } from '../logging/winston-logger';

export interface CorrelationContext {
  correlationId: string;
  requestId?: string | undefined;
  userId?: string | undefined;
  sessionId?: string | undefined;
  operation?: string | undefined;
  startTime: number;
  metadata: Record<string, any>;
}

export interface TraceSpan {
  spanId: string;
  parentSpanId?: string | undefined;
  operation: string;
  startTime: number;
  endTime?: number | undefined;
  duration?: number | undefined;
  tags: Record<string, any>;
  logs: TraceLog[];
  status: 'success' | 'error' | 'pending';
  error?: Error | undefined;
}

export interface TraceLog {
  timestamp: number;
  level: 'debug' | 'info' | 'warn' | 'error';
  message: string;
  fields?: Record<string, any> | undefined;
}

/**
 * Correlation ID Manager using AsyncLocalStorage
 */
class CorrelationIdManager {
  private readonly asyncLocalStorage =
    new AsyncLocalStorage<CorrelationContext>();
  private readonly activeSpans = new Map<string, TraceSpan>();

  /**
   * Generate a new correlation ID
   */
  generateCorrelationId(): string {
    return randomUUID();
  }

  /**
   * Generate a new span ID
   */
  generateSpanId(): string {
    return randomUUID().replace(/-/g, '').substring(0, 16);
  }

  /**
   * Run code with correlation context
   */
  run<T>(context: Partial<CorrelationContext>, callback: () => T): T {
    const fullContext: CorrelationContext = {
      correlationId: context.correlationId || this.generateCorrelationId(),
      requestId: context.requestId || undefined,
      userId: context.userId || undefined,
      sessionId: context.sessionId || undefined,
      operation: context.operation || undefined,
      startTime: context.startTime || Date.now(),
      metadata: context.metadata || {},
    };

    logger.debug('Starting correlation context', {
      correlationId: fullContext.correlationId,
      requestId: fullContext.requestId,
      operation: fullContext.operation,
    });

    return this.asyncLocalStorage.run(fullContext, callback);
  }

  /**
   * Get current correlation context
   */
  getContext(): CorrelationContext | undefined {
    return this.asyncLocalStorage.getStore();
  }

  /**
   * Get current correlation ID
   */
  getCorrelationId(): string | undefined {
    const context = this.getContext();
    return context?.correlationId;
  }

  /**
   * Get current request ID
   */
  getRequestId(): string | undefined {
    const context = this.getContext();
    return context?.requestId;
  }

  /**
   * Get current user ID
   */
  getUserId(): string | undefined {
    const context = this.getContext();
    return context?.userId;
  }

  /**
   * Update context metadata
   */
  updateMetadata(metadata: Record<string, any>): void {
    const context = this.getContext();
    if (context) {
      Object.assign(context.metadata, metadata);
    }
  }

  /**
   * Set user ID in current context
   */
  setUserId(userId: string): void {
    const context = this.getContext();
    if (context) {
      context.userId = userId;
    }
  }

  /**
   * Set session ID in current context
   */
  setSessionId(sessionId: string): void {
    const context = this.getContext();
    if (context) {
      context.sessionId = sessionId;
    }
  }

  /**
   * Start a new trace span
   */
  startSpan(
    operation: string,
    tags: Record<string, any> = {},
    parentSpanId?: string
  ): TraceSpan {
    const spanId = this.generateSpanId();
    const correlationId = this.getCorrelationId();

    const span: TraceSpan = {
      spanId,
      parentSpanId: parentSpanId || undefined,
      operation,
      startTime: Date.now(),
      tags: { ...tags, correlationId },
      logs: [],
      status: 'pending',
    };

    this.activeSpans.set(spanId, span);

    logger.debug('Started trace span', {
      spanId,
      parentSpanId,
      operation,
      correlationId,
      tags,
    });

    return span;
  }

  /**
   * Finish a trace span
   */
  finishSpan(spanId: string, error?: Error): TraceSpan | undefined {
    const span = this.activeSpans.get(spanId);
    if (!span) {
      logger.warn('Attempted to finish non-existent span', { spanId });
      return undefined;
    }

    span.endTime = Date.now();
    span.duration = span.endTime - span.startTime;
    span.status = error ? 'error' : 'success';
    span.error = error || undefined;

    logger.debug('Finished trace span', {
      spanId: span.spanId,
      operation: span.operation,
      duration: span.duration,
      status: span.status,
      correlationId: this.getCorrelationId(),
      error: error?.message,
    });

    this.activeSpans.delete(spanId);
    return span;
  }

  /**
   * Add log to trace span
   */
  addSpanLog(
    spanId: string,
    level: TraceLog['level'],
    message: string,
    fields?: Record<string, any>
  ): void {
    const span = this.activeSpans.get(spanId);
    if (span) {
      span.logs.push({
        timestamp: Date.now(),
        level,
        message,
        fields: fields || undefined,
      });
    }
  }

  /**
   * Get active span by ID
   */
  getSpan(spanId: string): TraceSpan | undefined {
    return this.activeSpans.get(spanId);
  }

  /**
   * Get all active spans
   */
  getActiveSpans(): TraceSpan[] {
    return Array.from(this.activeSpans.values());
  }

  /**
   * Clear all active spans (useful for cleanup)
   */
  clearActiveSpans(): void {
    this.activeSpans.clear();
  }

  /**
   * Create child logger with correlation context
   */
  createLogger() {
    const context = this.getContext();
    if (!context) {
      return logger;
    }

    return logger.child({
      correlationId: context.correlationId,
      requestId: context.requestId,
      userId: context.userId,
      sessionId: context.sessionId,
      operation: context.operation,
    });
  }
}

// Global correlation ID manager instance
export const correlationIdManager = new CorrelationIdManager();

/**
 * Decorator for automatic span creation
 */
export function trace(operation?: string, tags: Record<string, any> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const operationName =
      operation || `${target.constructor.name}.${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const span = correlationIdManager.startSpan(operationName, tags);

      try {
        const result = await originalMethod.apply(this, args);
        correlationIdManager.finishSpan(span.spanId);
        return result;
      } catch (error) {
        correlationIdManager.finishSpan(span.spanId, error as Error);
        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Utility functions for correlation ID management
 */
export class CorrelationUtils {
  /**
   * Extract correlation ID from various sources
   */
  static extractCorrelationId(
    headers?: Record<string, string | string[]>,
    query?: Record<string, any>,
    body?: Record<string, any>
  ): string | undefined {
    // Check headers first (most common)
    if (headers) {
      const headerValue =
        headers['x-correlation-id'] ||
        headers['correlation-id'] ||
        headers['x-request-id'] ||
        headers['request-id'];

      if (headerValue) {
        return Array.isArray(headerValue) ? headerValue[0] : headerValue;
      }
    }

    // Check query parameters
    if (query?.['correlationId'] || query?.['requestId']) {
      return query['correlationId'] || query['requestId'];
    }

    // Check body
    if (body?.['correlationId'] || body?.['requestId']) {
      return body['correlationId'] || body['requestId'];
    }

    return undefined;
  }

  /**
   * Create correlation context from request
   */
  static createContextFromRequest(
    headers?: Record<string, string | string[]>,
    query?: Record<string, any>,
    body?: Record<string, any>,
    userId?: string,
    sessionId?: string
  ): Partial<CorrelationContext> {
    const correlationId =
      this.extractCorrelationId(headers, query, body) ||
      correlationIdManager.generateCorrelationId();

    const requestId =
      (headers?.['x-request-id'] as string) ||
      correlationIdManager.generateCorrelationId();

    const context: Partial<CorrelationContext> = {
      correlationId,
      requestId,
      userId: userId || undefined,
      sessionId: sessionId || undefined,
      startTime: Date.now(),
      metadata: {
        userAgent: headers?.['user-agent'],
        ip: headers?.['x-forwarded-for'] || headers?.['x-real-ip'],
        method: headers?.['x-http-method'],
        path: headers?.['x-original-uri'],
      },
    };

    return context;
  }

  /**
   * Get correlation headers for outgoing requests
   */
  static getCorrelationHeaders(): Record<string, string> {
    const correlationId = correlationIdManager.getCorrelationId();
    const requestId = correlationIdManager.getRequestId();

    const headers: Record<string, string> = {};

    if (correlationId) {
      headers['x-correlation-id'] = correlationId;
    }

    if (requestId) {
      headers['x-request-id'] = requestId;
    }

    return headers;
  }

  /**
   * Create error context with correlation information
   */
  static createErrorContext(): Record<string, any> {
    const context = correlationIdManager.getContext();
    if (!context) {
      return {};
    }

    return {
      correlationId: context.correlationId,
      requestId: context.requestId,
      userId: context.userId,
      sessionId: context.sessionId,
      operation: context.operation,
      requestDuration: Date.now() - context.startTime,
    };
  }

  /**
   * Log with correlation context
   */
  static log(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    meta?: Record<string, any>
  ): void {
    const contextLogger = correlationIdManager.createLogger();
    contextLogger[level](message, meta);
  }
}

/**
 * Middleware factory for Express/Fastify correlation ID handling
 */
export function createCorrelationMiddleware() {
  return (req: any, res: any, next: any) => {
    const context = CorrelationUtils.createContextFromRequest(
      req.headers,
      req.query,
      req.body,
      req.user?.id,
      req.session?.id
    );

    // Set correlation ID header in response
    if (context.correlationId) {
      res.setHeader('x-correlation-id', context.correlationId);
    }

    if (context.requestId) {
      res.setHeader('x-request-id', context.requestId);
    }

    // Run request in correlation context
    correlationIdManager.run(context, () => {
      next();
    });
  };
}
