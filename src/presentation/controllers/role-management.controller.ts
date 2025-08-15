/**
 * Role Management Controller
 * Provides administrative interfaces for role management
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { RoleManagementService } from '../../application/services/role-management.service';
import { logger } from '../../infrastructure/logging/winston-logger';
import {
  CreateRoleData,
  UpdateRoleData,
  RoleFilters,
} from '../../application/interfaces/role-management.interface';

export class RoleManagementController {
  constructor(private roleManagementService: RoleManagementService) {}

  /**
   * Create a new role
   */
  async createRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const data = request.body as CreateRoleData;
      const createdBy = request.user?.id;

      const role = await this.roleManagementService.createRole(data, createdBy);

      logger.info('Role created via API', {
        correlationId: request.correlationId,
        roleId: role.id,
        name: role.name,
        createdBy,
      });

      reply.status(201).send({
        success: true,
        data: {
          id: role.id,
          name: role.name,
          description: role.description,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
          permissions: role.permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            resource: permission.resource,
            action: permission.action,
            description: permission.getDescription(),
          })),
          isSystemRole: (role as any).isSystemRole(),
          isAdminRole: (role as any).isAdminRole(),
          hierarchyLevel: (role as any).getHierarchyLevel(),
        },
        message: 'Role created successfully',
      });
    } catch (error) {
      logger.error('Failed to create role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: 'ROLE_CREATION_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to create role',
      });
    }
  }

  /**
   * Get role by ID
   */
  async getRoleById(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { roleId } = request.params as { roleId: string };
      const includePermissions =
        (request.query as any)?.includePermissions !== 'false';

      const role = await this.roleManagementService.getRoleById(
        roleId,
        includePermissions
      );

      if (!role) {
        reply.status(404).send({
          success: false,
          error: 'ROLE_NOT_FOUND',
          message: 'Role not found',
        });
        return;
      }

      reply.send({
        success: true,
        data: {
          id: role.id,
          name: role.name,
          description: role.description,
          createdAt: role.createdAt,
          updatedAt: role.updatedAt,
          permissions: role.permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            resource: permission.resource,
            action: permission.action,
            description: permission.getDescription(),
            isWildcard: permission.isWildcard(),
            isAdministrative: permission.isAdministrative(),
            scopeLevel: permission.getScopeLevel(),
          })),
          isSystemRole: (role as any).isSystemRole(),
          isAdminRole: (role as any).isAdminRole(),
          hierarchyLevel: (role as any).getHierarchyLevel(),
          canBeAssigned: (role as any).canBeAssigned(),
          summary: (role as any).getSummary(),
        },
      });
    } catch (error) {
      logger.error('Failed to get role by ID via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        roleId: (request.params as any)?.roleId,
      });

      reply.status(500).send({
        success: false,
        error: 'ROLE_FETCH_FAILED',
        message: 'Failed to fetch role',
      });
    }
  }

  /**
   * Update role
   */
  async updateRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { roleId } = request.params as { roleId: string };
      const data = request.body as UpdateRoleData;
      const updatedBy = request.user?.id;

      const role = await this.roleManagementService.updateRole(
        roleId,
        data,
        updatedBy
      );

      logger.info('Role updated via API', {
        correlationId: request.correlationId,
        roleId: role.id,
        updatedBy,
        changes: Object.keys(data),
      });

      reply.send({
        success: true,
        data: {
          id: role.id,
          name: role.name,
          description: role.description,
          updatedAt: role.updatedAt,
        },
        message: 'Role updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        roleId: (request.params as any)?.roleId,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: 'ROLE_UPDATE_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to update role',
      });
    }
  }

  /**
   * Delete role
   */
  async deleteRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { roleId } = request.params as { roleId: string };
      const deletedBy = request.user?.id;

      await this.roleManagementService.deleteRole(roleId, deletedBy);

      logger.info('Role deleted via API', {
        correlationId: request.correlationId,
        roleId,
        deletedBy,
      });

      reply.send({
        success: true,
        message: 'Role deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        roleId: (request.params as any)?.roleId,
      });

      reply.status(400).send({
        success: false,
        error: 'ROLE_DELETION_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to delete role',
      });
    }
  }

  /**
   * Get roles with filters
   */
  async getRoles(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const query = request.query as any;
      const filters: RoleFilters = {
        search: query.search,
        hasPermission: query.hasPermission,
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      };

      // Handle date filters
      if (query.createdAfter) {
        filters.createdAfter = new Date(query.createdAfter);
      }
      if (query.createdBefore) {
        filters.createdBefore = new Date(query.createdBefore);
      }

      // Handle boolean filters that need explicit true/false checks
      if (query.isSystemRole === 'true') {
        filters.isSystemRole = true;
      } else if (query.isSystemRole === 'false') {
        filters.isSystemRole = false;
      }

      if (query.isAdminRole === 'true') {
        filters.isAdminRole = true;
      } else if (query.isAdminRole === 'false') {
        filters.isAdminRole = false;
      }

      const result = await this.roleManagementService.getRoles(filters);

      reply.send({
        success: true,
        data: {
          roles: result.roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            createdAt: role.createdAt,
            updatedAt: role.updatedAt,
            permissionCount: role.permissions.length,
            isSystemRole: (role as any).isSystemRole(),
            isAdminRole: (role as any).isAdminRole(),
            hierarchyLevel: (role as any).getHierarchyLevel(),
            canBeAssigned: (role as any).canBeAssigned(),
          })),
          pagination: {
            total: result.total,
            limit: filters.limit,
            offset: filters.offset,
            hasMore:
              (filters.offset || 0) + (filters.limit || 50) < result.total,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get roles via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query: request.query,
      });

      reply.status(500).send({
        success: false,
        error: 'ROLES_FETCH_FAILED',
        message: 'Failed to fetch roles',
      });
    }
  }

  /**
   * Search roles
   */
  async searchRoles(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { query } = request.query as { query: string };
      const limit = parseInt((request.query as any).limit) || 10;

      if (!query || query.length < 2) {
        reply.status(400).send({
          success: false,
          error: 'INVALID_SEARCH_QUERY',
          message: 'Search query must be at least 2 characters long',
        });
        return;
      }

      const roles = await this.roleManagementService.searchRoles(query, limit);

      reply.send({
        success: true,
        data: roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          permissionCount: role.permissions.length,
          hierarchyLevel: (role as any).getHierarchyLevel(),
        })),
      });
    } catch (error) {
      logger.error('Failed to search roles via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query: request.query,
      });

      reply.status(500).send({
        success: false,
        error: 'ROLE_SEARCH_FAILED',
        message: 'Failed to search roles',
      });
    }
  }

  /**
   * Add permission to role
   */
  async addPermissionToRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { roleId } = request.params as { roleId: string };
      const { permissionId } = request.body as { permissionId: string };
      const addedBy = request.user?.id;

      await this.roleManagementService.addPermissionToRole(
        roleId,
        permissionId,
        addedBy
      );

      logger.info('Permission added to role via API', {
        correlationId: request.correlationId,
        roleId,
        permissionId,
        addedBy,
      });

      reply.send({
        success: true,
        message: 'Permission added to role successfully',
      });
    } catch (error) {
      logger.error('Failed to add permission to role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        roleId: (request.params as any)?.roleId,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: 'PERMISSION_ASSIGNMENT_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to add permission to role',
      });
    }
  }

  /**
   * Remove permission from role
   */
  async removePermissionFromRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { roleId, permissionId } = request.params as {
        roleId: string;
        permissionId: string;
      };
      const removedBy = request.user?.id;

      await this.roleManagementService.removePermissionFromRole(
        roleId,
        permissionId,
        removedBy
      );

      logger.info('Permission removed from role via API', {
        correlationId: request.correlationId,
        roleId,
        permissionId,
        removedBy,
      });

      reply.send({
        success: true,
        message: 'Permission removed from role successfully',
      });
    } catch (error) {
      logger.error('Failed to remove permission from role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        roleId: (request.params as any)?.roleId,
        permissionId: (request.params as any)?.permissionId,
      });

      reply.status(400).send({
        success: false,
        error: 'PERMISSION_REMOVAL_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to remove permission from role',
      });
    }
  }

  /**
   * Get role permissions
   */
  async getRolePermissions(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { roleId } = request.params as { roleId: string };

      const permissions =
        await this.roleManagementService.getRolePermissions(roleId);

      reply.send({
        success: true,
        data: permissions.map((permission) => ({
          id: permission.id,
          name: permission.name,
          resource: permission.resource,
          action: permission.action,
          description: permission.getDescription(),
          isWildcard: permission.isWildcard(),
          isAdministrative: permission.isAdministrative(),
          scopeLevel: permission.getScopeLevel(),
          conditions: permission.conditions,
        })),
      });
    } catch (error) {
      logger.error('Failed to get role permissions via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        roleId: (request.params as any)?.roleId,
      });

      reply.status(500).send({
        success: false,
        error: 'ROLE_PERMISSIONS_FETCH_FAILED',
        message: 'Failed to fetch role permissions',
      });
    }
  }

  /**
   * Get role hierarchy
   */
  async getRoleHierarchy(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const hierarchy = await this.roleManagementService.getRoleHierarchy();

      reply.send({
        success: true,
        data: hierarchy.map((item) => ({
          role: {
            id: item.role.id,
            name: item.role.name,
            description: item.role.description,
          },
          level: item.level,
          children: item.children.map((child) => ({
            id: child.role.id,
            name: child.role.name,
            level: child.level,
          })),
          parent: item.parent
            ? {
                id: item.parent.role.id,
                name: item.parent.role.name,
                level: item.parent.level,
              }
            : undefined,
        })),
      });
    } catch (error) {
      logger.error('Failed to get role hierarchy via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'ROLE_HIERARCHY_FETCH_FAILED',
        message: 'Failed to fetch role hierarchy',
      });
    }
  }

  /**
   * Get system roles
   */
  async getSystemRoles(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const roles = await this.roleManagementService.getSystemRoles();

      reply.send({
        success: true,
        data: roles.map((role) => ({
          id: role.id,
          name: role.name,
          description: role.description,
          createdAt: role.createdAt,
          permissions: role.permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            resource: permission.resource,
            action: permission.action,
          })),
          hierarchyLevel: (role as any).getHierarchyLevel(),
        })),
      });
    } catch (error) {
      logger.error('Failed to get system roles via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'SYSTEM_ROLES_FETCH_FAILED',
        message: 'Failed to fetch system roles',
      });
    }
  }

  /**
   * Validate role assignment
   */
  async validateRoleAssignment(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId, roleId } = request.body as {
        userId: string;
        roleId: string;
      };

      const validation =
        await this.roleManagementService.validateRoleAssignment(userId, roleId);

      reply.send({
        success: true,
        data: validation,
      });
    } catch (error) {
      logger.error('Failed to validate role assignment via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        body: request.body,
      });

      reply.status(500).send({
        success: false,
        error: 'ROLE_VALIDATION_FAILED',
        message: 'Failed to validate role assignment',
      });
    }
  }

  /**
   * Get role statistics
   */
  async getRoleStats(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const stats = await this.roleManagementService.getRoleStats();

      reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get role stats via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'ROLE_STATS_FAILED',
        message: 'Failed to fetch role statistics',
      });
    }
  }
}
