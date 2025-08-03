/**
 * Permission Management Service Interface
 * Defines permission management for RBAC system
 */

import { Permission } from '../../domain/entities/permission';

export interface CreatePermissionData {
  name: string;
  resource: string;
  action: string;
  conditions?: Record<string, any>;
}

export interface UpdatePermissionData {
  name?: string;
  resource?: string;
  action?: string;
  conditions?: Record<string, any>;
}

export interface PermissionFilters {
  search?: string;
  resource?: string;
  action?: string;
  isWildcard?: boolean;
  isAdministrative?: boolean;
  scopeLevelMin?: number;
  scopeLevelMax?: number;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'resource' | 'action' | 'createdAt' | 'scopeLevel';
  sortOrder?: 'asc' | 'desc';
}

export interface PermissionCheck {
  resource: string;
  action: string;
  context?: Record<string, any>;
}

export interface PermissionCheckResult {
  allowed: boolean;
  permission?: Permission;
  reason?: string;
  matchedConditions?: Record<string, any>;
}

export interface IPermissionManagementService {
  // Basic CRUD operations
  createPermission(
    data: CreatePermissionData,
    createdBy?: string
  ): Promise<Permission>;
  getPermissionById(id: string): Promise<Permission | null>;
  getPermissionByName(name: string): Promise<Permission | null>;
  updatePermission(
    id: string,
    data: UpdatePermissionData,
    updatedBy?: string
  ): Promise<Permission>;
  deletePermission(id: string, deletedBy?: string): Promise<void>;

  // Advanced queries
  getPermissions(
    filters: PermissionFilters
  ): Promise<{ permissions: Permission[]; total: number }>;
  searchPermissions(query: string, limit?: number): Promise<Permission[]>;

  // Resource and action management
  getResources(): Promise<string[]>;
  getActions(): Promise<string[]>;
  getResourceActions(resource: string): Promise<string[]>;
  getPermissionsByResource(resource: string): Promise<Permission[]>;
  getPermissionsByAction(action: string): Promise<Permission[]>;

  // Permission checking
  checkPermission(
    permissions: Permission[],
    check: PermissionCheck
  ): Promise<PermissionCheckResult>;
  checkMultiplePermissions(
    permissions: Permission[],
    checks: PermissionCheck[]
  ): Promise<PermissionCheckResult[]>;

  // System permissions
  getSystemPermissions(): Promise<Permission[]>;
  createSystemPermission(data: CreatePermissionData): Promise<Permission>;
  isSystemPermission(permissionId: string): Promise<boolean>;

  // Validation
  validatePermission(
    data: CreatePermissionData | UpdatePermissionData
  ): Promise<{
    valid: boolean;
    errors: string[];
  }>;

  validatePermissionConflicts(permissionId: string): Promise<{
    hasConflicts: boolean;
    conflicts: Array<{
      permissionId: string;
      name: string;
      reason: string;
    }>;
  }>;

  // Bulk operations
  bulkCreatePermissions(
    permissions: CreatePermissionData[],
    createdBy?: string
  ): Promise<{
    success: boolean;
    created: Permission[];
    errors: Array<{ index: number; error: string; data: CreatePermissionData }>;
  }>;

  // Analytics
  getPermissionStats(): Promise<{
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
  }>;
}
