/**
 * Authorization Middleware
 * Implements permission checking and authorization for API endpoints
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { AuthorizationService } from '../../../application/services/authorization.service';
import {
  AuthorizationContext,
  AuthorizationRequest,
} from '../../../application/interfaces/authorization.interface';
import { logger } from '../../logging/winston-logger';

export interface AuthorizationConfig {
  resource: string;
  action: string;
  context?: (request: FastifyRequest) => Record<string, any>;
  requireAll?: boolean;
  skipIfAdmin?: boolean;
  onAuthorizationFailure?: (
    request: FastifyRequest,
    reply: FastifyReply,
    reason: string
  ) => void;
}

export interface RequireRoleConfig {
  roles: string[];
  requireAll?: boolean;
  skipIfAdmin?: boolean;
}

export interface RequirePermissionConfig {
  permissions: string[];
  requireAll?: boolean;
  skipIfAdmin?: boolean;
}

declare module 'fastify' {
  interface FastifyRequest {
    authorizationContext?: AuthorizationContext;
    hasPermission?: (
      resource: string,
      action: string,
      context?: Record<string, any>
    ) => Promise<boolean>;
    hasRole?: (
      roles: string | string[],
      requireAll?: boolean
    ) => Promise<boolean>;
    isAdmin?: () => Promise<boolean>;
    canManageUser?: (userId: string) => Promise<boolean>;
    canManageRole?: (roleId: string) => Promise<boolean>;
  }
}

export class AuthorizationMiddleware {
  constructor(private authorizationService: AuthorizationService) {}

  /**
   * Create middleware to require specific resource/action permission
   */
  requirePermission(config: AuthorizationConfig): FastifyPluginAsync {
    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await this.checkPermission(request, reply, config);
      });
    };
  }

  /**
   * Create preHandler function to require specific resource/action permission
   */
  requirePermissionHandler(config: AuthorizationConfig) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await this.checkPermission(request, reply, config);
    };
  }

  /**
   * Create middleware to require specific roles
   */
  requireRole(config: RequireRoleConfig): FastifyPluginAsync {
    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await this.checkRole(request, reply, config);
      });
    };
  }

  /**
   * Create preHandler function to require specific roles
   */
  requireRoleHandler(config: RequireRoleConfig) {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await this.checkRole(request, reply, config);
    };
  }

  /**
   * Create middleware to require admin access
   */
  requireAdmin(): FastifyPluginAsync {
    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await this.checkAdmin(request, reply);
      });
    };
  }

  /**
   * Create preHandler function to require admin access
   */
  requireAdminHandler() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await this.checkAdmin(request, reply);
    };
  }

  /**
   * Create middleware to add authorization helper methods to request
   */
  addAuthorizationHelpers(): FastifyPluginAsync {
    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await this.addHelpers(request, reply);
      });
    };
  }

  /**
   * Create preHandler function to add authorization helper methods to request
   */
  addAuthorizationHelpersHandler() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await this.addHelpers(request, reply);
    };
  }

  /**
   * Create middleware for user management endpoints
   */
  requireUserManagement(): FastifyPluginAsync {
    return this.requirePermission({
      resource: 'users',
      action: 'manage',
      context: (request) => ({
        targetUserId: (request.params as any)?.userId || (request.body as any)?.userId,
      }),
    });
  }

  /**
   * Create preHandler function for user management endpoints
   */
  requireUserManagementHandler() {
    return this.requirePermissionHandler({
      resource: 'users',
      action: 'manage',
      context: (request) => ({
        targetUserId: (request.params as any)?.userId || (request.body as any)?.userId,
      }),
    });
  }

  /**
   * Create middleware for role management endpoints
   */
  requireRoleManagement(): FastifyPluginAsync {
    return this.requirePermission({
      resource: 'roles',
      action: 'manage',
      context: (request) => ({
        targetRoleId: (request.params as any)?.roleId || (request.body as any)?.roleId,
      }),
    });
  }

  /**
   * Create preHandler function for role management endpoints
   */
  requireRoleManagementHandler() {
    return this.requirePermissionHandler({
      resource: 'roles',
      action: 'manage',
      context: (request) => ({
        targetRoleId: (request.params as any)?.roleId || (request.body as any)?.roleId,
      }),
    });
  }

  /**
   * Create middleware for permission management endpoints
   */
  requirePermissionManagement(): FastifyPluginAsync {
    return this.requirePermission({
      resource: 'permissions',
      action: 'manage',
      skipIfAdmin: true,
    });
  }

  /**
   * Create preHandler function for permission management endpoints
   */
  requirePermissionManagementHandler() {
    return this.requirePermissionHandler({
      resource: 'permissions',
      action: 'manage',
      skipIfAdmin: true,
    });
  }

  /**
   * Create middleware to require authentication
   */
  requireAuthentication(): FastifyPluginAsync {
    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await this.checkAuthentication(request, reply);
      });
    };
  }

  /**
   * Create preHandler function to require authentication
   */
  requireAuthenticationHandler() {
    return async (request: FastifyRequest, reply: FastifyReply) => {
      await this.checkAuthentication(request, reply);
    };
  }

  private async checkPermission(
    request: FastifyRequest,
    reply: FastifyReply,
    config: AuthorizationConfig
  ): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!request.isAuthenticated || !request.user) {
        return this.handleAuthorizationFailure(
          request,
          reply,
          'Authentication required',
          config
        );
      }

      // Skip if admin and configured to do so
      if (config.skipIfAdmin) {
        const context = this.buildAuthorizationContext(request);
        const isAdmin = await this.authorizationService.isAdmin(context);
        if (isAdmin) {
          return;
        }
      }

      // Build authorization context
      const context = this.buildAuthorizationContext(request);
      request.authorizationContext = context;

      // Build authorization request
      const authRequest: AuthorizationRequest = {
        resource: config.resource,
        action: config.action,
        context: config.context ? config.context(request) : undefined,
        requireAll: config.requireAll || false,
      };

      // Check authorization
      const result = await this.authorizationService.authorize(
        context,
        authRequest
      );

      if (!result.allowed) {
        return this.handleAuthorizationFailure(
          request,
          reply,
          result.reason || 'Access denied',
          config
        );
      }

      logger.debug('Authorization successful', {
        correlationId: request.correlationId,
        userId: request.user.id,
        resource: config.resource,
        action: config.action,
        matchedPermissions: result.matchedPermissions.length,
      });
    } catch (error) {
      logger.error('Authorization middleware error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
        resource: config.resource,
        action: config.action,
      });

      return this.handleAuthorizationFailure(
        request,
        reply,
        'Authorization system error',
        config
      );
    }
  }

  private async checkRole(
    request: FastifyRequest,
    reply: FastifyReply,
    config: RequireRoleConfig
  ): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!request.isAuthenticated || !request.user) {
        return this.handleRoleFailure(
          request,
          reply,
          'Authentication required',
          config
        );
      }

      // Skip if admin and configured to do so
      if (config.skipIfAdmin) {
        const context = this.buildAuthorizationContext(request);
        const isAdmin = await this.authorizationService.isAdmin(context);
        if (isAdmin) {
          return;
        }
      }

      // Build authorization context
      const context = this.buildAuthorizationContext(request);

      // Check roles
      const hasRole = await this.authorizationService.hasRole(context, {
        requiredRoles: config.roles,
        requireAll: config.requireAll || false,
      });

      if (!hasRole) {
        const roleRequirement = config.requireAll ? 'all' : 'any';
        return this.handleRoleFailure(
          request,
          reply,
          `User must have ${roleRequirement} of the following roles: ${config.roles.join(', ')}`,
          config
        );
      }

      logger.debug('Role check successful', {
        correlationId: request.correlationId,
        userId: request.user.id,
        requiredRoles: config.roles,
        userRoles: request.user.roles,
      });
    } catch (error) {
      logger.error('Role check middleware error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
        requiredRoles: config.roles,
      });

      return this.handleRoleFailure(
        request,
        reply,
        'Role check system error',
        config
      );
    }
  }

  private async checkAdmin(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Ensure user is authenticated
      if (!request.isAuthenticated || !request.user) {
        return this.handleAdminFailure(
          request,
          reply,
          'Authentication required'
        );
      }

      // Build authorization context
      const context = this.buildAuthorizationContext(request);

      // Check admin status
      const isAdmin = await this.authorizationService.isAdmin(context);

      if (!isAdmin) {
        return this.handleAdminFailure(
          request,
          reply,
          'Administrator access required'
        );
      }

      logger.debug('Admin check successful', {
        correlationId: request.correlationId,
        userId: request.user.id,
      });
    } catch (error) {
      logger.error('Admin check middleware error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      return this.handleAdminFailure(
        request,
        reply,
        'Admin check system error'
      );
    }
  }

  private async checkAuthentication(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Check if user is authenticated
      if (!request.user) {
        return reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'Authentication required',
          correlationId: request.correlationId,
        });
      }

      logger.debug('Authentication check successful', {
        correlationId: request.correlationId,
        userId: request.user.id,
      });
    } catch (error) {
      logger.error('Authentication check middleware error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Authentication system error',
        correlationId: request.correlationId,
      });
    }
  }

  private async addHelpers(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    try {
      // Only add helpers if user is authenticated
      if (!request.user) {
        return;
      }

      const context = this.buildAuthorizationContext(request);
      request.authorizationContext = context;

      // Add permission check helper
      request.hasPermission = async (
        resource: string,
        action: string,
        permissionContext?: Record<string, any>
      ) => {
        try {
          return await this.authorizationService.canPerformAction(
            context,
            resource,
            action,
            permissionContext
          );
        } catch (error) {
          logger.error('Permission check helper error', {
            error,
            resource,
            action,
          });
          return false;
        }
      };

      // Add role check helper
      request.hasRole = async (
        roles: string | string[],
        requireAll = false
      ) => {
        try {
          const roleArray = Array.isArray(roles) ? roles : [roles];
          return await this.authorizationService.hasRole(context, {
            requiredRoles: roleArray,
            requireAll,
          });
        } catch (error) {
          logger.error('Role check helper error', { error, roles });
          return false;
        }
      };

      // Add admin check helper
      request.isAdmin = async () => {
        try {
          return await this.authorizationService.isAdmin(context);
        } catch (error) {
          logger.error('Admin check helper error', { error });
          return false;
        }
      };

      // Add user management check helper
      request.canManageUser = async (userId: string) => {
        try {
          return await this.authorizationService.canManageUser(context, userId);
        } catch (error) {
          logger.error('User management check helper error', { error, userId });
          return false;
        }
      };

      // Add role management check helper
      request.canManageRole = async (roleId: string) => {
        try {
          return await this.authorizationService.canManageRole(context, roleId);
        } catch (error) {
          logger.error('Role management check helper error', { error, roleId });
          return false;
        }
      };
    } catch (error) {
      logger.error('Authorization helpers middleware error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });
    }
  }

  private buildAuthorizationContext(
    request: FastifyRequest
  ): AuthorizationContext {
    if (!request.user) {
      throw new Error('User not authenticated');
    }

    return {
      userId: request.user.id,
      roles: request.user.roles || [],
      permissions: request.user.permissions || [],
      sessionId: request.user.sessionId || undefined,
      ipAddress: request.ip || undefined,
      userAgent: request.headers['user-agent'] || undefined,
      deviceFingerprint: request.user.deviceFingerprint || undefined,
      riskScore: request.user.riskScore || undefined,
      additionalContext: {
        correlationId: request.correlationId,
        timestamp: new Date(),
      },
    };
  }

  private handleAuthorizationFailure(
    request: FastifyRequest,
    reply: FastifyReply,
    reason: string,
    config: AuthorizationConfig
  ): void {
    logger.warn('Authorization failed', {
      correlationId: request.correlationId,
      userId: request.user?.id,
      resource: config.resource,
      action: config.action,
      reason,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    if (config.onAuthorizationFailure) {
      config.onAuthorizationFailure(request, reply, reason);
      return;
    }

    reply.status(403).send({
      code: 'AUTHORIZATION_FAILED',
      error: 'Forbidden',
      message: 'Insufficient permissions',
      statusCode: 403,
      details: {
        reason,
        requiredResource: config.resource,
        requiredAction: config.action,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private handleRoleFailure(
    request: FastifyRequest,
    reply: FastifyReply,
    reason: string,
    config: RequireRoleConfig
  ): void {
    logger.warn('Role check failed', {
      correlationId: request.correlationId,
      userId: request.user?.id,
      requiredRoles: config.roles,
      userRoles: request.user?.roles,
      reason,
      ip: request.ip,
    });

    reply.status(403).send({
      code: 'ROLE_REQUIRED',
      error: 'Forbidden',
      message: 'Required role not found',
      statusCode: 403,
      details: {
        reason,
        requiredRoles: config.roles,
        requireAll: config.requireAll,
        timestamp: new Date().toISOString(),
      },
    });
  }

  private handleAdminFailure(
    request: FastifyRequest,
    reply: FastifyReply,
    reason: string
  ): void {
    logger.warn('Admin check failed', {
      correlationId: request.correlationId,
      userId: request.user?.id,
      reason,
      ip: request.ip,
    });

    reply.status(403).send({
      code: 'ADMIN_REQUIRED',
      error: 'Forbidden',
      message: 'Administrator access required',
      statusCode: 403,
      details: {
        reason,
        timestamp: new Date().toISOString(),
      },
    });
  }
}

// Export pre-configured middleware instances
export const createAuthorizationMiddleware = (
  authorizationService: AuthorizationService
) => {
  return new AuthorizationMiddleware(authorizationService);
};

// Common middleware configurations (Plugin style - for registration)
export const requireUserRead = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermission({
    resource: 'users',
    action: 'read',
  });

export const requireUserWrite = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermission({
    resource: 'users',
    action: 'write',
  });

export const requireRoleRead = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermission({
    resource: 'roles',
    action: 'read',
  });

export const requireRoleWrite = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermission({
    resource: 'roles',
    action: 'write',
  });

export const requirePermissionRead = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermission({
    resource: 'permissions',
    action: 'read',
  });

export const requirePermissionWrite = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermission({
    resource: 'permissions',
    action: 'write',
  });

export const requireAdminRole = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requireRole({
    roles: ['admin'],
  });

export const requireModeratorOrAdmin = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requireRole({
    roles: ['moderator', 'admin'],
    requireAll: false,
  });

// Common middleware configurations (Handler style - for preHandler arrays)
export const requireUserReadHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermissionHandler({
    resource: 'users',
    action: 'read',
  });

export const requireUserWriteHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermissionHandler({
    resource: 'users',
    action: 'write',
  });

export const requireRoleReadHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermissionHandler({
    resource: 'roles',
    action: 'read',
  });

export const requireRoleWriteHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermissionHandler({
    resource: 'roles',
    action: 'write',
  });

export const requirePermissionReadHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermissionHandler({
    resource: 'permissions',
    action: 'read',
  });

export const requirePermissionWriteHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requirePermissionHandler({
    resource: 'permissions',
    action: 'write',
  });

export const requireAdminRoleHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requireRoleHandler({
    roles: ['admin'],
  });

export const requireModeratorOrAdminHandler = (authService: AuthorizationService) =>
  createAuthorizationMiddleware(authService).requireRoleHandler({
    roles: ['moderator', 'admin'],
    requireAll: false,
  });
