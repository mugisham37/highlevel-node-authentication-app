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
import { createRouteRegistration } from '../../presentation/routes/index';
import { WebSocketServer } from '../websocket/websocket-server';
import { monitoringSystem } from '../monitoring';

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

  // Initialize monitoring system
  await initializeMonitoringSystem(server);

  // Register API routes
  await registerApiRoutes(server);

  // Initialize WebSocket server
  await initializeWebSocketServer(server);

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

/**
 * Register API routes with dependency injection
 */
async function registerApiRoutes(server: FastifyInstance): Promise<void> {
  try {
    // Import service factory
    const { createServicesForRoutes } = await import(
      '../../presentation/factories/service.factory'
    );

    // Create service instances
    const services = createServicesForRoutes({
      logger,
      // In a real application, you would pass actual database connections here
      // prismaClient: prismaClient,
      // drizzleDb: drizzleDb,
    });

    // Register routes
    const routeRegistration = createRouteRegistration(services);
    await server.register(routeRegistration);

    logger.info('API routes registered successfully');
  } catch (error) {
    logger.error('Failed to register API routes', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Initialize monitoring system
 */
async function initializeMonitoringSystem(
  server: FastifyInstance
): Promise<void> {
  try {
    await monitoringSystem.initialize(server);

    // Store monitoring system instance for graceful shutdown
    (server as any).monitoringSystem = monitoringSystem;

    logger.info('Monitoring system initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize monitoring system', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}

/**
 * Initialize WebSocket server
 */
async function initializeWebSocketServer(
  server: FastifyInstance
): Promise<void> {
  try {
    const webSocketServer = new WebSocketServer();
    await webSocketServer.initialize(server);

    // Store WebSocket server instance for graceful shutdown
    (server as any).webSocketServer = webSocketServer;

    logger.info('WebSocket server initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize WebSocket server', {
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    throw error;
  }
}
