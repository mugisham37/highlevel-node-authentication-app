/**
 * Role Repository Interface
 * Defines data access operations for roles
 */

import { Role } from '../../domain/entities/role';
import { Permission } from '../../domain/entities/permission';

export interface CreateRoleData {
  name: string;
  description?: string;
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
}

export interface RoleFilters {
  search?: string;
  isSystemRole?: boolean;
  hasPermission?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
}

export interface RoleWithPermissions {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  permissions: Permission[];
}

export interface IRoleRepository {
  // Basic CRUD operations
  create(data: CreateRoleData): Promise<Role>;
  findById(
    id: string,
    includePermissions?: boolean
  ): Promise<RoleWithPermissions | null>;
  findByName(
    name: string,
    includePermissions?: boolean
  ): Promise<RoleWithPermissions | null>;
  update(id: string, data: UpdateRoleData): Promise<Role>;
  delete(id: string): Promise<void>;

  // Advanced queries
  findMany(
    filters: RoleFilters
  ): Promise<{ roles: RoleWithPermissions[]; total: number }>;
  findByIds(
    ids: string[],
    includePermissions?: boolean
  ): Promise<RoleWithPermissions[]>;
  search(query: string, limit?: number): Promise<RoleWithPermissions[]>;

  // Permission management
  addPermission(roleId: string, permissionId: string): Promise<void>;
  removePermission(roleId: string, permissionId: string): Promise<void>;
  getRolePermissions(roleId: string): Promise<Permission[]>;
  hasPermission(roleId: string, permissionId: string): Promise<boolean>;

  // System roles
  findSystemRoles(): Promise<RoleWithPermissions[]>;
  isSystemRole(roleId: string): Promise<boolean>;

  // User assignments
  getUserCount(roleId: string): Promise<number>;
  findUsersWithRole(
    roleId: string,
    limit?: number,
    offset?: number
  ): Promise<{
    users: Array<{
      id: string;
      email: string;
      name?: string;
      assignedAt: Date;
    }>;
    total: number;
  }>;

  // Hierarchy and relationships
  getRoleHierarchy(): Promise<
    Array<{
      role: Role;
      level: number;
      userCount: number;
      permissionCount: number;
    }>
  >;

  // Bulk operations
  bulkCreate(roles: CreateRoleData[]): Promise<Role[]>;
  bulkDelete(roleIds: string[]): Promise<void>;

  // Analytics
  getStats(): Promise<{
    total: number;
    systemRoles: number;
    adminRoles: number;
    averagePermissions: number;
    mostUsedRoles: Array<{ roleId: string; name: string; userCount: number }>;
  }>;

  // Validation
  exists(id: string): Promise<boolean>;
  nameExists(name: string, excludeId?: string): Promise<boolean>;
}
