/**
 * Structured Logging System with Correlation IDs and Context
 * Provides comprehensive logging with correlation tracking and structured data
 */

import winston from 'winston';
import { correlationIdManager } from '../tracing/correlation-id';
import { config } from '../config/environment';
import { 
  LogContext, 
  ErrorLogContext, 
  PerformanceLogContext, 
  SecurityLogContext, 
  AuditLogContext,
  BusinessLogContext,
  AuthLogContext
} from '../utils/monitoring-types';
import { ENV } from '../utils/env-utils';
import { safeGetProperty } from '../utils/monitoring-utils';

/**
 * Log Levels with Numeric Values
 */
export enum LogLevel {
  ERROR = 0,
  WARN = 1,
  INFO = 2,
  HTTP = 3,
  VERBOSE = 4,
  DEBUG = 5,
  SILLY = 6,
}

/**
 * Log Transport Configuration
 */
interface TransportConfig {
  level: string;
  filename?: string;
  maxsize?: number;
  maxFiles?: number;
  format?: winston.Logform.Format;
}

/**
 * Enhanced Structured Logger with Correlation IDs and Typed Contexts
 */
export class StructuredLogger {
  private logger: winston.Logger;
  private component: string;
  private defaultContext: LogContext;

  constructor(component: string, defaultContext: LogContext = {}) {
    this.component = component;
    this.defaultContext = {
      component,
      service: config.SERVICE_NAME || 'auth-backend',
      version: config.APP_VERSION || '1.0.0',
      environment: config.NODE_ENV || 'development',
      ...defaultContext,
    };

    this.logger = this.createLogger();
  }

  /**
   * Create Winston logger with custom configuration
   */
  private createLogger(): winston.Logger {
    const transports = this.createTransports();
    const level = this.getLogLevel();

    return winston.createLogger({
      level,
      format: winston.format.combine(
        winston.format.timestamp({
          format: 'YYYY-MM-DD HH:mm:ss.SSS',
        }),
        winston.format.errors({ stack: true }),
        winston.format.json(),
        winston.format.printf(this.formatLogEntry.bind(this))
      ),
      transports,
      exitOnError: false,
      // Handle promise rejections
      rejectionHandlers: [
        new winston.transports.File({
          filename: 'logs/rejections.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
      // Handle uncaught exceptions
      exceptionHandlers: [
        new winston.transports.File({
          filename: 'logs/exceptions.log',
          maxsize: 5242880, // 5MB
          maxFiles: 5,
        }),
      ],
    });
  }

  /**
   * Create transport configurations
   */
  private createTransports(): winston.transport[] {
    const transports: winston.transport[] = [];

    // Console transport (always present in development)
    if (config.NODE_ENV === 'development' || config.NODE_ENV === 'test') {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf(this.formatConsoleEntry.bind(this))
          ),
        })
      );
    }

    // File transports (production and staging)
    if (config.NODE_ENV === 'production' || config.NODE_ENV === 'staging') {
      // Application logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/app.log',
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        })
      );

      // Error logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          level: 'error',
          maxsize: 10485760, // 10MB
          maxFiles: 10,
        })
      );
    }

    return transports;
  }

  /**
   * Get log level based on environment
   */
  private getLogLevel(): string {
    if (config.LOG_LEVEL) {
      return config.LOG_LEVEL;
    }

    switch (config.NODE_ENV) {
      case 'production':
        return 'info';
      case 'staging':
        return 'debug';
      case 'test':
        return 'warn';
      default:
        return 'debug';
    }
  }

  /**
   * Format log entry for JSON output
   */
  private formatLogEntry(info: winston.Logform.TransformableInfo): string {
    const { timestamp, level, message, ...meta } = info;

    return JSON.stringify({
      timestamp,
      level,
      message,
      component: this.component,
      correlationId: correlationIdManager.getCorrelationId(),
      ...this.defaultContext,
      ...meta,
    });
  }

  /**
   * Format log entry for console output
   */
  private formatConsoleEntry(info: winston.Logform.TransformableInfo): string {
    const { timestamp, level, message, ...meta } = info;
    const correlationId = correlationIdManager.getCorrelationId();
    
    let formatted = `${timestamp} [${level}] [${this.component}]`;
    
    if (correlationId) {
      formatted += ` [${correlationId}]`;
    }
    
    formatted += `: ${message}`;

    // Add meta information if present
    if (Object.keys(meta).length > 0) {
      formatted += `\n  Meta: ${JSON.stringify(meta, null, 2)}`;
    }

    return formatted;
  }

  /**
   * Build log context with correlation ID and default context
   */
  private buildContext<T extends LogContext>(context: T): T {
    return {
      ...this.defaultContext,
      correlationId: correlationIdManager.getCorrelationId(),
      ...context,
    } as T;
  }

  /**
   * Debug logging
   */
  debug(message: string, context: LogContext = {}): void {
    this.logger.debug(message, this.buildContext(context));
  }

  /**
   * Info logging
   */
  info(message: string, context: LogContext = {}): void {
    this.logger.info(message, this.buildContext(context));
  }

  /**
   * Warning logging
   */
  warn(message: string, context: LogContext = {}): void {
    this.logger.warn(message, this.buildContext(context));
  }

  /**
   * Error logging with enhanced context
   */
  error(message: string, context: ErrorLogContext): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      stackTrace: context.stackTrace || new Error().stack,
    };

    this.logger.error(message, enhancedContext);
  }

  /**
   * Performance logging
   */
  performance(message: string, context: PerformanceLogContext): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'performance',
    };

    this.logger.info(message, enhancedContext);
  }

  /**
   * Security event logging
   */
  security(message: string, context: SecurityLogContext): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'security',
    };

    // Security events are always logged as warnings or higher
    if (context.severity === 'critical' || context.severity === 'high') {
      this.logger.error(message, enhancedContext);
    } else {
      this.logger.warn(message, enhancedContext);
    }
  }

  /**
   * Audit logging for compliance
   */
  audit(message: string, context: AuditLogContext): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'audit',
    };

    this.logger.info(message, enhancedContext);
  }

  /**
   * Business event logging
   */
  business(message: string, context: BusinessLogContext): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'business',
    };

    this.logger.info(message, enhancedContext);
  }

  /**
   * Authentication event logging
   */
  auth(message: string, context: AuthLogContext): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'authentication',
    };

    if (context.outcome === 'failure') {
      this.logger.warn(message, enhancedContext);
    } else {
      this.logger.info(message, enhancedContext);
    }
  }

  /**
   * HTTP request/response logging
   */
  http(message: string, context: LogContext & {
    method?: string;
    url?: string;
    statusCode?: number;
    responseTime?: number;
    userAgent?: string;
    ipAddress?: string;
  }): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'http',
    };

    this.logger.http(message, enhancedContext);
  }

  /**
   * Metric logging for monitoring systems
   */
  metric(message: string, context: LogContext & {
    metricName: string;
    metricValue: number;
    metricType: 'counter' | 'gauge' | 'histogram' | 'summary';
    tags?: Record<string, string>;
  }): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'metric',
    };

    this.logger.info(message, enhancedContext);
  }

  /**
   * Database operation logging
   */
  database(message: string, context: LogContext & {
    operation: string;
    table?: string;
    query?: string;
    duration?: number;
    affectedRows?: number;
  }): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'database',
    };

    this.logger.debug(message, enhancedContext);
  }

  /**
   * External service call logging
   */
  external(message: string, context: LogContext & {
    service: string;
    endpoint?: string;
    method?: string;
    statusCode?: number;
    duration?: number;
  }): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'external',
    };

    this.logger.info(message, enhancedContext);
  }

  /**
   * Cache operation logging
   */
  cache(message: string, context: LogContext & {
    operation: 'hit' | 'miss' | 'set' | 'delete' | 'clear';
    key?: string;
    ttl?: number;
    size?: number;
  }): void {
    const enhancedContext = {
      ...this.buildContext(context),
      timestamp: new Date().toISOString(),
      logType: 'cache',
    };

    this.logger.debug(message, enhancedContext);
  }

  /**
   * Timing wrapper for operations
   */
  async time<T>(
    operationName: string,
    operation: () => Promise<T>,
    context: LogContext = {}
  ): Promise<T> {
    const startTime = Date.now();
    const span = correlationIdManager.startSpan(operationName);

    this.debug(`Operation started: ${operationName}`, {
      ...context,
      operationType: operationName,
      spanId: span.spanId,
    });

    try {
      const result = await operation();
      const duration = Date.now() - startTime;

      this.performance(`Operation completed: ${operationName}`, {
        ...context,
        operation: operationName,
        operationType: operationName,
        duration,
        spanId: span.spanId,
      });

      correlationIdManager.finishSpan(span.spanId);
      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.error(`Operation failed: ${operationName}`, {
        ...context,
        errorType: 'OPERATION_FAILURE',
        operation: operationName,
        operationType: operationName,
        duration,
        spanId: span.spanId,
        error: (error as Error).message,
        stackTrace: (error as Error).stack,
      });

      correlationIdManager.finishSpan(span.spanId);
      throw error;
    }
  }

  /**
   * Sample logging with reduced frequency
   */
  sample(
    level: 'debug' | 'info' | 'warn',
    message: string,
    context: LogContext = {},
    sampleRate: number = 0.1
  ): void {
    if (Math.random() < sampleRate) {
      this[level](message, context);
    }
  }

  /**
   * Sample error logging with reduced frequency
   */
  sampleError(
    message: string,
    context: ErrorLogContext,
    sampleRate: number = 0.1
  ): void {
    if (Math.random() < sampleRate) {
      this.error(message, context);
    }
  }

  /**
   * Flush logs (useful for graceful shutdown)
   */
  async flush(): Promise<void> {
    return new Promise((resolve) => {
      this.logger.on('finish', resolve);
      this.logger.end();
    });
  }
}

/**
 * Logger Factory
 */
export class LoggerFactory {
  private static loggers = new Map<string, StructuredLogger>();

  /**
   * Get or create logger for component
   */
  static getLogger(
    component: string,
    defaultContext: LogContext = {}
  ): StructuredLogger {
    const key = `${component}:${JSON.stringify(defaultContext)}`;
    
    if (!this.loggers.has(key)) {
      this.loggers.set(key, new StructuredLogger(component, defaultContext));
    }

    return this.loggers.get(key)!;
  }

  /**
   * Create new logger instance (bypasses caching)
   */
  static createLogger(
    component: string,
    defaultContext: LogContext = {}
  ): StructuredLogger {
    return new StructuredLogger(component, defaultContext);
  }

  /**
   * Clear all cached loggers
   */
  static clearCache(): void {
    this.loggers.clear();
  }
}

/**
 * Pre-configured loggers for common components
 */
export const loggers = {
  // Core application loggers
  app: LoggerFactory.getLogger('app'),
  auth: LoggerFactory.getLogger('auth'),
  database: LoggerFactory.getLogger('database'),
  cache: LoggerFactory.getLogger('cache'),
  
  // Infrastructure loggers
  server: LoggerFactory.getLogger('server'),
  middleware: LoggerFactory.getLogger('middleware'),
  validation: LoggerFactory.getLogger('validation'),
  
  // Monitoring and observability
  monitoring: LoggerFactory.getLogger('monitoring'),
  metrics: LoggerFactory.getLogger('metrics'),
  health: LoggerFactory.getLogger('health'),
  tracing: LoggerFactory.getLogger('tracing'),
  
  // Security and compliance
  security: LoggerFactory.getLogger('security'),
  audit: LoggerFactory.getLogger('audit'),
  
  // External integrations
  external: LoggerFactory.getLogger('external'),
  webhooks: LoggerFactory.getLogger('webhooks'),
  
  // Background processes
  jobs: LoggerFactory.getLogger('jobs'),
  scheduler: LoggerFactory.getLogger('scheduler'),
};

/**
 * Global logger instance (default)
 */
export const logger = LoggerFactory.getLogger('default');

/**
 * Create correlation-aware logger
 */
export function createCorrelatedLogger(
  component: string,
  baseContext: LogContext = {}
): StructuredLogger {
  const correlationId = correlationIdManager.getCorrelationId();
  const context = correlationId 
    ? { ...baseContext, correlationId }
    : baseContext;
    
  return LoggerFactory.createLogger(component, context);
}

/**
 * Request-scoped logger creator
 */
export function createRequestLogger(
  component: string,
  requestContext: {
    requestId?: string;
    userId?: string;
    sessionId?: string;
    method?: string;
    url?: string;
    userAgent?: string;
    ipAddress?: string;
  } = {}
): StructuredLogger {
  return LoggerFactory.createLogger(component, requestContext);
}
