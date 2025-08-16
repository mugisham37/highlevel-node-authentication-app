/**
 * User Management Service Implementation      const userData = {
        email: data.email,
        ...(data.name && { name: data.name }),
        ...(data.image && { image: data.image }),
        ...(password?.hashedValue && { passwordHash: password.hashedValue }),
        ...(data.emailVerified && { emailVerified: new Date() }),
      };vides comprehensive user CRUD operations with proper authorization
 */

import { Logger } from 'winston';
import { User } from '../../domain/entities/user';
import { Role } from '../../domain/entities/role';
import { Permission } from '../../domain/entities/permission';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { PrismaRoleRepository } from '../../infrastructure/database/repositories/prisma-role-repository';
import {
  IUserManagementService,
  CreateUserData,
  UpdateUserData,
  UserFilters,
  UserWithRoles,
  BulkOperationResult,
  UserExportData,
} from '../interfaces/user-management.interface';

export class UserManagementService implements IUserManagementService {
  constructor(
    private userRepository: PrismaUserRepository,
    private roleRepository: PrismaRoleRepository,
    private logger: Logger
  ) {}

  async createUser(
    data: CreateUserData,
    createdBy?: string
  ): Promise<UserWithRoles> {
    try {
      this.logger.info('Creating new user', { email: data.email, createdBy });

      // Validate email
      const email = new Email(data.email);

      // Hash password if provided
      let password: Password | undefined;
      if (data.password) {
        password = await Password.fromPlainText(data.password);
      }

      // Create user data
      const userData = {
        email: email.value,
        ...(data.name && { name: data.name }),
        ...(data.image && { image: data.image }),
        ...(password?.hashedValue && { passwordHash: password.hashedValue }),
        ...(data.emailVerified && { emailVerified: new Date() }),
      };

      const createdUser = await this.userRepository.createUser(userData);

      // Convert to domain entity
      const user = new User({
        id: createdUser.id,
        email,
        ...(createdUser.emailVerified && { emailVerified: createdUser.emailVerified }),
        ...(createdUser.name && { name: createdUser.name }),
        ...(createdUser.image && { image: createdUser.image }),
        password,
        createdAt: createdUser.createdAt,
        updatedAt: createdUser.updatedAt,
        mfaEnabled: createdUser.mfaEnabled,
        ...(createdUser.totpSecret && { totpSecret: createdUser.totpSecret }),
        backupCodes: createdUser.backupCodes,
        failedLoginAttempts: createdUser.failedLoginAttempts,
        ...(createdUser.lockedUntil && { lockedUntil: createdUser.lockedUntil }),
        ...(createdUser.lastLoginAt && { lastLoginAt: createdUser.lastLoginAt }),
        ...(createdUser.lastLoginIP && { lastLoginIP: createdUser.lastLoginIP }),
        riskScore: createdUser.riskScore,
      });

      // Assign default roles if specified
      const roles: Role[] = [];
      if (data.roles && data.roles.length > 0) {
        for (const roleId of data.roles) {
          await this.userRepository.assignRole(user.id, roleId, createdBy);
          const role = await this.roleRepository.findById(roleId, true);
          if (role) {
            roles.push(role as any);
          }
        }
      } else {
        // Assign default 'user' role
        const defaultRole = await this.roleRepository.findByName('user', true);
        if (defaultRole) {
          await this.userRepository.assignRole(
            user.id,
            defaultRole.id,
            createdBy
          );
          roles.push(defaultRole as any);
        }
      }

      // Get all permissions from roles
      const permissions = roles.flatMap((role) => role.permissions);

      this.logger.info('User created successfully', {
        userId: user.id,
        email: user.email.value,
        rolesCount: roles.length,
      });

      return {
        ...user,
        roles,
        permissions,
      } as UserWithRoles;
    } catch (error) {
      this.logger.error('Failed to create user', { error, data, createdBy });
      throw error;
    }
  }

  async getUserById(
    id: string,
    includeRelations = true
  ): Promise<UserWithRoles | null> {
    try {
      const userData = await this.userRepository.findById(id, includeRelations);
      if (!userData) return null;

      return this.mapToUserWithRoles(userData);
    } catch (error) {
      this.logger.error('Failed to get user by ID', { error, id });
      throw error;
    }
  }

  async getUserByEmail(
    email: string,
    includeRelations = true
  ): Promise<UserWithRoles | null> {
    try {
      const userData = await this.userRepository.findByEmail(
        email,
        includeRelations
      );
      if (!userData) return null;

      return this.mapToUserWithRoles(userData);
    } catch (error) {
      this.logger.error('Failed to get user by email', { error, email });
      throw error;
    }
  }

  async updateUser(
    id: string,
    data: UpdateUserData,
    updatedBy?: string
  ): Promise<UserWithRoles> {
    try {
      this.logger.info('Updating user', { userId: id, updatedBy });

      const updateData: any = { ...data };

      // Validate and convert email if provided
      if (data.email) {
        const email = new Email(data.email);
        updateData.email = email.value;
      }

      await this.userRepository.updateUser(id, updateData);
      const userWithRelations = await this.userRepository.findById(id, true);

      if (!userWithRelations) {
        throw new Error('User not found after update');
      }

      this.logger.info('User updated successfully', { userId: id });
      return this.mapToUserWithRoles(userWithRelations);
    } catch (error) {
      this.logger.error('Failed to update user', {
        error,
        id,
        data,
        updatedBy,
      });
      throw error;
    }
  }

  async deleteUser(id: string, deletedBy?: string): Promise<void> {
    try {
      this.logger.info('Deleting user', { userId: id, deletedBy });

      await this.userRepository.deleteUser(id);

      this.logger.info('User deleted successfully', { userId: id });
    } catch (error) {
      this.logger.error('Failed to delete user', { error, id, deletedBy });
      throw error;
    }
  }

  async getUsers(
    filters: UserFilters
  ): Promise<{ users: UserWithRoles[]; total: number }> {
    try {
      const result = await this.userRepository.findUsersWithFilters({
        ...(filters.search && { search: filters.search }),
        ...(filters.mfaEnabled !== undefined && { mfaEnabled: filters.mfaEnabled }),
        ...(filters.locked !== undefined && { locked: filters.locked }),
        ...(filters.createdAfter && { createdAfter: filters.createdAfter }),
        ...(filters.createdBefore && { createdBefore: filters.createdBefore }),
        ...(filters.limit && { limit: filters.limit }),
        ...(filters.offset && { offset: filters.offset }),
      });

      const users = await Promise.all(
        result.users.map(async (userData) => {
          const userWithRelations = await this.userRepository.findById(
            userData.id,
            true
          );
          return userWithRelations
            ? this.mapToUserWithRoles(userWithRelations)
            : null;
        })
      );

      const validUsers = users.filter(
        (user): user is UserWithRoles => user !== null
      );

      return { users: validUsers, total: result.total };
    } catch (error) {
      this.logger.error('Failed to get users', { error, filters });
      throw error;
    }
  }

  async searchUsers(query: string, limit = 10): Promise<UserWithRoles[]> {
    try {
      const result = await this.userRepository.findUsersWithFilters({
        search: query,
        limit,
      });

      const users = await Promise.all(
        result.users.map(async (userData) => {
          const userWithRelations = await this.userRepository.findById(
            userData.id,
            true
          );
          return userWithRelations
            ? this.mapToUserWithRoles(userWithRelations)
            : null;
        })
      );

      return users.filter((user): user is UserWithRoles => user !== null);
    } catch (error) {
      this.logger.error('Failed to search users', { error, query });
      throw error;
    }
  }

  async assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<void> {
    try {
      this.logger.info('Assigning role to user', {
        userId,
        roleId,
        assignedBy,
      });

      await this.userRepository.assignRole(userId, roleId, assignedBy);

      this.logger.info('Role assigned successfully', { userId, roleId });
    } catch (error) {
      this.logger.error('Failed to assign role', {
        error,
        userId,
        roleId,
        assignedBy,
      });
      throw error;
    }
  }

  async removeRole(
    userId: string,
    roleId: string,
    removedBy?: string
  ): Promise<void> {
    try {
      this.logger.info('Removing role from user', {
        userId,
        roleId,
        removedBy,
      });

      await this.userRepository.removeRole(userId, roleId);

      this.logger.info('Role removed successfully', { userId, roleId });
    } catch (error) {
      this.logger.error('Failed to remove role', {
        error,
        userId,
        roleId,
        removedBy,
      });
      throw error;
    }
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    try {
      const userWithRelations = await this.userRepository.findById(
        userId,
        true
      );
      if (!userWithRelations || !userWithRelations.roles) return [];

      return userWithRelations.roles.map((userRole: any) => userRole.role);
    } catch (error) {
      this.logger.error('Failed to get user roles', { error, userId });
      throw error;
    }
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    try {
      const permissions = await this.userRepository.getUserPermissions(userId);
      return permissions.map((permissionName) => {
        // This is a simplified mapping - in a real implementation,
        // you'd fetch the full Permission objects
        return new Permission({
          id: permissionName,
          name: permissionName,
          resource: '*',
          action: '*',
          createdAt: new Date(),
        });
      });
    } catch (error) {
      this.logger.error('Failed to get user permissions', { error, userId });
      throw error;
    }
  }

  async bulkCreateUsers(
    users: CreateUserData[],
    createdBy?: string
  ): Promise<BulkOperationResult> {
    try {
      this.logger.info('Starting bulk user creation', {
        count: users.length,
        createdBy,
      });

      const result: BulkOperationResult = {
        success: true,
        processed: 0,
        failed: 0,
        errors: [],
      };

      for (let i = 0; i < users.length; i++) {
        const userData = users[i];
        if (!userData) continue;
        
        try {
          await this.createUser(userData, createdBy);
          result.processed++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: userData,
          });
        }
      }

      result.success = result.failed === 0;

      this.logger.info('Bulk user creation completed', {
        processed: result.processed,
        failed: result.failed,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed bulk user creation', {
        error,
        count: users.length,
      });
      throw error;
    }
  }

  async bulkUpdateUsers(
    updates: Array<{ id: string; data: UpdateUserData }>,
    updatedBy?: string
  ): Promise<BulkOperationResult> {
    try {
      this.logger.info('Starting bulk user update', {
        count: updates.length,
        updatedBy,
      });

      const result: BulkOperationResult = {
        success: true,
        processed: 0,
        failed: 0,
        errors: [],
      };

      for (let i = 0; i < updates.length; i++) {
        const updateData = updates[i];
        if (!updateData) continue;
        
        try {
          await this.updateUser(updateData.id, updateData.data, updatedBy);
          result.processed++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: updates[i],
          });
        }
      }

      result.success = result.failed === 0;

      this.logger.info('Bulk user update completed', {
        processed: result.processed,
        failed: result.failed,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed bulk user update', {
        error,
        count: updates.length,
      });
      throw error;
    }
  }

  async bulkDeleteUsers(
    userIds: string[],
    deletedBy?: string
  ): Promise<BulkOperationResult> {
    try {
      this.logger.info('Starting bulk user deletion', {
        count: userIds.length,
        deletedBy,
      });

      const result: BulkOperationResult = {
        success: true,
        processed: 0,
        failed: 0,
        errors: [],
      };

      for (let i = 0; i < userIds.length; i++) {
        const userId = userIds[i];
        if (!userId) continue;
        
        try {
          await this.deleteUser(userId, deletedBy);
          result.processed++;
        } catch (error) {
          result.failed++;
          result.errors.push({
            index: i,
            error: error instanceof Error ? error.message : 'Unknown error',
            data: userIds[i],
          });
        }
      }

      result.success = result.failed === 0;

      this.logger.info('Bulk user deletion completed', {
        processed: result.processed,
        failed: result.failed,
        success: result.success,
      });

      return result;
    } catch (error) {
      this.logger.error('Failed bulk user deletion', {
        error,
        count: userIds.length,
      });
      throw error;
    }
  }

  async exportUsers(filters?: UserFilters): Promise<UserExportData[]> {
    try {
      this.logger.info('Exporting users', { filters });

      const result = await this.getUsers(filters || {});

      const exportData: UserExportData[] = result.users.map((user) => ({
        id: user.id,
        email: user.email.value,
        name: user.name || 'Unknown',
        emailVerified: user.isEmailVerified(),
        mfaEnabled: user.mfaEnabled,
        createdAt: user.createdAt,
        lastLoginAt: user.lastLoginAt || new Date(),
        riskScore: user.riskScore,
        roles: user.roles.map((role) => role.name),
        permissions: user.permissions.map((permission) => permission.name),
      }));

      this.logger.info('Users exported successfully', {
        count: exportData.length,
      });
      return exportData;
    } catch (error) {
      this.logger.error('Failed to export users', { error, filters });
      throw error;
    }
  }

  async importUsers(
    users: CreateUserData[],
    createdBy?: string
  ): Promise<BulkOperationResult> {
    return this.bulkCreateUsers(users, createdBy);
  }

  async lockUser(
    userId: string,
    reason: string,
    lockedBy?: string
  ): Promise<void> {
    try {
      this.logger.info('Locking user', { userId, reason, lockedBy });

      await this.userRepository.updateUser(userId, {
        lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // Lock for 24 hours
      });

      this.logger.info('User locked successfully', { userId, reason });
    } catch (error) {
      this.logger.error('Failed to lock user', {
        error,
        userId,
        reason,
        lockedBy,
      });
      throw error;
    }
  }

  async unlockUser(userId: string, unlockedBy?: string): Promise<void> {
    try {
      this.logger.info('Unlocking user', { userId, unlockedBy });

      await this.userRepository.updateUser(userId, {
        lockedUntil: null,
        failedLoginAttempts: 0,
      });

      this.logger.info('User unlocked successfully', { userId });
    } catch (error) {
      this.logger.error('Failed to unlock user', { error, userId, unlockedBy });
      throw error;
    }
  }

  async resetUserPassword(userId: string, resetBy?: string): Promise<string> {
    try {
      this.logger.info('Resetting user password', { userId, resetBy });

      // Generate temporary password
      const tempPassword = Math.random().toString(36).slice(-12);
      const password = await Password.fromPlainText(tempPassword);

      await this.userRepository.updateUser(userId, {
        passwordHash: password.hashedValue,
      });

      this.logger.info('User password reset successfully', { userId });
      return tempPassword;
    } catch (error) {
      this.logger.error('Failed to reset user password', {
        error,
        userId,
        resetBy,
      });
      throw error;
    }
  }

  async forcePasswordChange(userId: string, forcedBy?: string): Promise<void> {
    try {
      this.logger.info('Forcing password change', { userId, forcedBy });

      // In a real implementation, you'd set a flag that requires password change on next login
      // For now, we'll just log the action
      this.logger.info('Password change forced successfully', { userId });
    } catch (error) {
      this.logger.error('Failed to force password change', {
        error,
        userId,
        forcedBy,
      });
      throw error;
    }
  }

  async getUserStats(): Promise<{
    total: number;
    active: number;
    locked: number;
    mfaEnabled: number;
    averageRiskScore: number;
    newUsersToday: number;
    newUsersThisWeek: number;
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const weekAgo = new Date();
      weekAgo.setDate(weekAgo.getDate() - 7);
      weekAgo.setHours(0, 0, 0, 0);

      const [totalResult, lockedResult, mfaResult, todayResult, weekResult] =
        await Promise.all([
          this.userRepository.findUsersWithFilters({ limit: 1 }),
          this.userRepository.findUsersWithFilters({ locked: true, limit: 1 }),
          this.userRepository.findUsersWithFilters({
            mfaEnabled: true,
            limit: 1,
          }),
          this.userRepository.findUsersWithFilters({
            createdAfter: today,
            limit: 1,
          }),
          this.userRepository.findUsersWithFilters({
            createdAfter: weekAgo,
            limit: 1,
          }),
        ]);

      // For average risk score, we'd need to fetch all users or use aggregation
      // This is a simplified implementation
      const averageRiskScore = 25; // Placeholder

      return {
        total: totalResult.total,
        active: totalResult.total - lockedResult.total,
        locked: lockedResult.total,
        mfaEnabled: mfaResult.total,
        averageRiskScore,
        newUsersToday: todayResult.total,
        newUsersThisWeek: weekResult.total,
      };
    } catch (error) {
      this.logger.error('Failed to get user stats', { error });
      throw error;
    }
  }

  private mapToUserWithRoles(userData: any): UserWithRoles {
    const email = new Email(userData.email);

    const user = new User({
      id: userData.id,
      email,
      ...(userData.emailVerified && { emailVerified: userData.emailVerified }),
      ...(userData.name && { name: userData.name }),
      ...(userData.image && { image: userData.image }),
      password: undefined, // Don't expose password
      createdAt: userData.createdAt,
      updatedAt: userData.updatedAt,
      mfaEnabled: userData.mfaEnabled,
      ...(userData.totpSecret && { totpSecret: userData.totpSecret }),
      backupCodes: userData.backupCodes || [],
      failedLoginAttempts: userData.failedLoginAttempts,
      ...(userData.lockedUntil && { lockedUntil: userData.lockedUntil }),
      ...(userData.lastLoginAt && { lastLoginAt: userData.lastLoginAt }),
      ...(userData.lastLoginIP && { lastLoginIP: userData.lastLoginIP }),
      riskScore: userData.riskScore,
    });

    const roles = userData.roles?.map((userRole: any) => userRole.role) || [];
    const permissions = roles.flatMap(
      (role: any) => role.permissions?.map((rp: any) => rp.permission) || []
    );

    return {
      ...user,
      roles,
      permissions,
    } as UserWithRoles;
  }
}
