import { MultiLayerCache } from './multi-layer-cache';
import { CacheOptions } from './cache-entry';
import { logger } from '../logging/winston-logger';
import { nanoid } from 'nanoid';

export interface SessionData {
  id: string;
  userId: string;
  token: string;
  refreshToken: string;
  expiresAt: number;
  refreshExpiresAt: number;
  createdAt: number;
  lastActivity: number;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  riskScore: number;
  isActive: boolean;
  metadata?: Record<string, any>;
}

export interface DeviceInfo {
  fingerprint: string;
  platform: string;
  browser: string;
  version: string;
  isMobile: boolean;
  screenResolution?: string;
  timezone?: string;
}

export interface SessionStorageConfig {
  sessionTTL: number; // Session TTL in seconds
  refreshTTL: number; // Refresh token TTL in seconds
  cleanupInterval: number; // Cleanup interval in milliseconds
  maxSessionsPerUser: number; // Maximum concurrent sessions per user
  extendOnActivity: boolean; // Whether to extend session on activity
  activityThreshold: number; // Minimum time between activity updates (seconds)
}

export class SessionStorage {
  private cleanupTimer: NodeJS.Timeout | null = null;

  constructor(
    private cache: MultiLayerCache,
    private config: SessionStorageConfig
  ) {
    this.startCleanupTimer();
  }

  async createSession(
    userId: string,
    deviceInfo: DeviceInfo,
    ipAddress: string,
    userAgent: string,
    metadata?: Record<string, any>
  ): Promise<SessionData> {
    const sessionId = nanoid(32);
    const token = nanoid(64);
    const refreshToken = nanoid(64);
    const now = Date.now();

    const sessionData: SessionData = {
      id: sessionId,
      userId,
      token,
      refreshToken,
      expiresAt: now + this.config.sessionTTL * 1000,
      refreshExpiresAt: now + this.config.refreshTTL * 1000,
      createdAt: now,
      lastActivity: now,
      deviceInfo,
      ipAddress,
      userAgent,
      riskScore: 0,
      isActive: true,
      metadata,
    };

    try {
      // Check and enforce session limits
      await this.enforceSessionLimits(userId);

      // Store session data
      const cacheOptions: CacheOptions = {
        ttl: this.config.sessionTTL,
        tags: [`user:${userId}`, 'session', `device:${deviceInfo.fingerprint}`],
      };

      await this.cache.set(
        this.getSessionKey(sessionId),
        sessionData,
        cacheOptions
      );
      await this.cache.set(this.getTokenKey(token), sessionId, cacheOptions);
      await this.cache.set(
        this.getRefreshTokenKey(refreshToken),
        sessionId,
        cacheOptions
      );

      // Add to user's session list
      await this.addToUserSessions(userId, sessionId);

      logger.info('Session created', {
        sessionId,
        userId,
        deviceFingerprint: deviceInfo.fingerprint,
        ipAddress,
      });

      return sessionData;
    } catch (error) {
      logger.error('Failed to create session:', { userId, error });
      throw error;
    }
  }

  async getSession(sessionId: string): Promise<SessionData | null> {
    try {
      const sessionData = await this.cache.get<SessionData>(
        this.getSessionKey(sessionId)
      );

      if (!sessionData) {
        return null;
      }

      // Check if session is expired
      if (this.isSessionExpired(sessionData)) {
        await this.deleteSession(sessionId);
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session:', { sessionId, error });
      return null;
    }
  }

  async getSessionByToken(token: string): Promise<SessionData | null> {
    try {
      const sessionId = await this.cache.get<string>(this.getTokenKey(token));

      if (!sessionId) {
        return null;
      }

      return await this.getSession(sessionId);
    } catch (error) {
      logger.error('Failed to get session by token:', {
        token: token.substring(0, 8) + '...',
        error,
      });
      return null;
    }
  }

  async getSessionByRefreshToken(
    refreshToken: string
  ): Promise<SessionData | null> {
    try {
      const sessionId = await this.cache.get<string>(
        this.getRefreshTokenKey(refreshToken)
      );

      if (!sessionId) {
        return null;
      }

      const sessionData = await this.getSession(sessionId);

      if (!sessionData) {
        return null;
      }

      // Check if refresh token is expired
      if (Date.now() > sessionData.refreshExpiresAt) {
        await this.deleteSession(sessionId);
        return null;
      }

      return sessionData;
    } catch (error) {
      logger.error('Failed to get session by refresh token:', {
        refreshToken: refreshToken.substring(0, 8) + '...',
        error,
      });
      return null;
    }
  }

  async updateSessionActivity(
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
    riskScore?: number
  ): Promise<boolean> {
    try {
      const sessionData = await this.getSession(sessionId);

      if (!sessionData) {
        return false;
      }

      const now = Date.now();

      // Check activity threshold to avoid too frequent updates
      if (
        now - sessionData.lastActivity <
        this.config.activityThreshold * 1000
      ) {
        return true;
      }

      // Update session data
      sessionData.lastActivity = now;
      if (ipAddress) sessionData.ipAddress = ipAddress;
      if (userAgent) sessionData.userAgent = userAgent;
      if (riskScore !== undefined) sessionData.riskScore = riskScore;

      // Extend session if configured
      if (this.config.extendOnActivity) {
        sessionData.expiresAt = now + this.config.sessionTTL * 1000;
      }

      const cacheOptions: CacheOptions = {
        ttl: Math.ceil((sessionData.expiresAt - now) / 1000),
        tags: [
          `user:${sessionData.userId}`,
          'session',
          `device:${sessionData.deviceInfo.fingerprint}`,
        ],
      };

      await this.cache.set(
        this.getSessionKey(sessionId),
        sessionData,
        cacheOptions
      );

      logger.debug('Session activity updated', {
        sessionId,
        userId: sessionData.userId,
        lastActivity: new Date(sessionData.lastActivity),
        riskScore: sessionData.riskScore,
      });

      return true;
    } catch (error) {
      logger.error('Failed to update session activity:', { sessionId, error });
      return false;
    }
  }

  async refreshSession(
    sessionId: string
  ): Promise<{ token: string; refreshToken: string } | null> {
    try {
      const sessionData = await this.getSession(sessionId);

      if (!sessionData) {
        return null;
      }

      // Check if refresh is allowed
      if (Date.now() > sessionData.refreshExpiresAt) {
        await this.deleteSession(sessionId);
        return null;
      }

      // Generate new tokens
      const newToken = nanoid(64);
      const newRefreshToken = nanoid(64);
      const now = Date.now();

      // Remove old token mappings
      await this.cache.delete(this.getTokenKey(sessionData.token));
      await this.cache.delete(
        this.getRefreshTokenKey(sessionData.refreshToken)
      );

      // Update session data
      sessionData.token = newToken;
      sessionData.refreshToken = newRefreshToken;
      sessionData.expiresAt = now + this.config.sessionTTL * 1000;
      sessionData.lastActivity = now;

      const cacheOptions: CacheOptions = {
        ttl: this.config.sessionTTL,
        tags: [
          `user:${sessionData.userId}`,
          'session',
          `device:${sessionData.deviceInfo.fingerprint}`,
        ],
      };

      // Store updated session and new token mappings
      await this.cache.set(
        this.getSessionKey(sessionId),
        sessionData,
        cacheOptions
      );
      await this.cache.set(this.getTokenKey(newToken), sessionId, cacheOptions);
      await this.cache.set(
        this.getRefreshTokenKey(newRefreshToken),
        sessionId,
        cacheOptions
      );

      logger.info('Session refreshed', {
        sessionId,
        userId: sessionData.userId,
      });

      return {
        token: newToken,
        refreshToken: newRefreshToken,
      };
    } catch (error) {
      logger.error('Failed to refresh session:', { sessionId, error });
      return null;
    }
  }

  async deleteSession(sessionId: string): Promise<boolean> {
    try {
      const sessionData = await this.cache.get<SessionData>(
        this.getSessionKey(sessionId)
      );

      if (!sessionData) {
        return false;
      }

      // Remove all session-related keys
      await Promise.all([
        this.cache.delete(this.getSessionKey(sessionId)),
        this.cache.delete(this.getTokenKey(sessionData.token)),
        this.cache.delete(this.getRefreshTokenKey(sessionData.refreshToken)),
      ]);

      // Remove from user's session list
      await this.removeFromUserSessions(sessionData.userId, sessionId);

      logger.info('Session deleted', {
        sessionId,
        userId: sessionData.userId,
      });

      return true;
    } catch (error) {
      logger.error('Failed to delete session:', { sessionId, error });
      return false;
    }
  }

  async getUserSessions(userId: string): Promise<SessionData[]> {
    try {
      const sessionIds = await this.cache.get<string[]>(
        this.getUserSessionsKey(userId)
      );

      if (!sessionIds || sessionIds.length === 0) {
        return [];
      }

      const sessions: SessionData[] = [];

      for (const sessionId of sessionIds) {
        const sessionData = await this.getSession(sessionId);
        if (sessionData) {
          sessions.push(sessionData);
        }
      }

      return sessions;
    } catch (error) {
      logger.error('Failed to get user sessions:', { userId, error });
      return [];
    }
  }

  async deleteUserSessions(userId: string): Promise<number> {
    try {
      const sessions = await this.getUserSessions(userId);
      let deleted = 0;

      for (const session of sessions) {
        if (await this.deleteSession(session.id)) {
          deleted++;
        }
      }

      // Clear user sessions list
      await this.cache.delete(this.getUserSessionsKey(userId));

      logger.info('User sessions deleted', { userId, deleted });
      return deleted;
    } catch (error) {
      logger.error('Failed to delete user sessions:', { userId, error });
      return 0;
    }
  }

  async cleanupExpiredSessions(): Promise<number> {
    try {
      // This is a simplified cleanup - in production, you might want to use Redis SCAN
      // or maintain a separate index of sessions by expiration time
      let cleaned = 0;

      // Invalidate expired sessions by tag
      cleaned += await this.cache.invalidateByTag('session');

      logger.info('Expired sessions cleaned up', { cleaned });
      return cleaned;
    } catch (error) {
      logger.error('Failed to cleanup expired sessions:', error);
      return 0;
    }
  }

  private async enforceSessionLimits(userId: string): Promise<void> {
    const sessions = await this.getUserSessions(userId);

    if (sessions.length >= this.config.maxSessionsPerUser) {
      // Sort by last activity and remove oldest sessions
      sessions.sort((a, b) => a.lastActivity - b.lastActivity);

      const sessionsToRemove = sessions.slice(
        0,
        sessions.length - this.config.maxSessionsPerUser + 1
      );

      for (const session of sessionsToRemove) {
        await this.deleteSession(session.id);
      }

      logger.info('Session limit enforced', {
        userId,
        removed: sessionsToRemove.length,
        remaining: this.config.maxSessionsPerUser - 1,
      });
    }
  }

  private async addToUserSessions(
    userId: string,
    sessionId: string
  ): Promise<void> {
    const key = this.getUserSessionsKey(userId);
    const sessions = (await this.cache.get<string[]>(key)) || [];

    if (!sessions.includes(sessionId)) {
      sessions.push(sessionId);
      await this.cache.set(key, sessions, {
        ttl: this.config.refreshTTL,
        tags: [`user:${userId}`],
      });
    }
  }

  private async removeFromUserSessions(
    userId: string,
    sessionId: string
  ): Promise<void> {
    const key = this.getUserSessionsKey(userId);
    const sessions = (await this.cache.get<string[]>(key)) || [];

    const filtered = sessions.filter((id) => id !== sessionId);

    if (filtered.length !== sessions.length) {
      if (filtered.length > 0) {
        await this.cache.set(key, filtered, {
          ttl: this.config.refreshTTL,
          tags: [`user:${userId}`],
        });
      } else {
        await this.cache.delete(key);
      }
    }
  }

  private isSessionExpired(sessionData: SessionData): boolean {
    return Date.now() > sessionData.expiresAt || !sessionData.isActive;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpiredSessions().catch((error) => {
        logger.error('Session cleanup error:', error);
      });
    }, this.config.cleanupInterval);
  }

  private getSessionKey(sessionId: string): string {
    return `session:${sessionId}`;
  }

  private getTokenKey(token: string): string {
    return `token:${token}`;
  }

  private getRefreshTokenKey(refreshToken: string): string {
    return `refresh:${refreshToken}`;
  }

  private getUserSessionsKey(userId: string): string {
    return `user_sessions:${userId}`;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
  }
}
