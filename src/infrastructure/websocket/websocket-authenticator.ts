/**
 * WebSocket Authenticator
 * Handles authentication and authorization for WebSocket connections
 */

import { FastifyRequest } from 'fastify';
import { WebSocketAuthResult } from './types';
import { logger } from '../logging/winston-logger';
import { JWTTokenService } from '../security/jwt-token.service';
import { getRedisClient } from '../cache/redis-client';

export class WebSocketAuthenticator {
  private jwtService: JWTTokenService;
  private redisClient;

  constructor() {
    // Initialize JWT service with fallback secrets for testing
    const accessSecret =
      process.env.JWT_SECRET || 'test-access-secret-key-for-websocket-auth';
    const refreshSecret =
      process.env.JWT_REFRESH_SECRET ||
      'test-refresh-secret-key-for-websocket-auth';

    this.jwtService = new JWTTokenService(accessSecret, refreshSecret);
    this.redisClient = getRedisClient().getClient();
  }

  /**
   * Authenticate WebSocket connection
   */
  async authenticate(request: FastifyRequest): Promise<WebSocketAuthResult> {
    try {
      // Extract token from query parameters or headers
      const token = this.extractToken(request);

      if (!token) {
        return {
          success: false,
          error: 'No authentication token provided',
        };
      }

      // Verify JWT token
      const tokenValidation = await this.jwtService.verifyToken(token);

      if (!tokenValidation.valid || !tokenValidation.payload) {
        return {
          success: false,
          error: 'Invalid or expired token',
        };
      }

      const { userId, sessionId } = tokenValidation.payload;

      // Verify session is still active
      const sessionValid = await this.verifySession(sessionId);

      if (!sessionValid) {
        return {
          success: false,
          error: 'Session expired or invalid',
        };
      }

      // Get user permissions
      const permissions = await this.getUserPermissions(userId);

      logger.debug('WebSocket authentication successful', {
        userId,
        sessionId,
        permissions: permissions.length,
      });

      return {
        success: true,
        userId,
        sessionId,
        permissions,
      };
    } catch (error) {
      logger.error('WebSocket authentication error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: 'Authentication failed',
      };
    }
  }

  /**
   * Authenticate admin WebSocket connection
   */
  async authenticateAdmin(
    request: FastifyRequest
  ): Promise<WebSocketAuthResult> {
    const authResult = await this.authenticate(request);

    if (!authResult.success) {
      return authResult;
    }

    // Check if user has admin permissions
    const hasAdminPermission = authResult.permissions?.some(
      (permission) =>
        permission.includes('admin') || permission.includes('system')
    );

    if (!hasAdminPermission) {
      return {
        success: false,
        error: 'Admin privileges required',
      };
    }

    return authResult;
  }

  /**
   * Extract authentication token from request
   */
  private extractToken(request: FastifyRequest): string | null {
    // Try query parameter first
    const queryToken = (request.query as any)?.token;
    if (queryToken) {
      return queryToken;
    }

    // Try Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Try WebSocket protocol header (for some clients)
    const protocolHeader = request.headers['sec-websocket-protocol'];
    if (protocolHeader) {
      const protocols = protocolHeader.split(',').map((p) => p.trim());
      const tokenProtocol = protocols.find((p) => p.startsWith('token.'));
      if (tokenProtocol) {
        return tokenProtocol.substring(6); // Remove 'token.' prefix
      }
    }

    return null;
  }

  /**
   * Verify session is still active
   */
  private async verifySession(sessionId: string): Promise<boolean> {
    try {
      // Check if session exists in Redis
      const sessionData = await this.redisClient.get(`session:${sessionId}`);

      if (!sessionData) {
        return false;
      }

      const session = JSON.parse(sessionData);

      // Check if session is expired
      const now = new Date();
      const expiresAt = new Date(session.expiresAt);

      if (now > expiresAt) {
        // Clean up expired session
        await this.redisClient.del(`session:${sessionId}`);
        return false;
      }

      // Update last activity
      session.lastActivity = now.toISOString();
      await this.redisClient.setex(
        `session:${sessionId}`,
        Math.floor((expiresAt.getTime() - now.getTime()) / 1000),
        JSON.stringify(session)
      );

      return true;
    } catch (error) {
      logger.error('Error verifying session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get user permissions
   */
  private async getUserPermissions(userId: string): Promise<string[]> {
    try {
      // Get user permissions from Redis cache
      const permissionsData = await this.redisClient.get(
        `user:${userId}:permissions`
      );

      if (permissionsData) {
        return JSON.parse(permissionsData);
      }

      // If not in cache, return basic permissions
      // In a real implementation, this would fetch from database
      const basicPermissions = [
        'websocket:connect',
        'events:subscribe',
        'notifications:receive',
      ];

      // Cache permissions for 5 minutes
      await this.redisClient.setex(
        `user:${userId}:permissions`,
        300,
        JSON.stringify(basicPermissions)
      );

      return basicPermissions;
    } catch (error) {
      logger.error('Error getting user permissions', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return minimal permissions on error
      return ['websocket:connect'];
    }
  }

  /**
   * Validate WebSocket origin
   */
  validateOrigin(origin: string, allowedOrigins: string[]): boolean {
    if (!origin) {
      return false;
    }

    // Allow localhost in development
    if (
      process.env.NODE_ENV === 'development' &&
      origin.includes('localhost')
    ) {
      return true;
    }

    return allowedOrigins.some((allowed) => {
      if (allowed === '*') return true;
      if (allowed.endsWith('*')) {
        const prefix = allowed.slice(0, -1);
        return origin.startsWith(prefix);
      }
      return origin === allowed;
    });
  }

  /**
   * Rate limit WebSocket connections per user
   */
  async checkRateLimit(
    userId: string,
    ip: string
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
  }> {
    try {
      const key = `websocket:ratelimit:${userId}:${ip}`;
      const window = 60; // 1 minute window
      const limit = 10; // 10 connections per minute

      const current = await this.redisClient.incr(key);

      if (current === 1) {
        await this.redisClient.expire(key, window);
      }

      const ttl = await this.redisClient.ttl(key);
      const resetTime = new Date(Date.now() + ttl * 1000);

      return {
        allowed: current <= limit,
        remaining: Math.max(0, limit - current),
        resetTime,
      };
    } catch (error) {
      logger.error('Error checking WebSocket rate limit', {
        userId,
        ip,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Allow on error to avoid blocking legitimate users
      return {
        allowed: true,
        remaining: 10,
        resetTime: new Date(Date.now() + 60000),
      };
    }
  }

  /**
   * Log authentication attempt
   */
  async logAuthAttempt(
    success: boolean,
    userId?: string,
    ip?: string,
    userAgent?: string,
    error?: string
  ): Promise<void> {
    try {
      const logEntry = {
        timestamp: new Date().toISOString(),
        type: 'websocket_auth',
        success,
        userId,
        ip,
        userAgent,
        error,
      };

      // Store in Redis for audit purposes
      const key = `websocket:auth:log:${Date.now()}`;
      await this.redisClient.setex(key, 86400, JSON.stringify(logEntry)); // 24 hours

      // Also log to application logger
      if (success) {
        logger.info('WebSocket authentication successful', {
          userId,
          ip,
          userAgent,
        });
      } else {
        logger.warn('WebSocket authentication failed', {
          userId,
          ip,
          userAgent,
          error,
        });
      }
    } catch (error) {
      logger.error('Error logging WebSocket auth attempt', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Revoke user sessions (for security events)
   */
  async revokeUserSessions(userId: string, reason: string): Promise<void> {
    try {
      // Get all user sessions
      const sessionKeys = await this.redisClient.keys(`session:*`);
      const userSessions: string[] = [];

      for (const key of sessionKeys) {
        const sessionData = await this.redisClient.get(key);
        if (sessionData) {
          const session = JSON.parse(sessionData);
          if (session.userId === userId) {
            userSessions.push(key);
          }
        }
      }

      // Delete all user sessions
      if (userSessions.length > 0) {
        await this.redisClient.del(...userSessions);
      }

      logger.info('User sessions revoked', {
        userId,
        reason,
        sessionsRevoked: userSessions.length,
      });
    } catch (error) {
      logger.error('Error revoking user sessions', {
        userId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get authentication statistics
   */
  async getAuthStats(): Promise<{
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    uniqueUsers: number;
    recentFailures: any[];
  }> {
    try {
      // Get recent auth logs
      const logKeys = await this.redisClient.keys('websocket:auth:log:*');
      const logs = await Promise.all(
        logKeys.map(async (key) => {
          const data = await this.redisClient.get(key);
          return data ? JSON.parse(data) : null;
        })
      );

      const validLogs = logs.filter((log) => log !== null);
      const successfulAttempts = validLogs.filter((log) => log.success).length;
      const failedAttempts = validLogs.filter((log) => !log.success).length;
      const uniqueUsers = new Set(
        validLogs.map((log) => log.userId).filter(Boolean)
      ).size;
      const recentFailures = validLogs
        .filter((log) => !log.success)
        .sort(
          (a, b) =>
            new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
        )
        .slice(0, 10);

      return {
        totalAttempts: validLogs.length,
        successfulAttempts,
        failedAttempts,
        uniqueUsers,
        recentFailures,
      };
    } catch (error) {
      logger.error('Error getting auth stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        totalAttempts: 0,
        successfulAttempts: 0,
        failedAttempts: 0,
        uniqueUsers: 0,
        recentFailures: [],
      };
    }
  }
}
