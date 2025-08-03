import { PrismaClient } from '@prisma/client';
import { Logger } from 'winston';

// Define the types manually since we're using a custom generated client
interface User {
  id: string;
  email: string;
  emailVerified?: Date | null;
  name?: string | null;
  image?: string | null;
  passwordHash?: string | null;
  createdAt: Date;
  updatedAt: Date;
  mfaEnabled: boolean;
  totpSecret?: string | null;
  backupCodes: string[];
  failedLoginAttempts: number;
  lockedUntil?: Date | null;
  lastLoginAt?: Date | null;
  lastLoginIP?: string | null;
  riskScore: number;
}

// Define Prisma namespace types
namespace Prisma {
  export interface UserWhereInput {
    id?: string;
    email?: { contains?: string; mode?: string };
    name?: { contains?: string; mode?: string };
    mfaEnabled?: boolean;
    lockedUntil?: { gt?: Date };
    createdAt?: { gte?: Date; lte?: Date };
    OR?: UserWhereInput[];
  }
}

export interface UserWithRelations extends User {
  accounts?: any[];
  sessions?: any[];
  roles?: any[];
  auditLogs?: any[];
  webAuthnCredentials?: any[];
}

export interface CreateUserData {
  email: string;
  name?: string;
  image?: string;
  passwordHash?: string;
  emailVerified?: Date;
}

export interface UpdateUserData {
  name?: string;
  image?: string;
  passwordHash?: string;
  emailVerified?: Date;
  mfaEnabled?: boolean;
  totpSecret?: string;
  backupCodes?: string[];
  failedLoginAttempts?: number;
  lockedUntil?: Date;
  lastLoginAt?: Date;
  lastLoginIP?: string;
  riskScore?: number;
}

export class PrismaUserRepository {
  constructor(
    private prisma: PrismaClient,
    private logger: Logger
  ) { }

  async createUser(data: CreateUserData): Promise<User> {
    try {
      const user = await this.prisma.user.create({
        data: {
          ...data,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.info('User created successfully', {
        userId: user.id,
        email: user.email,
      });
      return user;
    } catch (error) {
      this.logger.error('Failed to create user', { error, data });
      throw error;
    }
  }

  async findById(
    id: string,
    includeRelations = false
  ): Promise<UserWithRelations | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { id },
        include: includeRelations
          ? {
            accounts: true,
            sessions: {
              where: { isActive: true },
              orderBy: { lastActivity: 'desc' },
            },
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
            webAuthnCredentials: true,
          }
          : undefined,
      });

      return user;
    } catch (error) {
      this.logger.error('Failed to find user by ID', { error, id });
      throw error;
    }
  }

  async findByEmail(
    email: string,
    includeRelations = false
  ): Promise<UserWithRelations | null> {
    try {
      const user = await this.prisma.user.findUnique({
        where: { email },
        include: includeRelations
          ? {
            accounts: true,
            sessions: {
              where: { isActive: true },
              orderBy: { lastActivity: 'desc' },
            },
            roles: {
              include: {
                role: {
                  include: {
                    permissions: {
                      include: {
                        permission: true,
                      },
                    },
                  },
                },
              },
            },
            webAuthnCredentials: true,
          }
          : undefined,
      });

      return user;
    } catch (error) {
      this.logger.error('Failed to find user by email', { error, email });
      throw error;
    }
  }

  async updateUser(id: string, data: UpdateUserData): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id },
        data: {
          ...data,
          updatedAt: new Date(),
        },
      });

      this.logger.info('User updated successfully', { userId: id });
      return user;
    } catch (error) {
      this.logger.error('Failed to update user', { error, id, data });
      throw error;
    }
  }

  async deleteUser(id: string): Promise<void> {
    try {
      await this.prisma.user.delete({
        where: { id },
      });

      this.logger.info('User deleted successfully', { userId: id });
    } catch (error) {
      this.logger.error('Failed to delete user', { error, id });
      throw error;
    }
  }

  async findUsersWithFilters(filters: {
    search?: string;
    mfaEnabled?: boolean;
    locked?: boolean;
    createdAfter?: Date;
    createdBefore?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{ users: User[]; total: number }> {
    try {
      const where: Prisma.UserWhereInput = {};

      if (filters.search) {
        where.OR = [
          { email: { contains: filters.search, mode: 'insensitive' } },
          { name: { contains: filters.search, mode: 'insensitive' } },
        ];
      }

      if (filters.mfaEnabled !== undefined) {
        where.mfaEnabled = filters.mfaEnabled;
      }

      if (filters.locked) {
        where.lockedUntil = { gt: new Date() };
      }

      if (filters.createdAfter) {
        where.createdAt = { ...where.createdAt, gte: filters.createdAfter };
      }

      if (filters.createdBefore) {
        where.createdAt = { ...where.createdAt, lte: filters.createdBefore };
      }

      const [users, total] = await Promise.all([
        this.prisma.user.findMany({
          where,
          take: filters.limit || 50,
          skip: filters.offset || 0,
          orderBy: { createdAt: 'desc' },
        }),
        this.prisma.user.count({ where }),
      ]);

      return { users, total };
    } catch (error) {
      this.logger.error('Failed to find users with filters', {
        error,
        filters,
      });
      throw error;
    }
  }

  async assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<void> {
    try {
      await this.prisma.userRole.create({
        data: {
          userId,
          roleId,
          assignedBy,
          assignedAt: new Date(),
        },
      });

      this.logger.info('Role assigned to user', { userId, roleId, assignedBy });
    } catch (error) {
      this.logger.error('Failed to assign role to user', {
        error,
        userId,
        roleId,
      });
      throw error;
    }
  }

  async removeRole(userId: string, roleId: string): Promise<void> {
    try {
      await this.prisma.userRole.deleteMany({
        where: {
          userId,
          roleId,
        },
      });

      this.logger.info('Role removed from user', { userId, roleId });
    } catch (error) {
      this.logger.error('Failed to remove role from user', {
        error,
        userId,
        roleId,
      });
      throw error;
    }
  }

  async getUserPermissions(userId: string): Promise<string[]> {
    try {
      const userRoles = await this.prisma.userRole.findMany({
        where: { userId },
        include: {
          role: {
            include: {
              permissions: {
                include: {
                  permission: true,
                },
              },
            },
          },
        },
      });

      const permissions = new Set<string>();

      userRoles.forEach((userRole: any) => {
        userRole.role.permissions.forEach((rolePermission: any) => {
          permissions.add(rolePermission.permission.name);
        });
      });

      return Array.from(permissions);
    } catch (error) {
      this.logger.error('Failed to get user permissions', { error, userId });
      throw error;
    }
  }

  async bulkCreateUsers(users: CreateUserData[]): Promise<User[]> {
    try {
      const result = await this.prisma.$transaction(
        users.map((userData) =>
          this.prisma.user.create({
            data: {
              ...userData,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
          })
        )
      );

      this.logger.info('Bulk user creation completed', {
        count: result.length,
      });
      return result;
    } catch (error) {
      this.logger.error('Failed to bulk create users', {
        error,
        count: users.length,
      });
      throw error;
    }
  }

  async incrementFailedLoginAttempts(userId: string): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: { increment: 1 },
          updatedAt: new Date(),
        },
      });

      // Lock account if too many failed attempts
      if (user.failedLoginAttempts >= 5) {
        const lockDuration =
          Math.pow(2, Math.min(user.failedLoginAttempts - 5, 10)) * 60 * 1000; // Exponential backoff
        const lockedUntil = new Date(Date.now() + lockDuration);

        return await this.prisma.user.update({
          where: { id: userId },
          data: {
            lockedUntil,
            updatedAt: new Date(),
          },
        });
      }

      return user;
    } catch (error) {
      this.logger.error('Failed to increment failed login attempts', {
        error,
        userId,
      });
      throw error;
    }
  }

  async resetFailedLoginAttempts(userId: string): Promise<User> {
    try {
      const user = await this.prisma.user.update({
        where: { id: userId },
        data: {
          failedLoginAttempts: 0,
          lockedUntil: null,
          lastLoginAt: new Date(),
          updatedAt: new Date(),
        },
      });

      this.logger.info('Failed login attempts reset', { userId });
      return user;
    } catch (error) {
      this.logger.error('Failed to reset failed login attempts', {
        error,
        userId,
      });
      throw error;
    }
  }
}
