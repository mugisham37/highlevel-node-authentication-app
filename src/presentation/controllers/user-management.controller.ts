/**
 * User Management Controller
 * Provides administrative interfaces for user and role management
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { UserManagementService } from '../../application/services/user-management.service';
import { logger } from '../../infrastructure/logging/winston-logger';
import {
  CreateUserData,
  UpdateUserData,
  UserFilters,
} from '../../application/interfaces/user-management.interface';

export class UserManagementController {
  constructor(private userManagementService: UserManagementService) {}

  /**
   * Create a new user
   */
  async createUser(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const data = request.body as CreateUserData;
      const createdBy = request.user?.id;

      const user = await this.userManagementService.createUser(data, createdBy);

      logger.info('User created via API', {
        correlationId: request.correlationId,
        userId: user.id,
        email: user.email.value,
        createdBy,
      });

      reply.status(201).send({
        success: true,
        data: {
          id: user.id,
          email: user.email.value,
          name: user.name,
          emailVerified: user.isEmailVerified(),
          mfaEnabled: user.mfaEnabled,
          createdAt: user.createdAt,
          roles: user.roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
          })),
          permissions: user.permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            resource: permission.resource,
            action: permission.action,
          })),
        },
        message: 'User created successfully',
      });
    } catch (error) {
      logger.error('Failed to create user via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: 'USER_CREATION_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to create user',
      });
    }
  }

  /**
   * Get user by ID
   */
  async getUserById(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };
      const includeRelations =
        (request.query as any)?.includeRelations !== 'false';

      const user = await this.userManagementService.getUserById(
        userId,
        includeRelations
      );

      if (!user) {
        reply.status(404).send({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
        });
        return;
      }

      reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email.value,
          name: user.name,
          image: user.image,
          emailVerified: user.isEmailVerified(),
          mfaEnabled: user.mfaEnabled,
          createdAt: user.createdAt,
          updatedAt: user.updatedAt,
          lastLoginAt: user.lastLoginAt,
          riskScore: user.riskScore,
          isLocked: user.isLocked(),
          securityStatus: user.getSecurityStatus(),
          roles: user.roles.map((role) => ({
            id: role.id,
            name: role.name,
            description: role.description,
            hierarchyLevel: (role as any).getHierarchyLevel(),
          })),
          permissions: user.permissions.map((permission) => ({
            id: permission.id,
            name: permission.name,
            resource: permission.resource,
            action: permission.action,
            description: permission.getDescription(),
          })),
        },
      });
    } catch (error) {
      logger.error('Failed to get user by ID via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
      });

      reply.status(500).send({
        success: false,
        error: 'USER_FETCH_FAILED',
        message: 'Failed to fetch user',
      });
    }
  }

  /**
   * Update user
   */
  async updateUser(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };
      const data = request.body as UpdateUserData;
      const updatedBy = request.user?.id;

      const user = await this.userManagementService.updateUser(
        userId,
        data,
        updatedBy
      );

      logger.info('User updated via API', {
        correlationId: request.correlationId,
        userId: user.id,
        updatedBy,
        changes: Object.keys(data),
      });

      reply.send({
        success: true,
        data: {
          id: user.id,
          email: user.email.value,
          name: user.name,
          image: user.image,
          emailVerified: user.isEmailVerified(),
          mfaEnabled: user.mfaEnabled,
          updatedAt: user.updatedAt,
        },
        message: 'User updated successfully',
      });
    } catch (error) {
      logger.error('Failed to update user via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: 'USER_UPDATE_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to update user',
      });
    }
  }

  /**
   * Delete user
   */
  async deleteUser(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };
      const deletedBy = request.user?.id;

      await this.userManagementService.deleteUser(userId, deletedBy);

      logger.info('User deleted via API', {
        correlationId: request.correlationId,
        userId,
        deletedBy,
      });

      reply.send({
        success: true,
        message: 'User deleted successfully',
      });
    } catch (error) {
      logger.error('Failed to delete user via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
      });

      reply.status(400).send({
        success: false,
        error: 'USER_DELETION_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to delete user',
      });
    }
  }

  /**
   * Get users with filters
   */
  async getUsers(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const query = request.query as any;
      const filters: UserFilters = {
        search: query.search,
        mfaEnabled:
          query.mfaEnabled === 'true'
            ? true
            : query.mfaEnabled === 'false'
              ? false
              : undefined,
        locked: query.locked === 'true',
        emailVerified:
          query.emailVerified === 'true'
            ? true
            : query.emailVerified === 'false'
              ? false
              : undefined,
        roles: query.roles
          ? Array.isArray(query.roles)
            ? query.roles
            : [query.roles]
          : undefined,
        createdAfter: query.createdAfter
          ? new Date(query.createdAfter)
          : undefined,
        createdBefore: query.createdBefore
          ? new Date(query.createdBefore)
          : undefined,
        riskScoreMin: query.riskScoreMin
          ? parseFloat(query.riskScoreMin)
          : undefined,
        riskScoreMax: query.riskScoreMax
          ? parseFloat(query.riskScoreMax)
          : undefined,
        limit: query.limit ? parseInt(query.limit) : 50,
        offset: query.offset ? parseInt(query.offset) : 0,
        sortBy: query.sortBy,
        sortOrder: query.sortOrder,
      };

      const result = await this.userManagementService.getUsers(filters);

      reply.send({
        success: true,
        data: {
          users: result.users.map((user) => ({
            id: user.id,
            email: user.email.value,
            name: user.name,
            emailVerified: user.isEmailVerified(),
            mfaEnabled: user.mfaEnabled,
            createdAt: user.createdAt,
            lastLoginAt: user.lastLoginAt,
            riskScore: user.riskScore,
            isLocked: user.isLocked(),
            roles: user.roles.map((role) => role.name),
          })),
          pagination: {
            total: result.total,
            limit: filters.limit,
            offset: filters.offset,
            hasMore:
              (filters.offset || 0) + (filters.limit || 50) < result.total,
          },
        },
      });
    } catch (error) {
      logger.error('Failed to get users via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query: request.query,
      });

      reply.status(500).send({
        success: false,
        error: 'USERS_FETCH_FAILED',
        message: 'Failed to fetch users',
      });
    }
  }

  /**
   * Search users
   */
  async searchUsers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { query } = request.query as { query: string };
      const limit = parseInt((request.query as any).limit) || 10;

      if (!query || query.length < 2) {
        reply.status(400).send({
          success: false,
          error: 'INVALID_SEARCH_QUERY',
          message: 'Search query must be at least 2 characters long',
        });
        return;
      }

      const users = await this.userManagementService.searchUsers(query, limit);

      reply.send({
        success: true,
        data: users.map((user) => ({
          id: user.id,
          email: user.email.value,
          name: user.name,
          image: user.image,
          roles: user.roles.map((role) => role.name),
        })),
      });
    } catch (error) {
      logger.error('Failed to search users via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query: request.query,
      });

      reply.status(500).send({
        success: false,
        error: 'USER_SEARCH_FAILED',
        message: 'Failed to search users',
      });
    }
  }

  /**
   * Assign role to user
   */
  async assignRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };
      const { roleId } = request.body as { roleId: string };
      const assignedBy = request.user?.id;

      await this.userManagementService.assignRole(userId, roleId, assignedBy);

      logger.info('Role assigned to user via API', {
        correlationId: request.correlationId,
        userId,
        roleId,
        assignedBy,
      });

      reply.send({
        success: true,
        message: 'Role assigned successfully',
      });
    } catch (error) {
      logger.error('Failed to assign role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
        body: request.body,
      });

      reply.status(400).send({
        success: false,
        error: 'ROLE_ASSIGNMENT_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to assign role',
      });
    }
  }

  /**
   * Remove role from user
   */
  async removeRole(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId, roleId } = request.params as {
        userId: string;
        roleId: string;
      };
      const removedBy = request.user?.id;

      await this.userManagementService.removeRole(userId, roleId, removedBy);

      logger.info('Role removed from user via API', {
        correlationId: request.correlationId,
        userId,
        roleId,
        removedBy,
      });

      reply.send({
        success: true,
        message: 'Role removed successfully',
      });
    } catch (error) {
      logger.error('Failed to remove role via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
        roleId: (request.params as any)?.roleId,
      });

      reply.status(400).send({
        success: false,
        error: 'ROLE_REMOVAL_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to remove role',
      });
    }
  }

  /**
   * Bulk create users
   */
  async bulkCreateUsers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { users } = request.body as { users: CreateUserData[] };
      const createdBy = request.user?.id;

      if (!Array.isArray(users) || users.length === 0) {
        reply.status(400).send({
          success: false,
          error: 'INVALID_BULK_DATA',
          message: 'Users array is required and must not be empty',
        });
        return;
      }

      const result = await this.userManagementService.bulkCreateUsers(
        users,
        createdBy
      );

      logger.info('Bulk user creation via API', {
        correlationId: request.correlationId,
        processed: result.processed,
        failed: result.failed,
        createdBy,
      });

      reply.status(result.success ? 201 : 207).send({
        success: result.success,
        data: {
          processed: result.processed,
          failed: result.failed,
          errors: result.errors,
        },
        message: result.success
          ? 'All users created successfully'
          : `${result.processed} users created, ${result.failed} failed`,
      });
    } catch (error) {
      logger.error('Failed bulk user creation via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'BULK_USER_CREATION_FAILED',
        message: 'Failed to create users in bulk',
      });
    }
  }

  /**
   * Export users
   */
  async exportUsers(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const query = request.query as any;
      const filters: UserFilters = {
        search: query.search,
        mfaEnabled:
          query.mfaEnabled === 'true'
            ? true
            : query.mfaEnabled === 'false'
              ? false
              : undefined,
        locked: query.locked === 'true',
        emailVerified:
          query.emailVerified === 'true'
            ? true
            : query.emailVerified === 'false'
              ? false
              : undefined,
        roles: query.roles
          ? Array.isArray(query.roles)
            ? query.roles
            : [query.roles]
          : undefined,
        createdAfter: query.createdAfter
          ? new Date(query.createdAfter)
          : undefined,
        createdBefore: query.createdBefore
          ? new Date(query.createdBefore)
          : undefined,
      };

      const users = await this.userManagementService.exportUsers(filters);

      logger.info('Users exported via API', {
        correlationId: request.correlationId,
        count: users.length,
        exportedBy: request.user?.id,
      });

      reply.header('Content-Type', 'application/json');
      reply.header(
        'Content-Disposition',
        `attachment; filename="users-export-${new Date().toISOString().split('T')[0]}.json"`
      );

      reply.send({
        success: true,
        data: {
          exportedAt: new Date().toISOString(),
          count: users.length,
          users,
        },
      });
    } catch (error) {
      logger.error('Failed to export users via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        query: request.query,
      });

      reply.status(500).send({
        success: false,
        error: 'USER_EXPORT_FAILED',
        message: 'Failed to export users',
      });
    }
  }

  /**
   * Lock user
   */
  async lockUser(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };
      const { reason } = request.body as { reason: string };
      const lockedBy = request.user?.id;

      await this.userManagementService.lockUser(userId, reason, lockedBy);

      logger.info('User locked via API', {
        correlationId: request.correlationId,
        userId,
        reason,
        lockedBy,
      });

      reply.send({
        success: true,
        message: 'User locked successfully',
      });
    } catch (error) {
      logger.error('Failed to lock user via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
      });

      reply.status(400).send({
        success: false,
        error: 'USER_LOCK_FAILED',
        message: error instanceof Error ? error.message : 'Failed to lock user',
      });
    }
  }

  /**
   * Unlock user
   */
  async unlockUser(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };
      const unlockedBy = request.user?.id;

      await this.userManagementService.unlockUser(userId, unlockedBy);

      logger.info('User unlocked via API', {
        correlationId: request.correlationId,
        userId,
        unlockedBy,
      });

      reply.send({
        success: true,
        message: 'User unlocked successfully',
      });
    } catch (error) {
      logger.error('Failed to unlock user via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: (request.params as any)?.userId,
      });

      reply.status(400).send({
        success: false,
        error: 'USER_UNLOCK_FAILED',
        message:
          error instanceof Error ? error.message : 'Failed to unlock user',
      });
    }
  }

  /**
   * Get user statistics
   */
  async getUserStats(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const stats = await this.userManagementService.getUserStats();

      reply.send({
        success: true,
        data: stats,
      });
    } catch (error) {
      logger.error('Failed to get user stats via API', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'USER_STATS_FAILED',
        message: 'Failed to fetch user statistics',
      });
    }
  }
}
