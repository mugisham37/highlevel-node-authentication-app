/**
 * User Management Factory
 * Creates and configures user management services and dependencies
 */

import { PrismaClient } from '../../generated/prisma';
import { Logger } from 'winston';
import { UserManagementService } from '../services/user-management.service';
import { RoleManagementService } from '../services/role-management.service';
import { PermissionManagementService } from '../services/permission-management.service';
import { AuthorizationService } from '../services/authorization.service';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { PrismaRoleRepository } from '../../infrastructure/database/repositories/prisma-role-repository';
import { PrismaPermissionRepository } from '../../infrastructure/database/repositories/prisma-permission-repository';
import { UserManagementController } from '../../presentation/controllers/user-management.controller';
import { RoleManagementController } from '../../presentation/controllers/role-management.controller';

export interface UserManagementDependencies {
  prisma: PrismaClient;
  logger: Logger;
}

export interface UserManagementServices {
  userManagementService: UserManagementService;
  roleManagementService: RoleManagementService;
  permissionManagementService: PermissionManagementService;
  authorizationService: AuthorizationService;
}

export interface UserManagementRepositories {
  userRepository: PrismaUserRepository;
  roleRepository: PrismaRoleRepository;
  permissionRepository: PrismaPermissionRepository;
}

export interface UserManagementControllers {
  userManagementController: UserManagementController;
  roleManagementController: RoleManagementController;
}

export class UserManagementFactory {
  private repositories: UserManagementRepositories;
  private services: UserManagementServices;
  private controllers: UserManagementControllers;

  constructor(private dependencies: UserManagementDependencies) {
    this.repositories = this.createRepositories();
    this.services = this.createServices();
    this.controllers = this.createControllers();
  }

  /**
   * Create repository instances
   */
  private createRepositories(): UserManagementRepositories {
    const { prisma, logger } = this.dependencies;

    return {
      userRepository: new PrismaUserRepository(prisma, logger),
      roleRepository: new PrismaRoleRepository(prisma, logger),
      permissionRepository: new PrismaPermissionRepository(prisma, logger),
    };
  }

  /**
   * Create service instances
   */
  private createServices(): UserManagementServices {
    const { logger } = this.dependencies;
    const { userRepository, roleRepository, permissionRepository } =
      this.repositories;

    const userManagementService = new UserManagementService(
      userRepository,
      roleRepository,
      logger
    );

    const roleManagementService = new RoleManagementService(
      roleRepository,
      permissionRepository,
      logger
    );

    const permissionManagementService = new PermissionManagementService(
      permissionRepository,
      logger
    );

    const authorizationService = new AuthorizationService(
      userRepository,
      roleRepository,
      permissionRepository,
      logger
    );

    return {
      userManagementService,
      roleManagementService,
      permissionManagementService,
      authorizationService,
    };
  }

  /**
   * Create controller instances
   */
  private createControllers(): UserManagementControllers {
    const { userManagementService, roleManagementService } = this.services;

    return {
      userManagementController: new UserManagementController(
        userManagementService
      ),
      roleManagementController: new RoleManagementController(
        roleManagementService
      ),
    };
  }

  /**
   * Get all repositories
   */
  getRepositories(): UserManagementRepositories {
    return this.repositories;
  }

  /**
   * Get all services
   */
  getServices(): UserManagementServices {
    return this.services;
  }

  /**
   * Get all controllers
   */
  getControllers(): UserManagementControllers {
    return this.controllers;
  }

  /**
   * Get user management service
   */
  getUserManagementService(): UserManagementService {
    return this.services.userManagementService;
  }

  /**
   * Get role management service
   */
  getRoleManagementService(): RoleManagementService {
    return this.services.roleManagementService;
  }

  /**
   * Get permission management service
   */
  getPermissionManagementService(): PermissionManagementService {
    return this.services.permissionManagementService;
  }

  /**
   * Get authorization service
   */
  getAuthorizationService(): AuthorizationService {
    return this.services.authorizationService;
  }

  /**
   * Get user management controller
   */
  getUserManagementController(): UserManagementController {
    return this.controllers.userManagementController;
  }

  /**
   * Get role management controller
   */
  getRoleManagementController(): RoleManagementController {
    return this.controllers.roleManagementController;
  }

  /**
   * Initialize default system roles and permissions
   */
  async initializeSystemData(): Promise<void> {
    const { logger } = this.dependencies;
    const { roleManagementService, permissionManagementService } =
      this.services;

    try {
      logger.info('Initializing system roles and permissions');

      // Create system permissions
      const systemPermissions = [
        // User permissions
        { name: 'users:create', resource: 'users', action: 'create' },
        { name: 'users:read', resource: 'users', action: 'read' },
        { name: 'users:update', resource: 'users', action: 'update' },
        { name: 'users:delete', resource: 'users', action: 'delete' },
        { name: 'users:list', resource: 'users', action: 'list' },
        { name: 'users:search', resource: 'users', action: 'search' },
        { name: 'users:assign_role', resource: 'users', action: 'assign_role' },
        { name: 'users:remove_role', resource: 'users', action: 'remove_role' },
        { name: 'users:bulk_create', resource: 'users', action: 'bulk_create' },
        { name: 'users:export', resource: 'users', action: 'export' },
        { name: 'users:lock', resource: 'users', action: 'lock' },
        { name: 'users:unlock', resource: 'users', action: 'unlock' },
        { name: 'users:stats', resource: 'users', action: 'stats' },

        // Role permissions
        { name: 'roles:create', resource: 'roles', action: 'create' },
        { name: 'roles:read', resource: 'roles', action: 'read' },
        { name: 'roles:update', resource: 'roles', action: 'update' },
        { name: 'roles:delete', resource: 'roles', action: 'delete' },
        { name: 'roles:list', resource: 'roles', action: 'list' },
        { name: 'roles:search', resource: 'roles', action: 'search' },
        {
          name: 'roles:manage_permissions',
          resource: 'roles',
          action: 'manage_permissions',
        },
        {
          name: 'roles:read_hierarchy',
          resource: 'roles',
          action: 'read_hierarchy',
        },
        { name: 'roles:read_system', resource: 'roles', action: 'read_system' },
        { name: 'roles:validate', resource: 'roles', action: 'validate' },
        { name: 'roles:stats', resource: 'roles', action: 'stats' },

        // Permission permissions
        {
          name: 'permissions:create',
          resource: 'permissions',
          action: 'create',
        },
        { name: 'permissions:read', resource: 'permissions', action: 'read' },
        {
          name: 'permissions:update',
          resource: 'permissions',
          action: 'update',
        },
        {
          name: 'permissions:delete',
          resource: 'permissions',
          action: 'delete',
        },
        { name: 'permissions:list', resource: 'permissions', action: 'list' },
        {
          name: 'permissions:search',
          resource: 'permissions',
          action: 'search',
        },
        { name: 'permissions:stats', resource: 'permissions', action: 'stats' },

        // Admin permissions
        { name: 'admin:*', resource: 'admin', action: '*' },
        { name: '*:*', resource: '*', action: '*' },
      ];

      // Create permissions if they don't exist
      for (const permissionData of systemPermissions) {
        try {
          const existing =
            await permissionManagementService.getPermissionByName(
              permissionData.name
            );
          if (!existing) {
            await permissionManagementService.createSystemPermission(
              permissionData
            );
            logger.info('Created system permission', {
              name: permissionData.name,
            });
          }
        } catch (error) {
          logger.warn('Failed to create system permission', {
            name: permissionData.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      // Create system roles
      const systemRoles = [
        {
          name: 'admin',
          description: 'Administrator with full system access',
          permissions: ['admin:*', '*:*'],
        },
        {
          name: 'user',
          description: 'Standard user with basic permissions',
          permissions: ['users:read', 'roles:read'],
        },
        {
          name: 'moderator',
          description: 'Moderator with user management permissions',
          permissions: [
            'users:read',
            'users:list',
            'users:search',
            'users:lock',
            'users:unlock',
            'roles:read',
            'roles:list',
            'roles:search',
          ],
        },
        {
          name: 'guest',
          description: 'Guest user with minimal permissions',
          permissions: [],
        },
      ];

      // Create roles if they don't exist
      for (const roleData of systemRoles) {
        try {
          const existing = await roleManagementService.getRoleByName(
            roleData.name
          );
          if (!existing) {
            const role = await roleManagementService.createSystemRole({
              name: roleData.name,
              description: roleData.description,
            });

            // Add permissions to role
            for (const permissionName of roleData.permissions) {
              const permission =
                await permissionManagementService.getPermissionByName(
                  permissionName
                );
              if (permission) {
                await roleManagementService.addPermissionToRole(
                  role.id,
                  permission.id,
                  'system'
                );
              }
            }

            logger.info('Created system role', { name: roleData.name });
          }
        } catch (error) {
          logger.warn('Failed to create system role', {
            name: roleData.name,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      logger.info('System roles and permissions initialization completed');
    } catch (error) {
      logger.error('Failed to initialize system data', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cleanup resources
   */
  async cleanup(): Promise<void> {
    // Clear authorization cache
    await this.services.authorizationService.clearAuthorizationCache();
  }
}
