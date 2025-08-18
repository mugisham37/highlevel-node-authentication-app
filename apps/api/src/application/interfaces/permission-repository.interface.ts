/**
 * Permission Repository Interface
 * Defines data access operations for permissions
 */

import { Permission } from "@company/shared"entities/permission';

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
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface IPermissionRepository {
  // Basic CRUD operations
  create(data: CreatePermissionData): Promise<Permission>;
  findById(id: string): Promise<Permission | null>;
  findByName(name: string): Promise<Permission | null>;
  update(id: string, data: UpdatePermissionData): Promise<Permission>;
  delete(id: string): Promise<void>;

  // Advanced queries
  findMany(
    filters: PermissionFilters
  ): Promise<{ permissions: Permission[]; total: number }>;
  findByIds(ids: string[]): Promise<Permission[]>;
  search(query: string, limit?: number): Promise<Permission[]>;

  // Resource and action queries
  findByResource(resource: string): Promise<Permission[]>;
  findByAction(action: string): Promise<Permission[]>;
  findByResourceAndAction(
    resource: string,
    action: string
  ): Promise<Permission[]>;
  getResources(): Promise<string[]>;
  getActions(): Promise<string[]>;
  getResourceActions(resource: string): Promise<string[]>;

  // System permissions
  findSystemPermissions(): Promise<Permission[]>;
  isSystemPermission(permissionId: string): Promise<boolean>;

  // Role assignments
  getRoleCount(permissionId: string): Promise<number>;
  findRolesWithPermission(
    permissionId: string,
    limit?: number,
    offset?: number
  ): Promise<{
    roles: Array<{ id: string; name: string; description?: string }>;
    total: number;
  }>;

  // Wildcard and administrative permissions
  findWildcardPermissions(): Promise<Permission[]>;
  findAdministrativePermissions(): Promise<Permission[]>;

  // Bulk operations
  bulkCreate(permissions: CreatePermissionData[]): Promise<Permission[]>;
  bulkDelete(permissionIds: string[]): Promise<void>;

  // Analytics
  getStats(): Promise<{
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

  // Validation
  exists(id: string): Promise<boolean>;
  nameExists(name: string, excludeId?: string): Promise<boolean>;
  findConflicts(permissionId: string): Promise<
    Array<{
      permissionId: string;
      name: string;
      reason: string;
    }>
  >;
}

