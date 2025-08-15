/**
 * User Management Service Interface
 * Defines comprehensive user CRUD operations with proper authorization
 */

import { User } from '../../domain/entities/user';
import { Role } from '../../domain/entities/role';
import { Permission } from '../../domain/entities/permission';

export interface CreateUserData {
  email: string;
  name?: string;
  image?: string;
  password?: string;
  emailVerified?: boolean;
  roles?: string[];
}

export interface UpdateUserData {
  name?: string;
  image?: string;
  email?: string;
  emailVerified?: boolean;
  mfaEnabled?: boolean;
}

export interface UserFilters {
  search?: string;
  mfaEnabled?: boolean;
  locked?: boolean;
  emailVerified?: boolean;
  roles?: string[];
  createdAfter?: Date;
  createdBefore?: Date;
  riskScoreMin?: number;
  riskScoreMax?: number;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'lastLoginAt' | 'email' | 'name' | 'riskScore';
  sortOrder?: 'asc' | 'desc';
}

export interface UserWithRoles extends User {
  roles: Role[];
  permissions: Permission[];
}

export interface BulkUserOperation {
  operation: 'create' | 'update' | 'delete';
  users: CreateUserData[] | { id: string; data: UpdateUserData }[] | string[];
}

export interface BulkOperationResult {
  success: boolean;
  processed: number;
  failed: number;
  errors: Array<{
    index: number;
    error: string;
    data?: any;
  }>;
}

export interface UserExportData {
  id: string;
  email: string;
  name?: string;
  emailVerified: boolean;
  mfaEnabled: boolean;
  createdAt: Date;
  lastLoginAt?: Date;
  riskScore: number;
  roles: string[];
  permissions: string[];
}

export interface IUserManagementService {
  // Basic CRUD operations
  createUser(data: CreateUserData, createdBy?: string): Promise<UserWithRoles>;
  getUserById(
    id: string,
    includeRelations?: boolean
  ): Promise<UserWithRoles | null>;
  getUserByEmail(
    email: string,
    includeRelations?: boolean
  ): Promise<UserWithRoles | null>;
  updateUser(
    id: string,
    data: UpdateUserData,
    updatedBy?: string
  ): Promise<UserWithRoles>;
  deleteUser(id: string, deletedBy?: string): Promise<void>;

  // Advanced queries
  getUsers(
    filters: UserFilters
  ): Promise<{ users: UserWithRoles[]; total: number }>;
  searchUsers(query: string, limit?: number): Promise<UserWithRoles[]>;

  // Role management
  assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<void>;
  removeRole(userId: string, roleId: string, removedBy?: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
  getUserPermissions(userId: string): Promise<Permission[]>;

  // Bulk operations
  bulkCreateUsers(
    users: CreateUserData[],
    createdBy?: string
  ): Promise<BulkOperationResult>;
  bulkUpdateUsers(
    updates: Array<{ id: string; data: UpdateUserData }>,
    updatedBy?: string
  ): Promise<BulkOperationResult>;
  bulkDeleteUsers(
    userIds: string[],
    deletedBy?: string
  ): Promise<BulkOperationResult>;

  // Import/Export
  exportUsers(filters?: UserFilters): Promise<UserExportData[]>;
  importUsers(
    users: CreateUserData[],
    createdBy?: string
  ): Promise<BulkOperationResult>;

  // Security operations
  lockUser(userId: string, reason: string, lockedBy?: string): Promise<void>;
  unlockUser(userId: string, unlockedBy?: string): Promise<void>;
  resetUserPassword(userId: string, resetBy?: string): Promise<string>; // Returns temporary password
  forcePasswordChange(userId: string, forcedBy?: string): Promise<void>;

  // Analytics
  getUserStats(): Promise<{
    total: number;
    active: number;
    locked: number;
    mfaEnabled: number;
    averageRiskScore: number;
    newUsersToday: number;
    newUsersThisWeek: number;
  }>;
}
