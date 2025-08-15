/**
 * Role Management Service Implementation
 * Provides role-based access control with hierarchical permissions
 */

import { Logger } from 'winston';
import { Permission } from '../../domain/entities/permission';
import { PrismaRoleRepository } from '../../infrastructure/database/repositories/prisma-role-repository';
import { PrismaPermissionRepository } from '../../infrastructure/database/repositories/prisma-permission-repository';
import {
  IRoleManagementService,
  CreateRoleData,
  UpdateRoleData,
  RoleFilters,
  RoleHierarchy,
} from '../interfaces/role-management.interface';
import { RoleWithPermissions } from '../interfaces/role-repository.interface';

export class RoleManagementService implements IRoleManagementService {
  constructor(
    private roleRepository: PrismaRoleRepository,
    private permissionRepository: PrismaPermissionRepository,
    private logger: Logger
  ) {}

  async createRole(
    data: CreateRoleData,
    createdBy?: string
  ): Promise<RoleWithPermissions> {
    try {
      this.logger.info('Creating new role', { name: data.name, createdBy });

      // Create the role
      const roleData: { name: string; description?: string } = {
        name: data.name,
      };
      
      if (data.description !== undefined) {
        roleData.description = data.description;
      }
      
      const role = await this.roleRepository.create(roleData);

      // Add permissions if specified
      const permissions: Permission[] = [];
      if (data.permissions && data.permissions.length > 0) {
        for (const permissionId of data.permissions) {
          await this.roleRepository.addPermission(role.id, permissionId);
          const permission =
            await this.permissionRepository.findById(permissionId);
          if (permission) {
            permissions.push(permission);
          }
        }
      }

      this.logger.info('Role created successfully', {
        roleId: role.id,
        name: role.name,
        permissionsCount: permissions.length,
      });

      return {
        ...role,
        permissions,
      } as RoleWithPermissions;
    } catch (error) {
      this.logger.error('Failed to create role', { error, data, createdBy });
      throw error;
    }
  }

  async getRoleById(
    id: string,
    includePermissions = true
  ): Promise<RoleWithPermissions | null> {
    try {
      return await this.roleRepository.findById(id, includePermissions);
    } catch (error) {
      this.logger.error('Failed to get role by ID', { error, id });
      throw error;
    }
  }

  async getRoleByName(
    name: string,
    includePermissions = true
  ): Promise<RoleWithPermissions | null> {
    try {
      return await this.roleRepository.findByName(name, includePermissions);
    } catch (error) {
      this.logger.error('Failed to get role by name', { error, name });
      throw error;
    }
  }

  async updateRole(
    id: string,
    data: UpdateRoleData,
    updatedBy?: string
  ): Promise<RoleWithPermissions> {
    try {
      this.logger.info('Updating role', { roleId: id, updatedBy });

      await this.roleRepository.update(id, data);
      const roleWithPermissions = await this.roleRepository.findById(id, true);

      if (!roleWithPermissions) {
        throw new Error('Role not found after update');
      }

      this.logger.info('Role updated successfully', { roleId: id });
      return roleWithPermissions;
    } catch (error) {
      this.logger.error('Failed to update role', {
        error,
        id,
        data,
        updatedBy,
      });
      throw error;
    }
  }

  async deleteRole(id: string, deletedBy?: string): Promise<void> {
    try {
      this.logger.info('Deleting role', { roleId: id, deletedBy });

      // Check if it's a system role
      const isSystem = await this.roleRepository.isSystemRole(id);
      if (isSystem) {
        throw new Error('Cannot delete system role');
      }

      // Check if role is in use
      const userCount = await this.roleRepository.getUserCount(id);
      if (userCount > 0) {
        throw new Error(
          `Cannot delete role: ${userCount} users are assigned to this role`
        );
      }

      await this.roleRepository.delete(id);

      this.logger.info('Role deleted successfully', { roleId: id });
    } catch (error) {
      this.logger.error('Failed to delete role', { error, id, deletedBy });
      throw error;
    }
  }

  async getRoles(
    filters: RoleFilters
  ): Promise<{ roles: RoleWithPermissions[]; total: number }> {
    try {
      return await this.roleRepository.findMany(filters);
    } catch (error) {
      this.logger.error('Failed to get roles', { error, filters });
      throw error;
    }
  }

  async searchRoles(query: string, limit = 10): Promise<RoleWithPermissions[]> {
    try {
      return await this.roleRepository.search(query, limit);
    } catch (error) {
      this.logger.error('Failed to search roles', { error, query });
      throw error;
    }
  }

  async addPermissionToRole(
    roleId: string,
    permissionId: string,
    addedBy?: string
  ): Promise<void> {
    try {
      this.logger.info('Adding permission to role', {
        roleId,
        permissionId,
        addedBy,
      });

      // Check if permission already exists
      const hasPermission = await this.roleRepository.hasPermission(
        roleId,
        permissionId
      );
      if (hasPermission) {
        throw new Error('Permission already assigned to role');
      }

      await this.roleRepository.addPermission(roleId, permissionId);

      this.logger.info('Permission added to role successfully', {
        roleId,
        permissionId,
      });
    } catch (error) {
      this.logger.error('Failed to add permission to role', {
        error,
        roleId,
        permissionId,
        addedBy,
      });
      throw error;
    }
  }

  async removePermissionFromRole(
    roleId: string,
    permissionId: string,
    removedBy?: string
  ): Promise<void> {
    try {
      this.logger.info('Removing permission from role', {
        roleId,
        permissionId,
        removedBy,
      });

      await this.roleRepository.removePermission(roleId, permissionId);

      this.logger.info('Permission removed from role successfully', {
        roleId,
        permissionId,
      });
    } catch (error) {
      this.logger.error('Failed to remove permission from role', {
        error,
        roleId,
        permissionId,
        removedBy,
      });
      throw error;
    }
  }

  async getRolePermissions(roleId: string): Promise<Permission[]> {
    try {
      return await this.roleRepository.getRolePermissions(roleId);
    } catch (error) {
      this.logger.error('Failed to get role permissions', { error, roleId });
      throw error;
    }
  }

  async getRoleHierarchy(): Promise<RoleHierarchy[]> {
    try {
      const hierarchyData = await this.roleRepository.getRoleHierarchy();

      // Convert to RoleHierarchy structure
      const hierarchies: RoleHierarchy[] = hierarchyData.map((item) => ({
        role: item.role,
        level: item.level,
        children: [], // Would be populated based on actual hierarchy relationships
        // parent property is omitted when undefined
      }));

      // Sort by hierarchy level (highest first)
      return hierarchies.sort((a, b) => b.level - a.level);
    } catch (error) {
      this.logger.error('Failed to get role hierarchy', { error });
      throw error;
    }
  }

  async getRolesByHierarchyLevel(
    minLevel?: number,
    maxLevel?: number
  ): Promise<RoleWithPermissions[]> {
    try {
      const allRoles = await this.roleRepository.findMany({});

      let filteredRoles = allRoles.roles;

      if (minLevel !== undefined) {
        filteredRoles = filteredRoles.filter((role) => {
          const roleEntity = role as any;
          return roleEntity.getHierarchyLevel() >= minLevel;
        });
      }

      if (maxLevel !== undefined) {
        filteredRoles = filteredRoles.filter((role) => {
          const roleEntity = role as any;
          return roleEntity.getHierarchyLevel() <= maxLevel;
        });
      }

      return filteredRoles;
    } catch (error) {
      this.logger.error('Failed to get roles by hierarchy level', {
        error,
        minLevel,
        maxLevel,
      });
      throw error;
    }
  }

  async canRoleBeAssignedBy(
    roleId: string,
    assignerRoleIds: string[]
  ): Promise<boolean> {
    try {
      const role = await this.roleRepository.findById(roleId, true);
      if (!role) return false;

      // System roles require special permissions
      if (await this.roleRepository.isSystemRole(roleId)) {
        // Check if assigner has admin role
        for (const assignerRoleId of assignerRoleIds) {
          const assignerRole = await this.roleRepository.findById(
            assignerRoleId,
            true
          );
          if (assignerRole && (assignerRole as any).isAdminRole()) {
            return true;
          }
        }
        return false;
      }

      // For non-system roles, check hierarchy levels
      const roleLevel = (role as any).getHierarchyLevel();

      for (const assignerRoleId of assignerRoleIds) {
        const assignerRole = await this.roleRepository.findById(
          assignerRoleId,
          true
        );
        if (assignerRole) {
          const assignerLevel = (assignerRole as any).getHierarchyLevel();
          if (assignerLevel > roleLevel) {
            return true;
          }
        }
      }

      return false;
    } catch (error) {
      this.logger.error('Failed to check role assignment permission', {
        error,
        roleId,
        assignerRoleIds,
      });
      throw error;
    }
  }

  async getSystemRoles(): Promise<RoleWithPermissions[]> {
    try {
      return await this.roleRepository.findSystemRoles();
    } catch (error) {
      this.logger.error('Failed to get system roles', { error });
      throw error;
    }
  }

  async createSystemRole(data: CreateRoleData): Promise<RoleWithPermissions> {
    try {
      this.logger.info('Creating system role', { name: data.name });

      // Validate system role name
      const systemRoleNames = ['admin', 'user', 'guest', 'moderator'];
      if (!systemRoleNames.includes(data.name.toLowerCase())) {
        throw new Error('Invalid system role name');
      }

      return await this.createRole(data, 'system');
    } catch (error) {
      this.logger.error('Failed to create system role', { error, data });
      throw error;
    }
  }

  async isSystemRole(roleId: string): Promise<boolean> {
    try {
      return await this.roleRepository.isSystemRole(roleId);
    } catch (error) {
      this.logger.error('Failed to check if role is system role', {
        error,
        roleId,
      });
      throw error;
    }
  }

  async validateRoleAssignment(
    userId: string,
    roleId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    conflicts?: string[];
  }> {
    try {
      const role = await this.roleRepository.findById(roleId, true);
      if (!role) {
        return {
          valid: false,
          reason: 'Role not found',
        };
      }

      // Check if role can be assigned
      if (!(role as any).canBeAssigned()) {
        return {
          valid: false,
          reason: 'Role cannot be assigned to users',
        };
      }

      // Additional validation logic could be added here
      // For example, checking for conflicting roles, user limits, etc.

      return {
        valid: true,
      };
    } catch (error) {
      this.logger.error('Failed to validate role assignment', {
        error,
        userId,
        roleId,
      });
      return {
        valid: false,
        reason: 'Validation error occurred',
      };
    }
  }

  async getRoleStats(): Promise<{
    total: number;
    systemRoles: number;
    adminRoles: number;
    averagePermissions: number;
    mostUsedRoles: Array<{ roleId: string; name: string; userCount: number }>;
  }> {
    try {
      return await this.roleRepository.getStats();
    } catch (error) {
      this.logger.error('Failed to get role stats', { error });
      throw error;
    }
  }
}
