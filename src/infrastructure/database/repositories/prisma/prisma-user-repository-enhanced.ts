/**
 * Enhanced Prisma User Repository
 * Implements complex relational queries with caching and optimization
 */

import { PrismaClient } from '@prisma/client';
import { Logger } from 'winston';
import { BaseRepository } from '../base/base-repository';
import { TransactionManager } from '../base/transaction-manager';
import { MultiLayerCache } from '../../../cache/multi-layer-cache';
import {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  UserFilters,
  UserWithRelations,
} from '../interfaces/user-repository.interface';
import { ITransactionContext } from '../interfaces/base-repository.interface';
import { Role } from '../../../../domain/entities/role';
import { Permission } from '../../../../domain/entities/permission';

export class PrismaUserRepositoryEnhanced
  extends BaseRepository
  implements IUserRepository
{
  constructor(
    private prismaClient: PrismaClient,
    logger: Logger,
    transactionManager: TransactionManager,
    cache?: MultiLayerCache
  ) {
    super(logger, cache, transactionManager);
  }

  private ensureTransactionManager(): TransactionManager {
    if (!this.transactionManager) {
      throw new Error('Transaction manager is required for this operation');
    }
    return this.transactionManager;
  }

  // Basic CRUD operations
  async create(data: CreateUserData): Promise<UserWithRelations> {
    const startTime = Date.now();

    try {
      const result = await this.ensureTransactionManager().withTransaction(
        async (context: ITransactionContext) => {
          const { roles, ...userData } = data;

          // Create user
          const user = await context.prisma.user.create({
            data: {
              ...userData,
              createdAt: new Date(),
              updatedAt: new Date(),
            },
            include: this.getDefaultIncludes(),
          });

          // Assign roles if provided
          if (roles && roles.length > 0) {
            await context.prisma.userRole.createMany({
              data: roles.map((roleId) => ({
                userId: user.id,
                roleId,
                assignedAt: new Date(),
              })),
            });

            // Refetch with roles
            return await context.prisma.user.findUnique({
              where: { id: user.id },
              include: this.getDefaultIncludes(),
            });
          }

          return user;
        }
      );

      // Invalidate related caches
      await this.invalidateUserCaches(result.id);

      this.recordQuery('create', Date.now() - startTime, true);
      this.logger.info('User created successfully', {
        userId: result.id,
        email: result.email,
      });

      return result;
    } catch (error) {
      this.recordQuery('create', Date.now() - startTime, false);
      this.logger.error('Failed to create user', { error, data });
      throw error;
    }
  }

  async findById(id: string): Promise<UserWithRelations | null> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        () =>
          this.prismaClient.user.findUnique({
            where: { id },
            include: this.getDefaultIncludes(),
          }),
        {
          cacheKey: this.generateCacheKey('findById', { id }),
          ttl: 3600,
          preferReplica: true,
        }
      ) as UserWithRelations | null;

      this.recordQuery('findById', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('findById', Date.now() - startTime, false);
      this.logger.error('Failed to find user by ID', { error, id });
      throw error;
    }
  }

  async findByEmail(
    email: string,
    includeRelations: boolean = true
  ): Promise<UserWithRelations | null> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        () =>
          this.prismaClient.user.findUnique({
            where: { email },
            include: includeRelations ? this.getDefaultIncludes() : undefined,
          }),
        {
          cacheKey: this.generateCacheKey('findByEmail', {
            email,
            includeRelations,
          }),
          ttl: 1800,
          preferReplica: true,
        }
      ) as UserWithRelations | null;

      this.recordQuery('findByEmail', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('findByEmail', Date.now() - startTime, false);
      this.logger.error('Failed to find user by email', { error, email });
      throw error;
    }
  }

  async findByEmailCached(
    email: string,
    ttl: number = 1800
  ): Promise<UserWithRelations | null> {
    return this.findByIdCached(email, ttl);
  }

  async update(id: string, data: UpdateUserData): Promise<UserWithRelations> {
    const startTime = Date.now();

    try {
      const result = await this.ensureTransactionManager().withTransaction(
        async (context: ITransactionContext) => {
          const user = await context.prisma.user.update({
            where: { id },
            data: {
              ...data,
              updatedAt: new Date(),
            },
            include: this.getDefaultIncludes(),
          });

          return user;
        }
      );

      // Invalidate caches
      await this.invalidateUserCaches(id);

      this.recordQuery('update', Date.now() - startTime, true);
      this.logger.info('User updated successfully', { userId: id });

      return result;
    } catch (error) {
      this.recordQuery('update', Date.now() - startTime, false);
      this.logger.error('Failed to update user', { error, id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.ensureTransactionManager().withTransaction(async (context: ITransactionContext) => {
        // Soft delete by marking as inactive or hard delete based on requirements
        await context.prisma.user.delete({
          where: { id },
        });
      });

      // Invalidate caches
      await this.invalidateUserCaches(id);

      this.recordQuery('delete', Date.now() - startTime, true);
      this.logger.info('User deleted successfully', { userId: id });
    } catch (error) {
      this.recordQuery('delete', Date.now() - startTime, false);
      this.logger.error('Failed to delete user', { error, id });
      throw error;
    }
  }

  // Authentication-specific operations
  async incrementFailedLoginAttempts(
    userId: string
  ): Promise<UserWithRelations> {
    const startTime = Date.now();

    try {
      const result = await this.ensureTransactionManager().withTransaction(
        async (context) => {
          const user = await context.prisma.user.update({
            where: { id: userId },
            data: {
              failedLoginAttempts: { increment: 1 },
              updatedAt: new Date(),
            },
            include: this.getDefaultIncludes(),
          });

          // Auto-lock if too many failed attempts
          if (user.failedLoginAttempts >= 5) {
            const lockDuration =
              Math.pow(2, Math.min(user.failedLoginAttempts - 5, 10)) *
              60 *
              1000;
            const lockedUntil = new Date(Date.now() + lockDuration);

            return await context.prisma.user.update({
              where: { id: userId },
              data: {
                lockedUntil,
                updatedAt: new Date(),
              },
              include: this.getDefaultIncludes(),
            });
          }

          return user;
        }
      );

      await this.invalidateUserCaches(userId);
      this.recordQuery(
        'incrementFailedLoginAttempts',
        Date.now() - startTime,
        true
      );

      return result;
    } catch (error) {
      this.recordQuery(
        'incrementFailedLoginAttempts',
        Date.now() - startTime,
        false
      );
      this.logger.error('Failed to increment failed login attempts', {
        error,
        userId,
      });
      throw error;
    }
  }

  async resetFailedLoginAttempts(userId: string): Promise<UserWithRelations> {
    const startTime = Date.now();

    try {
      const result = await this.ensureTransactionManager().withTransaction(
        async (context) => {
          return await context.prisma.user.update({
            where: { id: userId },
            data: {
              failedLoginAttempts: 0,
              lockedUntil: null,
              lastLoginAt: new Date(),
              updatedAt: new Date(),
            },
            include: this.getDefaultIncludes(),
          });
        }
      );

      await this.invalidateUserCaches(userId);
      this.recordQuery(
        'resetFailedLoginAttempts',
        Date.now() - startTime,
        true
      );

      return result;
    } catch (error) {
      this.recordQuery(
        'resetFailedLoginAttempts',
        Date.now() - startTime,
        false
      );
      this.logger.error('Failed to reset failed login attempts', {
        error,
        userId,
      });
      throw error;
    }
  }

  async lockUser(
    userId: string,
    reason: string,
    lockedBy?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await this.ensureTransactionManager().withTransaction(async (context: ITransactionContext) => {
        await context.prisma.user.update({
          where: { id: userId },
          data: {
            lockedUntil: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
            updatedAt: new Date(),
          },
        });

        // Log the action
        await context.prisma.auditLog.create({
          data: {
            userId,
            action: 'USER_LOCKED',
            resource: 'user',
            details: { reason, lockedBy },
            timestamp: new Date(),
          },
        });
      });

      await this.invalidateUserCaches(userId);
      this.recordQuery('lockUser', Date.now() - startTime, true);
      this.logger.info('User locked', { userId, reason, lockedBy });
    } catch (error) {
      this.recordQuery('lockUser', Date.now() - startTime, false);
      this.logger.error('Failed to lock user', { error, userId, reason });
      throw error;
    }
  }

  async unlockUser(userId: string, unlockedBy?: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.ensureTransactionManager().withTransaction(async (context: ITransactionContext) => {
        await context.prisma.user.update({
          where: { id: userId },
          data: {
            lockedUntil: null,
            failedLoginAttempts: 0,
            updatedAt: new Date(),
          },
        });

        // Log the action
        await context.prisma.auditLog.create({
          data: {
            userId,
            action: 'USER_UNLOCKED',
            resource: 'user',
            details: { unlockedBy },
            timestamp: new Date(),
          },
        });
      });

      await this.invalidateUserCaches(userId);
      this.recordQuery('unlockUser', Date.now() - startTime, true);
      this.logger.info('User unlocked', { userId, unlockedBy });
    } catch (error) {
      this.recordQuery('unlockUser', Date.now() - startTime, false);
      this.logger.error('Failed to unlock user', { error, userId });
      throw error;
    }
  }

  // Role management
  async assignRole(
    userId: string,
    roleId: string,
    assignedBy?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await this.ensureTransactionManager().withTransaction(async (context: ITransactionContext) => {
        await context.prisma.userRole.create({
          data: {
            userId,
            roleId,
            assignedBy,
            assignedAt: new Date(),
          },
        });

        // Log the action
        await context.prisma.auditLog.create({
          data: {
            userId,
            action: 'ROLE_ASSIGNED',
            resource: 'user_role',
            details: { roleId, assignedBy },
            timestamp: new Date(),
          },
        });
      });

      await this.invalidateUserCaches(userId);
      this.recordQuery('assignRole', Date.now() - startTime, true);
      this.logger.info('Role assigned to user', { userId, roleId, assignedBy });
    } catch (error) {
      this.recordQuery('assignRole', Date.now() - startTime, false);
      this.logger.error('Failed to assign role to user', {
        error,
        userId,
        roleId,
      });
      throw error;
    }
  }

  async removeRole(
    userId: string,
    roleId: string,
    removedBy?: string
  ): Promise<void> {
    const startTime = Date.now();

    try {
      await this.ensureTransactionManager().withTransaction(async (context: ITransactionContext) => {
        await context.prisma.userRole.deleteMany({
          where: { userId, roleId },
        });

        // Log the action
        await context.prisma.auditLog.create({
          data: {
            userId,
            action: 'ROLE_REMOVED',
            resource: 'user_role',
            details: { roleId, removedBy },
            timestamp: new Date(),
          },
        });
      });

      await this.invalidateUserCaches(userId);
      this.recordQuery('removeRole', Date.now() - startTime, true);
      this.logger.info('Role removed from user', { userId, roleId, removedBy });
    } catch (error) {
      this.recordQuery('removeRole', Date.now() - startTime, false);
      this.logger.error('Failed to remove role from user', {
        error,
        userId,
        roleId,
      });
      throw error;
    }
  }

  async getUserRoles(userId: string): Promise<Role[]> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        async () => {
          const userRoles = await this.prismaClient.userRole.findMany({
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

          return userRoles.map((ur: any) => ur.role);
        },
        {
          cacheKey: this.generateCacheKey('getUserRoles', { userId }),
          ttl: 1800,
          preferReplica: true,
        }
      );

      this.recordQuery('getUserRoles', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('getUserRoles', Date.now() - startTime, false);
      this.logger.error('Failed to get user roles', { error, userId });
      throw error;
    }
  }

  async getUserPermissions(userId: string): Promise<Permission[]> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        async () => {
          const userRoles = await this.prismaClient.userRole.findMany({
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

          const permissions = new Map<string, Permission>();
          userRoles.forEach((userRole: any) => {
            userRole.role.permissions.forEach((rolePermission: any) => {
              permissions.set(
                rolePermission.permission.id,
                rolePermission.permission
              );
            });
          });

          return Array.from(permissions.values());
        },
        {
          cacheKey: this.generateCacheKey('getUserPermissions', { userId }),
          ttl: 1800,
          preferReplica: true,
        }
      );

      this.recordQuery('getUserPermissions', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('getUserPermissions', Date.now() - startTime, false);
      this.logger.error('Failed to get user permissions', { error, userId });
      throw error;
    }
  }

  // Implementation of remaining abstract methods
  async findByIds(ids: string[]): Promise<UserWithRelations[]> {
    const startTime = Date.now();

    try {
      const result = await this.prismaClient.user.findMany({
        where: { id: { in: ids } },
        include: this.getDefaultIncludes(),
      });

      this.recordQuery('findByIds', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('findByIds', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkCreate(data: CreateUserData[]): Promise<UserWithRelations[]> {
    const startTime = Date.now();

    try {
      const result = await this.ensureTransactionManager().withTransaction(
        async (context) => {
          const users = await Promise.all(
            data.map((userData) =>
              context.prisma.user.create({
                data: {
                  ...userData,
                  createdAt: new Date(),
                  updatedAt: new Date(),
                },
                include: this.getDefaultIncludes(),
              })
            )
          );

          return users;
        }
      );

      this.recordQuery('bulkCreate', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('bulkCreate', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkUpdate(
    updates: Array<{ id: string; data: UpdateUserData }>
  ): Promise<UserWithRelations[]> {
    const startTime = Date.now();

    try {
      const result = await this.ensureTransactionManager().withTransaction(
        async (context) => {
          const users = await Promise.all(
            updates.map((update) =>
              context.prisma.user.update({
                where: { id: update.id },
                data: {
                  ...update.data,
                  updatedAt: new Date(),
                },
                include: this.getDefaultIncludes(),
              })
            )
          );

          return users;
        }
      );

      // Invalidate caches for all updated users
      await Promise.all(
        updates.map((update) => this.invalidateUserCaches(update.id))
      );

      this.recordQuery('bulkUpdate', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('bulkUpdate', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const startTime = Date.now();

    try {
      await this.ensureTransactionManager().withTransaction(async (context: ITransactionContext) => {
        await context.prisma.user.deleteMany({
          where: { id: { in: ids } },
        });
      });

      // Invalidate caches for all deleted users
      await Promise.all(ids.map((id) => this.invalidateUserCaches(id)));

      this.recordQuery('bulkDelete', Date.now() - startTime, true);
    } catch (error) {
      this.recordQuery('bulkDelete', Date.now() - startTime, false);
      throw error;
    }
  }

  async findMany(
    filters: UserFilters
  ): Promise<{ items: UserWithRelations[]; total: number }> {
    const startTime = Date.now();

    try {
      const where = this.buildWhereClause(filters);
      const orderBy = this.buildOrderBy(filters);

      const [items, total] = await Promise.all([
        this.prismaClient.user.findMany({
          where,
          include: this.getDefaultIncludes(),
          take: filters.limit || 50,
          skip: filters.offset || 0,
          orderBy,
        }),
        this.prismaClient.user.count({ where }),
      ]);

      this.recordQuery('findMany', Date.now() - startTime, true);
      return { items, total };
    } catch (error) {
      this.recordQuery('findMany', Date.now() - startTime, false);
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      const result = await this.prismaClient.user.findUnique({
        where: { id },
        select: { id: true },
      });

      this.recordQuery('exists', Date.now() - startTime, true);
      return !!result;
    } catch (error) {
      this.recordQuery('exists', Date.now() - startTime, false);
      throw error;
    }
  }

  async count(filters?: Partial<UserFilters>): Promise<number> {
    const startTime = Date.now();

    try {
      const where = filters ? this.buildWhereClause(filters) : {};
      const result = await this.prismaClient.user.count({ where });

      this.recordQuery('count', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('count', Date.now() - startTime, false);
      throw error;
    }
  }

  // Additional methods for user-specific operations
  async searchUsers(
    query: string,
    limit: number = 50
  ): Promise<UserWithRelations[]> {
    const startTime = Date.now();

    try {
      const result = await this.prismaClient.user.findMany({
        where: {
          OR: [
            { email: { contains: query, mode: 'insensitive' } },
            { name: { contains: query, mode: 'insensitive' } },
          ],
        },
        include: this.getDefaultIncludes(),
        take: limit,
      });

      this.recordQuery('searchUsers', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('searchUsers', Date.now() - startTime, false);
      throw error;
    }
  }

  async findUsersWithRole(
    roleId: string,
    limit?: number,
    offset?: number
  ): Promise<{
    users: UserWithRelations[];
    total: number;
  }> {
    const startTime = Date.now();

    try {
      const [users, total] = await Promise.all([
        this.prismaClient.user.findMany({
          where: {
            roles: {
              some: { roleId },
            },
          },
          include: this.getDefaultIncludes(),
          take: limit || 50,
          skip: offset || 0,
        }),
        this.prismaClient.user.count({
          where: {
            roles: {
              some: { roleId },
            },
          },
        }),
      ]);

      this.recordQuery('findUsersWithRole', Date.now() - startTime, true);
      return { users, total };
    } catch (error) {
      this.recordQuery('findUsersWithRole', Date.now() - startTime, false);
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
    const startTime = Date.now();

    try {
      const now = new Date();
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      const weekAgo = new Date(today.getTime() - 7 * 24 * 60 * 60 * 1000);

      const [
        total,
        locked,
        mfaEnabled,
        newUsersToday,
        newUsersThisWeek,
        avgRiskScore,
      ] = await Promise.all([
        this.prismaClient.user.count(),
        this.prismaClient.user.count({
          where: { lockedUntil: { gt: now } },
        }),
        this.prismaClient.user.count({
          where: { mfaEnabled: true },
        }),
        this.prismaClient.user.count({
          where: { createdAt: { gte: today } },
        }),
        this.prismaClient.user.count({
          where: { createdAt: { gte: weekAgo } },
        }),
        this.prismaClient.user.aggregate({
          _avg: { riskScore: true },
        }),
      ]);

      const active = total - locked;
      const averageRiskScore = avgRiskScore._avg.riskScore || 0;

      this.recordQuery('getUserStats', Date.now() - startTime, true);

      return {
        total,
        active,
        locked,
        mfaEnabled,
        averageRiskScore,
        newUsersToday,
        newUsersThisWeek,
      };
    } catch (error) {
      this.recordQuery('getUserStats', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkCreateWithValidation(users: CreateUserData[]): Promise<{
    success: UserWithRelations[];
    failed: Array<{ data: CreateUserData; error: string }>;
  }> {
    const success: UserWithRelations[] = [];
    const failed: Array<{ data: CreateUserData; error: string }> = [];

    for (const userData of users) {
      try {
        const user = await this.create(userData);
        success.push(user);
      } catch (error) {
        failed.push({
          data: userData,
          error: (error as Error).message,
        });
      }
    }

    return { success, failed };
  }

  async exportUsers(filters?: UserFilters): Promise<any[]> {
    const { items } = await this.findMany(filters || {});

    return items.map((user) => ({
      id: user.id,
      email: user.email,
      name: user.name,
      emailVerified: user.emailVerified,
      mfaEnabled: user.mfaEnabled,
      createdAt: user.createdAt,
      lastLoginAt: user.lastLoginAt,
      riskScore: user.riskScore,
      roles: user.roles?.map((r) => r.name) || [],
    }));
  }

  async findSuspiciousUsers(
    riskThreshold: number = 0.7
  ): Promise<UserWithRelations[]> {
    return this.prismaClient.user.findMany({
      where: {
        riskScore: { gte: riskThreshold },
      },
      include: this.getDefaultIncludes(),
      orderBy: { riskScore: 'desc' },
    });
  }

  async updateRiskScore(userId: string, riskScore: number): Promise<void> {
    await this.update(userId, { riskScore });
  }

  // Helper methods
  private getDefaultIncludes() {
    return {
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
    };
  }

  private buildWhereClause(filters: Partial<UserFilters>) {
    const where: any = {};

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

    if (filters.emailVerified !== undefined) {
      where.emailVerified = filters.emailVerified ? { not: null } : null;
    }

    if (filters.roles && filters.roles.length > 0) {
      where.roles = {
        some: {
          roleId: { in: filters.roles },
        },
      };
    }

    if (filters.createdAfter) {
      where.createdAt = { ...where.createdAt, gte: filters.createdAfter };
    }

    if (filters.createdBefore) {
      where.createdAt = { ...where.createdAt, lte: filters.createdBefore };
    }

    if (filters.riskScoreMin !== undefined) {
      where.riskScore = { ...where.riskScore, gte: filters.riskScoreMin };
    }

    if (filters.riskScoreMax !== undefined) {
      where.riskScore = { ...where.riskScore, lte: filters.riskScoreMax };
    }

    return where;
  }

  private buildOrderBy(filters: UserFilters) {
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';

    return { [sortBy]: sortOrder };
  }

  private async invalidateUserCaches(userId: string): Promise<void> {
    const patterns = [
      `${this.constructor.name}:findById:*${userId}*`,
      `${this.constructor.name}:findByEmail:*`,
      `${this.constructor.name}:getUserRoles:*${userId}*`,
      `${this.constructor.name}:getUserPermissions:*${userId}*`,
    ];

    await Promise.all(patterns.map((pattern) => this.invalidateCache(pattern)));
  }
}
