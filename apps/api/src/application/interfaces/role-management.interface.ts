/**
 * Role Management Service Interface
 * Defines role-based access control with hierarchical permissions
 */

import { Role } from "@company/shared/entities/role';
import { Permission } from "@company/shared/entities/permission';
import { RoleWithPermissions } from './role-repository.interface';

export interface CreateRoleData {
  name: string;
  description?: string;
  permissions?: string[];
}

export interface UpdateRoleData {
  name?: string;
  description?: string;
}

export interface RoleFilters {
  search?: string;
  isSystemRole?: boolean;
  isAdminRole?: boolean;
  hasPermission?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'name' | 'createdAt' | 'permissionCount' | 'hierarchyLevel';
  sortOrder?: 'asc' | 'desc';
}

export interface RoleHierarchy {
  role: Role;
  level: number;
  children: RoleHierarchy[];
  parent?: RoleHierarchy;
}

export interface IRoleManagementService {
  // Basic CRUD operations
  createRole(
    data: CreateRoleData,
    createdBy?: string
  ): Promise<RoleWithPermissions>;
  getRoleById(
    id: string,
    includePermissions?: boolean
  ): Promise<RoleWithPermissions | null>;
  getRoleByName(
    name: string,
    includePermissions?: boolean
  ): Promise<RoleWithPermissions | null>;
  updateRole(
    id: string,
    data: UpdateRoleData,
    updatedBy?: string
  ): Promise<RoleWithPermissions>;
  deleteRole(id: string, deletedBy?: string): Promise<void>;

  // Advanced queries
  getRoles(
    filters: RoleFilters
  ): Promise<{ roles: RoleWithPermissions[]; total: number }>;
  searchRoles(query: string, limit?: number): Promise<RoleWithPermissions[]>;

  // Permission management
  addPermissionToRole(
    roleId: string,
    permissionId: string,
    addedBy?: string
  ): Promise<void>;
  removePermissionFromRole(
    roleId: string,
    permissionId: string,
    removedBy?: string
  ): Promise<void>;
  getRolePermissions(roleId: string): Promise<Permission[]>;

  // Hierarchy management
  getRoleHierarchy(): Promise<RoleHierarchy[]>;
  getRolesByHierarchyLevel(
    minLevel?: number,
    maxLevel?: number
  ): Promise<RoleWithPermissions[]>;
  canRoleBeAssignedBy(
    roleId: string,
    assignerRoleIds: string[]
  ): Promise<boolean>;

  // System roles
  getSystemRoles(): Promise<RoleWithPermissions[]>;
  createSystemRole(data: CreateRoleData): Promise<RoleWithPermissions>;
  isSystemRole(roleId: string): Promise<boolean>;

  // Validation
  validateRoleAssignment(
    userId: string,
    roleId: string
  ): Promise<{
    valid: boolean;
    reason?: string;
    conflicts?: string[];
  }>;

  // Analytics
  getRoleStats(): Promise<{
    total: number;
    systemRoles: number;
    adminRoles: number;
    averagePermissions: number;
    mostUsedRoles: Array<{ roleId: string; name: string; userCount: number }>;
  }>;
}


