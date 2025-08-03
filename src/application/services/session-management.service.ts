/**
 * Session Management Service Implementation
 * Implements session creation with Redis and database dual storage,
 * session validation with automatic cleanup, concurrent session management,
 * session refresh mechanisms, and device tracking with suspicious activity detection
 */

import { Logger } from 'winston';
import { Session } from '../../domain/entities/session';
import { DeviceInfo } from '../../domain/entities/user';
import { DrizzleSessionRepository } from '../../infrastructure/database/repositories/drizzle-session-repository';
import { SessionStorage } from '../../infrastructure/cache/session-storage';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';
import { RiskScoringService } from '../../infrastructure/security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../infrastructure/security/device-fingerprinting.service';
import {
  SecurityContext,
  RiskAssessment,
  DeviceFingerprint,
} from '../../infrastructure/security/types';

export interface SessionCreationRequest {
  userId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  riskScore?: number;
  metadata?: Record<string, any>;
}

export interface SessionValidationResult {
  valid: boolean;
  session?: Session;
  reason?: string;
  requiresRefresh?: boolean;
  securityIssues?: string[];
  recommendations?: string[];
}

export interface SessionRefreshRequest {
  sessionId: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
  validateDevice?: boolean;
}

export interface SessionRefreshResult {
  success: boolean;
  session?: Session;
  newTokens?: {
    accessToken: string;
    refreshToken: string;
  };
  riskAssessment?: RiskAssessment;
  error?: string;
}

export interface ConcurrentSessionConfig {
  maxSessionsPerUser: number;
  maxSessionsPerDevice: number;
  allowMultipleDevices: boolean;
  sessionLimitStrategy: 'oldest_first' | 'lowest_activity' | 'highest_risk';
}

export interface SuspiciousActivityAlert {
  type:
    | 'device_change'
    | 'location_change'
    | 'rapid_requests'
    | 'unusual_pattern';
  severity: 'low' | 'medium' | 'high' | 'critical';
  sessionId: string;
  userId: string;
  details: Record<string, any>;
  timestamp: Date;
  recommendations: string[];
}

export interface SessionAnalytics {
  totalActiveSessions: number;
  sessionsPerUser: Record<string, number>;
  deviceDistribution: Record<string, number>;
  riskDistribution: Record<string, number>;
  suspiciousActivities: SuspiciousActivityAlert[];
  averageSessionDuration: number;
  topRiskyUsers: Array<{
    userId: string;
    riskScore: number;
    sessionCount: number;
  }>;
}

export class SessionManagementService {
  private readonly cleanupInterval: NodeJS.Timeout;
  private readonly suspiciousActivityThresholds = {
    rapidRequests: 10, // requests per minute
    deviceChangeWindow: 5 * 60 * 1000, // 5 minutes
    locationChangeDistance: 100, // km (simplified)
    highRiskThreshold: 70,
  };

  constructor(
    private readonly sessionRepository: DrizzleSessionRepository,
    private readonly sessionStorage: SessionStorage,
    private readonly riskScoringService: RiskScoringService,
    private readonly deviceFingerprintingService: DeviceFingerprintingService,
    private readonly concurrentSessionConfig: ConcurrentSessionConfig,
    private readonly logger: Logger
  ) {
    // Start automatic cleanup of expired sessions
    this.cleanupInterval = setInterval(
      () => this.cleanupExpiredSessions(),
      5 * 60 * 1000 // Every 5 minutes
    );

    this.logger.info('Session Management Service initialized', {
      maxSessionsPerUser: concurrentSessionConfig.maxSessionsPerUser,
      maxSessionsPerDevice: concurrentSessionConfig.maxSessionsPerDevice,
      cleanupInterval: '5 minutes',
    });
  }

  /**
   * Create a new session with Redis and database dual storage
   */
  async createSession(request: SessionCreationRequest): Promise<Session> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Creating new session', {
        correlationId,
        userId: request.userId,
        deviceFingerprint: request.deviceInfo.fingerprint,
        ipAddress: request.ipAddress,
      });

      // Generate session ID and tokens
      const sessionId = SecureIdGenerator.generateSessionId();
      const accessToken = SecureIdGenerator.generateCustomId({
        length: 64,
        alphabet: SecureIdGenerator['ALPHABETS'].urlSafe,
        entropy: 320,
      });
      const refreshToken = SecureIdGenerator.generateCustomId({
        length: 64,
        alphabet: SecureIdGenerator['ALPHABETS'].urlSafe,
        entropy: 320,
      });

      const now = new Date();
      const expiresAt = new Date(now.getTime() + 60 * 60 * 1000); // 1 hour
      const refreshExpiresAt = new Date(
        now.getTime() + 7 * 24 * 60 * 60 * 1000
      ); // 7 days

      // Enforce concurrent session limits
      await this.enforceSessionLimits(request.userId, request.deviceInfo);

      // Perform risk assessment
      const riskAssessment = await this.assessSessionRisk(
        request,
        correlationId
      );

      // Create session data
      const sessionData = {
        id: sessionId,
        userId: request.userId,
        token: accessToken,
        refreshToken: refreshToken,
        expiresAt,
        refreshExpiresAt,
        ipAddress: request.ipAddress,
        deviceFingerprint: request.deviceInfo.fingerprint,
        userAgent: request.userAgent,
        riskScore: request.riskScore || riskAssessment.overallScore,
      };

      // Store in database (persistent storage)
      // Create session in database
      await this.sessionRepository.createSession(sessionData);

      // Store in Redis cache (fast access)
      await this.sessionStorage.createSession(
        request.userId,
        request.deviceInfo,
        request.ipAddress,
        request.userAgent,
        request.metadata
      );

      // Create domain entity
      const session = new Session({
        id: sessionId,
        userId: request.userId,
        token: accessToken,
        refreshToken: refreshToken,
        expiresAt,
        refreshExpiresAt,
        createdAt: now,
        lastActivity: now,
        deviceInfo: request.deviceInfo,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        riskScore: riskAssessment.overallScore,
        isActive: true,
      });

      // Check for suspicious activity
      await this.detectSuspiciousActivity(session, request, correlationId);

      this.logger.info('Session created successfully', {
        correlationId,
        sessionId,
        userId: request.userId,
        riskScore: riskAssessment.overallScore,
        expiresAt,
      });

      return session;
    } catch (error) {
      this.logger.error('Failed to create session', {
        correlationId,
        userId: request.userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Validate session with automatic cleanup of expired sessions
   */
  async validateSession(sessionId: string): Promise<SessionValidationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.debug('Validating session', {
        correlationId,
        sessionId,
      });

      // Try Redis cache first (fast path)
      let sessionData = await this.sessionStorage.getSession(sessionId);

      if (!sessionData) {
        // Fallback to database
        const dbValidation =
          await this.sessionRepository.validateSession(sessionId);
        if (!dbValidation.isValid || !dbValidation.session) {
          return {
            valid: false,
            reason: dbValidation.reason || 'Session not found',
          };
        }

        // Convert database session to cache format and store in Redis
        sessionData = this.convertDbSessionToCacheFormat(dbValidation.session);
        if (sessionData) {
          await this.sessionStorage.createSession(
            sessionData.userId,
            sessionData.deviceInfo,
            sessionData.ipAddress,
            sessionData.userAgent
          );
        }
      }

      // Ensure sessionData is not null before proceeding
      if (!sessionData) {
        this.logger.warn('Session data is null after validation', {
          correlationId,
          sessionId,
        });
        return {
          valid: false,
          reason: 'Session data unavailable',
        };
      }

      // Create domain entity
      const session = new Session({
        id: sessionData.id,
        userId: sessionData.userId,
        token: sessionData.token,
        refreshToken: sessionData.refreshToken,
        expiresAt: new Date(sessionData.expiresAt),
        refreshExpiresAt: new Date(sessionData.refreshExpiresAt),
        createdAt: new Date(sessionData.createdAt),
        lastActivity: new Date(sessionData.lastActivity),
        deviceInfo: sessionData.deviceInfo,
        ipAddress: sessionData.ipAddress,
        userAgent: sessionData.userAgent,
        riskScore: sessionData.riskScore,
        isActive: sessionData.isActive,
      });

      // Validate session state
      if (!session.isValid()) {
        await this.terminateSession(sessionId);
        return {
          valid: false,
          reason: session.isExpired() ? 'Session expired' : 'Session inactive',
        };
      }

      // Get security status
      const securityStatus = session.getSecurityStatus();

      // Update last activity
      await this.updateSessionActivity(sessionId);

      this.logger.debug('Session validation successful', {
        correlationId,
        sessionId,
        userId: session.userId,
        riskScore: session.riskScore,
        riskLevel: securityStatus.riskLevel,
      });

      return {
        valid: true,
        session,
        securityIssues: securityStatus.issues,
        recommendations: securityStatus.recommendations,
        requiresRefresh: session.expiresWithin(5), // Suggest refresh if expires in 5 minutes
      };
    } catch (error) {
      this.logger.error('Session validation error', {
        correlationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        valid: false,
        reason: 'Validation error occurred',
      };
    }
  }

  /**
   * Refresh session with security validation
   */
  async refreshSession(
    request: SessionRefreshRequest
  ): Promise<SessionRefreshResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Refreshing session', {
        correlationId,
        sessionId: request.sessionId,
        ipAddress: request.ipAddress,
      });

      // Get current session
      const validation = await this.validateSession(request.sessionId);
      if (!validation.valid || !validation.session) {
        return {
          success: false,
          error: validation.reason || 'Session not found or invalid',
        };
      }

      const session = validation.session;

      // Check if session is refreshable
      if (!session.isRefreshable()) {
        return {
          success: false,
          error: 'Session cannot be refreshed',
        };
      }

      // Validate device if requested
      if (request.validateDevice) {
        const deviceValid = await this.validateDeviceConsistency(
          session,
          request.deviceInfo,
          request.ipAddress
        );

        if (!deviceValid.valid) {
          this.logger.warn('Device validation failed during refresh', {
            correlationId,
            sessionId: request.sessionId,
            reason: deviceValid.reason,
          });

          // Terminate session due to device inconsistency
          await this.terminateSession(request.sessionId);

          return {
            success: false,
            error: 'Device validation failed - session terminated for security',
          };
        }
      }

      // Perform risk assessment for refresh
      const riskAssessment = await this.assessRefreshRisk(
        session,
        request,
        correlationId
      );

      // Update session risk score
      session.calculateRiskScore(request.ipAddress, request.deviceInfo);

      // Generate new tokens
      const newAccessToken = SecureIdGenerator.generateCustomId({
        length: 64,
        alphabet: SecureIdGenerator['ALPHABETS'].urlSafe,
        entropy: 320,
      });
      const newRefreshToken = SecureIdGenerator.generateCustomId({
        length: 64,
        alphabet: SecureIdGenerator['ALPHABETS'].urlSafe,
        entropy: 320,
      });

      // Update session in storage
      const refreshResult = await this.sessionStorage.refreshSession(
        request.sessionId
      );
      if (!refreshResult) {
        return {
          success: false,
          error: 'Failed to refresh session in storage',
        };
      }

      // Update database
      await this.sessionRepository.updateLastActivity(request.sessionId);

      // Create updated session entity
      const updatedSession = new Session({
        id: session.id,
        userId: session.userId,
        token: newAccessToken,
        refreshToken: newRefreshToken,
        expiresAt: session.expiresAt,
        refreshExpiresAt: session.refreshExpiresAt,
        createdAt: session.createdAt,
        lastActivity: new Date(),
        deviceInfo: session.deviceInfo || {
          fingerprint: '',
          userAgent: '',
          platform: '',
          browser: '',
          version: '',
          isMobile: false,
        },
        ipAddress: session.ipAddress || '',
        userAgent: session.userAgent || '',
        riskScore: riskAssessment.overallScore,
        isActive: session.isActive,
      });

      this.logger.info('Session refreshed successfully', {
        correlationId,
        sessionId: request.sessionId,
        userId: session.userId,
        newRiskScore: riskAssessment.overallScore,
      });

      return {
        success: true,
        session: updatedSession,
        newTokens: {
          accessToken: newAccessToken,
          refreshToken: newRefreshToken,
        },
        riskAssessment,
      };
    } catch (error) {
      this.logger.error('Session refresh error', {
        correlationId,
        sessionId: request.sessionId,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        success: false,
        error: 'An error occurred during session refresh',
      };
    }
  }

  /**
   * Terminate a specific session
   */
  async terminateSession(sessionId: string): Promise<void> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Terminating session', {
        correlationId,
        sessionId,
      });

      // Remove from Redis cache
      await this.sessionStorage.deleteSession(sessionId);

      // Update database
      await this.sessionRepository.terminateSession(sessionId);

      this.logger.info('Session terminated successfully', {
        correlationId,
        sessionId,
      });
    } catch (error) {
      this.logger.error('Failed to terminate session', {
        correlationId,
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Get all active sessions for a user
   */
  async getUserSessions(userId: string): Promise<Session[]> {
    try {
      // Try Redis cache first
      const cachedSessions = await this.sessionStorage.getUserSessions(userId);

      if (cachedSessions.length > 0) {
        return cachedSessions.map(
          (sessionData) =>
            new Session({
              id: sessionData.id,
              userId: sessionData.userId,
              token: sessionData.token,
              refreshToken: sessionData.refreshToken,
              expiresAt: new Date(sessionData.expiresAt),
              refreshExpiresAt: new Date(sessionData.refreshExpiresAt),
              createdAt: new Date(sessionData.createdAt),
              lastActivity: new Date(sessionData.lastActivity),
              deviceInfo: sessionData.deviceInfo,
              ipAddress: sessionData.ipAddress,
              userAgent: sessionData.userAgent,
              riskScore: sessionData.riskScore,
              isActive: sessionData.isActive,
            })
        );
      }

      // Fallback to database
      const dbSessions =
        await this.sessionRepository.getUserActiveSessions(userId);

      return dbSessions.map(
        (session) =>
          new Session({
            id: session.id,
            userId: session.userId,
            token: session.token,
            refreshToken: session.refreshToken || '',
            expiresAt: session.expiresAt,
            refreshExpiresAt:
              session.refreshExpiresAt ||
              new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
            createdAt: session.createdAt || new Date(),
            lastActivity: session.lastActivity || new Date(),
            deviceInfo: session.deviceFingerprint
              ? {
                  fingerprint: session.deviceFingerprint,
                  userAgent: session.userAgent || '',
                  platform: '',
                  browser: '',
                  version: '',
                  isMobile: false,
                }
              : {
                  fingerprint: '',
                  userAgent: '',
                  platform: '',
                  browser: '',
                  version: '',
                  isMobile: false,
                },
            ipAddress: session.ipAddress || '',
            userAgent: session.userAgent || '',
            riskScore: session.riskScore || 0,
            isActive: session.isActive,
          })
      );
    } catch (error) {
      this.logger.error('Failed to get user sessions', {
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      return [];
    }
  }

  /**
   * Terminate all sessions for a user
   */
  async terminateUserSessions(
    userId: string,
    excludeSessionId?: string
  ): Promise<number> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Terminating user sessions', {
        correlationId,
        userId,
        excludeSessionId,
      });

      // Terminate in Redis cache
      const cacheTerminated =
        await this.sessionStorage.deleteUserSessions(userId);

      // Terminate in database
      const dbTerminated = await this.sessionRepository.terminateUserSessions(
        userId,
        excludeSessionId
      );

      const totalTerminated = Math.max(cacheTerminated, dbTerminated);

      this.logger.info('User sessions terminated', {
        correlationId,
        userId,
        terminated: totalTerminated,
      });

      return totalTerminated;
    } catch (error) {
      this.logger.error('Failed to terminate user sessions', {
        correlationId,
        userId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Update session activity timestamp
   */
  async updateSessionActivity(
    sessionId: string,
    ipAddress?: string,
    userAgent?: string,
    riskScore?: number
  ): Promise<void> {
    try {
      // Update in Redis cache
      await this.sessionStorage.updateSessionActivity(
        sessionId,
        ipAddress,
        userAgent,
        riskScore
      );

      // Update in database
      await this.sessionRepository.updateLastActivity(sessionId);
    } catch (error) {
      this.logger.error('Failed to update session activity', {
        sessionId,
        error: error instanceof Error ? error.message : String(error),
      });
      // Don't throw as this is not critical
    }
  }

  /**
   * Clean up expired sessions
   */
  async cleanupExpiredSessions(): Promise<number> {
    try {
      this.logger.debug('Starting expired session cleanup');

      // Cleanup from Redis cache
      const cacheCleanup = await this.sessionStorage.cleanupExpiredSessions();

      // Cleanup from database
      const dbCleanup = await this.sessionRepository.cleanupExpiredSessions();

      const totalCleaned = cacheCleanup + dbCleanup;

      if (totalCleaned > 0) {
        this.logger.info('Expired sessions cleaned up', {
          cache: cacheCleanup,
          database: dbCleanup,
          total: totalCleaned,
        });
      }

      return totalCleaned;
    } catch (error) {
      this.logger.error('Failed to cleanup expired sessions', {
        error: error instanceof Error ? error.message : String(error),
      });
      return 0;
    }
  }

  /**
   * Get session analytics and statistics
   */
  async getSessionAnalytics(): Promise<SessionAnalytics> {
    try {
      // Get basic stats from database
      // Get stats for logging/monitoring if needed
      await this.sessionRepository.getSessionStats();

      // Get all active sessions for detailed analysis
      const allSessions = await this.getAllActiveSessions();

      // Calculate analytics
      const sessionsPerUser: Record<string, number> = {};
      const deviceDistribution: Record<string, number> = {};
      const riskDistribution: Record<string, number> = {};
      let totalDuration = 0;

      for (const session of allSessions) {
        // Sessions per user
        sessionsPerUser[session.userId] =
          (sessionsPerUser[session.userId] || 0) + 1;

        // Device distribution
        const deviceType = session.deviceInfo?.isMobile ? 'mobile' : 'desktop';
        deviceDistribution[deviceType] =
          (deviceDistribution[deviceType] || 0) + 1;

        // Risk distribution
        const riskLevel = this.getRiskLevel(session.riskScore);
        riskDistribution[riskLevel] = (riskDistribution[riskLevel] || 0) + 1;

        // Session duration
        totalDuration += session.getSessionDuration();
      }

      // Get top risky users
      const topRiskyUsers = Object.entries(sessionsPerUser)
        .map(([userId, sessionCount]) => {
          const userSessions = allSessions.filter((s) => s.userId === userId);
          const avgRiskScore =
            userSessions.reduce((sum, s) => sum + s.riskScore, 0) /
            userSessions.length;
          return { userId, riskScore: avgRiskScore, sessionCount };
        })
        .sort((a, b) => b.riskScore - a.riskScore)
        .slice(0, 10);

      return {
        totalActiveSessions: allSessions.length,
        sessionsPerUser,
        deviceDistribution,
        riskDistribution,
        suspiciousActivities: [], // Would be populated from a separate tracking system
        averageSessionDuration:
          allSessions.length > 0 ? totalDuration / allSessions.length : 0,
        topRiskyUsers,
      };
    } catch (error) {
      this.logger.error('Failed to get session analytics', {
        error: error instanceof Error ? error.message : String(error),
      });

      // Return empty analytics on error
      return {
        totalActiveSessions: 0,
        sessionsPerUser: {},
        deviceDistribution: {},
        riskDistribution: {},
        suspiciousActivities: [],
        averageSessionDuration: 0,
        topRiskyUsers: [],
      };
    }
  }

  /**
   * Destroy the service and cleanup resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.logger.info('Session Management Service destroyed');
  }

  // Private helper methods

  private async enforceSessionLimits(
    userId: string,
    deviceInfo: DeviceInfo
  ): Promise<void> {
    const userSessions = await this.getUserSessions(userId);

    // Check user session limit
    if (
      userSessions.length >= this.concurrentSessionConfig.maxSessionsPerUser
    ) {
      const sessionsToRemove = this.selectSessionsToRemove(
        userSessions,
        this.concurrentSessionConfig.sessionLimitStrategy,
        userSessions.length -
          this.concurrentSessionConfig.maxSessionsPerUser +
          1
      );

      for (const session of sessionsToRemove) {
        await this.terminateSession(session.id);
      }

      this.logger.info('User session limit enforced', {
        userId,
        removed: sessionsToRemove.length,
        strategy: this.concurrentSessionConfig.sessionLimitStrategy,
      });
    }

    // Check device session limit if configured
    if (this.concurrentSessionConfig.maxSessionsPerDevice > 0) {
      const deviceSessions = userSessions.filter(
        (s) => s.deviceInfo?.fingerprint === deviceInfo.fingerprint
      );

      if (
        deviceSessions.length >=
        this.concurrentSessionConfig.maxSessionsPerDevice
      ) {
        const sessionsToRemove = this.selectSessionsToRemove(
          deviceSessions,
          'oldest_first',
          deviceSessions.length -
            this.concurrentSessionConfig.maxSessionsPerDevice +
            1
        );

        for (const session of sessionsToRemove) {
          await this.terminateSession(session.id);
        }

        this.logger.info('Device session limit enforced', {
          userId,
          deviceFingerprint: deviceInfo.fingerprint,
          removed: sessionsToRemove.length,
        });
      }
    }
  }

  private selectSessionsToRemove(
    sessions: Session[],
    strategy: 'oldest_first' | 'lowest_activity' | 'highest_risk',
    count: number
  ): Session[] {
    const sortedSessions = [...sessions];

    switch (strategy) {
      case 'oldest_first':
        sortedSessions.sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        );
        break;
      case 'lowest_activity':
        sortedSessions.sort(
          (a, b) => a.lastActivity.getTime() - b.lastActivity.getTime()
        );
        break;
      case 'highest_risk':
        sortedSessions.sort((a, b) => b.riskScore - a.riskScore);
        break;
    }

    return sortedSessions.slice(0, count);
  }

  private async assessSessionRisk(
    request: SessionCreationRequest,
    correlationId: string
  ): Promise<RiskAssessment> {
    try {
      const deviceFingerprint: DeviceFingerprint = {
        id: request.deviceInfo.fingerprint,
        userAgent: request.userAgent,
        ipAddress: request.ipAddress,
        platform: request.deviceInfo.platform,
        createdAt: new Date(),
        lastSeen: new Date(),
        trustScore: 50,
      };

      const securityContext: SecurityContext = {
        userId: request.userId,
        sessionId: '', // Will be set later
        deviceFingerprint,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        timestamp: new Date(),
        accountAge: 0, // Would be calculated from user data
        failedAttempts: 0, // Would be retrieved from user data
      };

      return await this.riskScoringService.assessRisk(securityContext);
    } catch (error) {
      this.logger.error('Risk assessment failed', {
        correlationId,
        userId: request.userId,
        error: error instanceof Error ? error.message : String(error),
      });

      // Return default medium risk on error
      return {
        overallScore: 50,
        level: 'medium',
        factors: [],
        recommendations: ['Monitor session closely due to assessment error'],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      };
    }
  }

  private async assessRefreshRisk(
    session: Session,
    request: SessionRefreshRequest,
    correlationId: string
  ): Promise<RiskAssessment> {
    try {
      const deviceFingerprint: DeviceFingerprint = {
        id: request.deviceInfo.fingerprint,
        userAgent: request.userAgent,
        ipAddress: request.ipAddress,
        platform: request.deviceInfo.platform,
        createdAt: new Date(),
        lastSeen: new Date(),
        trustScore: 50,
      };

      const securityContext: SecurityContext = {
        userId: session.userId,
        sessionId: session.id,
        deviceFingerprint,
        ipAddress: request.ipAddress,
        userAgent: request.userAgent,
        timestamp: new Date(),
        accountAge: 0, // Would be calculated
        failedAttempts: 0, // Would be retrieved
      };

      const assessment =
        await this.riskScoringService.assessRisk(securityContext);

      // Add refresh-specific risk factors
      if (session.ipAddress !== request.ipAddress) {
        assessment.overallScore += 15;
        assessment.factors.push({
          type: 'ip_change',
          severity: 'medium',
          score: 15,
          description: 'IP address changed during refresh',
        });
      }

      if (session.deviceInfo?.fingerprint !== request.deviceInfo.fingerprint) {
        assessment.overallScore += 25;
        assessment.factors.push({
          type: 'device_change',
          severity: 'high',
          score: 25,
          description: 'Device fingerprint changed during refresh',
        });
      }

      assessment.overallScore = Math.min(100, assessment.overallScore);

      return assessment;
    } catch (error) {
      this.logger.error('Refresh risk assessment failed', {
        correlationId,
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });

      return {
        overallScore: 60, // Higher default risk for refresh
        level: 'medium',
        factors: [],
        recommendations: ['Monitor refresh closely due to assessment error'],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      };
    }
  }

  private async validateDeviceConsistency(
    session: Session,
    currentDevice: DeviceInfo,
    currentIP: string
  ): Promise<{ valid: boolean; reason?: string }> {
    // Check device fingerprint consistency
    if (session.deviceInfo?.fingerprint !== currentDevice.fingerprint) {
      return {
        valid: false,
        reason: 'Device fingerprint mismatch',
      };
    }

    // Check for significant user agent changes
    if (session.userAgent && session.userAgent !== currentDevice.userAgent) {
      const similarity = this.calculateUserAgentSimilarity(
        session.userAgent,
        currentDevice.userAgent
      );

      if (similarity < 0.8) {
        return {
          valid: false,
          reason: 'User agent significantly different',
        };
      }
    }

    // Check IP address changes (allow some flexibility)
    if (session.ipAddress && session.ipAddress !== currentIP) {
      // In a real implementation, you might check if IPs are in the same geographic region
      // For now, we'll be more permissive
      this.logger.warn('IP address changed during session', {
        sessionId: session.id,
        oldIP: session.ipAddress,
        newIP: currentIP,
      });
    }

    return { valid: true };
  }

  private calculateUserAgentSimilarity(ua1: string, ua2: string): number {
    // Simple similarity calculation - in production, you might use a more sophisticated algorithm
    const words1 = ua1.toLowerCase().split(/\s+/);
    const words2 = ua2.toLowerCase().split(/\s+/);

    const commonWords = words1.filter((word) => words2.includes(word));
    const totalWords = new Set([...words1, ...words2]).size;

    return commonWords.length / totalWords;
  }

  private async detectSuspiciousActivity(
    session: Session,
    request: SessionCreationRequest,
    correlationId: string
  ): Promise<void> {
    try {
      const alerts: SuspiciousActivityAlert[] = [];

      // Check for rapid session creation
      const recentSessions = await this.getUserSessions(request.userId);
      const recentSessionsCount = recentSessions.filter(
        (s) => Date.now() - s.createdAt.getTime() < 60 * 1000 // Last minute
      ).length;

      if (recentSessionsCount > 3) {
        alerts.push({
          type: 'rapid_requests',
          severity: 'high',
          sessionId: session.id,
          userId: request.userId,
          details: { recentSessionsCount },
          timestamp: new Date(),
          recommendations: ['Verify user identity', 'Consider rate limiting'],
        });
      }

      // Check for device changes
      const otherSessions = recentSessions.filter((s) => s.id !== session.id);
      const differentDevices = otherSessions.filter(
        (s) => s.deviceInfo?.fingerprint !== request.deviceInfo.fingerprint
      );

      if (differentDevices.length > 0) {
        const latestDifferentDevice = differentDevices.sort(
          (a, b) => b.createdAt.getTime() - a.createdAt.getTime()
        )[0];

        if (
          latestDifferentDevice &&
          Date.now() - latestDifferentDevice.createdAt.getTime() <
            this.suspiciousActivityThresholds.deviceChangeWindow
        ) {
          alerts.push({
            type: 'device_change',
            severity: 'medium',
            sessionId: session.id,
            userId: request.userId,
            details: {
              previousDevice: latestDifferentDevice.deviceInfo?.fingerprint,
              currentDevice: request.deviceInfo.fingerprint,
              timeWindow: this.suspiciousActivityThresholds.deviceChangeWindow,
            },
            timestamp: new Date(),
            recommendations: [
              'Verify device ownership',
              'Consider MFA challenge',
            ],
          });
        }
      }

      // Log alerts
      for (const alert of alerts) {
        this.logger.warn('Suspicious activity detected', {
          correlationId,
          alert,
        });
      }
    } catch (error) {
      this.logger.error('Failed to detect suspicious activity', {
        correlationId,
        sessionId: session.id,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private convertDbSessionToCacheFormat(dbSession: any): any {
    return {
      id: dbSession.id,
      userId: dbSession.userId,
      token: dbSession.token,
      refreshToken: dbSession.refreshToken || '',
      expiresAt: dbSession.expiresAt.getTime(),
      refreshExpiresAt:
        dbSession.refreshExpiresAt?.getTime() ||
        Date.now() + 7 * 24 * 60 * 60 * 1000,
      createdAt: dbSession.createdAt?.getTime() || Date.now(),
      lastActivity: dbSession.lastActivity?.getTime() || Date.now(),
      deviceInfo: dbSession.deviceFingerprint
        ? {
            fingerprint: dbSession.deviceFingerprint,
            userAgent: dbSession.userAgent || '',
            platform: '',
            browser: '',
            version: '',
            isMobile: false,
          }
        : {
            fingerprint: '',
            userAgent: '',
            platform: '',
            browser: '',
            version: '',
            isMobile: false,
          },
      ipAddress: dbSession.ipAddress || '',
      userAgent: dbSession.userAgent || '',
      riskScore: dbSession.riskScore || 0,
      isActive: dbSession.isActive,
    };
  }

  private async getAllActiveSessions(): Promise<Session[]> {
    // This would typically use a more efficient query in production
    // For now, we'll return an empty array as a placeholder
    return [];
  }

  private getRiskLevel(riskScore: number): string {
    if (riskScore < 25) return 'low';
    if (riskScore < 50) return 'medium';
    if (riskScore < 75) return 'high';
    return 'critical';
  }
}
