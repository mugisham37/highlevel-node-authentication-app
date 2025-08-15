/**
 * Authorization Service Interface
 * Defines permission checking and authorization middleware functionality
 */

import { Permission } from '../../domain/entities/permission';
import { Role } from '../../domain/entities/role';

export interface AuthorizationContext {
  userId: string;
  roles: string[];
  permissions: string[];
  sessionId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  deviceFingerprint?: string | undefined;
  riskScore?: number | undefined;
  additionalContext?: Record<string, any> | undefined;
}

export interface AuthorizationRequest {
  resource: string;
  action: string;
  context?: Record<string, any> | undefined;
  requireAll: boolean; // Changed to required boolean
}

export interface AuthorizationResult {
  allowed: boolean;
  reason?: string;
  matchedPermissions: Permission[];
  requiredPermissions: string[];
  missingPermissions: string[];
  contextValidation?: {
    valid: boolean;
    failedConditions: string[];
  };
}

export interface RoleBasedCheck {
  requiredRoles: string[];
  requireAll: boolean; // Changed to required boolean
}

export interface PermissionBasedCheck {
  requiredPermissions: string[];
  requireAll?: boolean; // If true, user must have all permissions
}

export interface ResourceAccessCheck {
  resource: string;
  actions: string[];
  context?: Record<string, any> | undefined;
}

export interface IAuthorizationService {
  // Basic authorization checks
  authorize(
    context: AuthorizationContext,
    request: AuthorizationRequest
  ): Promise<AuthorizationResult>;
  authorizeMultiple(
    context: AuthorizationContext,
    requests: AuthorizationRequest[]
  ): Promise<AuthorizationResult[]>;

  // Role-based authorization
  hasRole(
    context: AuthorizationContext,
    roleCheck: RoleBasedCheck
  ): Promise<boolean>;
  hasAnyRole(context: AuthorizationContext, roles: string[]): Promise<boolean>;
  hasAllRoles(context: AuthorizationContext, roles: string[]): Promise<boolean>;

  // Permission-based authorization
  hasPermission(
    context: AuthorizationContext,
    permissionCheck: PermissionBasedCheck
  ): Promise<boolean>;
  hasAnyPermission(
    context: AuthorizationContext,
    permissions: string[]
  ): Promise<boolean>;
  hasAllPermissions(
    context: AuthorizationContext,
    permissions: string[]
  ): Promise<boolean>;

  // Resource-based authorization
  canAccessResource(
    context: AuthorizationContext,
    resourceCheck: ResourceAccessCheck
  ): Promise<AuthorizationResult>;
  canPerformAction(
    context: AuthorizationContext,
    resource: string,
    action: string,
    actionContext?: Record<string, any> | undefined
  ): Promise<boolean>;

  // Administrative checks
  isAdmin(context: AuthorizationContext): Promise<boolean>;
  isSuperAdmin(context: AuthorizationContext): Promise<boolean>;
  canManageUser(
    context: AuthorizationContext,
    targetUserId: string
  ): Promise<boolean>;
  canManageRole(
    context: AuthorizationContext,
    roleId: string
  ): Promise<boolean>;

  // Hierarchical authorization
  canAssignRole(
    context: AuthorizationContext,
    roleId: string
  ): Promise<boolean>;
  canRevokeRole(
    context: AuthorizationContext,
    roleId: string
  ): Promise<boolean>;
  getAssignableRoles(context: AuthorizationContext): Promise<Role[]>;

  // Context-aware authorization
  evaluateConditions(
    permissions: Permission[],
    context: Record<string, any>
  ): Promise<Permission[]>;
  validateContext(context: AuthorizationContext): Promise<{
    valid: boolean;
    issues: string[];
    recommendations: string[];
  }>;

  // Bulk authorization
  bulkAuthorize(
    contexts: AuthorizationContext[],
    request: AuthorizationRequest
  ): Promise<Map<string, AuthorizationResult>>;

  // Authorization caching
  clearAuthorizationCache(userId?: string): Promise<void>;
  warmAuthorizationCache(userId: string): Promise<void>;

  // Audit and logging
  logAuthorizationAttempt(
    context: AuthorizationContext,
    request: AuthorizationRequest,
    result: AuthorizationResult
  ): Promise<void>;
  getAuthorizationHistory(
    userId: string,
    limit?: number
  ): Promise<
    Array<{
      timestamp: Date;
      resource: string;
      action: string;
      allowed: boolean;
      reason?: string;
    }>
  >;
}
