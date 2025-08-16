/**
 * User Repository Interface
 * Defines user-specific repository operations
 */

import { User } from '../../../../domain/entities/user';
import { Role } from '../../../../domain/entities/role';
import { Permission } from '../../../../domain/entities/permission';
import {
  IBaseRepository,
  ICacheableRepository,
  IOptimizedRepository,
} from './base-repository.interface';

export interface CreateUserData {
  email: string;
  name?: string;
  image?: string;
  passwordHash?: string;
  emailVerified?: Date;
  mfaEnabled?: boolean;
  roles?: string[];
}

export interface UpdateUserData {
  name?: string;
  image?: string;
  email?: string;
  emailVerified?: Date;
  passwordHash?: string;
  mfaEnabled?: boolean;
  totpSecret?: string;
  backupCodes?: string[];
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIP?: string;
  riskScore?: number;
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

export interface UserWithRelations extends User {
  roles?: Role[];
  permissions?: Permission[];
  accounts?: any[];
  sessions?: any[];
  webAuthnCredentials?: any[];
}

export interface IUserRepository
  extends IBaseRepository<
      UserWithRelations,
      CreateUserData,
      UpdateUserData,
      UserFilters
    >,
    ICacheableRepository<UserWithRelations>,
    IOptimizedRepository {
  // User-specific queries
  findByEmail(
    email: string,
    includeRelations?: boolean
  ): Promise<UserWithRelations | null>;
  findByEmailCached(
    email: string,
    ttl?: number
  ): Promise<UserWithRelations | null>;

  // Authentication-specific operations
  incrementFailedLoginAttempts(userId: string): Promise<UserWithRelations>;
  resetFailedLoginAttempts(userId: string): Promise<UserWithRelations>;
  lockUser(userId: string, reason: string, lockedBy?: string): Promise<void>;
  unlockUser(userId: string, unlockedBy?: string): Promise<void>;

  // Role management
  assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<void>;
  removeRole(userId: string, roleId: string, removedBy?: string): Promise<void>;
  getUserRoles(userId: string): Promise<Role[]>;
  getUserPermissions(userId: string): Promise<Permission[]>;

  // Search and filtering
  searchUsers(query: string, limit?: number): Promise<UserWithRelations[]>;
  findUsersWithRole(
    roleId: string,
    limit?: number,
    offset?: number
  ): Promise<{
    users: UserWithRelations[];
    total: number;
  }>;

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

  // Bulk operations with validation
  bulkCreateWithValidation(users: CreateUserData[]): Promise<{
    success: UserWithRelations[];
    failed: Array<{ data: CreateUserData; error: string }>;
  }>;

  // Export/Import
  exportUsers(filters?: UserFilters): Promise<any[]>;

  // Security operations
  findSuspiciousUsers(riskThreshold?: number): Promise<UserWithRelations[]>;
  updateRiskScore(userId: string, riskScore: number): Promise<void>;
}
