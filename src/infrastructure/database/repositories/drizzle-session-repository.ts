import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, gt, lt, desc } from 'drizzle-orm';
import { Logger } from 'winston';
import {
  activeSessions,
  authAttempts,
  userAuthCache,
  ActiveSession,
  NewActiveSession,
  AuthAttempt,
  NewAuthAttempt,
  UserAuthCacheEntry,
  NewUserAuthCacheEntry,
} from '../drizzle/schema/auth-sessions';
import * as authSessionsSchema from '../drizzle/schema/auth-sessions';
import * as oauthCacheSchema from '../drizzle/schema/oauth-cache';

export interface SessionCreateData {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: Date;
  refreshExpiresAt: Date;
  ipAddress?: string;
  deviceFingerprint?: string;
  userAgent?: string;
  riskScore?: number;
}

export interface SessionValidationResult {
  isValid: boolean;
  session?: ActiveSession;
  reason?: string;
}

export class DrizzleSessionRepository {
  constructor(
    private db: NodePgDatabase<
      typeof authSessionsSchema & typeof oauthCacheSchema
    >,
    private logger: Logger
  ) {}

  async createSession(data: SessionCreateData): Promise<ActiveSession> {
    try {
      const sessionData: NewActiveSession = {
        id: data.id,
        userId: data.userId,
        token: data.token,
        refreshToken: data.refreshToken,
        expiresAt: data.expiresAt,
        refreshExpiresAt: data.refreshExpiresAt,
        ipAddress: data.ipAddress,
        deviceFingerprint: data.deviceFingerprint,
        userAgent: data.userAgent,
        riskScore: data.riskScore || 0,
        isActive: true,
        createdAt: new Date(),
        lastActivity: new Date(),
      };

      const [session] = await this.db
        .insert(activeSessions)
        .values(sessionData)
        .returning();

      if (!session) {
        throw new Error('Failed to create session');
      }

      this.logger.info('Session created successfully', {
        sessionId: session.id,
        userId: session.userId,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create session', { error, data });
      throw error;
    }
  }

  async validateSession(token: string): Promise<SessionValidationResult> {
    try {
      const [session] = await this.db
        .select()
        .from(activeSessions)
        .where(
          and(
            eq(activeSessions.token, token),
            eq(activeSessions.isActive, true),
            gt(activeSessions.expiresAt, new Date())
          )
        )
        .limit(1);

      if (!session) {
        return {
          isValid: false,
          reason: 'Session not found or expired',
        };
      }

      // Update last activity
      await this.updateLastActivity(session.id);

      return {
        isValid: true,
        session,
      };
    } catch (error) {
      this.logger.error('Failed to validate session', {
        error,
        token: token.substring(0, 10) + '...',
      });
      return {
        isValid: false,
        reason: 'Database error during validation',
      };
    }
  }

  async refreshSession(refreshToken: string): Promise<ActiveSession | null> {
    try {
      const [session] = await this.db
        .select()
        .from(activeSessions)
        .where(
          and(
            eq(activeSessions.refreshToken, refreshToken),
            eq(activeSessions.isActive, true),
            gt(activeSessions.refreshExpiresAt, new Date())
          )
        )
        .limit(1);

      if (!session) {
        return null;
      }

      // Update last activity
      await this.updateLastActivity(session.id);

      return session;
    } catch (error) {
      this.logger.error('Failed to refresh session', { error });
      throw error;
    }
  }

  async updateLastActivity(sessionId: string): Promise<void> {
    try {
      await this.db
        .update(activeSessions)
        .set({ lastActivity: new Date() })
        .where(eq(activeSessions.id, sessionId));
    } catch (error) {
      this.logger.error('Failed to update session activity', {
        error,
        sessionId,
      });
      // Don't throw here as this is not critical
    }
  }

  async terminateSession(sessionId: string): Promise<void> {
    try {
      await this.db
        .update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.id, sessionId));

      this.logger.info('Session terminated', { sessionId });
    } catch (error) {
      this.logger.error('Failed to terminate session', { error, sessionId });
      throw error;
    }
  }

  async terminateUserSessions(
    userId: string,
    excludeSessionId?: string
  ): Promise<number> {
    try {
      const conditions = [
        eq(activeSessions.userId, userId),
        eq(activeSessions.isActive, true),
      ];

      if (excludeSessionId) {
        conditions.push(eq(activeSessions.id, excludeSessionId));
      }

      const result = await this.db
        .update(activeSessions)
        .set({ isActive: false })
        .where(and(...conditions));

      this.logger.info('User sessions terminated', {
        userId,
        count: result.rowCount,
      });
      return result.rowCount || 0;
    } catch (error) {
      this.logger.error('Failed to terminate user sessions', { error, userId });
      throw error;
    }
  }

  async getUserActiveSessions(userId: string): Promise<ActiveSession[]> {
    try {
      const sessions = await this.db
        .select()
        .from(activeSessions)
        .where(
          and(
            eq(activeSessions.userId, userId),
            eq(activeSessions.isActive, true),
            gt(activeSessions.expiresAt, new Date())
          )
        )
        .orderBy(desc(activeSessions.lastActivity));

      return sessions;
    } catch (error) {
      this.logger.error('Failed to get user active sessions', {
        error,
        userId,
      });
      throw error;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      const result = await this.db
        .update(activeSessions)
        .set({ isActive: false })
        .where(
          and(
            eq(activeSessions.isActive, true),
            lt(activeSessions.expiresAt, new Date())
          )
        );

      const count = result.rowCount || 0;
      if (count > 0) {
        this.logger.info('Expired sessions cleaned up', { count });
      }

      return count;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', { error });
      throw error;
    }
  }

  // Authentication attempts tracking
  async recordAuthAttempt(data: {
    userId?: string;
    email?: string;
    ipAddress: string;
    userAgent?: string;
    success: boolean;
    failureReason?: string;
    deviceFingerprint?: string;
    riskScore?: number;
  }): Promise<AuthAttempt> {
    try {
      const attemptData: NewAuthAttempt = {
        userId: data.userId,
        email: data.email,
        ipAddress: data.ipAddress,
        userAgent: data.userAgent,
        success: data.success,
        failureReason: data.failureReason,
        deviceFingerprint: data.deviceFingerprint,
        riskScore: data.riskScore || 0,
        timestamp: new Date(),
      };

      const [attempt] = await this.db
        .insert(authAttempts)
        .values(attemptData)
        .returning();

      if (!attempt) {
        throw new Error('Failed to record auth attempt');
      }

      return attempt;
    } catch (error) {
      this.logger.error('Failed to record auth attempt', { error, data });
      throw error;
    }
  }

  async getRecentFailedAttempts(
    identifier: string,
    identifierType: 'email' | 'ip' | 'userId',
    timeWindow: number = 15 * 60 * 1000 // 15 minutes
  ): Promise<AuthAttempt[]> {
    try {
      const since = new Date(Date.now() - timeWindow);
      let condition;

      switch (identifierType) {
        case 'email':
          condition = eq(authAttempts.email, identifier);
          break;
        case 'ip':
          condition = eq(authAttempts.ipAddress, identifier);
          break;
        case 'userId':
          condition = eq(authAttempts.userId, identifier);
          break;
        default:
          throw new Error(`Invalid identifier type: ${identifierType}`);
      }

      const attempts = await this.db
        .select()
        .from(authAttempts)
        .where(
          and(
            condition,
            eq(authAttempts.success, false),
            gt(authAttempts.timestamp, since)
          )
        )
        .orderBy(desc(authAttempts.timestamp));

      return attempts;
    } catch (error) {
      this.logger.error('Failed to get recent failed attempts', {
        error,
        identifier,
        identifierType,
      });
      throw error;
    }
  }

  // User auth cache operations for fast lookups
  async cacheUserAuth(
    data: NewUserAuthCacheEntry
  ): Promise<UserAuthCacheEntry> {
    try {
      const [cached] = await this.db
        .insert(userAuthCache)
        .values({
          ...data,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: userAuthCache.userId,
          set: {
            email: data.email,
            passwordHash: data.passwordHash,
            mfaEnabled: data.mfaEnabled,
            totpSecret: data.totpSecret,
            failedLoginAttempts: data.failedLoginAttempts,
            lockedUntil: data.lockedUntil,
            lastLoginAt: data.lastLoginAt,
            lastLoginIP: data.lastLoginIP,
            riskScore: data.riskScore,
            updatedAt: new Date(),
          },
        })
        .returning();

      if (!cached) {
        throw new Error('Failed to cache user auth data');
      }

      return cached;
    } catch (error) {
      this.logger.error('Failed to cache user auth data', {
        error,
        userId: data.userId,
      });
      throw error;
    }
  }

  async getCachedUserAuth(userId: string): Promise<UserAuthCacheEntry | null> {
    try {
      const [cached] = await this.db
        .select()
        .from(userAuthCache)
        .where(eq(userAuthCache.userId, userId))
        .limit(1);

      return cached || null;
    } catch (error) {
      this.logger.error('Failed to get cached user auth data', {
        error,
        userId,
      });
      throw error;
    }
  }

  async invalidateUserAuthCache(userId: string): Promise<void> {
    try {
      await this.db
        .delete(userAuthCache)
        .where(eq(userAuthCache.userId, userId));

      this.logger.debug('User auth cache invalidated', { userId });
    } catch (error) {
      this.logger.error('Failed to invalidate user auth cache', {
        error,
        userId,
      });
      throw error;
    }
  }

  // Analytics and reporting
  async getSessionStats(timeWindow: number = 24 * 60 * 60 * 1000): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    uniqueUsers: number;
  }> {
    try {
      const since = new Date(Date.now() - timeWindow);

      // This would be more complex in a real implementation
      // For now, returning basic stats
      const totalSessions = await this.db
        .select()
        .from(activeSessions)
        .where(gt(activeSessions.createdAt, since));

      const activeSessionsCount = await this.db
        .select()
        .from(activeSessions)
        .where(
          and(
            eq(activeSessions.isActive, true),
            gt(activeSessions.expiresAt, new Date())
          )
        );

      return {
        totalSessions: totalSessions.length,
        activeSessions: activeSessionsCount.length,
        averageSessionDuration: 0, // Would need more complex calculation
        uniqueUsers: new Set(totalSessions.map((s) => s.userId)).size,
      };
    } catch (error) {
      this.logger.error('Failed to get session stats', { error });
      throw error;
    }
  }
}
