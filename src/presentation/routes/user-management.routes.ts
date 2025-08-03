/**
 * User Management Routes
 * Defines API endpoints for user and role management
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { UserManagementController } from '../controllers/user-management.controller';
import { createAuthorizationMiddleware } from '../../infrastructure/server/middleware/authorization';
import { AuthorizationService } from '../../application/services/authorization.service';
import { validate } from '../middleware/validation.middleware';
import {
  CreateUserSchema,
  UpdateUserSchema,
  UserQuerySchema,
  UserSearchSchema,
  RoleAssignmentSchema,
  BulkCreateUsersSchema,
  UserLockSchema,
  UserExportQuerySchema,
} from '../schemas/user-management.schemas';

export interface UserManagementRoutesOptions extends FastifyPluginOptions {
  userManagementController: UserManagementController;
  authorizationService: AuthorizationService;
}

export async function userManagementRoutes(
  fastify: FastifyInstance,
  options: UserManagementRoutesOptions
): Promise<void> {
  const { userManagementController, authorizationService } = options;
  const authMiddleware = createAuthorizationMiddleware(authorizationService);

  // Add authorization helpers to all routes
  await fastify.register(authMiddleware.addAuthorizationHelpers());

  // User CRUD operations
  fastify.post('/users', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'create',
      }),
      validate({ body: CreateUserSchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Create a new user',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
          name: { type: 'string' },
          image: { type: 'string', format: 'uri' },
          password: { type: 'string', minLength: 8 },
          emailVerified: { type: 'boolean' },
          roles: {
            type: 'array',
            items: { type: 'string' },
          },
        },
      },
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                email: { type: 'string' },
                name: { type: 'string' },
                emailVerified: { type: 'boolean' },
                mfaEnabled: { type: 'boolean' },
                createdAt: { type: 'string', format: 'date-time' },
                roles: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                permissions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      resource: { type: 'string' },
                      action: { type: 'string' },
                    },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: userManagementController.createUser.bind(userManagementController),
  });

  fastify.get('/users/:userId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'read',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
        }),
      }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Get user by ID',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
      querystring: {
        type: 'object',
        properties: {
          includeRelations: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
    handler: userManagementController.getUserById.bind(
      userManagementController
    ),
  });

  fastify.put('/users/:userId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'update',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
        }),
      }),
      validate({ body: UpdateUserSchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Update user',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          image: { type: 'string', format: 'uri' },
          email: { type: 'string', format: 'email' },
          emailVerified: { type: 'boolean' },
          mfaEnabled: { type: 'boolean' },
        },
      },
    },
    handler: userManagementController.updateUser.bind(userManagementController),
  });

  fastify.delete('/users/:userId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'delete',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
        }),
      }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Delete user',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
    },
    handler: userManagementController.deleteUser.bind(userManagementController),
  });

  // User listing and search
  fastify.get('/users', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'list',
      }),
      validate({ querystring: UserQuerySchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Get users with filters',
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          mfaEnabled: { type: 'string', enum: ['true', 'false'] },
          locked: { type: 'string', enum: ['true', 'false'] },
          emailVerified: { type: 'string', enum: ['true', 'false'] },
          roles: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          createdAfter: { type: 'string', format: 'date-time' },
          createdBefore: { type: 'string', format: 'date-time' },
          riskScoreMin: { type: 'number', minimum: 0, maximum: 100 },
          riskScoreMax: { type: 'number', minimum: 0, maximum: 100 },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          offset: { type: 'integer', minimum: 0 },
          sortBy: {
            type: 'string',
            enum: ['createdAt', 'lastLoginAt', 'email', 'name', 'riskScore'],
          },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    handler: userManagementController.getUsers.bind(userManagementController),
  });

  fastify.get('/users/search', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'search',
      }),
      validate({ querystring: UserSearchSchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Search users',
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2 },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['query'],
      },
    },
    handler: userManagementController.searchUsers.bind(
      userManagementController
    ),
  });

  // Role assignment
  fastify.post('/users/:userId/roles', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'assign_role',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
          roleId: (request.body as any)?.roleId,
        }),
      }),
      validate({ body: RoleAssignmentSchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Assign role to user',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
      body: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
    },
    handler: userManagementController.assignRole.bind(userManagementController),
  });

  fastify.delete('/users/:userId/roles/:roleId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'remove_role',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
          roleId: (request.params as any).roleId,
        }),
      }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Remove role from user',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          roleId: { type: 'string' },
        },
        required: ['userId', 'roleId'],
      },
    },
    handler: userManagementController.removeRole.bind(userManagementController),
  });

  // Bulk operations
  fastify.post('/users/bulk', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'bulk_create',
      }),
      validate({ body: BulkCreateUsersSchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Bulk create users',
      body: {
        type: 'object',
        properties: {
          users: {
            type: 'array',
            items: {
              type: 'object',
              required: ['email'],
              properties: {
                email: { type: 'string', format: 'email' },
                name: { type: 'string' },
                image: { type: 'string', format: 'uri' },
                password: { type: 'string', minLength: 8 },
                emailVerified: { type: 'boolean' },
                roles: {
                  type: 'array',
                  items: { type: 'string' },
                },
              },
            },
          },
        },
        required: ['users'],
      },
    },
    handler: userManagementController.bulkCreateUsers.bind(
      userManagementController
    ),
  });

  // Export/Import
  fastify.get('/users/export', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'export',
      }),
      validate({ querystring: UserExportQuerySchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Export users',
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          mfaEnabled: { type: 'string', enum: ['true', 'false'] },
          locked: { type: 'string', enum: ['true', 'false'] },
          emailVerified: { type: 'string', enum: ['true', 'false'] },
          roles: {
            oneOf: [
              { type: 'string' },
              { type: 'array', items: { type: 'string' } },
            ],
          },
          createdAfter: { type: 'string', format: 'date-time' },
          createdBefore: { type: 'string', format: 'date-time' },
        },
      },
    },
    handler: userManagementController.exportUsers.bind(
      userManagementController
    ),
  });

  // User security operations
  fastify.post('/users/:userId/lock', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'lock',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
        }),
      }),
      validate({ body: UserLockSchema }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Lock user account',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
      body: {
        type: 'object',
        properties: {
          reason: { type: 'string' },
        },
        required: ['reason'],
      },
    },
    handler: userManagementController.lockUser.bind(userManagementController),
  });

  fastify.post('/users/:userId/unlock', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'unlock',
        context: (request) => ({
          targetUserId: (request.params as any).userId,
        }),
      }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Unlock user account',
      params: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
        },
        required: ['userId'],
      },
    },
    handler: userManagementController.unlockUser.bind(userManagementController),
  });

  // Statistics
  fastify.get('/users/stats', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'users',
        action: 'stats',
      }),
    ],
    schema: {
      tags: ['User Management'],
      summary: 'Get user statistics',
    },
    handler: userManagementController.getUserStats.bind(
      userManagementController
    ),
  });
}
