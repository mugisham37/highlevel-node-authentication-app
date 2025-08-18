/**
 * Authentication Guards
 * Provides guard functions for protecting routes and resources
 */

import { Session } from '@company/shared/entities/session';
import { User } from '@company/shared/entities/user';

export interface AuthGuardContext {
  user?: User;
  session?: Session;
  resource?: any;
  action?: string;
  metadata?: Record<string, any>;
}

export interface GuardResult {
  allowed: boolean;
  reason?: string;
  requiredRoles?: string[];
  requiredPermissions?: string[];
}

export abstract class BaseAuthGuard {
  abstract canActivate(context: AuthGuardContext): Promise<GuardResult> | GuardResult;
}

/**
 * Role-based authentication guard
 */
export class RoleGuard extends BaseAuthGuard {
  constructor(private readonly requiredRoles: string[]) {
    super();
  }

  canActivate(context: AuthGuardContext): GuardResult {
    if (!context.user) {
      return {
        allowed: false,
        reason: 'User not authenticated',
        requiredRoles: this.requiredRoles
      };
    }

    if (!context.user.roles || context.user.roles.length === 0) {
      return {
        allowed: false,
        reason: 'User has no roles assigned',
        requiredRoles: this.requiredRoles
      };
    }

    const userRoles = context.user.roles.map(role => role.name);
    const hasRequiredRole = this.requiredRoles.some(role => userRoles.includes(role));

    if (!hasRequiredRole) {
      return {
        allowed: false,
        reason: 'User does not have required roles',
        requiredRoles: this.requiredRoles
      };
    }

    return { allowed: true };
  }
}

/**
 * Permission-based authentication guard
 */
export class PermissionGuard extends BaseAuthGuard {
  constructor(private readonly requiredPermissions: string[]) {
    super();
  }

  canActivate(context: AuthGuardContext): GuardResult {
    if (!context.user) {
      return {
        allowed: false,
        reason: 'User not authenticated',
        requiredPermissions: this.requiredPermissions
      };
    }

    if (!context.user.roles || context.user.roles.length === 0) {
      return {
        allowed: false,
        reason: 'User has no roles assigned',
        requiredPermissions: this.requiredPermissions
      };
    }

    const userPermissions = context.user.roles.flatMap(role => 
      role.permissions?.map(p => p.name) || []
    );

    const hasAllPermissions = this.requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );

    if (!hasAllPermissions) {
      return {
        allowed: false,
        reason: 'User does not have required permissions',
        requiredPermissions: this.requiredPermissions
      };
    }

    return { allowed: true };
  }
}

/**
 * Resource ownership guard
 */
export class OwnershipGuard extends BaseAuthGuard {
  constructor(private readonly ownershipField: string = 'userId') {
    super();
  }

  canActivate(context: AuthGuardContext): GuardResult {
    if (!context.user) {
      return {
        allowed: false,
        reason: 'User not authenticated'
      };
    }

    if (!context.resource) {
      return {
        allowed: false,
        reason: 'Resource not provided'
      };
    }

    const resourceOwnerId = context.resource[this.ownershipField];
    if (!resourceOwnerId) {
      return {
        allowed: false,
        reason: `Resource does not have ${this.ownershipField} field`
      };
    }

    if (resourceOwnerId !== context.user.id) {
      return {
        allowed: false,
        reason: 'User does not own this resource'
      };
    }

    return { allowed: true };
  }
}

/**
 * Session validity guard
 */
export class SessionGuard extends BaseAuthGuard {
  canActivate(context: AuthGuardContext): GuardResult {
    if (!context.session) {
      return {
        allowed: false,
        reason: 'No active session'
      };
    }

    if (!context.session.isValid()) {
      return {
        allowed: false,
        reason: 'Session is invalid or expired'
      };
    }

    if (context.session.riskScore > 80) {
      return {
        allowed: false,
        reason: 'Session has high risk score'
      };
    }

    return { allowed: true };
  }
}

/**
 * MFA requirement guard
 */
export class MFAGuard extends BaseAuthGuard {
  canActivate(context: AuthGuardContext): GuardResult {
    if (!context.user) {
      return {
        allowed: false,
        reason: 'User not authenticated'
      };
    }

    if (!context.user.mfaEnabled) {
      return {
        allowed: false,
        reason: 'Multi-factor authentication is required'
      };
    }

    // Check if session has MFA verification
    if (context.session && !context.session.mfaVerified) {
      return {
        allowed: false,
        reason: 'MFA verification required for this session'
      };
    }

    return { allowed: true };
  }
}

/**
 * Time-based access guard
 */
export class TimeBasedGuard extends BaseAuthGuard {
  constructor(
    private readonly allowedHours: { start: number; end: number },
    private readonly timezone: string = 'UTC'
  ) {
    super();
  }

  canActivate(context: AuthGuardContext): GuardResult {
    const now = new Date();
    const currentHour = now.getHours(); // Simplified - in production, use proper timezone handling

    if (currentHour < this.allowedHours.start || currentHour > this.allowedHours.end) {
      return {
        allowed: false,
        reason: `Access is only allowed between ${this.allowedHours.start}:00 and ${this.allowedHours.end}:00`
      };
    }

    return { allowed: true };
  }
}

/**
 * IP whitelist guard
 */
export class IPWhitelistGuard extends BaseAuthGuard {
  constructor(private readonly allowedIPs: string[]) {
    super();
  }

  canActivate(context: AuthGuardContext): GuardResult {
    const clientIP = context.metadata?.ipAddress;
    
    if (!clientIP) {
      return {
        allowed: false,
        reason: 'Client IP address not available'
      };
    }

    if (!this.allowedIPs.includes(clientIP)) {
      return {
        allowed: false,
        reason: 'IP address not in whitelist'
      };
    }

    return { allowed: true };
  }
}

/**
 * Composite guard that combines multiple guards
 */
export class CompositeGuard extends BaseAuthGuard {
  constructor(
    private readonly guards: BaseAuthGuard[],
    private readonly operator: 'AND' | 'OR' = 'AND'
  ) {
    super();
  }

  async canActivate(context: AuthGuardContext): Promise<GuardResult> {
    const results: GuardResult[] = [];

    for (const guard of this.guards) {
      const result = await guard.canActivate(context);
      results.push(result);

      if (this.operator === 'AND' && !result.allowed) {
        return result; // Fail fast for AND operation
      }

      if (this.operator === 'OR' && result.allowed) {
        return result; // Success fast for OR operation
      }
    }

    if (this.operator === 'OR') {
      // All guards failed for OR operation
      return {
        allowed: false,
        reason: 'None of the authorization conditions were met',
        requiredRoles: results.flatMap(r => r.requiredRoles || []),
        requiredPermissions: results.flatMap(r => r.requiredPermissions || [])
      };
    }

    // All guards passed for AND operation
    return { allowed: true };
  }
}

/**
 * Guard factory for creating common guard combinations
 */
export class GuardFactory {
  static createRoleGuard(roles: string[]): RoleGuard {
    return new RoleGuard(roles);
  }

  static createPermissionGuard(permissions: string[]): PermissionGuard {
    return new PermissionGuard(permissions);
  }

  static createOwnershipGuard(field?: string): OwnershipGuard {
    return new OwnershipGuard(field);
  }

  static createSessionGuard(): SessionGuard {
    return new SessionGuard();
  }

  static createMFAGuard(): MFAGuard {
    return new MFAGuard();
  }

  static createTimeBasedGuard(hours: { start: number; end: number }, timezone?: string): TimeBasedGuard {
    return new TimeBasedGuard(hours, timezone);
  }

  static createIPWhitelistGuard(ips: string[]): IPWhitelistGuard {
    return new IPWhitelistGuard(ips);
  }

  static createCompositeGuard(guards: BaseAuthGuard[], operator: 'AND' | 'OR' = 'AND'): CompositeGuard {
    return new CompositeGuard(guards, operator);
  }

  /**
   * Create a guard for admin access
   */
  static createAdminGuard(): CompositeGuard {
    return new CompositeGuard([
      new RoleGuard(['admin', 'super_admin']),
      new SessionGuard(),
      new MFAGuard()
    ], 'AND');
  }

  /**
   * Create a guard for resource owner or admin access
   */
  static createOwnerOrAdminGuard(ownershipField?: string): CompositeGuard {
    return new CompositeGuard([
      new CompositeGuard([
        new OwnershipGuard(ownershipField),
        new RoleGuard(['admin', 'super_admin'])
      ], 'OR'),
      new SessionGuard()
    ], 'AND');
  }
}