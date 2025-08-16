/**
 * Session Repository Interface
 * Defines session-specific repository operations for high-performance session management
 */

import { Session } from '../../../../domain/entities/session';
import {
  IBaseRepository,
  ICacheableRepository,
  IOptimizedRepository,
} from './base-repository.interface';

export interface CreateSessionData {
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
  deviceInfo?: any;
}

export interface UpdateSessionData {
  lastActivity?: Date;
  riskScore?: number;
  isActive?: boolean;
  deviceInfo?: any;
}

export interface SessionFilters {
  userId?: string;
  isActive?: boolean;
  expiredOnly?: boolean;
  riskScoreMin?: number;
  riskScoreMax?: number;
  ipAddress?: string;
  deviceFingerprint?: string;
  createdAfter?: Date;
  createdBefore?: Date;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'lastActivity' | 'expiresAt' | 'riskScore';
  sortOrder?: 'asc' | 'desc';
}

export interface SessionValidationResult {
  isValid: boolean;
  session?: Session;
  reason?: string;
}

export interface AuthAttemptData {
  userId?: string;
  email?: string;
  ipAddress: string;
  userAgent?: string;
  success: boolean;
  failureReason?: string;
  deviceFingerprint?: string;
  riskScore?: number;
}

export interface ISessionRepository
  extends IBaseRepository<
      Session,
      CreateSessionData,
      UpdateSessionData,
      SessionFilters
    >,
    ICacheableRepository<Session>,
    IOptimizedRepository {
  // Session validation and management
  validateSession(token: string): Promise<SessionValidationResult>;
  validateSessionCached(
    token: string,
    ttl?: number
  ): Promise<SessionValidationResult>;
  refreshSession(refreshToken: string): Promise<Session | null>;

  // Session lifecycle
  terminateSession(sessionId: string): Promise<void>;
  terminateUserSessions(
    userId: string,
    excludeSessionId?: string
  ): Promise<number>;
  terminateExpiredSessions(): Promise<number>;

  // User session management
  getUserActiveSessions(userId: string): Promise<Session[]>;
  getUserSessionCount(userId: string): Promise<number>;
  enforceSessionLimit(userId: string, maxSessions: number): Promise<void>;

  // Activity tracking
  updateLastActivity(sessionId: string): Promise<void>;
  recordSessionActivity(sessionId: string, activity: any): Promise<void>;

  // Authentication attempts tracking
  recordAuthAttempt(data: AuthAttemptData): Promise<void>;
  getRecentFailedAttempts(
    identifier: string,
    identifierType: 'email' | 'ip' | 'userId',
    timeWindow?: number
  ): Promise<any[]>;

  // Security and risk management
  updateSessionRiskScore(sessionId: string, riskScore: number): Promise<void>;
  findHighRiskSessions(riskThreshold?: number): Promise<Session[]>;
  findSuspiciousSessions(criteria: {
    multipleIPs?: boolean;
    unusualLocation?: boolean;
    highRiskScore?: number;
  }): Promise<Session[]>;

  // Device management
  findSessionsByDevice(deviceFingerprint: string): Promise<Session[]>;
  findSessionsByIP(ipAddress: string): Promise<Session[]>;

  // Analytics and reporting
  getSessionStats(timeWindow?: number): Promise<{
    totalSessions: number;
    activeSessions: number;
    averageSessionDuration: number;
    uniqueUsers: number;
    topDevices: Array<{ device: string; count: number }>;
    topLocations: Array<{ ip: string; count: number }>;
  }>;

  // Cleanup operations
  cleanupExpiredSessions(): Promise<number>;
  cleanupOldAuthAttempts(olderThan: Date): Promise<number>;

  // Rate limiting support
  checkRateLimit(
    identifier: string,
    resource: string,
    limit: number,
    windowMs: number
  ): Promise<{
    allowed: boolean;
    remaining: number;
    resetTime: Date;
  }>;

  // User auth cache operations (for fast authentication)
  cacheUserAuth(userId: string, authData: any): Promise<void>;
  getCachedUserAuth(userId: string): Promise<any | null>;
  invalidateUserAuthCache(userId: string): Promise<void>;
}
