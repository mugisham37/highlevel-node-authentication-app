import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config/environment';
import { logger } from '../logging/winston-logger';
import { errorHandler } from './error-handler';
import { correlationIdPlugin } from './plugins/correlation-id';
import { requestLoggingPlugin } from './plugins/request-logging';

// Import new security middleware
import {
  authenticationRateLimiter,
  apiRateLimiter,
} from './middleware/intelligent-rate-limiter';
import { standardZeroTrust } from './middleware/zero-trust-auth';
import { standardAuditLogger } from './middleware/audit-logging';
import {
  standardSecurityHeaders,
  developmentSecurityHeaders,
} from './middleware/security-headers';

export async function createServer(): Promise<FastifyInstance> {
  const server = Fastify({
    logger: false, // We use Winston instead
    trustProxy: true,
    requestIdHeader: 'x-request-id',
    requestIdLogLabel: 'requestId',
    maxParamLength: 200,
    bodyLimit: 1048576, // 1MB
    keepAliveTimeout: 30000,
    connectionTimeout: 10000,
  });

  // Register correlation ID plugin first
  await server.register(correlationIdPlugin);

  // Register request logging plugin
  await server.register(requestLoggingPlugin);

  // Register audit logging middleware
  await server.register(standardAuditLogger);

  // Register enhanced security headers middleware
  if (config.isDevelopment) {
    await server.register(developmentSecurityHeaders);
  } else {
    await server.register(standardSecurityHeaders);
  }

  // Basic Helmet for additional protection (complementing our custom security headers)
  await server.register(helmet, {
    contentSecurityPolicy: false, // We handle CSP in our custom middleware
    hsts: false, // We handle HSTS in our custom middleware
    crossOriginEmbedderPolicy: false, // We handle COEP in our custom middleware
    crossOriginOpenerPolicy: false, // We handle COOP in our custom middleware
  });

  // CORS configuration
  await server.register(cors, {
    origin: config.isDevelopment ? true : false, // Configure properly for production
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: [
      'Content-Type',
      'Authorization',
      'X-Requested-With',
      'X-Correlation-ID',
    ],
  });

  // Intelligent rate limiting (replaces basic rate limiting)
  await server.register(apiRateLimiter);

  // Zero-trust authentication middleware (will be applied to protected routes)
  // Note: This is registered but will only affect routes that require authentication
  await server.register(standardZeroTrust);

  // Swagger documentation
  if (config.isDevelopment) {
    await server.register(swagger, {
      swagger: {
        info: {
          title: 'Enterprise Authentication API',
          description: 'Enterprise-grade authentication backend API',
          version: '1.0.0',
        },
        host: `${config.server.host}:${config.server.port}`,
        schemes: ['http', 'https'],
        consumes: ['application/json'],
        produces: ['application/json'],
        securityDefinitions: {
          Bearer: {
            type: 'apiKey',
            name: 'Authorization',
            in: 'header',
            description: 'Enter JWT token in format: Bearer <token>',
          },
        },
      },
    });

    await server.register(swaggerUi, {
      routePrefix: '/docs',
      uiConfig: {
        docExpansion: 'list',
        deepLinking: false,
      },
    });
  }

  // Health check endpoint
  server.get(
    '/health',
    {
      schema: {
        description: 'Health check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
              uptime: { type: 'number' },
              environment: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      return {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        environment: config.env,
      };
    }
  );

  // Ready check endpoint (for Kubernetes readiness probes)
  server.get(
    '/ready',
    {
      schema: {
        description: 'Readiness check endpoint',
        tags: ['Health'],
        response: {
          200: {
            type: 'object',
            properties: {
              status: { type: 'string' },
              timestamp: { type: 'string' },
            },
          },
        },
      },
    },
    async (_request, _reply) => {
      // Add database and Redis connectivity checks here in future tasks
      return {
        status: 'ready',
        timestamp: new Date().toISOString(),
      };
    }
  );

  // Register error handler
  server.setErrorHandler(errorHandler);

  // 404 handler
  server.setNotFoundHandler((request, reply) => {
    reply.status(404).send({
      code: 'NOT_FOUND',
      error: 'Not Found',
      message: `Route ${request.method}:${request.url} not found`,
      statusCode: 404,
    });
  });

  return server;
}
