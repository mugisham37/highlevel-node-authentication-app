import Fastify, { FastifyInstance } from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import { config } from '../config/environment';
// import { logger } from '../logging/winston-logger'; // Will be used in future tasks
import { errorHandler } from './error-handler';
import { correlationIdPlugin } from './plugins/correlation-id';
import { requestLoggingPlugin } from './plugins/request-logging';

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

  // Security middleware
  await server.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
      },
    },
    hsts: {
      maxAge: 31536000,
      includeSubDomains: true,
      preload: true,
    },
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

  // Rate limiting
  await server.register(rateLimit, {
    max: config.security.rateLimit.max,
    timeWindow: config.security.rateLimit.window,
    skipOnError: true,
    keyGenerator: (request) => {
      return request.ip || 'unknown';
    },
    errorResponseBuilder: (_request, context) => {
      return {
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'Too Many Requests',
        message: `Rate limit exceeded, retry in ${Math.round(context.ttl / 1000)} seconds`,
        statusCode: 429,
      };
    },
  });

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
