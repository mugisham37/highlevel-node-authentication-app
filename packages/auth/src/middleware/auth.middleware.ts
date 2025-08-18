/**
 * Authentication Middleware
 * Provides middleware functions for validating JWT tokens and extracting user context
 */

import { Session } from '@company/shared/entities/session';
import { User } from '@company/shared/entities/user';
import { NextFunction, Request, Response } from 'express';
import { Logger } from 'winston';

export interface AuthenticatedRequest extends Request {
  user?: User;
  session?: Session;
  correlationId?: string;
}

export interface AuthMiddlewareOptions {
  required?: boolean;
  roles?: string[];
  permissions?: string[];
  skipPaths?: string[];
}

export class AuthMiddleware {
  constructor(
    private readonly jwtService: any, // Will be properly typed when JWT service is available
    private readonly sessionService: any, // Will be properly typed when session service is available
    private readonly logger: Logger
  ) {}

  /**
   * Main authentication middleware
   */
  authenticate(options: AuthMiddlewareOptions = {}) {
    return async (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
      try {
        // Skip authentication for certain paths
        if (options.skipPaths?.some(path => req.path.startsWith(path))) {
          return next();
        }

        const token = this.extractToken(req);
        
        if (!token) {
          if (options.required !== false) {
            return res.status(401).json({
              success: false,
              error: {
                code: 'MISSING_TOKEN',
                message: 'Authentication token is required'
              }
            });
          }
          return next();
        }

        // Validate token
        const validation = await this.jwtService.validateToken(token);
        if (!validation.valid) {
          return res.status(401).json({
            success: false,
            error: {
              code: 'INVALID_TOKEN',
              message: validation.error?.message || 'Invalid authentication token'
            }
          });
        }

        // Attach user and session to request
        req.user = validation.user;
        req.session = validation.session;
        req.correlationId = this.generateCorrelationId();

        // Check roles if specified
        if (options.roles && options.roles.length > 0) {
          const hasRole = this.checkUserRoles(validation.user, options.roles);
          if (!hasRole) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_ROLES',
                message: 'User does not have required roles'
              }
            });
          }
        }

        // Check permissions if specified
        if (options.permissions && options.permissions.length > 0) {
          const hasPermission = this.checkUserPermissions(validation.user, options.permissions);
          if (!hasPermission) {
            return res.status(403).json({
              success: false,
              error: {
                code: 'INSUFFICIENT_PERMISSIONS',
                message: 'User does not have required permissions'
              }
            });
          }
        }

        next();
      } catch (error) {
        this.logger.error('Authentication middleware error', {
          error: error instanceof Error ? error.message : 'Unknown error',
          path: req.path,
          method: req.method
        });

        res.status(500).json({
          success: false,
          error: {
            code: 'AUTH_MIDDLEWARE_ERROR',
            message: 'An error occurred during authentication'
          }
        });
      }
    };
  }

  /**
   * Optional authentication middleware (doesn't require token)
   */
  optionalAuth() {
    return this.authenticate({ required: false });
  }

  /**
   * Require specific roles
   */
  requireRoles(roles: string[]) {
    return this.authenticate({ roles });
  }

  /**
   * Require specific permissions
   */
  requirePermissions(permissions: string[]) {
    return this.authenticate({ permissions });
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(req: Request): string | null {
    // Check Authorization header
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookie
    const cookieToken = req.cookies?.accessToken;
    if (cookieToken) {
      return cookieToken;
    }

    // Check query parameter (less secure, for specific use cases)
    const queryToken = req.query.token as string;
    if (queryToken) {
      return queryToken;
    }

    return null;
  }

  /**
   * Check if user has required roles
   */
  private checkUserRoles(user: User, requiredRoles: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }

    return requiredRoles.some(role => 
      user.roles.some(userRole => userRole.name === role)
    );
  }

  /**
   * Check if user has required permissions
   */
  private checkUserPermissions(user: User, requiredPermissions: string[]): boolean {
    if (!user.roles || user.roles.length === 0) {
      return false;
    }

    const userPermissions = user.roles.flatMap(role => 
      role.permissions?.map(p => p.name) || []
    );

    return requiredPermissions.every(permission => 
      userPermissions.includes(permission)
    );
  }

  /**
   * Generate correlation ID for request tracking
   */
  private generateCorrelationId(): string {
    return `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

/**
 * Rate limiting middleware for authentication endpoints
 */
export class AuthRateLimitMiddleware {
  private attempts: Map<string, { count: number; resetTime: number }> = new Map();

  constructor(
    private readonly maxAttempts: number = 5,
    private readonly windowMs: number = 15 * 60 * 1000, // 15 minutes
    private readonly logger: Logger
  ) {}

  rateLimit() {
    return (req: Request, res: Response, next: NextFunction) => {
      const key = this.getKey(req);
      const now = Date.now();
      
      const attempt = this.attempts.get(key);
      
      if (!attempt || now > attempt.resetTime) {
        // Reset or create new attempt record
        this.attempts.set(key, {
          count: 1,
          resetTime: now + this.windowMs
        });
        return next();
      }

      if (attempt.count >= this.maxAttempts) {
        this.logger.warn('Rate limit exceeded', {
          key,
          attempts: attempt.count,
          resetTime: new Date(attempt.resetTime)
        });

        return res.status(429).json({
          success: false,
          error: {
            code: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many authentication attempts. Please try again later.',
            retryAfter: Math.ceil((attempt.resetTime - now) / 1000)
          }
        });
      }

      // Increment attempt count
      attempt.count++;
      next();
    };
  }

  private getKey(req: Request): string {
    // Use IP address and user agent for rate limiting key
    const ip = req.ip || req.connection.remoteAddress || 'unknown';
    const userAgent = req.get('User-Agent') || 'unknown';
    return `${ip}:${userAgent}`;
  }
}