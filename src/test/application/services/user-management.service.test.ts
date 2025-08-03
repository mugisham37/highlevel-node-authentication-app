/**
 * User Management Service Tests
 * Tests for the user management service functionality
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { UserManagementService } from '../../../application/services/user-management.service';
import { PrismaUserRepository } from '../../../infrastructure/database/repositories/prisma-user-repository';
import { PrismaRoleRepository } from '../../../infrastructure/database/repositories/prisma-role-repository';
import { Email } from '../../../domain/value-objects/email';
import { User } from '../../../domain/entities/user';
import { Role } from '../../../domain/entities/role';
import { Permission } from '../../../domain/entities/permission';

// Mock dependencies
const mockUserRepository = {
  createUser: vi.fn(),
  findById: vi.fn(),
  findByEmail: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  findUsersWithFilters: vi.fn(),
  assignRole: vi.fn(),
  removeRole: vi.fn(),
  getUserPermissions: vi.fn(),
} as any;

const mockRoleRepository = {
  findById: vi.fn(),
  findByName: vi.fn(),
} as any;

const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as any;

describe('UserManagementService', () => {
  let userManagementService: UserManagementService;

  beforeEach(() => {
    userManagementService = new UserManagementService(
      mockUserRepository,
      mockRoleRepository,
      mockLogger
    );

    // Reset all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.resetAllMocks();
  });

  describe('createUser', () => {
    it('should create a user successfully', async () => {
      // Arrange
      const userData = {
        email: 'test@example.com',
        name: 'Test User',
        password: 'StrongP@ssw0rd!',
      };

      const mockCreatedUser = {
        id: 'user-1',
        email: 'test@example.com',
        name: 'Test User',
        emailVerified: null,
        image: null,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIP: null,
        riskScore: 0,
      };

      const mockDefaultRole = {
        id: 'role-1',
        name: 'user',
        description: 'Default user role',
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: [],
      };

      mockUserRepository.createUser.mockResolvedValue(mockCreatedUser);
      mockRoleRepository.findByName.mockResolvedValue(mockDefaultRole);
      mockUserRepository.assignRole.mockResolvedValue(undefined);

      // Act
      const result = await userManagementService.createUser(
        userData,
        'admin-1'
      );

      // Assert
      expect(mockUserRepository.createUser).toHaveBeenCalledWith({
        email: 'test@example.com',
        name: 'Test User',
        image: undefined,
        passwordHash: expect.any(String),
        emailVerified: undefined,
      });

      expect(mockRoleRepository.findByName).toHaveBeenCalledWith('user', true);
      expect(mockUserRepository.assignRole).toHaveBeenCalledWith(
        'user-1',
        'role-1',
        'admin-1'
      );

      expect(result).toBeDefined();
      expect(result.id).toBe('user-1');
      expect(result.email.value).toBe('test@example.com');
      expect(result.roles).toHaveLength(1);
    });

    it('should create a user with custom roles', async () => {
      // Arrange
      const userData = {
        email: 'admin@example.com',
        name: 'Admin User',
        roles: ['admin-role-1'],
      };

      const mockCreatedUser = {
        id: 'user-2',
        email: 'admin@example.com',
        name: 'Admin User',
        emailVerified: null,
        image: null,
        passwordHash: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIP: null,
        riskScore: 0,
      };

      const mockAdminRole = {
        id: 'admin-role-1',
        name: 'admin',
        description: 'Administrator role',
        createdAt: new Date(),
        updatedAt: new Date(),
        permissions: [
          new Permission({
            id: 'perm-1',
            name: 'admin:*',
            resource: 'admin',
            action: '*',
            createdAt: new Date(),
          }),
        ],
      };

      mockUserRepository.createUser.mockResolvedValue(mockCreatedUser);
      mockRoleRepository.findById.mockResolvedValue(mockAdminRole);
      mockUserRepository.assignRole.mockResolvedValue(undefined);

      // Act
      const result = await userManagementService.createUser(
        userData,
        'super-admin'
      );

      // Assert
      expect(mockUserRepository.assignRole).toHaveBeenCalledWith(
        'user-2',
        'admin-role-1',
        'super-admin'
      );
      expect(result.roles).toHaveLength(1);
      expect(result.roles[0].name).toBe('admin');
      expect(result.permissions).toHaveLength(1);
      expect(result.permissions[0].name).toBe('admin:*');
    });

    it('should handle invalid email', async () => {
      // Arrange
      const userData = {
        email: 'invalid-email',
        name: 'Test User',
      };

      // Act & Assert
      await expect(
        userManagementService.createUser(userData)
      ).rejects.toThrow();
    });
  });

  describe('getUserById', () => {
    it('should call repository with correct parameters', async () => {
      // Arrange
      const userId = 'user-1';
      mockUserRepository.findById.mockResolvedValue(null);

      // Act
      const result = await userManagementService.getUserById(userId);

      // Assert
      expect(mockUserRepository.findById).toHaveBeenCalledWith(userId, true);
      expect(result).toBeNull();
    });

    it('should return null for non-existent user', async () => {
      // Arrange
      const userId = 'non-existent';
      mockUserRepository.findById.mockResolvedValue(null);

      // Act
      const result = await userManagementService.getUserById(userId);

      // Assert
      expect(result).toBeNull();
    });
  });

  describe('updateUser', () => {
    it('should update user successfully', async () => {
      // Arrange
      const userId = 'user-1';
      const updateData = {
        name: 'Updated Name',
        email: 'updated@example.com',
      };

      const mockUpdatedUser = {
        id: 'user-1',
        email: 'updated@example.com',
        name: 'Updated Name',
        emailVerified: null,
        image: null,
        passwordHash: 'hashed-password',
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: [],
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: null,
        lastLoginIP: null,
        riskScore: 0,
      };

      const mockUserWithRelations = {
        ...mockUpdatedUser,
        roles: [],
      };

      mockUserRepository.updateUser.mockResolvedValue(mockUpdatedUser);
      mockUserRepository.findById.mockResolvedValue(mockUserWithRelations);

      // Act
      const result = await userManagementService.updateUser(
        userId,
        updateData,
        'admin-1'
      );

      // Assert
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(userId, {
        name: 'Updated Name',
        email: 'updated@example.com',
      });
      expect(result).toBeDefined();
      if (result) {
        expect(result.name).toBe('Updated Name');
        expect(result.email.value).toBe('updated@example.com');
      }
    });
  });

  describe('assignRole', () => {
    it('should assign role to user successfully', async () => {
      // Arrange
      const userId = 'user-1';
      const roleId = 'role-1';
      const assignedBy = 'admin-1';

      mockUserRepository.assignRole.mockResolvedValue(undefined);

      // Act
      await userManagementService.assignRole(userId, roleId, assignedBy);

      // Assert
      expect(mockUserRepository.assignRole).toHaveBeenCalledWith(
        userId,
        roleId,
        assignedBy
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Role assigned successfully',
        { userId, roleId }
      );
    });
  });

  describe('removeRole', () => {
    it('should remove role from user successfully', async () => {
      // Arrange
      const userId = 'user-1';
      const roleId = 'role-1';
      const removedBy = 'admin-1';

      mockUserRepository.removeRole.mockResolvedValue(undefined);

      // Act
      await userManagementService.removeRole(userId, roleId, removedBy);

      // Assert
      expect(mockUserRepository.removeRole).toHaveBeenCalledWith(
        userId,
        roleId
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Role removed successfully',
        { userId, roleId }
      );
    });
  });

  describe('getUserStats', () => {
    it('should return user statistics', async () => {
      // Arrange
      const mockResults = [
        { users: [], total: 100 }, // total
        { users: [], total: 5 }, // locked
        { users: [], total: 75 }, // mfaEnabled
        { users: [], total: 10 }, // today
        { users: [], total: 25 }, // week
      ];

      mockUserRepository.findUsersWithFilters
        .mockResolvedValueOnce(mockResults[0])
        .mockResolvedValueOnce(mockResults[1])
        .mockResolvedValueOnce(mockResults[2])
        .mockResolvedValueOnce(mockResults[3])
        .mockResolvedValueOnce(mockResults[4]);

      // Act
      const result = await userManagementService.getUserStats();

      // Assert
      expect(result).toEqual({
        total: 100,
        active: 95,
        locked: 5,
        mfaEnabled: 75,
        averageRiskScore: 25,
        newUsersToday: 10,
        newUsersThisWeek: 25,
      });
    });
  });
});
