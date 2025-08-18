/**
 * Authentication Decorators
 * Provides decorators for method-level authentication and authorization
 */

import 'reflect-metadata';

// Metadata keys for storing decorator information
export const AUTH_METADATA_KEY = Symbol('auth:metadata');
export const ROLES_METADATA_KEY = Symbol('auth:roles');
export const PERMISSIONS_METADATA_KEY = Symbol('auth:permissions');
export const MFA_METADATA_KEY = Symbol('auth:mfa');
export const RATE_LIMIT_METADATA_KEY = Symbol('auth:rateLimit');

export interface AuthDecoratorOptions {
  required?: boolean;
  roles?: string[];
  permissions?: string[];
  requireMFA?: boolean;
  rateLimit?: {
    maxAttempts: number;
    windowMs: number;
  };
}

/**
 * Require authentication for a method or class
 */
export function RequireAuth(options: AuthDecoratorOptions = {}) {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    const metadata = {
      required: options.required !== false,
      roles: options.roles || [],
      permissions: options.permissions || [],
      requireMFA: options.requireMFA || false,
      rateLimit: options.rateLimit
    };

    if (propertyKey) {
      // Method decorator
      Reflect.defineMetadata(AUTH_METADATA_KEY, metadata, target, propertyKey);
    } else {
      // Class decorator
      Reflect.defineMetadata(AUTH_METADATA_KEY, metadata, target);
    }
  };
}

/**
 * Require specific roles
 */
export function RequireRoles(...roles: string[]) {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    if (propertyKey) {
      Reflect.defineMetadata(ROLES_METADATA_KEY, roles, target, propertyKey);
    } else {
      Reflect.defineMetadata(ROLES_METADATA_KEY, roles, target);
    }
  };
}

/**
 * Require specific permissions
 */
export function RequirePermissions(...permissions: string[]) {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    if (propertyKey) {
      Reflect.defineMetadata(PERMISSIONS_METADATA_KEY, permissions, target, propertyKey);
    } else {
      Reflect.defineMetadata(PERMISSIONS_METADATA_KEY, permissions, target);
    }
  };
}

/**
 * Require MFA verification
 */
export function RequireMFA() {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    if (propertyKey) {
      Reflect.defineMetadata(MFA_METADATA_KEY, true, target, propertyKey);
    } else {
      Reflect.defineMetadata(MFA_METADATA_KEY, true, target);
    }
  };
}

/**
 * Apply rate limiting
 */
export function RateLimit(maxAttempts: number, windowMs: number) {
  return function (target: any, propertyKey?: string, descriptor?: PropertyDescriptor) {
    const rateLimitConfig = { maxAttempts, windowMs };
    
    if (propertyKey) {
      Reflect.defineMetadata(RATE_LIMIT_METADATA_KEY, rateLimitConfig, target, propertyKey);
    } else {
      Reflect.defineMetadata(RATE_LIMIT_METADATA_KEY, rateLimitConfig, target);
    }
  };
}

/**
 * Allow public access (no authentication required)
 */
export function Public() {
  return RequireAuth({ required: false });
}

/**
 * Admin only access
 */
export function AdminOnly() {
  return RequireAuth({
    required: true,
    roles: ['admin', 'super_admin'],
    requireMFA: true
  });
}

/**
 * Super admin only access
 */
export function SuperAdminOnly() {
  return RequireAuth({
    required: true,
    roles: ['super_admin'],
    requireMFA: true
  });
}

/**
 * Authenticated users only (no specific roles required)
 */
export function AuthenticatedOnly() {
  return RequireAuth({ required: true });
}

/**
 * Utility functions for reading decorator metadata
 */
export class AuthMetadataReader {
  static getAuthMetadata(target: any, propertyKey?: string): AuthDecoratorOptions | undefined {
    if (propertyKey) {
      return Reflect.getMetadata(AUTH_METADATA_KEY, target, propertyKey);
    }
    return Reflect.getMetadata(AUTH_METADATA_KEY, target);
  }

  static getRoles(target: any, propertyKey?: string): string[] {
    if (propertyKey) {
      return Reflect.getMetadata(ROLES_METADATA_KEY, target, propertyKey) || [];
    }
    return Reflect.getMetadata(ROLES_METADATA_KEY, target) || [];
  }

  static getPermissions(target: any, propertyKey?: string): string[] {
    if (propertyKey) {
      return Reflect.getMetadata(PERMISSIONS_METADATA_KEY, target, propertyKey) || [];
    }
    return Reflect.getMetadata(PERMISSIONS_METADATA_KEY, target) || [];
  }

  static requiresMFA(target: any, propertyKey?: string): boolean {
    if (propertyKey) {
      return Reflect.getMetadata(MFA_METADATA_KEY, target, propertyKey) || false;
    }
    return Reflect.getMetadata(MFA_METADATA_KEY, target) || false;
  }

  static getRateLimit(target: any, propertyKey?: string): { maxAttempts: number; windowMs: number } | undefined {
    if (propertyKey) {
      return Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, target, propertyKey);
    }
    return Reflect.getMetadata(RATE_LIMIT_METADATA_KEY, target);
  }

  /**
   * Get combined metadata from both class and method level
   */
  static getCombinedMetadata(target: any, propertyKey: string): {
    auth?: AuthDecoratorOptions;
    roles: string[];
    permissions: string[];
    requireMFA: boolean;
    rateLimit?: { maxAttempts: number; windowMs: number };
  } {
    // Get class-level metadata
    const classAuth = this.getAuthMetadata(target.constructor);
    const classRoles = this.getRoles(target.constructor);
    const classPermissions = this.getPermissions(target.constructor);
    const classMFA = this.requiresMFA(target.constructor);
    const classRateLimit = this.getRateLimit(target.constructor);

    // Get method-level metadata
    const methodAuth = this.getAuthMetadata(target, propertyKey);
    const methodRoles = this.getRoles(target, propertyKey);
    const methodPermissions = this.getPermissions(target, propertyKey);
    const methodMFA = this.requiresMFA(target, propertyKey);
    const methodRateLimit = this.getRateLimit(target, propertyKey);

    // Combine metadata (method-level overrides class-level)
    return {
      auth: methodAuth || classAuth,
      roles: [...classRoles, ...methodRoles],
      permissions: [...classPermissions, ...methodPermissions],
      requireMFA: methodMFA || classMFA,
      rateLimit: methodRateLimit || classRateLimit
    };
  }
}

/**
 * Method decorator for logging authentication events
 */
export function LogAuthEvents(eventType: string = 'auth_event') {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const startTime = Date.now();
      const context = {
        className: target.constructor.name,
        methodName: propertyKey,
        eventType,
        timestamp: new Date().toISOString(),
        args: args.length
      };

      try {
        const result = await originalMethod.apply(this, args);
        
        // Log successful authentication event
        if (this.logger) {
          this.logger.info('Authentication event completed', {
            ...context,
            success: true,
            duration: Date.now() - startTime
          });
        }

        return result;
      } catch (error) {
        // Log failed authentication event
        if (this.logger) {
          this.logger.warn('Authentication event failed', {
            ...context,
            success: false,
            duration: Date.now() - startTime,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
        }

        throw error;
      }
    };

    return descriptor;
  };
}

/**
 * Method decorator for caching authentication results
 */
export function CacheAuthResult(ttlSeconds: number = 300) {
  return function (target: any, propertyKey: string, descriptor: PropertyDescriptor) {
    const originalMethod = descriptor.value;
    const cache = new Map<string, { result: any; expiry: number }>();

    descriptor.value = async function (...args: any[]) {
      // Create cache key from method arguments
      const cacheKey = `${target.constructor.name}.${propertyKey}:${JSON.stringify(args)}`;
      const now = Date.now();

      // Check cache
      const cached = cache.get(cacheKey);
      if (cached && cached.expiry > now) {
        return cached.result;
      }

      // Execute method and cache result
      const result = await originalMethod.apply(this, args);
      cache.set(cacheKey, {
        result,
        expiry: now + (ttlSeconds * 1000)
      });

      // Clean up expired entries periodically
      if (cache.size > 1000) {
        for (const [key, value] of cache.entries()) {
          if (value.expiry <= now) {
            cache.delete(key);
          }
        }
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * Class decorator for applying authentication to all methods
 */
export function SecureClass(options: AuthDecoratorOptions = {}) {
  return function <T extends { new (...args: any[]): {} }>(constructor: T) {
    // Apply authentication metadata to the class
    Reflect.defineMetadata(AUTH_METADATA_KEY, {
      required: options.required !== false,
      roles: options.roles || [],
      permissions: options.permissions || [],
      requireMFA: options.requireMFA || false,
      rateLimit: options.rateLimit
    }, constructor);

    return constructor;
  };
}