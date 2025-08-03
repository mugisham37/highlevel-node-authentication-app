/**
 * Monitoring and Observability Module
 * Exports all monitoring components and provides initialization
 */

// Core monitoring components
export * from './prometheus-metrics';
export * from './structured-logger';
export * from './performance-tracker';
export * from './alerting-system';
export * from './system-status';
export * from './audit-trail';

// Re-export existing components
export * from '../health/health-check';
export * from '../tracing/correlation-id';

import { FastifyInstance } from 'fastify';
import { metricsManager } from './prometheus-metrics';
import { performanceTracker } from './performance-tracker';
import { alertingSystem } from './alerting-system';
import { auditTrailManager } from './audit-trail';
import { healthCheckManager } from '../health/health-check';
import { registerStatusEndpoints } from './system-status';
import { loggers } from './structured-logger';

/**
 * Monitoring System Manager
 */
export class MonitoringSystem {
  private static instance: MonitoringSystem;
  private initialized = false;

  private constructor() {}

  static getInstance(): MonitoringSystem {
    if (!MonitoringSystem.instance) {
      MonitoringSystem.instance = new MonitoringSystem();
    }
    return MonitoringSystem.instance;
  }

  /**
   * Initialize monitoring system
   */
  async initialize(fastify?: FastifyInstance): Promise<void> {
    if (this.initialized) {
      return;
    }

    loggers.monitoring.info('Initializing monitoring system...');

    try {
      // Start metrics collection
      metricsManager.startCollection(30000); // Every 30 seconds

      // Setup health checks
      await this.setupHealthChecks();

      // Register status endpoints if Fastify instance provided
      if (fastify) {
        registerStatusEndpoints(fastify);
        this.setupMiddleware(fastify);
      }

      // Setup event listeners
      this.setupEventListeners();

      this.initialized = true;
      loggers.monitoring.info('Monitoring system initialized successfully');
    } catch (error) {
      loggers.monitoring.error('Failed to initialize monitoring system', {
        error: (error as Error).message,
      });
      throw error;
    }
  }

  /**
   * Setup health checks
   */
  private async setupHealthChecks(): Promise<void> {
    // Database health check
    healthCheckManager.register(
      'database',
      async () => {
        // This would test actual database connectivity
        // For now, just simulate
        await new Promise((resolve) => setTimeout(resolve, 10));
      },
      {
        timeout: 5000,
        critical: true,
        tags: ['database', 'infrastructure'],
      }
    );

    // Redis health check
    healthCheckManager.register(
      'redis',
      async () => {
        // This would test actual Redis connectivity
        // For now, just simulate
        await new Promise((resolve) => setTimeout(resolve, 5));
      },
      {
        timeout: 3000,
        critical: false,
        tags: ['cache', 'redis'],
      }
    );

    // Memory health check
    healthCheckManager.register(
      'memory',
      async () => {
        const memUsage = process.memoryUsage();
        const memUsageMB = memUsage.heapUsed / 1024 / 1024;
        const maxMemoryMB = 1024; // 1GB limit

        if (memUsageMB > maxMemoryMB) {
          throw new Error(
            `Memory usage ${memUsageMB.toFixed(2)}MB exceeds limit ${maxMemoryMB}MB`
          );
        }
      },
      {
        timeout: 1000,
        critical: true,
        tags: ['system', 'memory'],
      }
    );

    // Start periodic health checking
    healthCheckManager.startPeriodicChecking(60000); // Every minute

    loggers.monitoring.info('Health checks configured', {
      totalChecks: healthCheckManager.getCheckNames().length,
    });
  }

  /**
   * Setup middleware for monitoring
   */
  private setupMiddleware(fastify: FastifyInstance): void {
    // Request/response monitoring middleware
    fastify.addHook('onRequest', async (request, reply) => {
      const startTime = Date.now();
      request.startTime = startTime;

      // Record request metrics
      metricsManager.recordHttpRequest(
        request.method,
        request.routerPath || request.url,
        0, // Status code not available yet
        0, // Duration not available yet
        request.headers['content-length']
          ? parseInt(request.headers['content-length'] as string)
          : undefined
      );
    });

    fastify.addHook('onResponse', async (request, reply) => {
      const duration = Date.now() - (request.startTime || Date.now());
      const responseSize = reply.getHeader('content-length') as number;

      // Update metrics with final values
      metricsManager.recordHttpRequest(
        request.method,
        request.routerPath || request.url,
        reply.statusCode,
        duration,
        request.headers['content-length']
          ? parseInt(request.headers['content-length'] as string)
          : undefined,
        responseSize
      );

      // Log HTTP request
      loggers.api.http(`${request.method} ${request.url}`, {
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode,
        responseTime: duration,
        userAgent: request.headers['user-agent'] as string,
        ipAddress: request.ip,
        requestSize: request.headers['content-length']
          ? parseInt(request.headers['content-length'] as string)
          : undefined,
        responseSize,
      });
    });

    // Error monitoring middleware
    fastify.setErrorHandler(async (error, request, reply) => {
      const duration = Date.now() - (request.startTime || Date.now());

      // Record error metrics
      metricsManager.recordHttpRequest(
        request.method,
        request.routerPath || request.url,
        reply.statusCode || 500,
        duration
      );

      // Log error
      loggers.api.error(`HTTP request error: ${error.message}`, {
        errorType: error.name,
        stackTrace: error.stack,
        method: request.method,
        url: request.url,
        statusCode: reply.statusCode || 500,
        duration,
        ipAddress: request.ip,
        userAgent: request.headers['user-agent'] as string,
      });

      // Record security event if it's a security-related error
      if (reply.statusCode === 401 || reply.statusCode === 403) {
        alertingSystem.recordSecurityEvent(
          'unauthorized_access',
          'medium',
          'api',
          {
            method: request.method,
            url: request.url,
            statusCode: reply.statusCode,
            error: error.message,
          },
          0.6, // Medium risk score
          undefined, // userId not available in error handler
          undefined, // sessionId not available
          request.ip,
          request.headers['user-agent'] as string
        );
      }

      // Send error response
      reply.status(reply.statusCode || 500).send({
        error: 'Internal Server Error',
        message:
          process.env.NODE_ENV === 'development'
            ? error.message
            : 'An error occurred',
        statusCode: reply.statusCode || 500,
        timestamp: new Date().toISOString(),
      });
    });

    loggers.monitoring.info('Monitoring middleware configured');
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen to performance alerts
    performanceTracker.on('performance_alert', (alert) => {
      loggers.monitoring.warn('Performance alert triggered', {
        operation: alert.operation,
        component: alert.component,
        duration: alert.actualDuration,
        threshold: alert.threshold,
        severity: alert.severity,
      });
    });

    // Listen to security alerts
    alertingSystem.on('alert_created', (alert) => {
      loggers.security.warn('Security alert created', {
        alertId: alert.id,
        type: alert.type,
        severity: alert.severity,
        title: alert.title,
        source: alert.source,
      });
    });

    // Listen to system events
    process.on('uncaughtException', (error) => {
      loggers.system.error('Uncaught exception', {
        errorType: error.name,
        stackTrace: error.stack,
        impact: 'critical',
      });

      // Record critical system alert
      alertingSystem.recordSecurityEvent(
        'anomalous_behavior',
        'critical',
        'system',
        {
          type: 'uncaught_exception',
          error: error.message,
          stack: error.stack,
        },
        1.0 // Maximum risk score
      );
    });

    process.on('unhandledRejection', (reason, promise) => {
      loggers.system.error('Unhandled promise rejection', {
        reason: String(reason),
        promise: String(promise),
        impact: 'high',
      });

      // Record high-severity system alert
      alertingSystem.recordSecurityEvent(
        'anomalous_behavior',
        'high',
        'system',
        {
          type: 'unhandled_rejection',
          reason: String(reason),
        },
        0.8 // High risk score
      );
    });

    loggers.monitoring.info('Event listeners configured');
  }

  /**
   * Record authentication event
   */
  recordAuthEvent(
    userId: string,
    action: string,
    outcome: 'success' | 'failure',
    details: Record<string, any> = {},
    ipAddress?: string,
    userAgent?: string
  ): void {
    // Record audit event
    auditTrailManager.recordEvent({
      actor: {
        type: 'user',
        id: userId,
      },
      action,
      resource: {
        type: 'authentication',
        id: userId,
      },
      outcome: {
        result: outcome,
        reason: details.reason,
        errorCode: details.errorCode,
        riskScore: details.riskScore,
      },
      metadata: details,
      ipAddress,
      userAgent,
    });

    // Record metrics
    metricsManager.recordAuthAttempt(
      action,
      details.provider || 'internal',
      outcome,
      userAgent
    );

    // Log authentication event
    loggers.auth.auth(`Authentication ${action}: ${outcome}`, {
      authMethod: action,
      provider: details.provider,
      outcome,
      failureReason: details.reason,
      ipAddress,
      userAgent,
      riskScore: details.riskScore,
      userId,
    });
  }

  /**
   * Record business event
   */
  recordBusinessEvent(
    eventType: string,
    entityType: string,
    entityId: string,
    details: Record<string, any> = {},
    userId?: string
  ): void {
    // Record audit event
    auditTrailManager.recordEvent({
      actor: {
        type: userId ? 'user' : 'system',
        id: userId || 'system',
      },
      action: eventType,
      resource: {
        type: entityType,
        id: entityId,
      },
      outcome: {
        result: 'success',
      },
      metadata: details,
    });

    // Log business event
    loggers.business.business(`Business event: ${eventType}`, {
      eventType,
      entityType,
      entityId,
      businessImpact: details.impact || 'low',
      metrics: details.metrics,
      userId,
    });
  }

  /**
   * Get monitoring status
   */
  getStatus(): {
    initialized: boolean;
    components: {
      metrics: boolean;
      performance: boolean;
      alerting: boolean;
      audit: boolean;
      health: boolean;
    };
  } {
    return {
      initialized: this.initialized,
      components: {
        metrics: true, // metricsManager is always available
        performance: true, // performanceTracker is always available
        alerting: true, // alertingSystem is always available
        audit: true, // auditTrailManager is always available
        health: healthCheckManager.isPeriodicCheckingEnabled(),
      },
    };
  }

  /**
   * Shutdown monitoring system
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    loggers.monitoring.info('Shutting down monitoring system...');

    try {
      // Stop metrics collection
      metricsManager.stopCollection();

      // Stop health checking
      healthCheckManager.stopPeriodicChecking();

      // Shutdown performance tracker
      performanceTracker.shutdown();

      // Shutdown alerting system
      alertingSystem.shutdown();

      // Shutdown audit trail manager
      auditTrailManager.shutdown();

      // Flush logs
      await Promise.all([
        loggers.monitoring.flush(),
        loggers.security.flush(),
        loggers.audit.flush(),
        loggers.performance.flush(),
      ]);

      this.initialized = false;
      loggers.monitoring.info('Monitoring system shutdown complete');
    } catch (error) {
      loggers.monitoring.error('Error during monitoring system shutdown', {
        error: (error as Error).message,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const monitoringSystem = MonitoringSystem.getInstance();
