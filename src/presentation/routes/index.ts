/**
 * Route Registration Index
 * Central registration point for all API routes with versioning support
 */

import { FastifyInstance } from 'fastify';
import { AuthenticationService } from '../../application/services/authentication.service';
import { MFAService } from '../../application/services/mfa.service';
import { SessionManagementService } from '../../application/services/session-management.service';
import { OAuthService } from '../../application/services/oauth.service';
import { OAuthServerService } from '../../application/services/oauth-server.service';
import { UserManagementService } from '../../application/services/user-management.service';
import { AuthorizationService } from '../../application/services/authorization.service';
import { PasswordlessAuthService } from '../../application/services/passwordless-auth.service';
import { DeviceManagementService } from '../../application/services/device-management.service';
import { FallbackAuthService } from '../../application/services/fallback-auth.service';
import { RoleManagementService } from '../../application/services/role-management.service';

// Infrastructure
import { logger } from '../../infrastructure/logging/winston-logger';

// Controllers
import { AuthenticationController } from '../controllers/authentication.controller';
import { OAuthController } from '../controllers/oauth.controller';
import { AdminController } from '../controllers/admin.controller';
import { PasswordlessAuthController } from '../controllers/passwordless-auth.controller';
import { RoleManagementController } from '../controllers/role-management.controller';

// Routes
import { authenticationRoutes } from './authentication.routes';
import { oauthRoutes } from './oauth.routes';
import { userManagementRoutes } from './user-management.routes';
import { adminRoutes } from './admin.routes';
import { passwordlessAuthRoutes } from './passwordless-auth.routes';
import { roleManagementRoutes } from './role-management.routes';
import { securityComplianceRoutes } from './security-compliance.routes';

// Middleware
import { validationPlugin } from '../middleware/validation.middleware';
import {
  versioningPlugin,
  registerVersionedRoutes,
} from '../middleware/versioning.middleware';

export interface RouteRegistrationOptions {
  // Services
  authenticationService: AuthenticationService;
  mfaService: MFAService;
  sessionService: SessionManagementService;
  oauthService: OAuthService;
  oauthServerService: OAuthServerService;
  userManagementService: UserManagementService;
  authorizationService: AuthorizationService;
  passwordlessAuthService: PasswordlessAuthService;
  deviceManagementService: DeviceManagementService;
  fallbackAuthService: FallbackAuthService;
  roleManagementService: RoleManagementService;
}

/**
 * Register all API routes with versioning support
 */
export async function registerRoutes(
  fastify: FastifyInstance,
  options: RouteRegistrationOptions
): Promise<void> {
  const {
    authenticationService,
    mfaService,
    sessionService,
    oauthService,
    oauthServerService,
    userManagementService,
    authorizationService,
    passwordlessAuthService,
    deviceManagementService,
    fallbackAuthService,
    roleManagementService,
  } = options;

  // Register validation plugin
  await fastify.register(validationPlugin);

  // Register versioning plugin
  await fastify.register(versioningPlugin, {
    defaultVersion: 'v1',
    supportedVersions: ['v1'],
    deprecatedVersions: {
      // Example: Mark v1 as deprecated (uncomment when v2 is ready)
      // 'v1': {
      //   deprecatedAt: '2024-01-01T00:00:00Z',
      //   sunsetAt: '2024-06-01T00:00:00Z',
      // },
    },
  });

  // Create controllers
  const authenticationController = new AuthenticationController(
    authenticationService,
    mfaService,
    sessionService
  );

  const oauthController = new OAuthController(oauthService, oauthServerService);

  const adminController = new AdminController(
    userManagementService,
    sessionService,
    authorizationService
  );

  const passwordlessAuthController = new PasswordlessAuthController(
    passwordlessAuthService,
    deviceManagementService,
    fallbackAuthService,
    logger
  );

  const roleManagementController = new RoleManagementController(
    roleManagementService
  );

  // Define versioned routes
  const versionedRoutes = {
    v1: async (fastifyInstance: FastifyInstance, routeOptions: any) => {
      // Authentication routes
      await fastifyInstance.register(authenticationRoutes, {
        authenticationController,
        authorizationService,
        ...routeOptions,
      });

      // OAuth routes
      await fastifyInstance.register(oauthRoutes, {
        oauthController,
        authorizationService,
        ...routeOptions,
      });

      // User management routes
      await fastifyInstance.register(userManagementRoutes, {
        userManagementController: new (
          await import('../controllers/user-management.controller')
        ).UserManagementController(userManagementService),
        authorizationService,
        ...routeOptions,
      });

      // Administrative routes
      await fastifyInstance.register(adminRoutes, {
        adminController,
        authorizationService,
        ...routeOptions,
      });

      // Passwordless authentication routes
      await fastifyInstance.register(passwordlessAuthRoutes, {
        passwordlessAuthController,
        ...routeOptions,
      });

      // Role management routes
      await fastifyInstance.register(roleManagementRoutes, {
        roleManagementController,
        authorizationService,
        ...routeOptions,
      });

      // Security compliance routes
      await fastifyInstance.register(securityComplianceRoutes, {
        ...routeOptions,
      });
    },
  };

  // Register versioned routes
  await fastify.register(registerVersionedRoutes(fastify, versionedRoutes));

  // Register health check routes (unversioned)
  await fastify.register(async (healthInstance) => {
    healthInstance.get(
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
                version: { type: 'string' },
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
          environment: process.env['NODE_ENV'] || 'development',
          version: '1.0.0',
        };
      }
    );

    healthInstance.get(
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
                checks: {
                  type: 'object',
                  properties: {
                    database: { type: 'string' },
                    redis: { type: 'string' },
                    external_services: { type: 'string' },
                  },
                },
              },
            },
          },
        },
      },
      async (_request, _reply) => {
        // In a real implementation, these would be actual health checks
        const checks = {
          database: 'healthy',
          redis: 'healthy',
          external_services: 'healthy',
        };

        const allHealthy = Object.values(checks).every(
          (status) => status === 'healthy'
        );

        return {
          status: allHealthy ? 'ready' : 'not_ready',
          timestamp: new Date().toISOString(),
          checks,
        };
      }
    );
  });

  // Register API documentation routes
  if (process.env['NODE_ENV'] === 'development') {
    await fastify.register(async (docsInstance) => {
      docsInstance.get(
        '/api-docs',
        {
          schema: {
            description: 'API documentation endpoint',
            tags: ['Documentation'],
            response: {
              200: {
                type: 'object',
                properties: {
                  title: { type: 'string' },
                  description: { type: 'string' },
                  version: { type: 'string' },
                  supportedVersions: {
                    type: 'array',
                    items: { type: 'string' },
                  },
                  endpoints: { type: 'object' },
                },
              },
            },
          },
        },
        async (_request, _reply) => {
          return {
            title: 'Enterprise Authentication API',
            description:
              'Enterprise-grade authentication backend API with OAuth, MFA, and advanced security features',
            version: '1.0.0',
            supportedVersions: ['v1'],
            endpoints: {
              authentication: '/api/v1/auth/*',
              oauth: '/api/v1/oauth/*',
              users: '/api/v1/users/*',
              admin: '/api/v1/admin/*',
            },
            documentation: {
              swagger: '/docs',
              openapi: '/docs/json',
            },
          };
        }
      );
    });
  }

  // Add global error handling for routes
  fastify.setErrorHandler(async (error, request, reply) => {
    const correlationId = (request as any).correlationId;

    // Log the error
    fastify.log.error({
      correlationId,
      error: error.message,
      stack: error.stack,
      url: request.url,
      method: request.method,
    });

    // Handle validation errors
    if (error.validation) {
      return reply.status(400).send({
        success: false,
        error: 'VALIDATION_ERROR',
        message: 'Request validation failed',
        details: error.validation,
        correlationId,
      });
    }

    // Handle authentication errors
    if (error.statusCode === 401) {
      return reply.status(401).send({
        success: false,
        error: 'UNAUTHORIZED',
        message: 'Authentication required',
        correlationId,
      });
    }

    // Handle authorization errors
    if (error.statusCode === 403) {
      return reply.status(403).send({
        success: false,
        error: 'FORBIDDEN',
        message: 'Insufficient permissions',
        correlationId,
      });
    }

    // Handle rate limiting errors
    if (error.statusCode === 429) {
      return reply.status(429).send({
        success: false,
        error: 'RATE_LIMIT_EXCEEDED',
        message: 'Too many requests',
        correlationId,
      });
    }

    // Handle generic errors
    const statusCode = error.statusCode || 500;
    const message =
      statusCode === 500 ? 'Internal server error' : error.message;

    return reply.status(statusCode).send({
      success: false,
      error: error.code || 'INTERNAL_SERVER_ERROR',
      message,
      correlationId,
    });
  });

  // Add 404 handler
  fastify.setNotFoundHandler(async (request, reply) => {
    const correlationId = (request as any).correlationId;

    return reply.status(404).send({
      success: false,
      error: 'NOT_FOUND',
      message: `Route ${request.method}:${request.url} not found`,
      correlationId,
      availableVersions: ['v1'],
      documentation:
        process.env['NODE_ENV'] === 'development' ? '/docs' : undefined,
    });
  });
}

/**
 * Route registration factory for dependency injection
 */
export function createRouteRegistration(services: RouteRegistrationOptions) {
  return async (fastify: FastifyInstance) => {
    await registerRoutes(fastify, services);
  };
}
