/**
 * Enhanced Drizzle Session Repository
 * Implements high-performance session operations with caching and optimization
 */

import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { eq, and, gt, lt, desc, asc, count, sql, inArray } from 'drizzle-orm';
import { Logger } from 'winston';
import { BaseRepository } from '../base/base-repository';
import { TransactionManager } from '../base/transaction-manager';
import { MultiLayerCache } from '../../../cache/multi-layer-cache';
import {
  ISessionRepository,
  CreateSessionData,
  UpdateSessionData,
  SessionFilters,
  SessionValidationResult,
  AuthAttemptData,
} from '../interfaces/session-repository.interface';
import { Session } from '../../../../domain/entities/session';
import {
  activeSessions,
  authAttempts,
  userAuthCache,
  rateLimitTracking,
  ActiveSession,
  NewActiveSession,
  AuthAttempt,
  NewAuthAttempt,
  UserAuthCacheEntry,
  NewUserAuthCacheEntry,
  RateLimitEntry,
  NewRateLimitEntry,
} from '../../drizzle/schema/auth-sessions';
import * as authSessionsSchema from '../../drizzle/schema/auth-sessions';
import * as oauthCacheSchema from '../../drizzle/schema/oauth-cache';

export class DrizzleSessionRepositoryEnhanced
  extends BaseRepository
  implements ISessionRepository
{
  constructor(
    private db: NodePgDatabase<
      typeof authSessionsSchema & typeof oauthCacheSchema
    >,
    private transactionManager: TransactionManager,
    logger: Logger,
    cache?: MultiLayerCache
  ) {
    super(logger, cache);
  }

  // Basic CRUD operations
  async create(data: CreateSessionData): Promise<Session> {
    const startTime = Date.now();

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

      const result = await this.optimizeQuery(
        async () => {
          const [session] = await this.db
            .insert(activeSessions)
            .values(sessionData)
            .returning();

          if (!session) {
            throw new Error('Failed to create session');
          }

          return this.mapToSessionEntity(session);
        },
        {
          cacheKey: this.generateCacheKey('create', { token: data.token }),
          ttl: 3600,
        }
      );

      this.recordQuery('create', Date.now() - startTime, true);
      this.logger.info('Session created successfully', {
        sessionId: result.id,
        userId: result.userId,
      });

      return result;
    } catch (error) {
      this.recordQuery('create', Date.now() - startTime, false);
      this.logger.error('Failed to create session', { error, data });
      throw error;
    }
  }

  async findById(id: string): Promise<Session | null> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        async () => {
          const [session] = await this.db
            .select()
            .from(activeSessions)
            .where(eq(activeSessions.id, id))
            .limit(1);

          return session ? this.mapToSessionEntity(session) : null;
        },
        {
          cacheKey: this.generateCacheKey('findById', { id }),
          ttl: 1800,
          preferReplica: true,
        }
      );

      this.recordQuery('findById', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('findById', Date.now() - startTime, false);
      this.logger.error('Failed to find session by ID', { error, id });
      throw error;
    }
  }

  async update(id: string, data: UpdateSessionData): Promise<Session> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(async () => {
        const [session] = await this.db
          .update(activeSessions)
          .set({
            ...data,
            lastActivity: data.lastActivity || new Date(),
          })
          .where(eq(activeSessions.id, id))
          .returning();

        if (!session) {
          throw new Error('Session not found');
        }

        return this.mapToSessionEntity(session);
      });

      // Invalidate caches
      await this.invalidateSessionCaches(id);

      this.recordQuery('update', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('update', Date.now() - startTime, false);
      this.logger.error('Failed to update session', { error, id, data });
      throw error;
    }
  }

  async delete(id: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.db
        .update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.id, id));

      await this.invalidateSessionCaches(id);

      this.recordQuery('delete', Date.now() - startTime, true);
      this.logger.info('Session deleted', { sessionId: id });
    } catch (error) {
      this.recordQuery('delete', Date.now() - startTime, false);
      this.logger.error('Failed to delete session', { error, id });
      throw error;
    }
  }

  // Session validation and management
  async validateSession(token: string): Promise<SessionValidationResult> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        async () => {
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

          // Update last activity asynchronously
          this.updateLastActivity(session.id).catch((error) =>
            this.logger.warn('Failed to update session activity', {
              error,
              sessionId: session.id,
            })
          );

          return {
            isValid: true,
            session: this.mapToSessionEntity(session),
          };
        },
        {
          cacheKey: this.generateCacheKey('validateSession', {
            token: token.substring(0, 10),
          }),
          ttl: 300, // Short TTL for security
          preferReplica: true,
        }
      );

      this.recordQuery('validateSession', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('validateSession', Date.now() - startTime, false);
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

  async validateSessionCached(
    token: string,
    ttl: number = 300
  ): Promise<SessionValidationResult> {
    const cacheKey = this.generateCacheKey('validateSessionCached', {
      token: token.substring(0, 10),
    });

    // Try cache first
    const cached = await this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const result = await this.validateSession(token);
    if (result.isValid) {
      await this.setCached(cacheKey, result, ttl);
    }

    return result;
  }

  async refreshSession(refreshToken: string): Promise<Session | null> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(async () => {
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

        return this.mapToSessionEntity(session);
      });

      this.recordQuery('refreshSession', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('refreshSession', Date.now() - startTime, false);
      this.logger.error('Failed to refresh session', { error });
      throw error;
    }
  }

  // Session lifecycle
  async terminateSession(sessionId: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.db
        .update(activeSessions)
        .set({ isActive: false })
        .where(eq(activeSessions.id, sessionId));

      await this.invalidateSessionCaches(sessionId);

      this.recordQuery('terminateSession', Date.now() - startTime, true);
      this.logger.info('Session terminated', { sessionId });
    } catch (error) {
      this.recordQuery('terminateSession', Date.now() - startTime, false);
      this.logger.error('Failed to terminate session', { error, sessionId });
      throw error;
    }
  }

  async terminateUserSessions(
    userId: string,
    excludeSessionId?: string
  ): Promise<number> {
    const startTime = Date.now();

    try {
      const conditions = [
        eq(activeSessions.userId, userId),
        eq(activeSessions.isActive, true),
      ];

      if (excludeSessionId) {
        // Note: This should be "not equal" but we'll use a different approach
        // since Drizzle might not have a direct "not equal" operator
        const sessions = await this.db
          .select()
          .from(activeSessions)
          .where(
            and(
              eq(activeSessions.userId, userId),
              eq(activeSessions.isActive, true)
            )
          );

        const sessionsToTerminate = sessions
          .filter((s) => s.id !== excludeSessionId)
          .map((s) => s.id);

        if (sessionsToTerminate.length > 0) {
          await this.db
            .update(activeSessions)
            .set({ isActive: false })
            .where(inArray(activeSessions.id, sessionsToTerminate));
        }

        this.recordQuery('terminateUserSessions', Date.now() - startTime, true);
        this.logger.info('User sessions terminated', {
          userId,
          count: sessionsToTerminate.length,
        });

        return sessionsToTerminate.length;
      } else {
        const result = await this.db
          .update(activeSessions)
          .set({ isActive: false })
          .where(and(...conditions));

        const terminatedCount = result.rowCount || 0;

        this.recordQuery('terminateUserSessions', Date.now() - startTime, true);
        this.logger.info('User sessions terminated', {
          userId,
          count: terminatedCount,
        });

        return terminatedCount;
      }
    } catch (error) {
      this.recordQuery('terminateUserSessions', Date.now() - startTime, false);
      this.logger.error('Failed to terminate user sessions', { error, userId });
      throw error;
    }
  }

  async terminateExpiredSessions(): Promise<number> {
    const startTime = Date.now();

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

      this.recordQuery(
        'terminateExpiredSessions',
        Date.now() - startTime,
        true
      );

      if (count > 0) {
        this.logger.info('Expired sessions terminated', { count });
      }

      return count;
    } catch (error) {
      this.recordQuery(
        'terminateExpiredSessions',
        Date.now() - startTime,
        false
      );
      this.logger.error('Failed to terminate expired sessions', { error });
      throw error;
    }
  }

  // User session management
  async getUserActiveSessions(userId: string): Promise<Session[]> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        async () => {
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

          return sessions.map((session) => this.mapToSessionEntity(session));
        },
        {
          cacheKey: this.generateCacheKey('getUserActiveSessions', { userId }),
          ttl: 600,
          preferReplica: true,
        }
      );

      this.recordQuery('getUserActiveSessions', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('getUserActiveSessions', Date.now() - startTime, false);
      this.logger.error('Failed to get user active sessions', {
        error,
        userId,
      });
      throw error;
    }
  }

  async getUserSessionCount(userId: string): Promise<number> {
    const startTime = Date.now();

    try {
      const result = await this.optimizeQuery(
        async () => {
          const [{ count: sessionCount }] = await this.db
            .select({ count: count() })
            .from(activeSessions)
            .where(
              and(
                eq(activeSessions.userId, userId),
                eq(activeSessions.isActive, true),
                gt(activeSessions.expiresAt, new Date())
              )
            );

          return sessionCount;
        },
        {
          cacheKey: this.generateCacheKey('getUserSessionCount', { userId }),
          ttl: 300,
          preferReplica: true,
        }
      );

      this.recordQuery('getUserSessionCount', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('getUserSessionCount', Date.now() - startTime, false);
      this.logger.error('Failed to get user session count', { error, userId });
      throw error;
    }
  }

  async enforceSessionLimit(
    userId: string,
    maxSessions: number
  ): Promise<void> {
    const startTime = Date.now();

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
        .orderBy(asc(activeSessions.lastActivity)); // Oldest first

      if (sessions.length > maxSessions) {
        const sessionsToTerminate = sessions
          .slice(0, sessions.length - maxSessions)
          .map((s) => s.id);

        await this.db
          .update(activeSessions)
          .set({ isActive: false })
          .where(inArray(activeSessions.id, sessionsToTerminate));

        this.logger.info('Session limit enforced', {
          userId,
          maxSessions,
          terminated: sessionsToTerminate.length,
        });
      }

      this.recordQuery('enforceSessionLimit', Date.now() - startTime, true);
    } catch (error) {
      this.recordQuery('enforceSessionLimit', Date.now() - startTime, false);
      this.logger.error('Failed to enforce session limit', {
        error,
        userId,
        maxSessions,
      });
      throw error;
    }
  }

  // Activity tracking
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

  async recordSessionActivity(sessionId: string, activity: any): Promise<void> {
    // This could be extended to record detailed activity logs
    await this.updateLastActivity(sessionId);
  }

  // Authentication attempts tracking
  async recordAuthAttempt(data: AuthAttemptData): Promise<void> {
    const startTime = Date.now();

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

      await this.db.insert(authAttempts).values(attemptData);

      this.recordQuery('recordAuthAttempt', Date.now() - startTime, true);
    } catch (error) {
      this.recordQuery('recordAuthAttempt', Date.now() - startTime, false);
      this.logger.error('Failed to record auth attempt', { error, data });
      throw error;
    }
  }

  async getRecentFailedAttempts(
    identifier: string,
    identifierType: 'email' | 'ip' | 'userId',
    timeWindow: number = 15 * 60 * 1000
  ): Promise<AuthAttempt[]> {
    const startTime = Date.now();

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

      this.recordQuery('getRecentFailedAttempts', Date.now() - startTime, true);
      return attempts;
    } catch (error) {
      this.recordQuery(
        'getRecentFailedAttempts',
        Date.now() - startTime,
        false
      );
      this.logger.error('Failed to get recent failed attempts', {
        error,
        identifier,
        identifierType,
      });
      throw error;
    }
  }

  // Implementation of remaining abstract methods
  async findByIds(ids: string[]): Promise<Session[]> {
    const startTime = Date.now();

    try {
      const sessions = await this.db
        .select()
        .from(activeSessions)
        .where(inArray(activeSessions.id, ids));

      const result = sessions.map((session) =>
        this.mapToSessionEntity(session)
      );

      this.recordQuery('findByIds', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('findByIds', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkCreate(data: CreateSessionData[]): Promise<Session[]> {
    const startTime = Date.now();

    try {
      const sessionData: NewActiveSession[] = data.map((d) => ({
        id: d.id,
        userId: d.userId,
        token: d.token,
        refreshToken: d.refreshToken,
        expiresAt: d.expiresAt,
        refreshExpiresAt: d.refreshExpiresAt,
        ipAddress: d.ipAddress,
        deviceFingerprint: d.deviceFingerprint,
        userAgent: d.userAgent,
        riskScore: d.riskScore || 0,
        isActive: true,
        createdAt: new Date(),
        lastActivity: new Date(),
      }));

      const sessions = await this.db
        .insert(activeSessions)
        .values(sessionData)
        .returning();

      const result = sessions.map((session) =>
        this.mapToSessionEntity(session)
      );

      this.recordQuery('bulkCreate', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('bulkCreate', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkUpdate(
    updates: Array<{ id: string; data: UpdateSessionData }>
  ): Promise<Session[]> {
    const startTime = Date.now();

    try {
      const results: Session[] = [];

      // Execute updates in parallel
      await Promise.all(
        updates.map(async (update) => {
          const session = await this.update(update.id, update.data);
          results.push(session);
        })
      );

      this.recordQuery('bulkUpdate', Date.now() - startTime, true);
      return results;
    } catch (error) {
      this.recordQuery('bulkUpdate', Date.now() - startTime, false);
      throw error;
    }
  }

  async bulkDelete(ids: string[]): Promise<void> {
    const startTime = Date.now();

    try {
      await this.db
        .update(activeSessions)
        .set({ isActive: false })
        .where(inArray(activeSessions.id, ids));

      // Invalidate caches for all deleted sessions
      await Promise.all(ids.map((id) => this.invalidateSessionCaches(id)));

      this.recordQuery('bulkDelete', Date.now() - startTime, true);
    } catch (error) {
      this.recordQuery('bulkDelete', Date.now() - startTime, false);
      throw error;
    }
  }

  async findMany(
    filters: SessionFilters
  ): Promise<{ items: Session[]; total: number }> {
    const startTime = Date.now();

    try {
      const conditions = this.buildWhereConditions(filters);
      const orderBy = this.buildOrderBy(filters);

      const [items, totalResult] = await Promise.all([
        this.db
          .select()
          .from(activeSessions)
          .where(and(...conditions))
          .orderBy(orderBy)
          .limit(filters.limit || 50)
          .offset(filters.offset || 0),
        this.db
          .select({ count: count() })
          .from(activeSessions)
          .where(and(...conditions)),
      ]);

      const result = {
        items: items.map((session) => this.mapToSessionEntity(session)),
        total: totalResult[0]?.count || 0,
      };

      this.recordQuery('findMany', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('findMany', Date.now() - startTime, false);
      throw error;
    }
  }

  async exists(id: string): Promise<boolean> {
    const startTime = Date.now();

    try {
      const [result] = await this.db
        .select({ id: activeSessions.id })
        .from(activeSessions)
        .where(eq(activeSessions.id, id))
        .limit(1);

      this.recordQuery('exists', Date.now() - startTime, true);
      return !!result;
    } catch (error) {
      this.recordQuery('exists', Date.now() - startTime, false);
      throw error;
    }
  }

  async count(filters?: Partial<SessionFilters>): Promise<number> {
    const startTime = Date.now();

    try {
      const conditions = filters ? this.buildWhereConditions(filters) : [];

      const [result] = await this.db
        .select({ count: count() })
        .from(activeSessions)
        .where(conditions.length > 0 ? and(...conditions) : undefined);

      this.recordQuery('count', Date.now() - startTime, true);
      return result?.count || 0;
    } catch (error) {
      this.recordQuery('count', Date.now() - startTime, false);
      throw error;
    }
  }

  // Additional session-specific methods
  async updateSessionRiskScore(
    sessionId: string,
    riskScore: number
  ): Promise<void> {
    await this.update(sessionId, { riskScore });
  }

  async findHighRiskSessions(riskThreshold: number = 0.7): Promise<Session[]> {
    const sessions = await this.db
      .select()
      .from(activeSessions)
      .where(
        and(
          eq(activeSessions.isActive, true),
          gt(activeSessions.riskScore, riskThreshold)
        )
      )
      .orderBy(desc(activeSessions.riskScore));

    return sessions.map((session) => this.mapToSessionEntity(session));
  }

  async findSuspiciousSessions(criteria: {
    multipleIPs?: boolean;
    unusualLocation?: boolean;
    highRiskScore?: number;
  }): Promise<Session[]> {
    // This would require more complex queries based on the criteria
    // For now, implementing basic high risk score filtering
    if (criteria.highRiskScore) {
      return this.findHighRiskSessions(criteria.highRiskScore);
    }

    return [];
  }

  async findSessionsByDevice(deviceFingerprint: string): Promise<Session[]> {
    const sessions = await this.db
      .select()
      .from(activeSessions)
      .where(eq(activeSessions.deviceFingerprint, deviceFingerprint))
      .orderBy(desc(activeSessions.lastActivity));

    return sessions.map((session) => this.mapToSessionEntity(session));
  }

  async findSessionsByIP(ipAddress: string): Promise<Session[]> {
    const sessions = await this.db
      .select()
      .from(activeSessions)
      .where(eq(activeSessions.ipAddress, ipAddress))
      .orderBy(desc(activeSessions.lastActivity));

    return sessions.map((session) => this.mapToSessionEntity(session));
  }

  async getSessionStats(timeWindow: number = 24 * 60 * 60 * 1000): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    uniqueUsers: number;
    topDevices: Array<{ device: string; count: number }>;
    topLocations: Array<{ ip: string; count: number }>;
  }> {
    const startTime = Date.now();

    try {
      const since = new Date(Date.now() - timeWindow);

      // Get basic stats
      const [totalSessionsResult, activeSessionsResult] = await Promise.all([
        this.db
          .select({ count: count() })
          .from(activeSessions)
          .where(gt(activeSessions.createdAt, since)),
        this.db
          .select({ count: count() })
          .from(activeSessions)
          .where(
            and(
              eq(activeSessions.isActive, true),
              gt(activeSessions.expiresAt, new Date())
            )
          ),
      ]);

      // Get unique users
      const uniqueUsersResult = await this.db
        .selectDistinct({ userId: activeSessions.userId })
        .from(activeSessions)
        .where(gt(activeSessions.createdAt, since));

      // Get top devices (simplified)
      const topDevicesResult = await this.db
        .select({
          device: activeSessions.deviceFingerprint,
          count: count(),
        })
        .from(activeSessions)
        .where(
          and(
            gt(activeSessions.createdAt, since),
            sql`${activeSessions.deviceFingerprint} IS NOT NULL`
          )
        )
        .groupBy(activeSessions.deviceFingerprint)
        .orderBy(desc(count()))
        .limit(10);

      // Get top IPs
      const topLocationsResult = await this.db
        .select({
          ip: activeSessions.ipAddress,
          count: count(),
        })
        .from(activeSessions)
        .where(
          and(
            gt(activeSessions.createdAt, since),
            sql`${activeSessions.ipAddress} IS NOT NULL`
          )
        )
        .groupBy(activeSessions.ipAddress)
        .orderBy(desc(count()))
        .limit(10);

      const result = {
        totalSessions: totalSessionsResult[0]?.count || 0,
        activeSessions: activeSessionsResult[0]?.count || 0,
        averageSessionDuration: 0, // Would need more complex calculation
        uniqueUsers: uniqueUsersResult.length,
        topDevices: topDevicesResult.map((d) => ({
          device: d.device || 'unknown',
          count: d.count,
        })),
        topLocations: topLocationsResult.map((l) => ({
          ip: l.ip || 'unknown',
          count: l.count,
        })),
      };

      this.recordQuery('getSessionStats', Date.now() - startTime, true);
      return result;
    } catch (error) {
      this.recordQuery('getSessionStats', Date.now() - startTime, false);
      this.logger.error('Failed to get session stats', { error });
      throw error;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    return this.terminateExpiredSessions();
  }

  async cleanupOldAuthAttempts(olderThan: Date): Promise<number> {
    const startTime = Date.now();

    try {
      const result = await this.db
        .delete(authAttempts)
        .where(lt(authAttempts.timestamp, olderThan));

      const count = result.rowCount || 0;

      this.recordQuery('cleanupOldAuthAttempts', Date.now() - startTime, true);

      if (count > 0) {
        this.logger.info('Old auth attempts cleaned up', { count });
      }

      return count;
    } catch (error) {
      this.recordQuery('cleanupOldAuthAttempts', Date.now() - startTime, false);
      this.logger.error('Failed to cleanup old auth attempts', { error });
      throw error;
    }
  }

  async checkRateLimit(
    identifier: string,
    resource: string,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
  }> {
    const startTime = Date.now();

    try {
      const now = new Date();
      const windowStart = new Date(now.getTime() - windowMs);

      // Get current count for this identifier and resource
      const [existing] = await this.db
        .select()
        .from(rateLimitTracking)
        .where(
          and(
            eq(rateLimitTracking.identifier, identifier),
            eq(rateLimitTracking.resource, resource),
            gt(rateLimitTracking.windowEnd, now)
          )
        )
        .limit(1);

      if (existing) {
        const allowed = existing.requestCount < limit;

        if (allowed) {
          // Increment counter
          await this.db
            .update(rateLimitTracking)
            .set({ requestCount: existing.requestCount + 1 })
            .where(eq(rateLimitTracking.id, existing.id));
        }

        this.recordQuery('checkRateLimit', Date.now() - startTime, true);

        return {
          allowed,
          remaining: Math.max(
            0,
            limit - existing.requestCount - (allowed ? 1 : 0)
          ),
          resetTime: existing.windowEnd,
        };
      } else {
        // Create new rate limit entry
        const windowEnd = new Date(now.getTime() + windowMs);

        await this.db.insert(rateLimitTracking).values({
          identifier,
          resource,
          requestCount: 1,
          windowStart: now,
          windowEnd,
          blocked: false,
        });

        this.recordQuery('checkRateLimit', Date.now() - startTime, true);

        return {
          allowed: true,
          remaining: limit - 1,
          resetTime: windowEnd,
        };
      }
    } catch (error) {
      this.recordQuery('checkRateLimit', Date.now() - startTime, false);
      this.logger.error('Failed to check rate limit', {
        error,
        identifier,
        resource,
      });
      throw error;
    }
  }

  // User auth cache operations
  async cacheUserAuth(userId: string, authData: any): Promise<void> {
    const startTime = Date.now();

    try {
      const cacheData: NewUserAuthCacheEntry = {
        userId,
        email: authData.email,
        passwordHash: authData.passwordHash,
        mfaEnabled: authData.mfaEnabled || false,
        totpSecret: authData.totpSecret,
        failedLoginAttempts: authData.failedLoginAttempts || 0,
        lockedUntil: authData.lockedUntil,
        lastLoginAt: authData.lastLoginAt,
        lastLoginIP: authData.lastLoginIP,
        riskScore: authData.riskScore || 0,
        updatedAt: new Date(),
      };

      await this.db
        .insert(userAuthCache)
        .values(cacheData)
        .onConflictDoUpdate({
          target: userAuthCache.userId,
          set: {
            email: cacheData.email,
            passwordHash: cacheData.passwordHash,
            mfaEnabled: cacheData.mfaEnabled,
            totpSecret: cacheData.totpSecret,
            failedLoginAttempts: cacheData.failedLoginAttempts,
            lockedUntil: cacheData.lockedUntil,
            lastLoginAt: cacheData.lastLoginAt,
            lastLoginIP: cacheData.lastLoginIP,
            riskScore: cacheData.riskScore,
            updatedAt: new Date(),
          },
        });

      this.recordQuery('cacheUserAuth', Date.now() - startTime, true);
    } catch (error) {
      this.recordQuery('cacheUserAuth', Date.now() - startTime, false);
      this.logger.error('Failed to cache user auth data', { error, userId });
      throw error;
    }
  }

  async getCachedUserAuth(userId: string): Promise<UserAuthCacheEntry | null> {
    const startTime = Date.now();

    try {
      const [cached] = await this.db
        .select()
        .from(userAuthCache)
        .where(eq(userAuthCache.userId, userId))
        .limit(1);

      this.recordQuery('getCachedUserAuth', Date.now() - startTime, true);
      return cached || null;
    } catch (error) {
      this.recordQuery('getCachedUserAuth', Date.now() - startTime, false);
      this.logger.error('Failed to get cached user auth data', {
        error,
        userId,
      });
      throw error;
    }
  }

  async invalidateUserAuthCache(userId: string): Promise<void> {
    const startTime = Date.now();

    try {
      await this.db
        .delete(userAuthCache)
        .where(eq(userAuthCache.userId, userId));

      this.recordQuery('invalidateUserAuthCache', Date.now() - startTime, true);
      this.logger.debug('User auth cache invalidated', { userId });
    } catch (error) {
      this.recordQuery(
        'invalidateUserAuthCache',
        Date.now() - startTime,
        false
      );
      this.logger.error('Failed to invalidate user auth cache', {
        error,
        userId,
      });
      throw error;
    }
  }

  // Helper methods
  private mapToSessionEntity(activeSession: ActiveSession): Session {
    return {
      id: activeSession.id,
      userId: activeSession.userId,
      token: activeSession.token,
      refreshToken: activeSession.refreshToken,
      expiresAt: activeSession.expiresAt,
      refreshExpiresAt: activeSession.refreshExpiresAt,
      createdAt: activeSession.createdAt,
      lastActivity: activeSession.lastActivity,
      deviceInfo: null, // Would need to parse if stored as JSON
      ipAddress: activeSession.ipAddress,
      userAgent: activeSession.userAgent,
      riskScore: activeSession.riskScore,
      isActive: activeSession.isActive,
    } as Session;
  }

  private buildWhereConditions(filters: Partial<SessionFilters>) {
    const conditions = [];

    if (filters.userId) {
      conditions.push(eq(activeSessions.userId, filters.userId));
    }

    if (filters.isActive !== undefined) {
      conditions.push(eq(activeSessions.isActive, filters.isActive));
    }

    if (filters.expiredOnly) {
      conditions.push(lt(activeSessions.expiresAt, new Date()));
    } else {
      // By default, exclude expired sessions
      conditions.push(gt(activeSessions.expiresAt, new Date()));
    }

    if (filters.riskScoreMin !== undefined) {
      conditions.push(gt(activeSessions.riskScore, filters.riskScoreMin));
    }

    if (filters.riskScoreMax !== undefined) {
      conditions.push(lt(activeSessions.riskScore, filters.riskScoreMax));
    }

    if (filters.ipAddress) {
      conditions.push(eq(activeSessions.ipAddress, filters.ipAddress));
    }

    if (filters.deviceFingerprint) {
      conditions.push(
        eq(activeSessions.deviceFingerprint, filters.deviceFingerprint)
      );
    }

    if (filters.createdAfter) {
      conditions.push(gt(activeSessions.createdAt, filters.createdAfter));
    }

    if (filters.createdBefore) {
      conditions.push(lt(activeSessions.createdAt, filters.createdBefore));
    }

    return conditions;
  }

  private buildOrderBy(filters: SessionFilters) {
    const sortBy = filters.sortBy || 'createdAt';
    const sortOrder = filters.sortOrder || 'desc';

    const column = activeSessions[sortBy as keyof typeof activeSessions];
    return sortOrder === 'desc' ? desc(column) : asc(column);
  }

  private async invalidateSessionCaches(sessionId: string): Promise<void> {
    const patterns = [
      `${this.constructor.name}:findById:*${sessionId}*`,
      `${this.constructor.name}:validateSession:*`,
      `${this.constructor.name}:getUserActiveSessions:*`,
      `${this.constructor.name}:getUserSessionCount:*`,
    ];

    await Promise.all(patterns.map((pattern) => this.invalidateCache(pattern)));
  }
}
