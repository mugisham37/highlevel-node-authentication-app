/**
 * Authorization Service Implementation
 * Provides permission checking and authorization functionality
 */

import { Logger } from 'winston';
import { Permission } from "@company/shared"entities/permission';
import { Role } from "@company/shared"entities/role';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { PrismaRoleRepository } from '../../infrastructure/database/repositories/prisma-role-repository';
import { PrismaPermissionRepository } from '../../infrastructure/database/repositories/prisma-permission-repository';
import {
  IAuthorizationService,
  AuthorizationContext,
  AuthorizationRequest,
  AuthorizationResult,
  RoleBasedCheck,
  PermissionBasedCheck,
  ResourceAccessCheck,
} from '../interfaces/authorization.interface';

export class AuthorizationService implements IAuthorizationService {
  private authorizationCache = new Map<
    string,
    { result: AuthorizationResult; timestamp: number }
  >();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  constructor(
    private userRepository: PrismaUserRepository,
    private roleRepository: PrismaRoleRepository,
    private permissionRepository: PrismaPermissionRepository,
    private logger: Logger
  ) {
    // Clean up cache every 10 minutes
    setInterval(
      () => {
        this.cleanupCache();
      },
      10 * 60 * 1000
    );
  }

  async authorize(
    context: AuthorizationContext,
    request: AuthorizationRequest
  ): Promise<AuthorizationResult> {
    try {
      // Check cache first
      const cacheKey = this.generateCacheKey(context, request);
      const cached = this.authorizationCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.CACHE_TTL) {
        return cached.result;
      }

      this.logger.debug('Authorizing request', {
        userId: context.userId,
        resource: request.resource,
        action: request.action,
      });

      // Get user permissions
      const userPermissions = await this.getUserPermissions(context.userId);

      const result: AuthorizationResult = {
        allowed: false,
        matchedPermissions: [],
        requiredPermissions: [`${request.resource}:${request.action}`],
        missingPermissions: [],
      };

      // Check if any permission matches
      for (const permission of userPermissions) {
        if (
          permission.matches(request.resource, request.action, request.context)
        ) {
          result.matchedPermissions.push(permission);
        }
      }

      // Determine if access is allowed
      if (request.requireAll) {
        // All required permissions must match
        result.allowed = result.requiredPermissions.every((reqPerm) =>
          result.matchedPermissions.some(
            (matched) =>
              matched.name === reqPerm ||
              matched.matches(request.resource, request.action, request.context)
          )
        );
      } else {
        // At least one permission must match
        result.allowed = result.matchedPermissions.length > 0;
      }

      // Set missing permissions
      if (!result.allowed) {
        result.missingPermissions = result.requiredPermissions.filter(
          (reqPerm) =>
            !result.matchedPermissions.some(
              (matched) => matched.name === reqPerm
            )
        );
        result.reason = `Missing required permissions: ${result.missingPermissions.join(', ')}`;
      }

      // Validate context conditions
      if (result.allowed && request.context) {
        const contextValidation = this.validateContextConditions(
          result.matchedPermissions,
          request.context
        );
        result.contextValidation = contextValidation;
        if (!contextValidation.valid) {
          result.allowed = false;
          result.reason = `Context validation failed: ${contextValidation.failedConditions.join(', ')}`;
        }
      }

      // Cache the result
      this.authorizationCache.set(cacheKey, {
        result,
        timestamp: Date.now(),
      });

      // Log authorization attempt
      await this.logAuthorizationAttempt(context, request, result);

      return result;
    } catch (error) {
      this.logger.error('Failed to authorize request', {
        error,
        context,
        request,
      });
      return {
        allowed: false,
        reason: 'Authorization error occurred',
        matchedPermissions: [],
        requiredPermissions: [`${request.resource}:${request.action}`],
        missingPermissions: [`${request.resource}:${request.action}`],
      };
    }
  }

  async authorizeMultiple(
    context: AuthorizationContext,
    requests: AuthorizationRequest[]
  ): Promise<AuthorizationResult[]> {
    try {
      const results: AuthorizationResult[] = [];

      for (const request of requests) {
        const result = await this.authorize(context, request);
        results.push(result);
      }

      return results;
    } catch (error) {
      this.logger.error('Failed to authorize multiple requests', {
        error,
        context,
        requests,
      });
      throw error;
    }
  }

  async hasRole(
    context: AuthorizationContext,
    roleCheck: RoleBasedCheck
  ): Promise<boolean> {
    try {
      if (roleCheck.requireAll) {
        return roleCheck.requiredRoles.every((role) =>
          context.roles.includes(role)
        );
      } else {
        return roleCheck.requiredRoles.some((role) =>
          context.roles.includes(role)
        );
      }
    } catch (error) {
      this.logger.error('Failed to check role', { error, context, roleCheck });
      return false;
    }
  }

  async hasAnyRole(
    context: AuthorizationContext,
    roles: string[]
  ): Promise<boolean> {
    return this.hasRole(context, { requiredRoles: roles, requireAll: false });
  }

  async hasAllRoles(
    context: AuthorizationContext,
    roles: string[]
  ): Promise<boolean> {
    return this.hasRole(context, { requiredRoles: roles, requireAll: true });
  }

  async hasPermission(
    context: AuthorizationContext,
    permissionCheck: PermissionBasedCheck
  ): Promise<boolean> {
    try {
      if (permissionCheck.requireAll) {
        return permissionCheck.requiredPermissions.every((permission) =>
          context.permissions.includes(permission)
        );
      } else {
        return permissionCheck.requiredPermissions.some((permission) =>
          context.permissions.includes(permission)
        );
      }
    } catch (error) {
      this.logger.error('Failed to check permission', {
        error,
        context,
        permissionCheck,
      });
      return false;
    }
  }

  async hasAnyPermission(
    context: AuthorizationContext,
    permissions: string[]
  ): Promise<boolean> {
    return this.hasPermission(context, {
      requiredPermissions: permissions,
      requireAll: false,
    });
  }

  async hasAllPermissions(
    context: AuthorizationContext,
    permissions: string[]
  ): Promise<boolean> {
    return this.hasPermission(context, {
      requiredPermissions: permissions,
      requireAll: true,
    });
  }

  async canAccessResource(
    context: AuthorizationContext,
    resourceCheck: ResourceAccessCheck
  ): Promise<AuthorizationResult> {
    try {
      const requests: AuthorizationRequest[] = resourceCheck.actions.map(
        (action) => ({
          resource: resourceCheck.resource,
          action,
          context: resourceCheck.context,
          requireAll: false,
        })
      );

      const results = await this.authorizeMultiple(context, requests);

      // Combine results
      const combinedResult: AuthorizationResult = {
        allowed: results.every((r) => r.allowed),
        matchedPermissions: results.flatMap((r) => r.matchedPermissions),
        requiredPermissions: results.flatMap((r) => r.requiredPermissions),
        missingPermissions: results.flatMap((r) => r.missingPermissions),
      };

      if (!combinedResult.allowed) {
        combinedResult.reason = `Access denied to ${resourceCheck.resource}. Missing permissions: ${combinedResult.missingPermissions.join(', ')}`;
      }

      return combinedResult;
    } catch (error) {
      this.logger.error('Failed to check resource access', {
        error,
        context,
        resourceCheck,
      });
      throw error;
    }
  }

  async canPerformAction(
    context: AuthorizationContext,
    resource: string,
    action: string,
    actionContext?: Record<string, any>
  ): Promise<boolean> {
    try {
      const result = await this.authorize(context, {
        resource,
        action,
        context: actionContext,
        requireAll: false,
      });

      return result.allowed;
    } catch (error) {
      this.logger.error('Failed to check action permission', {
        error,
        context,
        resource,
        action,
      });
      return false;
    }
  }

  async isAdmin(context: AuthorizationContext): Promise<boolean> {
    try {
      // Check for admin role
      if (context.roles.includes('admin')) {
        return true;
      }

      // Check for admin permissions
      const adminPermissions = ['admin:*', '*:*'];
      return adminPermissions.some((permission) =>
        context.permissions.includes(permission)
      );
    } catch (error) {
      this.logger.error('Failed to check admin status', { error, context });
      return false;
    }
  }

  async isSuperAdmin(context: AuthorizationContext): Promise<boolean> {
    try {
      // Check for super admin role
      if (context.roles.includes('superadmin')) {
        return true;
      }

      // Check for wildcard permissions
      return context.permissions.includes('*:*');
    } catch (error) {
      this.logger.error('Failed to check super admin status', {
        error,
        context,
      });
      return false;
    }
  }

  async canManageUser(
    context: AuthorizationContext,
    targetUserId: string
  ): Promise<boolean> {
    try {
      // Admins can manage all users
      if (await this.isAdmin(context)) {
        return true;
      }

      // Users can manage themselves
      if (context.userId === targetUserId) {
        return true;
      }

      // Check for user management permissions
      return await this.canPerformAction(context, 'users', 'manage', {
        targetUserId,
      });
    } catch (error) {
      this.logger.error('Failed to check user management permission', {
        error,
        context,
        targetUserId,
      });
      return false;
    }
  }

  async canManageRole(
    context: AuthorizationContext,
    roleId: string
  ): Promise<boolean> {
    try {
      // Admins can manage all roles
      if (await this.isAdmin(context)) {
        return true;
      }

      // Check for role management permissions
      return await this.canPerformAction(context, 'roles', 'manage', {
        roleId,
      });
    } catch (error) {
      this.logger.error('Failed to check role management permission', {
        error,
        context,
        roleId,
      });
      return false;
    }
  }

  async canAssignRole(
    context: AuthorizationContext,
    roleId: string
  ): Promise<boolean> {
    try {
      // Check if user can assign roles in general
      const canAssignRoles = await this.canPerformAction(
        context,
        'roles',
        'assign'
      );
      if (!canAssignRoles) {
        return false;
      }

      // Check hierarchy - users can only assign roles at or below their level
      const userRoles = await this.getUserRoles(context.userId);
      const targetRole = await this.roleRepository.findById(roleId, true);

      if (!targetRole) {
        return false;
      }

      // Get highest user role level
      const userMaxLevel = Math.max(
        ...userRoles.map((role) => (role as any).getHierarchyLevel())
      );
      const targetRoleLevel = (targetRole as any).getHierarchyLevel();

      return userMaxLevel > targetRoleLevel;
    } catch (error) {
      this.logger.error('Failed to check role assignment permission', {
        error,
        context,
        roleId,
      });
      return false;
    }
  }

  async canRevokeRole(
    context: AuthorizationContext,
    roleId: string
  ): Promise<boolean> {
    try {
      // Same logic as assign role
      return await this.canAssignRole(context, roleId);
    } catch (error) {
      this.logger.error('Failed to check role revocation permission', {
        error,
        context,
        roleId,
      });
      return false;
    }
  }

  async getAssignableRoles(context: AuthorizationContext): Promise<Role[]> {
    try {
      const userRoles = await this.getUserRoles(context.userId);
      const userMaxLevel = Math.max(
        ...userRoles.map((role) => (role as any).getHierarchyLevel())
      );

      const allRoles = await this.roleRepository.findMany({});

      return allRoles.roles.filter((role) => {
        const roleLevel = (role as any).getHierarchyLevel();
        return roleLevel < userMaxLevel && (role as any).canBeAssigned();
      }) as Role[];
    } catch (error) {
      this.logger.error('Failed to get assignable roles', { error, context });
      return [];
    }
  }

  async evaluateConditions(
    permissions: Permission[],
    context: Record<string, any>
  ): Promise<Permission[]> {
    try {
      return permissions.filter((permission) => {
        if (!permission.conditions) {
          return true; // No conditions means always valid
        }

        // Use the permission's built-in condition matching
        return permission.matches('*', '*', context);
      });
    } catch (error) {
      this.logger.error('Failed to evaluate conditions', {
        error,
        permissions,
        context,
      });
      return [];
    }
  }

  async validateContext(context: AuthorizationContext): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }> {
    try {
      const issues: string[] = [];
      const recommendations: string[] = [];

      // Validate user ID
      if (!context.userId) {
        issues.push('User ID is required');
      }

      // Validate roles
      if (!context.roles || context.roles.length === 0) {
        issues.push('User has no roles assigned');
        recommendations.push('Assign at least one role to the user');
      }

      // Validate permissions
      if (!context.permissions || context.permissions.length === 0) {
        issues.push('User has no permissions');
        recommendations.push('Assign roles with appropriate permissions');
      }

      // Check risk score
      if (context.riskScore && context.riskScore > 75) {
        issues.push('High risk score detected');
        recommendations.push(
          'Review user activity and consider additional authentication'
        );
      }

      return {
        valid: issues.length === 0,
        issues,
        recommendations,
      };
    } catch (error) {
      this.logger.error('Failed to validate context', { error, context });
      return {
        valid: false,
        issues: ['Context validation error'],
        recommendations: ['Contact system administrator'],
      };
    }
  }

  async bulkAuthorize(
    contexts: AuthorizationContext[],
    request: AuthorizationRequest
  ): Promise<Map<string, AuthorizationResult>> {
    try {
      const results = new Map<string, AuthorizationResult>();

      for (const context of contexts) {
        const result = await this.authorize(context, request);
        results.set(context.userId, result);
      }

      return results;
    } catch (error) {
      this.logger.error('Failed bulk authorization', { error, request });
      throw error;
    }
  }

  async clearAuthorizationCache(userId?: string): Promise<void> {
    try {
      if (userId) {
        // Clear cache entries for specific user
        for (const [key] of this.authorizationCache) {
          if (key.includes(userId)) {
            this.authorizationCache.delete(key);
          }
        }
      } else {
        // Clear entire cache
        this.authorizationCache.clear();
      }

      this.logger.info('Authorization cache cleared', { userId });
    } catch (error) {
      this.logger.error('Failed to clear authorization cache', {
        error,
        userId,
      });
    }
  }

  async warmAuthorizationCache(userId: string): Promise<void> {
    try {
      // Pre-load common permissions for user
      const commonRequests: AuthorizationRequest[] = [
        { resource: 'users', action: 'read', requireAll: false },
        { resource: 'users', action: 'update', requireAll: false },
        { resource: 'roles', action: 'read', requireAll: false },
        { resource: 'permissions', action: 'read', requireAll: false },
      ];

      const context = await this.buildAuthorizationContext(userId);

      for (const request of commonRequests) {
        await this.authorize(context, request);
      }

      this.logger.info('Authorization cache warmed', { userId });
    } catch (error) {
      this.logger.error('Failed to warm authorization cache', {
        error,
        userId,
      });
    }
  }

  async logAuthorizationAttempt(
    context: AuthorizationContext,
    request: AuthorizationRequest,
    result: AuthorizationResult
  ): Promise<void> {
    try {
      this.logger.info('Authorization attempt', {
        userId: context.userId,
        resource: request.resource,
        action: request.action,
        allowed: result.allowed,
        reason: result.reason,
        matchedPermissions: result.matchedPermissions.length,
        ipAddress: context.ipAddress,
        userAgent: context.userAgent,
      });
    } catch (error) {
      this.logger.error('Failed to log authorization attempt', { error });
    }
  }

  async getAuthorizationHistory(
    userId: string,
    _limit = 50 // TODO: Implement limit in audit log query
  ): Promise<
    Array<{
      timestamp: Date;
      resource: string;
      action: string;
      allowed: boolean;
      reason?: string;
    }>
  > {
    try {
      // In a real implementation, this would query an audit log
      // For now, return empty array
      return [];
    } catch (error) {
      this.logger.error('Failed to get authorization history', {
        error,
        userId,
      });
      return [];
    }
  }

  private async getUserPermissions(userId: string): Promise<Permission[]> {
    const permissionNames =
      await this.userRepository.getUserPermissions(userId);
    const permissions: Permission[] = [];

    for (const permissionName of permissionNames) {
      const permission =
        await this.permissionRepository.findByName(permissionName);
      if (permission) {
        permissions.push(permission);
      }
    }

    return permissions;
  }

  private async getUserRoles(userId: string): Promise<Role[]> {
    const userWithRelations = await this.userRepository.findById(userId, true);
    if (!userWithRelations || !userWithRelations.roles) {
      return [];
    }

    return userWithRelations.roles.map((userRole: any) => userRole.role);
  }

  private async buildAuthorizationContext(
    userId: string
  ): Promise<AuthorizationContext> {
    const userWithRelations = await this.userRepository.findById(userId, true);
    if (!userWithRelations) {
      throw new Error('User not found');
    }

    const roles = userWithRelations.roles?.map((ur: any) => ur.role.name) || [];
    const permissions = await this.userRepository.getUserPermissions(userId);

    return {
      userId,
      roles,
      permissions,
      riskScore: userWithRelations.riskScore,
    };
  }

  private validateContextConditions(
    permissions: Permission[],
    context: Record<string, any>
  ): {
    valid: boolean;
    failedConditions: string[];
  } {
    const failedConditions: string[] = [];

    for (const permission of permissions) {
      if (permission.conditions) {
        // This is a simplified validation - in reality, you'd use the permission's condition matching
        for (const [key, expectedValue] of Object.entries(
          permission.conditions
        )) {
          const actualValue = context[key];
          if (actualValue !== expectedValue) {
            failedConditions.push(
              `${key}: expected ${expectedValue}, got ${actualValue}`
            );
          }
        }
      }
    }

    return {
      valid: failedConditions.length === 0,
      failedConditions,
    };
  }

  private generateCacheKey(
    context: AuthorizationContext,
    request: AuthorizationRequest
  ): string {
    return `${context.userId}:${request.resource}:${request.action}:${JSON.stringify(request.context || {})}`;
  }

  private cleanupCache(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.authorizationCache.entries()) {
      if (now - entry.timestamp > this.CACHE_TTL) {
        this.authorizationCache.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      this.logger.debug('Cleaned up authorization cache', {
        cleanedCount,
        remainingCount: this.authorizationCache.size,
      });
    }
  }
}

