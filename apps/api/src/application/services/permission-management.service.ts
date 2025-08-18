/**
 * Permission Management Service Implementation
 * Provides permission management for RBAC system
 */

import { Logger } from 'winston';
import { Permission } from "@company/shared"entities/permission';
import { PrismaPermissionRepository } from '@company/database';
import {
  IPermissionManagementService,
  CreatePermissionData,
  UpdatePermissionData,
  PermissionFilters,
  PermissionCheck,
  PermissionCheckResult,
} from '../interfaces/permission-management.interface';

export class PermissionManagementService
  implements IPermissionManagementService
{
  constructor(
    private permissionRepository: PrismaPermissionRepository,
    private logger: Logger
  ) {}

  async createPermission(
    data: CreatePermissionData,
    createdBy?: string
  ): Promise<Permission> {
    try {
      this.logger.info('Creating new permission', {
        name: data.name,
        resource: data.resource,
        action: data.action,
        createdBy,
      });

      // Validate permission data
      const validation = await this.validatePermission(data);
      if (!validation.valid) {
        throw new Error(
          `Permission validation failed: ${validation.errors.join(', ')}`
        );
      }

      const permission = await this.permissionRepository.create(data);

      this.logger.info('Permission created successfully', {
        permissionId: permission.id,
        name: permission.name,
      });

      return permission;
    } catch (error) {
      this.logger.error('Failed to create permission', {
        error,
        data,
        createdBy,
      });
      throw error;
    }
  }

  async getPermissionById(id: string): Promise<Permission | null> {
    try {
      return await this.permissionRepository.findById(id);
    } catch (error) {
      this.logger.error('Failed to get permission by ID', { error, id });
      throw error;
    }
  }

  async getPermissionByName(name: string): Promise<Permission | null> {
    try {
      return await this.permissionRepository.findByName(name);
    } catch (error) {
      this.logger.error('Failed to get permission by name', { error, name });
      throw error;
    }
  }

  async updatePermission(
    id: string,
    data: UpdatePermissionData,
    updatedBy?: string
  ): Promise<Permission> {
    try {
      this.logger.info('Updating permission', { permissionId: id, updatedBy });

      // Validate permission data
      const validation = await this.validatePermission(data);
      if (!validation.valid) {
        throw new Error(
          `Permission validation failed: ${validation.errors.join(', ')}`
        );
      }

      const permission = await this.permissionRepository.update(id, data);

      this.logger.info('Permission updated successfully', { permissionId: id });
      return permission;
    } catch (error) {
      this.logger.error('Failed to update permission', {
        error,
        id,
        data,
        updatedBy,
      });
      throw error;
    }
  }

  async deletePermission(id: string, deletedBy?: string): Promise<void> {
    try {
      this.logger.info('Deleting permission', { permissionId: id, deletedBy });

      // Check if it's a system permission
      const isSystem = await this.permissionRepository.isSystemPermission(id);
      if (isSystem) {
        throw new Error('Cannot delete system permission');
      }

      // Check if permission is in use
      const roleCount = await this.permissionRepository.getRoleCount(id);
      if (roleCount > 0) {
        throw new Error(
          `Cannot delete permission: ${roleCount} roles are using this permission`
        );
      }

      await this.permissionRepository.delete(id);

      this.logger.info('Permission deleted successfully', { permissionId: id });
    } catch (error) {
      this.logger.error('Failed to delete permission', {
        error,
        id,
        deletedBy,
      });
      throw error;
    }
  }

  async getPermissions(
    filters: PermissionFilters
  ): Promise<{ permissions: Permission[]; total: number }> {
    try {
      return await this.permissionRepository.findMany(filters);
    } catch (error) {
      this.logger.error('Failed to get permissions', { error, filters });
      throw error;
    }
  }

  async searchPermissions(query: string, limit = 10): Promise<Permission[]> {
    try {
      return await this.permissionRepository.search(query, limit);
    } catch (error) {
      this.logger.error('Failed to search permissions', { error, query });
      throw error;
    }
  }

  async getResources(): Promise<string[]> {
    try {
      return await this.permissionRepository.getResources();
    } catch (error) {
      this.logger.error('Failed to get resources', { error });
      throw error;
    }
  }

  async getActions(): Promise<string[]> {
    try {
      return await this.permissionRepository.getActions();
    } catch (error) {
      this.logger.error('Failed to get actions', { error });
      throw error;
    }
  }

  async getResourceActions(resource: string): Promise<string[]> {
    try {
      return await this.permissionRepository.getResourceActions(resource);
    } catch (error) {
      this.logger.error('Failed to get resource actions', { error, resource });
      throw error;
    }
  }

  async getPermissionsByResource(resource: string): Promise<Permission[]> {
    try {
      return await this.permissionRepository.findByResource(resource);
    } catch (error) {
      this.logger.error('Failed to get permissions by resource', {
        error,
        resource,
      });
      throw error;
    }
  }

  async getPermissionsByAction(action: string): Promise<Permission[]> {
    try {
      return await this.permissionRepository.findByAction(action);
    } catch (error) {
      this.logger.error('Failed to get permissions by action', {
        error,
        action,
      });
      throw error;
    }
  }

  async checkPermission(
    permissions: Permission[],
    check: PermissionCheck
  ): Promise<PermissionCheckResult> {
    try {
      for (const permission of permissions) {
        if (permission.matches(check.resource, check.action, check.context)) {
          return {
            allowed: true,
            permission,
            ...(check.context && { matchedConditions: check.context }),
          };
        }
      }

      return {
        allowed: false,
        reason: `No permission found for ${check.action} on ${check.resource}`,
      };
    } catch (error) {
      this.logger.error('Failed to check permission', { error, check });
      return {
        allowed: false,
        reason: 'Permission check error occurred',
      };
    }
  }

  async checkMultiplePermissions(
    permissions: Permission[],
    checks: PermissionCheck[]
  ): Promise<PermissionCheckResult[]> {
    try {
      const results: PermissionCheckResult[] = [];

      for (const check of checks) {
        const result = await this.checkPermission(permissions, check);
        results.push(result);
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to check multiple permissions', {
        error,
        checks,
      });
      throw error;
    }
  }

  async getSystemPermissions(): Promise<Permission[]> {
    try {
      return await this.permissionRepository.findSystemPermissions();
    } catch (error) {
      this.logger.error('Failed to get system permissions', { error });
      throw error;
    }
  }

  async createSystemPermission(
    data: CreatePermissionData
  ): Promise<Permission> {
    try {
      this.logger.info('Creating system permission', { name: data.name });

      return await this.createPermission(data, 'system');
    } catch (error) {
      this.logger.error('Failed to create system permission', { error, data });
      throw error;
    }
  }

  async isSystemPermission(permissionId: string): Promise<boolean> {
    try {
      return await this.permissionRepository.isSystemPermission(permissionId);
    } catch (error) {
      this.logger.error('Failed to check if permission is system permission', {
        error,
        permissionId,
      });
      throw error;
    }
  }

  async validatePermission(
    data: CreatePermissionData | UpdatePermissionData
  ): Promise<{
    valid: boolean;
    errors: string[];
  }> {
    try {
      const errors: string[] = [];

      // Validate name
      if (data.name !== undefined) {
        if (!data.name || data.name.length < 2) {
          errors.push('Permission name must be at least 2 characters long');
        }
        if (data.name && data.name.length > 100) {
          errors.push('Permission name cannot be longer than 100 characters');
        }
        if (data.name && !/^[a-zA-Z0-9_:-]+$/.test(data.name)) {
          errors.push('Permission name contains invalid characters');
        }
      }

      // Validate resource
      if (data.resource !== undefined) {
        if (!data.resource) {
          errors.push('Permission resource is required');
        }
        if (data.resource && !/^[a-zA-Z0-9_*:-]+$/.test(data.resource)) {
          errors.push('Permission resource contains invalid characters');
        }
      }

      // Validate action
      if (data.action !== undefined) {
        if (!data.action) {
          errors.push('Permission action is required');
        }
        if (data.action && !/^[a-zA-Z0-9_*:-]+$/.test(data.action)) {
          errors.push('Permission action contains invalid characters');
        }
      }

      // Validate conditions
      if (data.conditions !== undefined && data.conditions !== null) {
        try {
          JSON.stringify(data.conditions);
        } catch {
          errors.push('Permission conditions contain circular references');
        }
      }

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      this.logger.error('Failed to validate permission', { error, data });
      return {
        valid: false,
        errors: ['Validation error occurred'],
      };
    }
  }

  async validatePermissionConflicts(permissionId: string): Promise<{
    hasConflicts: boolean;
    conflicts: Array<{
      permissionId: string;
      name: string;
      reason: string;
    }>;
  }> {
    try {
      const conflicts =
        await this.permissionRepository.findConflicts(permissionId);

      return {
        hasConflicts: conflicts.length > 0,
        conflicts,
      };
    } catch (error) {
      this.logger.error('Failed to validate permission conflicts', {
        error,
        permissionId,
      });
      throw error;
    }
  }

  async bulkCreatePermissions(
    permissions: CreatePermissionData[],
    createdBy?: string
  ): Promise<{
    success: boolean;
    created: Permission[];
    errors: Array<{ index: number; error: string; data: CreatePermissionData }>;
  }> {
    try {
      this.logger.info('Starting bulk permission creation', {
        count: permissions.length,
        createdBy,
      });

      const result = {
        success: true,
        created: [] as Permission[],
        errors: [] as Array<{
          index: number;
          error: string;
          data: CreatePermissionData;
        }>,
      };

      for (let i = 0; i < permissions.length; i++) {
        const permissionData = permissions[i];
        if (!permissionData) continue;
        
        try {
          const permission = await this.createPermission(
            permissionData,
            createdBy
          );
          result.created.push(permission);
        } catch (error) {
          result.errors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: permissionData,
          });
        }
      }

      result.success = result.errors.length === 0;

      this.logger.info('Bulk permission creation completed', {
        created: result.created.length,
        failed: result.errors.length,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed bulk permission creation', {
        error,
        count: permissions.length,
      });
      throw error;
    }
  }

  async getPermissionStats(): Promise<{
    total: number;
    wildcardPermissions: number;
    administrativePermissions: number;
    averageScopeLevel: number;
    resourceCount: number;
    actionCount: number;
    mostUsedPermissions: Array<{
      permissionId: string;
      name: string;
      roleCount: number;
    }>;
  }> {
    try {
      return await this.permissionRepository.getStats();
    } catch (error) {
      this.logger.error('Failed to get permission stats', { error });
      throw error;
    }
  }
}


