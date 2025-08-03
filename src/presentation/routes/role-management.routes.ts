/**
 * Role Management Routes
 * Defines API endpoints for role management
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { RoleManagementController } from '../controllers/role-management.controller';
import { createAuthorizationMiddleware } from '../../infrastructure/server/middleware/authorization';
import { AuthorizationService } from '../../application/services/authorization.service';
import { validate } from '../middleware/validation.middleware';
import {
  CreateRoleSchema,
  UpdateRoleSchema,
  RoleQuerySchema,
  RoleSearchSchema,
  PermissionAssignmentSchema,
  RoleValidationSchema,
} from '../schemas/role-management.schemas';

export interface RoleManagementRoutesOptions extends FastifyPluginOptions {
  roleManagementController: RoleManagementController;
  authorizationService: AuthorizationService;
}

export async function roleManagementRoutes(
  fastify: FastifyInstance,
  options: RoleManagementRoutesOptions
): Promise<void> {
  const { roleManagementController, authorizationService } = options;
  const authMiddleware = createAuthorizationMiddleware(authorizationService);

  // Add authorization helpers to all routes
  await fastify.register(authMiddleware.addAuthorizationHelpers());

  // Role CRUD operations
  fastify.post('/roles', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'create',
      }),
      validate({ body: CreateRoleSchema }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Create a new role',
      body: {
        type: 'object',
        required: ['name'],
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 50 },
          description: { type: 'string', maxLength: 500 },
          permissions: {
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
                name: { type: 'string' },
                description: { type: 'string' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                permissions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      resource: { type: 'string' },
                      action: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
                isSystemRole: { type: 'boolean' },
                isAdminRole: { type: 'boolean' },
                hierarchyLevel: { type: 'number' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: roleManagementController.createRole.bind(roleManagementController),
  });

  fastify.get('/roles/:roleId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'read',
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Get role by ID',
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      querystring: {
        type: 'object',
        properties: {
          includePermissions: { type: 'string', enum: ['true', 'false'] },
        },
      },
    },
    handler: roleManagementController.getRoleById.bind(
      roleManagementController
    ),
  });

  fastify.put('/roles/:roleId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'update',
        context: (request) => ({
          targetRoleId: (request.params as any).roleId,
        }),
      }),
      validate({ body: UpdateRoleSchema }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Update role',
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      body: {
        type: 'object',
        properties: {
          name: { type: 'string', minLength: 2, maxLength: 50 },
          description: { type: 'string', maxLength: 500 },
        },
      },
    },
    handler: roleManagementController.updateRole.bind(roleManagementController),
  });

  fastify.delete('/roles/:roleId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'delete',
        context: (request) => ({
          targetRoleId: (request.params as any).roleId,
        }),
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Delete role',
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
    },
    handler: roleManagementController.deleteRole.bind(roleManagementController),
  });

  // Role listing and search
  fastify.get('/roles', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'list',
      }),
      validate({ querystring: RoleQuerySchema }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Get roles with filters',
      querystring: {
        type: 'object',
        properties: {
          search: { type: 'string' },
          isSystemRole: { type: 'string', enum: ['true', 'false'] },
          isAdminRole: { type: 'string', enum: ['true', 'false'] },
          hasPermission: { type: 'string' },
          createdAfter: { type: 'string', format: 'date-time' },
          createdBefore: { type: 'string', format: 'date-time' },
          limit: { type: 'integer', minimum: 1, maximum: 100 },
          offset: { type: 'integer', minimum: 0 },
          sortBy: {
            type: 'string',
            enum: ['name', 'createdAt', 'permissionCount', 'hierarchyLevel'],
          },
          sortOrder: { type: 'string', enum: ['asc', 'desc'] },
        },
      },
    },
    handler: roleManagementController.getRoles.bind(roleManagementController),
  });

  fastify.get('/roles/search', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'search',
      }),
      validate({ querystring: RoleSearchSchema }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Search roles',
      querystring: {
        type: 'object',
        properties: {
          query: { type: 'string', minLength: 2 },
          limit: { type: 'integer', minimum: 1, maximum: 50 },
        },
        required: ['query'],
      },
    },
    handler: roleManagementController.searchRoles.bind(
      roleManagementController
    ),
  });

  // Permission management for roles
  fastify.post('/roles/:roleId/permissions', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'manage_permissions',
        context: (request) => ({
          targetRoleId: (request.params as any).roleId,
          permissionId: (request.body as any)?.permissionId,
        }),
      }),
      validate({ body: PermissionAssignmentSchema }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Add permission to role',
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
      body: {
        type: 'object',
        properties: {
          permissionId: { type: 'string' },
        },
        required: ['permissionId'],
      },
    },
    handler: roleManagementController.addPermissionToRole.bind(
      roleManagementController
    ),
  });

  fastify.delete('/roles/:roleId/permissions/:permissionId', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'manage_permissions',
        context: (request) => ({
          targetRoleId: (request.params as any).roleId,
          permissionId: (request.params as any).permissionId,
        }),
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Remove permission from role',
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
          permissionId: { type: 'string' },
        },
        required: ['roleId', 'permissionId'],
      },
    },
    handler: roleManagementController.removePermissionFromRole.bind(
      roleManagementController
    ),
  });

  fastify.get('/roles/:roleId/permissions', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'read',
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Get role permissions',
      params: {
        type: 'object',
        properties: {
          roleId: { type: 'string' },
        },
        required: ['roleId'],
      },
    },
    handler: roleManagementController.getRolePermissions.bind(
      roleManagementController
    ),
  });

  // Role hierarchy and system roles
  fastify.get('/roles/hierarchy', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'read_hierarchy',
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Get role hierarchy',
    },
    handler: roleManagementController.getRoleHierarchy.bind(
      roleManagementController
    ),
  });

  fastify.get('/roles/system', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'read_system',
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Get system roles',
    },
    handler: roleManagementController.getSystemRoles.bind(
      roleManagementController
    ),
  });

  // Role validation
  fastify.post('/roles/validate-assignment', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'validate',
      }),
      validate({ body: RoleValidationSchema }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Validate role assignment',
      body: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          roleId: { type: 'string' },
        },
        required: ['userId', 'roleId'],
      },
    },
    handler: roleManagementController.validateRoleAssignment.bind(
      roleManagementController
    ),
  });

  // Statistics
  fastify.get('/roles/stats', {
    preHandler: [
      authMiddleware.requirePermission({
        resource: 'roles',
        action: 'stats',
      }),
    ],
    schema: {
      tags: ['Role Management'],
      summary: 'Get role statistics',
    },
    handler: roleManagementController.getRoleStats.bind(
      roleManagementController
    ),
  });
}
