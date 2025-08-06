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
  AuditLogContext 
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
 * Structured Logger Class
 */
export class StructuredLogger {
  private logger: winston.Logger;
  private defaultContext: LogContext;

  constructor(
    component: string,
    service: string = 'auth-backend',
    defaultContext: Partial<LogContext> = {}
  ) {
    this.defaultContext = {
      component,
      service,
      version: ENV.APP_VERSION,
      environment: process.env.NODE_ENV || 'development',
      ...defaultContext,
    };

    this.logger = this.createLogger();
  }

  /**
   * Create Winston logger instance
   */
  private createLogger(): winston.Logger {
    const formats = [
      winston.format.timestamp({
        format: 'YYYY-MM-DD HH:mm:ss.SSS',
      }),
      winston.format.errors({ stack: true }),
      winston.format.json(),
    ];

    // Add custom format for structured logging
    formats.push(
      winston.format.printf((info) => {
        const { timestamp, level, message, ...meta } = info;

        // Merge with correlation context
        const correlationContext = correlationIdManager.getContext();
        const enrichedMeta = {
          ...this.defaultContext,
          ...meta,
          correlationId:
            correlationContext?.correlationId || safeGetProperty(meta, 'correlationId'),
          requestId: correlationContext?.requestId || safeGetProperty(meta, 'requestId'),
          userId: correlationContext?.userId || safeGetProperty(meta, 'userId'),
          sessionId: correlationContext?.sessionId || safeGetProperty(meta, 'sessionId'),
          operation: correlationContext?.operation || safeGetProperty(meta, 'operation'),
          timestamp,
          level: level.toUpperCase(),
        };

        return JSON.stringify({
          message,
          ...enrichedMeta,
        });
      })
    );

    const transports: winston.transport[] = [];

    // Console transport for development
    if (config.isDevelopment || config.isTest) {
      transports.push(
        new winston.transports.Console({
          format: winston.format.combine(
            winston.format.colorize(),
            winston.format.simple(),
            winston.format.printf((info) => {
              const correlationId = correlationIdManager.getCorrelationId();
              const prefix = correlationId
                ? `[${correlationId.substring(0, 8)}]`
                : '';
              return `${safeGetProperty(info, 'timestamp')} ${prefix} ${info.level}: ${info.message}`;
            })
          ),
          level: config.logging.level,
        })
      );
    }

    // File transports for production
    if (!config.isTest) {
      // General application logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/app.log',
          format: winston.format.combine(...formats),
          level: 'info',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
          tailable: true,
        })
      );

      // Error logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/error.log',
          format: winston.format.combine(...formats),
          level: 'error',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 10,
          tailable: true,
        })
      );

      // Security logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/security.log',
          format: winston.format.combine(...formats),
          level: 'info',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 20,
          tailable: true,
        })
      );

      // Audit logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/audit.log',
          format: winston.format.combine(...formats),
          level: 'info',
          maxsize: 100 * 1024 * 1024, // 100MB
          maxFiles: 50, // Keep more audit logs
          tailable: true,
        })
      );

      // Performance logs
      transports.push(
        new winston.transports.File({
          filename: 'logs/performance.log',
          format: winston.format.combine(...formats),
          level: 'info',
          maxsize: 50 * 1024 * 1024, // 50MB
          maxFiles: 15,
          tailable: true,
        })
      );
    }

    return winston.createLogger({
      level: config.logging.level,
      format: winston.format.combine(...formats),
      transports,
      exitOnError: false,
    });
  }

  /**
   * Log with additional context
   */
  private logWithContext(
    level: keyof winston.Logger,
    message: string,
    context: LogContext = {}
  ): void {
    const enrichedContext = {
      ...this.defaultContext,
      ...context,
      timestamp: new Date().toISOString(),
    };

    (this.logger[level] as any)(message, enrichedContext);
  }

  /**
   * Debug logging
   */
  debug(message: string, context: LogContext = {}): void {
    this.logWithContext('debug', message, context);
  }

  /**
   * Info logging
   */
  info(message: string, context: LogContext = {}): void {
    this.logWithContext('info', message, context);
  }

  /**
   * Warning logging
   */
  warn(message: string, context: LogContext = {}): void {
    this.logWithContext('warn', message, context);
  }

  /**
   * Error logging
   */
  error(message: string, context: ErrorLogContext): void {
    this.logWithContext('error', message, context);
  }

  /**
   * Security event logging
   */
  security(message: string, context: SecurityLogContext): void {
    const securityContext = {
      ...context,
      logType: 'security',
      component: this.defaultContext.component,
      service: this.defaultContext.service,
    };

    this.logger.info(message, securityContext);
  }

  /**
   * Performance logging
   */
  performance(message: string, context: PerformanceLogContext): void {
    const performanceContext = {
      ...context,
      logType: 'performance',
      component: this.defaultContext.component,
      service: this.defaultContext.service,
    };

    this.logger.info(message, performanceContext);
  }

  /**
   * Audit logging
   */
  audit(message: string, context: AuditLogContext): void {
    const auditContext = {
      ...context,
      logType: 'audit',
      component: this.defaultContext.component,
      service: this.defaultContext.service,
      immutable: true, // Mark as immutable for tamper protection
      hash: this.generateLogHash(message, context), // Add integrity hash
    };

    this.logger.info(message, auditContext);
  }

  /**
   * HTTP request logging
   */
  http(
    message: string,
    context: LogContext & {
      method: string;
      url: string;
      statusCode: number;
      responseTime: number;
      userAgent?: string;
      ipAddress?: string;
      requestSize?: number;
      responseSize?: number;
    }
  ): void {
    const httpContext = {
      ...context,
      logType: 'http',
      component: this.defaultContext.component,
      service: this.defaultContext.service,
    };

    this.logger.http(message, httpContext);
  }

  /**
   * Authentication event logging
   */
  auth(
    message: string,
    context: LogContext & {
      authMethod: string;
      provider?: string;
      outcome: 'success' | 'failure' | 'mfa_required';
      failureReason?: string;
      ipAddress?: string;
      userAgent?: string;
      riskScore?: number;
    }
  ): void {
    const authContext = {
      ...context,
      logType: 'authentication',
      component: this.defaultContext.component,
      service: this.defaultContext.service,
    };

    this.logger.info(message, authContext);
  }

  /**
   * Business event logging
   */
  business(
    message: string,
    context: LogContext & {
      eventType: string;
      entityType: string;
      entityId?: string;
      businessImpact?: 'low' | 'medium' | 'high';
      metrics?: Record<string, number>;
    }
  ): void {
    const businessContext = {
      ...context,
      logType: 'business',
      component: this.defaultContext.component,
      service: this.defaultContext.service,
    };

    this.logger.info(message, businessContext);
  }

  /**
   * Generate hash for log integrity
   */
  private generateLogHash(message: string, context: any): string {
    const crypto = require('crypto');
    const data = JSON.stringify({ message, context, timestamp: Date.now() });
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Create child logger with additional context
   */
  child(additionalContext: Partial<LogContext>): StructuredLogger {
    const childLogger = new StructuredLogger(
      this.defaultContext.component || 'unknown',
      this.defaultContext.service || 'auth-backend',
      {
        ...this.defaultContext,
        ...additionalContext,
      }
    );

    return childLogger;
  }

  /**
   * Measure and log operation duration
   */
  async measureOperation<T>(
    operationName: string,
    operation: () => Promise<T>,
    context: LogContext = {}
  ): Promise<T> {
    const startTime = Date.now();
    const span = correlationIdManager.startSpan(operationName);

    try {
      this.debug(`Starting operation: ${operationName}`, {
        ...context,
        operation: operationName,
        spanId: span.spanId,
      });

      const result = await operation();
      const duration = Date.now() - startTime;

      this.performance(`Operation completed: ${operationName}`, {
        ...context,
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
        errorType: (error as Error).name,
        stackTrace: (error as Error).stack,
        duration,
        spanId: span.spanId,
      });

      correlationIdManager.finishSpan(span.spanId, error as Error);
      throw error;
    }
  }

  /**
   * Log with sampling (useful for high-frequency events)
   */
  sample(
    level: 'debug' | 'info' | 'warn' | 'error',
    message: string,
    context: LogContext = {},
    sampleRate: number = 0.1
  ): void {
    if (Math.random() < sampleRate) {
      this[level](message, context);
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
    service: string = 'auth-backend',
    defaultContext: Partial<LogContext> = {}
  ): StructuredLogger {
    const key = `${service}:${component}`;

    if (!this.loggers.has(key)) {
      this.loggers.set(
        key,
        new StructuredLogger(component, service, defaultContext)
      );
    }

    return this.loggers.get(key)!;
  }

  /**
   * Clear all cached loggers
   */
  static clearLoggers(): void {
    this.loggers.clear();
  }

  /**
   * Get all active loggers
   */
  static getActiveLoggers(): Map<string, StructuredLogger> {
    return new Map(this.loggers);
  }
}

/**
 * Pre-configured loggers for common components
 */
export const loggers = {
  auth: LoggerFactory.getLogger('authentication'),
  api: LoggerFactory.getLogger('api'),
  database: LoggerFactory.getLogger('database'),
  cache: LoggerFactory.getLogger('cache'),
  security: LoggerFactory.getLogger('security'),
  monitoring: LoggerFactory.getLogger('monitoring'),
  websocket: LoggerFactory.getLogger('websocket'),
  oauth: LoggerFactory.getLogger('oauth'),
  mfa: LoggerFactory.getLogger('mfa'),
  session: LoggerFactory.getLogger('session'),
  audit: LoggerFactory.getLogger('audit'),
  performance: LoggerFactory.getLogger('performance'),
  business: LoggerFactory.getLogger('business'),
  system: LoggerFactory.getLogger('system'),
};

// Export default logger for backward compatibility
export const structuredLogger = LoggerFactory.getLogger('default');
