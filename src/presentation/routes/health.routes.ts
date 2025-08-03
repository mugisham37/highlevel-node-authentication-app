/**
 * Health Check Routes
 * Provides HTTP endpoints for system health monitoring
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import {
  healthCheckManager,
  CommonHealthChecks,
} from '../../infrastructure/health/health-check';
import { correlationIdManager } from '../../infrastructure/tracing/correlation-id';
import { logger } from '../../infrastructure/logging/winston-logger';
import { circuitBreakerManager } from '../../infrastructure/resilience/circuit-breaker';
import { degradationManagers } from '../../infrastructure/resilience/graceful-degradation';

interface HealthQueryParams {
  check?: string;
  format?: 'json' | 'text';
  details?: boolean;
}

/**
 * Register health check routes
 */
export async function registerHealthRoutes(fastify: FastifyInstance) {
  // Basic health check endpoint
  fastify.get(
    '/health',
    {
      schema: {
        description: 'Basic health check endpoint',
        tags: ['health'],
        querystring: {
          type: 'object',
          properties: {
            format: { type: 'string', enum: ['json', 'text'] },
            details: { type: 'boolean' },
          },
        },
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              version: { type: 'string' },
              environment: { type: 'string' },
            },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Querystring: HealthQueryParams }>,
      reply: FastifyReply
    ) => {
      const correlationId = correlationIdManager.getCorrelationId();
      const { format = 'json', details = false } = request.query;

      try {
        const healthStatus = await healthCheckManager.checkHealth();

        // Set appropriate status code
        const statusCode =
          healthStatus.status === 'healthy'
            ? 200
            : healthStatus.status === 'degraded'
              ? 200
              : 503;

        reply.code(statusCode);

        if (format === 'text') {
          const textResponse = details
            ? formatDetailedTextResponse(healthStatus)
            : formatSimpleTextResponse(healthStatus);

          reply.type('text/plain');
          return textResponse;
        }

        // JSON response
        if (!details) {
          return {
            status: healthStatus.status,
            timestamp: healthStatus.timestamp,
            uptime: healthStatus.uptime,
            version: healthStatus.version,
            environment: healthStatus.environment,
            correlationId,
          };
        }

        return healthStatus;
      } catch (error) {
        logger.error('Health check endpoint failed', {
          error: (error as Error).message,
          correlationId,
        });

        reply.code(503);
        return {
          status: 'unhealthy',
          timestamp: new Date(),
          error: 'Health check failed',
          correlationId,
        };
      }
    }
  );

  // Detailed health check endpoint
  fastify.get(
    '/health/detailed',
    {
      schema: {
        description: 'Detailed health check with all components',
        tags: ['health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              checks: { type: 'array' },
              summary: { type: 'object' },
            },
          },
        },
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = correlationIdManager.getCorrelationId();

      try {
        const healthStatus = await healthCheckManager.checkHealth();

        const statusCode =
          healthStatus.status === 'healthy'
            ? 200
            : healthStatus.status === 'degraded'
              ? 200
              : 503;

        reply.code(statusCode);
        return healthStatus;
      } catch (error) {
        logger.error('Detailed health check failed', {
          error: (error as Error).message,
          correlationId,
        });

        reply.code(503);
        return {
          status: 'unhealthy',
          timestamp: new Date(),
          error: 'Health check failed',
          correlationId,
        };
      }
    }
  );

  // Individual health check endpoint
  fastify.get(
    '/health/check/:checkName',
    {
      schema: {
        description: 'Check specific health component',
        tags: ['health'],
        params: {
          type: 'object',
          properties: {
            checkName: { type: 'string' },
          },
          required: ['checkName'],
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { checkName: string } }>,
      reply: FastifyReply
    ) => {
      const { checkName } = request.params;
      const correlationId = correlationIdManager.getCorrelationId();

      try {
        const result = await healthCheckManager.checkSpecific(checkName);

        const statusCode =
          result.status === 'healthy'
            ? 200
            : result.status === 'degraded'
              ? 200
              : 503;

        reply.code(statusCode);
        return result;
      } catch (error) {
        logger.error('Individual health check failed', {
          checkName,
          error: (error as Error).message,
          correlationId,
        });

        reply.code(404);
        return {
          error: 'Health check not found',
          checkName,
          correlationId,
        };
      }
    }
  );

  // Liveness probe (Kubernetes)
  fastify.get(
    '/health/live',
    {
      schema: {
        description: 'Liveness probe for Kubernetes',
        tags: ['health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Simple liveness check - just return OK if the process is running
      reply.code(200);
      return {
        status: 'alive',
        timestamp: new Date(),
        uptime: healthCheckManager.getUptime(),
      };
    }
  );

  // Readiness probe (Kubernetes)
  fastify.get(
    '/health/ready',
    {
      schema: {
        description: 'Readiness probe for Kubernetes',
        tags: ['health'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = correlationIdManager.getCorrelationId();

      try {
        const healthStatus = await healthCheckManager.checkHealth();

        // Ready only if healthy or degraded (not unhealthy)
        if (healthStatus.status === 'unhealthy') {
          reply.code(503);
          return {
            status: 'not-ready',
            reason: 'System is unhealthy',
            timestamp: new Date(),
            correlationId,
          };
        }

        reply.code(200);
        return {
          status: 'ready',
          timestamp: new Date(),
          correlationId,
        };
      } catch (error) {
        logger.error('Readiness check failed', {
          error: (error as Error).message,
          correlationId,
        });

        reply.code(503);
        return {
          status: 'not-ready',
          reason: 'Health check failed',
          timestamp: new Date(),
          correlationId,
        };
      }
    }
  );

  // Circuit breaker status endpoint
  fastify.get(
    '/health/circuit-breakers',
    {
      schema: {
        description: 'Circuit breaker status information',
        tags: ['health', 'resilience'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = correlationIdManager.getCorrelationId();

      try {
        const stats = circuitBreakerManager.getAllStats();
        const openCircuits = Object.entries(stats).filter(
          ([_, stat]) => stat.state === 'OPEN'
        );

        const statusCode = openCircuits.length > 0 ? 200 : 200; // Always 200 for info endpoint

        reply.code(statusCode);
        return {
          status: openCircuits.length === 0 ? 'healthy' : 'degraded',
          timestamp: new Date(),
          circuitBreakers: stats,
          summary: {
            total: Object.keys(stats).length,
            open: openCircuits.length,
            closed: Object.values(stats).filter((s) => s.state === 'CLOSED')
              .length,
            halfOpen: Object.values(stats).filter(
              (s) => s.state === 'HALF_OPEN'
            ).length,
          },
          correlationId,
        };
      } catch (error) {
        logger.error('Circuit breaker status check failed', {
          error: (error as Error).message,
          correlationId,
        });

        reply.code(500);
        return {
          error: 'Failed to get circuit breaker status',
          correlationId,
        };
      }
    }
  );

  // Degradation status endpoint
  fastify.get(
    '/health/degradation',
    {
      schema: {
        description: 'Service degradation status information',
        tags: ['health', 'resilience'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = correlationIdManager.getCorrelationId();

      try {
        const degradationStatus = Object.entries(degradationManagers).reduce(
          (acc, [name, manager]) => {
            acc[name] = manager.getState();
            return acc;
          },
          {} as Record<string, any>
        );

        const degradedServices = Object.entries(degradationStatus)
          .filter(([_, state]) => state.isDegraded)
          .map(([name]) => name);

        reply.code(200);
        return {
          status: degradedServices.length === 0 ? 'healthy' : 'degraded',
          timestamp: new Date(),
          services: degradationStatus,
          summary: {
            total: Object.keys(degradationStatus).length,
            healthy: Object.values(degradationStatus).filter(
              (s: any) => s.isHealthy
            ).length,
            degraded: degradedServices.length,
          },
          correlationId,
        };
      } catch (error) {
        logger.error('Degradation status check failed', {
          error: (error as Error).message,
          correlationId,
        });

        reply.code(500);
        return {
          error: 'Failed to get degradation status',
          correlationId,
        };
      }
    }
  );

  // System metrics endpoint
  fastify.get(
    '/health/metrics',
    {
      schema: {
        description: 'System metrics and performance information',
        tags: ['health', 'metrics'],
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      const correlationId = correlationIdManager.getCorrelationId();

      try {
        const memUsage = process.memoryUsage();
        const cpuUsage = process.cpuUsage();

        reply.code(200);
        return {
          timestamp: new Date(),
          uptime: process.uptime(),
          memory: {
            rss: memUsage.rss,
            heapTotal: memUsage.heapTotal,
            heapUsed: memUsage.heapUsed,
            external: memUsage.external,
            arrayBuffers: memUsage.arrayBuffers,
          },
          cpu: {
            user: cpuUsage.user,
            system: cpuUsage.system,
          },
          process: {
            pid: process.pid,
            version: process.version,
            platform: process.platform,
            arch: process.arch,
          },
          correlationId,
        };
      } catch (error) {
        logger.error('System metrics check failed', {
          error: (error as Error).message,
          correlationId,
        });

        reply.code(500);
        return {
          error: 'Failed to get system metrics',
          correlationId,
        };
      }
    }
  );

  logger.info('Health check routes registered');
}

/**
 * Format simple text response
 */
function formatSimpleTextResponse(healthStatus: any): string {
  return (
    `Status: ${healthStatus.status.toUpperCase()}\n` +
    `Timestamp: ${healthStatus.timestamp}\n` +
    `Uptime: ${Math.floor(healthStatus.uptime / 1000)}s\n` +
    `Version: ${healthStatus.version || 'unknown'}\n` +
    `Environment: ${healthStatus.environment || 'unknown'}`
  );
}

/**
 * Format detailed text response
 */
function formatDetailedTextResponse(healthStatus: any): string {
  let response = formatSimpleTextResponse(healthStatus);

  response += `\n\nHealth Checks:\n`;
  response += `Total: ${healthStatus.summary.total}\n`;
  response += `Healthy: ${healthStatus.summary.healthy}\n`;
  response += `Degraded: ${healthStatus.summary.degraded}\n`;
  response += `Unhealthy: ${healthStatus.summary.unhealthy}\n`;

  if (healthStatus.checks && healthStatus.checks.length > 0) {
    response += `\nDetailed Results:\n`;
    for (const check of healthStatus.checks) {
      response += `- ${check.name}: ${check.status.toUpperCase()} (${check.responseTime}ms)\n`;
      if (check.error) {
        response += `  Error: ${check.error}\n`;
      }
    }
  }

  return response;
}
