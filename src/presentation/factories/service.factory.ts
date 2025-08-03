/**
 * Service Factory for Route Registration
 * Creates service instances for API route controllers
 */

import { PrismaClient } from '@prisma/client';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from 'winston';

// Import service factories
import { AuthenticationServiceFactory } from '../../application/factories/authentication.factory';
import { UserManagementServiceFactory } from '../../application/factories/user-management.factory';
import { OAuthProviderFactory } from '../../application/factories/oauth-provider.factory';

// Import services that might not have factories yet
import { MFAService } from '../../application/services/mfa.service';
import { SessionManagementService } from '../../application/services/session-management.service';
import { OAuthService } from '../../application/services/oauth.service';
import { OAuthServerService } from '../../application/services/oauth-server.service';
import { AuthorizationService } from '../../application/services/authorization.service';

// Import infrastructure services
import { logger } from '../../infrastructure/logging/winston-logger';
import { config } from '../../infrastructure/config/environment';

export interface ServiceFactoryDependencies {
  prismaClient?: PrismaClient;
  drizzleDb?: NodePgDatabase<any>;
  logger?: Logger;
}

export class ServiceFactory {
  private static instance: ServiceFactory;
  private services: any = {};

  private constructor(private dependencies: ServiceFactoryDependencies) {}

  static getInstance(
    dependencies?: ServiceFactoryDependencies
  ): ServiceFactory {
    if (!ServiceFactory.instance) {
      ServiceFactory.instance = new ServiceFactory(dependencies || {});
    }
    return ServiceFactory.instance;
  }

  /**
   * Create all services needed for route registration
   */
  createServices() {
    if (Object.keys(this.services).length > 0) {
      return this.services;
    }

    const {
      prismaClient,
      drizzleDb,
      logger: serviceLogger = logger,
    } = this.dependencies;

    try {
      // Create authentication service
      this.services.authenticationService = this.createAuthenticationService(
        prismaClient,
        drizzleDb,
        serviceLogger
      );

      // Create MFA service
      this.services.mfaService = this.createMFAService(
        prismaClient,
        serviceLogger
      );

      // Create session management service
      this.services.sessionService = this.createSessionService(
        prismaClient,
        drizzleDb,
        serviceLogger
      );

      // Create OAuth service
      this.services.oauthService = this.createOAuthService(
        prismaClient,
        serviceLogger
      );

      // Create OAuth server service
      this.services.oauthServerService = this.createOAuthServerService(
        prismaClient,
        serviceLogger
      );

      // Create user management service
      this.services.userManagementService = this.createUserManagementService(
        prismaClient,
        serviceLogger
      );

      // Create authorization service
      this.services.authorizationService = this.createAuthorizationService(
        prismaClient,
        serviceLogger
      );

      // Create passwordless authentication service
      this.services.passwordlessAuthService =
        this.createPasswordlessAuthService(prismaClient, serviceLogger);

      // Create device management service
      this.services.deviceManagementService =
        this.createDeviceManagementService(prismaClient, serviceLogger);

      // Create fallback authentication service
      this.services.fallbackAuthService = this.createFallbackAuthService(
        prismaClient,
        serviceLogger
      );

      // Create role management service
      this.services.roleManagementService = this.createRoleManagementService(
        prismaClient,
        serviceLogger
      );

      return this.services;
    } catch (error) {
      serviceLogger.error('Failed to create services', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return mock services for development
      return this.createMockServices();
    }
  }

  private createAuthenticationService(
    prismaClient?: PrismaClient,
    drizzleDb?: NodePgDatabase<any>,
    serviceLogger?: Logger
  ) {
    if (prismaClient && drizzleDb) {
      return AuthenticationServiceFactory.create({
        prismaClient,
        drizzleDb,
        logger: serviceLogger!,
        jwtAccessSecret: config.jwt.accessSecret,
        jwtRefreshSecret: config.jwt.refreshSecret,
      });
    }
    return this.createMockAuthenticationService();
  }

  private createMFAService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockMFAService();
  }

  private createSessionService(
    _prismaClient?: PrismaClient,
    _drizzleDb?: NodePgDatabase<any>,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockSessionService();
  }

  private createOAuthService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockOAuthService();
  }

  private createOAuthServerService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockOAuthServerService();
  }

  private createUserManagementService(
    prismaClient?: PrismaClient,
    serviceLogger?: Logger
  ) {
    if (prismaClient) {
      try {
        return UserManagementServiceFactory.create({
          prismaClient,
          logger: serviceLogger!,
        });
      } catch (error) {
        serviceLogger?.warn(
          'Failed to create UserManagementService, using mock',
          {
            error: error instanceof Error ? error.message : 'Unknown error',
          }
        );
      }
    }
    return this.createMockUserManagementService();
  }

  private createAuthorizationService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockAuthorizationService();
  }

  private createPasswordlessAuthService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockPasswordlessAuthService();
  }

  private createDeviceManagementService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockDeviceManagementService();
  }

  private createFallbackAuthService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockFallbackAuthService();
  }

  private createRoleManagementService(
    _prismaClient?: PrismaClient,
    _serviceLogger?: Logger
  ) {
    // For now, return a mock service
    return this.createMockRoleManagementService();
  }

  // Mock service creators for development/testing
  private createMockServices() {
    return {
      authenticationService: this.createMockAuthenticationService(),
      mfaService: this.createMockMFAService(),
      sessionService: this.createMockSessionService(),
      oauthService: this.createMockOAuthService(),
      oauthServerService: this.createMockOAuthServerService(),
      userManagementService: this.createMockUserManagementService(),
      authorizationService: this.createMockAuthorizationService(),
      passwordlessAuthService: this.createMockPasswordlessAuthService(),
      deviceManagementService: this.createMockDeviceManagementService(),
      fallbackAuthService: this.createMockFallbackAuthService(),
      roleManagementService: this.createMockRoleManagementService(),
    };
  }

  private createMockAuthenticationService() {
    return {
      authenticate: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Authentication service not available',
        },
        riskScore: 0,
      }),
      refreshToken: async () => ({ success: false }),
      initiatePasswordReset: async () => {},
      confirmPasswordReset: async () => ({ success: false }),
      changePassword: async () => ({ success: false }),
      getUserById: async () => null,
    };
  }

  private createMockMFAService() {
    return {
      setupMFA: async () => ({
        success: false,
        message: 'MFA service not available',
      }),
      verifyMFA: async () => ({ success: false }),
      completeMFAChallenge: async () => ({ success: false, riskScore: 0 }),
    };
  }

  private createMockSessionService() {
    return {
      terminateAllUserSessions: async () => {},
      terminateSession: async () => {},
      extendSession: async () => {},
      getActiveSessions: async () => [],
    };
  }

  private createMockOAuthService() {
    return {
      initiateOAuthFlow: async () => ({ authorizationUrl: '', state: '' }),
      handleCallback: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'OAuth service not available',
        },
      }),
      linkAccount: async () => ({ success: false }),
      unlinkAccount: async () => {},
      getUserAccounts: async () => [],
      refreshOAuthToken: async () => ({ success: false }),
    };
  }

  private createMockOAuthServerService() {
    return {
      authorize: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'OAuth server service not available',
        },
      }),
      token: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'OAuth server service not available',
        },
      }),
      getUserInfo: async () => null,
    };
  }

  private createMockUserManagementService() {
    return {
      createUser: async () => {
        throw new Error('User management service not available');
      },
      getUserById: async () => null,
      updateUser: async () => {
        throw new Error('User management service not available');
      },
      deleteUser: async () => {
        throw new Error('User management service not available');
      },
      getUsers: async () => ({ users: [], total: 0 }),
      searchUsers: async () => [],
      assignRole: async () => {
        throw new Error('User management service not available');
      },
      removeRole: async () => {
        throw new Error('User management service not available');
      },
      bulkCreateUsers: async () => ({
        success: false,
        processed: 0,
        failed: 0,
        errors: [],
      }),
      exportUsers: async () => [],
      lockUser: async () => {
        throw new Error('User management service not available');
      },
      unlockUser: async () => {
        throw new Error('User management service not available');
      },
      getUserStats: async () => ({
        totalUsers: 0,
        activeUsers: 0,
        lockedUsers: 0,
      }),
    };
  }

  private createMockAuthorizationService() {
    return {
      hasPermission: async () => false,
      getUserPermissions: async () => [],
      checkPermission: async () => {
        throw new Error('Authorization service not available');
      },
    };
  }

  private createMockPasswordlessAuthService() {
    return {
      initiatePasswordlessAuth: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Passwordless authentication service not available',
        },
        fallbackMethods: ['email_code', 'password_reset'],
        requiresRegistration: false,
      }),
      sendMagicLink: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Magic link service not available',
        },
      }),
      verifyMagicLink: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Magic link verification not available',
        },
      }),
      registerWebAuthnCredential: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'WebAuthn registration not available',
        },
      }),
      completeWebAuthnRegistration: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'WebAuthn registration completion not available',
        },
      }),
      authenticateWithWebAuthn: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'WebAuthn authentication not available',
        },
      }),
      initiateBiometricAuth: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Biometric authentication not available',
        },
        fallbackRequired: true,
      }),
    };
  }

  private createMockDeviceManagementService() {
    return {
      getUserDevices: async () => [],
      removeDevice: async () => false,
      registerDevice: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Device management service not available',
        },
      }),
      updateDeviceTrust: async () => false,
    };
  }

  private createMockFallbackAuthService() {
    return {
      initiateFallbackAuth: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Fallback authentication service not available',
        },
      }),
      getAvailableFallbackMethods: async () => ({
        methods: ['email_code', 'password_reset', 'support_contact'],
        recommendations: ['email_code'],
      }),
      completeFallbackAuth: async () => ({
        success: false,
        error: {
          code: 'SERVICE_UNAVAILABLE',
          message: 'Fallback authentication completion not available',
        },
      }),
    };
  }

  private createMockRoleManagementService() {
    return {
      createRole: async () => {
        throw new Error('Role management service not available');
      },
      getRoleById: async () => null,
      updateRole: async () => {
        throw new Error('Role management service not available');
      },
      deleteRole: async () => {
        throw new Error('Role management service not available');
      },
      getRoles: async () => ({ roles: [], total: 0 }),
      searchRoles: async () => [],
      addPermissionToRole: async () => {
        throw new Error('Role management service not available');
      },
      removePermissionFromRole: async () => {
        throw new Error('Role management service not available');
      },
      getRolePermissions: async () => [],
      getRoleHierarchy: async () => [],
      getSystemRoles: async () => [],
      validateRoleAssignment: async () => ({
        valid: false,
        reason: 'Role management service not available',
      }),
      getRoleStats: async () => ({
        totalRoles: 0,
        systemRoles: 0,
        customRoles: 0,
        adminRoles: 0,
      }),
    };
  }
}

/**
 * Create services for route registration
 */
export function createServicesForRoutes(
  dependencies?: ServiceFactoryDependencies
) {
  const factory = ServiceFactory.getInstance(dependencies);
  return factory.createServices();
}
