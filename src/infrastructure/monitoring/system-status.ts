/**
 * System Status and Health Check Endpoints
 * Provides comprehensive system status monitoring and health endpoints
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { healthCheckManager, SystemHealthStatus } from '../health/health-check';
import { metricsManager } from './prometheus-metrics';
import { performanceTracker } from './performance-tracker';
import { alertingSystem } from './alerting-system';
import { loggers } from './structured-logger';
import { correlationIdManager } from '../tracing/correlation-id';

export interface SystemStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version: string;
  environment: string;
  services: ServiceStatus[];
  metrics: SystemMetrics;
  alerts: AlertSummary;
  performance: PerformanceSummary;
  correlationId: string;
}

export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime?: number;
  lastCheck: Date;
  details?: Record<string, any>;
  dependencies?: ServiceStatus[];
}

export interface SystemMetrics {
  memory: {
    used: number;
    total: number;
    percentage: number;
    heap: {
      used: number;
      total: number;
      percentage: number;
    };
  };
  cpu: {
    usage: number;
    loadAverage: number[];
  };
  process: {
    pid: number;
    uptime: number;
    version: string;
  };
  database: {
    connections: {
      active: number;
      idle: number;
      total: number;
    };
    queryStats: {
      total: number;
      avgResponseTime: number;
      errorRate: number;
    };
  };
  cache: {
    hitRatio: number;
    memoryUsage: number;
    operations: {
      total: number;
      avgResponseTime: number;
    };
  };
  authentication: {
    activeSessions: number;
    requestsPerMinute: number;
    successRate: number;
    avgResponseTime: number;
  };
}

export interface AlertSummary {
  total: number;
  active: number;
  critical: number;
  high: number;
  medium: number;
  low: number;
  recentAlerts: Array<{
    id: string;
    title: string;
    severity: string;
    timestamp: Date;
  }>;
}

export interface PerformanceSummary {
  responseTime: {
    p50: number;
    p95: number;
    p99: number;
  };
  throughput: {
    requestsPerSecond: number;
    requestsPerMinute: number;
  };
  errorRate: number;
  slowestOperations: Array<{
    operation: string;
    component: string;
    avgDuration: number;
    count: number;
  }>;
}

/**
 * System Status Manager
 */
export class SystemStatusManager {
  private startTime = Date.now();
  private version: string;
  private environment: string;

  constructor() {
    this.version = process.env.APP_VERSION || '1.0.0';
    this.environment = process.env.NODE_ENV || 'development';
  }

  /**
   * Get comprehensive system status
   */
  async getSystemStatus(): Promise<SystemStatus> {
    const correlationId =
      correlationIdManager.getCorrelationId() || 'system-status';

    loggers.monitoring.debug('Generating system status report', {
      correlationId,
    });

    const [healthStatus, systemMetrics, alertSummary, performanceSummary] =
      await Promise.all([
        this.getHealthStatus(),
        this.getSystemMetrics(),
        this.getAlertSummary(),
        this.getPerformanceSummary(),
      ]);

    const status: SystemStatus = {
      status: healthStatus.status,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      version: this.version,
      environment: this.environment,
      services: this.mapHealthChecksToServices(healthStatus),
      metrics: systemMetrics,
      alerts: alertSummary,
      performance: performanceSummary,
      correlationId,
    };

    loggers.monitoring.info('System status report generated', {
      status: status.status,
      uptime: status.uptime,
      servicesCount: status.services.length,
      activeAlerts: status.alerts.active,
      correlationId,
    });

    return status;
  }

  /**
   * Get health status
   */
  private async getHealthStatus(): Promise<SystemHealthStatus> {
    try {
      return await healthCheckManager.checkHealth();
    } catch (error) {
      loggers.monitoring.error('Failed to get health status', {
        error: (error as Error).message,
      });

      return {
        status: 'unhealthy',
        timestamp: new Date(),
        uptime: Date.now() - this.startTime,
        version: this.version,
        environment: this.environment,
        checks: [],
        summary: { total: 0, healthy: 0, degraded: 0, unhealthy: 1 },
      };
    }
  }

  /**
   * Get system metrics
   */
  private async getSystemMetrics(): Promise<SystemMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();
    const loadAverage = require('os').loadavg();

    return {
      memory: {
        used: memUsage.rss,
        total: require('os').totalmem(),
        percentage: (memUsage.rss / require('os').totalmem()) * 100,
        heap: {
          used: memUsage.heapUsed,
          total: memUsage.heapTotal,
          percentage: (memUsage.heapUsed / memUsage.heapTotal) * 100,
        },
      },
      cpu: {
        usage: (cpuUsage.user + cpuUsage.system) / 1000000, // Convert to seconds
        loadAverage,
      },
      process: {
        pid: process.pid,
        uptime: process.uptime(),
        version: process.version,
      },
      database: await this.getDatabaseMetrics(),
      cache: await this.getCacheMetrics(),
      authentication: await this.getAuthenticationMetrics(),
    };
  }

  /**
   * Get database metrics
   */
  private async getDatabaseMetrics(): Promise<SystemMetrics['database']> {
    // This would integrate with actual database connection pools
    // For now, return mock data
    return {
      connections: {
        active: 5,
        idle: 10,
        total: 15,
      },
      queryStats: {
        total: 1000,
        avgResponseTime: 25,
        errorRate: 0.01,
      },
    };
  }

  /**
   * Get cache metrics
   */
  private async getCacheMetrics(): Promise<SystemMetrics['cache']> {
    // This would integrate with actual cache implementations
    // For now, return mock data
    return {
      hitRatio: 0.85,
      memoryUsage: 50 * 1024 * 1024, // 50MB
      operations: {
        total: 5000,
        avgResponseTime: 2,
      },
    };
  }

  /**
   * Get authentication metrics
   */
  private async getAuthenticationMetrics(): Promise<
    SystemMetrics['authentication']
  > {
    // This would integrate with actual authentication metrics
    // For now, return mock data
    return {
      activeSessions: 150,
      requestsPerMinute: 500,
      successRate: 0.98,
      avgResponseTime: 75,
    };
  }

  /**
   * Get alert summary
   */
  private async getAlertSummary(): Promise<AlertSummary> {
    const alerts = alertingSystem.getAlerts();
    const activeAlerts = alerts.filter((alert) => alert.status === 'active');

    const summary: AlertSummary = {
      total: alerts.length,
      active: activeAlerts.length,
      critical: alerts.filter((alert) => alert.severity === 'critical').length,
      high: alerts.filter((alert) => alert.severity === 'high').length,
      medium: alerts.filter((alert) => alert.severity === 'medium').length,
      low: alerts.filter((alert) => alert.severity === 'low').length,
      recentAlerts: alerts.slice(0, 5).map((alert) => ({
        id: alert.id,
        title: alert.title,
        severity: alert.severity,
        timestamp: alert.timestamp,
      })),
    };

    return summary;
  }

  /**
   * Get performance summary
   */
  private async getPerformanceSummary(): Promise<PerformanceSummary> {
    const stats = performanceTracker.getStats();

    if (stats.length === 0) {
      return {
        responseTime: { p50: 0, p95: 0, p99: 0 },
        throughput: { requestsPerSecond: 0, requestsPerMinute: 0 },
        errorRate: 0,
        slowestOperations: [],
      };
    }

    const allDurations = stats.flatMap((stat) => [
      stat.p50,
      stat.p95,
      stat.p99,
    ]);
    const totalRequests = stats.reduce((sum, stat) => sum + stat.count, 0);
    const totalErrors = stats.reduce(
      (sum, stat) => sum + stat.count * stat.errorRate,
      0
    );

    return {
      responseTime: {
        p50: this.calculatePercentile(allDurations, 0.5),
        p95: this.calculatePercentile(allDurations, 0.95),
        p99: this.calculatePercentile(allDurations, 0.99),
      },
      throughput: {
        requestsPerSecond: totalRequests / 60, // Assuming 1-minute window
        requestsPerMinute: totalRequests,
      },
      errorRate: totalErrors / totalRequests,
      slowestOperations: stats
        .sort((a, b) => b.averageDuration - a.averageDuration)
        .slice(0, 5)
        .map((stat) => ({
          operation: stat.operation,
          component: stat.component,
          avgDuration: stat.averageDuration,
          count: stat.count,
        })),
    };
  }

  /**
   * Calculate percentile
   */
  private calculatePercentile(values: number[], percentile: number): number {
    if (values.length === 0) return 0;

    const sorted = values.sort((a, b) => a - b);
    const index = Math.ceil(sorted.length * percentile) - 1;
    return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
  }

  /**
   * Map health checks to services
   */
  private mapHealthChecksToServices(
    healthStatus: SystemHealthStatus
  ): ServiceStatus[] {
    return healthStatus.checks.map((check) => ({
      name: check.name,
      status: check.status,
      responseTime: check.responseTime,
      lastCheck: check.timestamp,
      details: check.details,
    }));
  }

  /**
   * Get simple health check
   */
  async getSimpleHealth(): Promise<{ status: string; timestamp: Date }> {
    const healthStatus = await this.getHealthStatus();
    return {
      status: healthStatus.status,
      timestamp: new Date(),
    };
  }

  /**
   * Get readiness check
   */
  async getReadiness(): Promise<{
    ready: boolean;
    checks: Record<string, boolean>;
  }> {
    const healthStatus = await this.getHealthStatus();
    const checks: Record<string, boolean> = {};

    healthStatus.checks.forEach((check) => {
      checks[check.name] = check.status === 'healthy';
    });

    const ready = healthStatus.status === 'healthy';

    return { ready, checks };
  }

  /**
   * Get liveness check
   */
  async getLiveness(): Promise<{ alive: boolean; uptime: number }> {
    return {
      alive: true,
      uptime: Date.now() - this.startTime,
    };
  }
}

/**
 * Register health and status endpoints
 */
export function registerStatusEndpoints(fastify: FastifyInstance): void {
  const statusManager = new SystemStatusManager();

  // Comprehensive system status
  fastify.get(
    '/status',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const status = await statusManager.getSystemStatus();

        // Set appropriate HTTP status code
        const httpStatus =
          status.status === 'healthy'
            ? 200
            : status.status === 'degraded'
              ? 200
              : 503;

        reply.status(httpStatus).send(status);
      } catch (error) {
        loggers.monitoring.error('Failed to get system status', {
          error: (error as Error).message,
        });

        reply.status(503).send({
          status: 'unhealthy',
          error: 'Failed to retrieve system status',
          timestamp: new Date(),
        });
      }
    }
  );

  // Simple health check
  fastify.get(
    '/health',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const health = await statusManager.getSimpleHealth();

        const httpStatus = health.status === 'healthy' ? 200 : 503;
        reply.status(httpStatus).send(health);
      } catch (error) {
        reply.status(503).send({
          status: 'unhealthy',
          timestamp: new Date(),
        });
      }
    }
  );

  // Kubernetes readiness probe
  fastify.get(
    '/ready',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const readiness = await statusManager.getReadiness();

        const httpStatus = readiness.ready ? 200 : 503;
        reply.status(httpStatus).send(readiness);
      } catch (error) {
        reply.status(503).send({
          ready: false,
          error: 'Readiness check failed',
        });
      }
    }
  );

  // Kubernetes liveness probe
  fastify.get('/live', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const liveness = await statusManager.getLiveness();
      reply.status(200).send(liveness);
    } catch (error) {
      reply.status(503).send({
        alive: false,
        error: 'Liveness check failed',
      });
    }
  });

  // Prometheus metrics endpoint
  fastify.get(
    '/metrics',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const metrics = await metricsManager.getMetrics();
        reply.type('text/plain').send(metrics);
      } catch (error) {
        loggers.monitoring.error('Failed to get Prometheus metrics', {
          error: (error as Error).message,
        });

        reply.status(500).send('Failed to retrieve metrics');
      }
    }
  );

  // Detailed health checks
  fastify.get(
    '/health/detailed',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const healthStatus = await healthCheckManager.checkHealth();
        reply.send(healthStatus);
      } catch (error) {
        reply.status(503).send({
          status: 'unhealthy',
          error: 'Detailed health check failed',
          timestamp: new Date(),
        });
      }
    }
  );

  // Performance metrics
  fastify.get(
    '/status/performance',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const stats = performanceTracker.getStats();
        const activeMetrics = performanceTracker.getActiveMetrics();

        reply.send({
          stats,
          activeMetrics: activeMetrics.length,
          timestamp: new Date(),
        });
      } catch (error) {
        reply.status(500).send({
          error: 'Failed to retrieve performance metrics',
          timestamp: new Date(),
        });
      }
    }
  );

  // Alert status
  fastify.get(
    '/status/alerts',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const alerts = alertingSystem.getAlerts(
          undefined,
          undefined,
          undefined,
          50
        );
        const summary = await statusManager.getAlertSummary();

        reply.send({
          summary,
          alerts,
          timestamp: new Date(),
        });
      } catch (error) {
        reply.status(500).send({
          error: 'Failed to retrieve alert status',
          timestamp: new Date(),
        });
      }
    }
  );

  loggers.monitoring.info('Status endpoints registered', {
    endpoints: [
      '/status',
      '/health',
      '/ready',
      '/live',
      '/metrics',
      '/health/detailed',
      '/status/performance',
      '/status/alerts',
    ],
  });
}

// Export singleton instance
export const systemStatusManager = new SystemStatusManager();
