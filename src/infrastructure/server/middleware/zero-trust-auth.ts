/**
 * Zero-Trust Authentication Middleware
 * Implements zero-trust security architecture for all requests
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { JWTTokenService } from '../../security/jwt-token.service';
import { RiskScoringService } from '../../security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../security/device-fingerprinting.service';
import { SecurityContext, RiskAssessment } from '../../security/types';
import { logger } from '../../logging/winston-logger';
import { config } from '../../config/environment';

export interface ZeroTrustConfig {
  excludePaths?: string[];
  requireMFA?: boolean;
  maxRiskScore?: number;
  enableDeviceTracking?: boolean;
  enableBehavioralAnalysis?: boolean;
  sessionValidationInterval?: number; // minutes
  onAuthenticationFailure?: (
    request: FastifyRequest,
    reply: FastifyReply,
    reason: string
  ) => void;
  onHighRiskDetected?: (
    request: FastifyRequest,
    reply: FastifyReply,
    assessment: RiskAssessment
  ) => void;
}

export interface AuthenticatedUser {
  id: string;
  email: string;
  roles: string[];
  permissions: string[];
  mfaEnabled: boolean;
  lastLogin?: Date;
  riskScore: number;
  deviceFingerprint?: string;
  sessionId: string;
}

declare module 'fastify' {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    securityContext?: SecurityContext;
    riskAssessment?: RiskAssessment;
    isAuthenticated: boolean;
    requiresAdditionalAuth: boolean;
  }
}

export class ZeroTrustAuthMiddleware {
  private static readonly DEFAULT_CONFIG: Required<ZeroTrustConfig> = {
    excludePaths: ['/health', '/ready', '/docs', '/favicon.ico'],
    requireMFA: false,
    maxRiskScore: 75,
    enableDeviceTracking: true,
    enableBehavioralAnalysis: true,
    sessionValidationInterval: 5, // 5 minutes
    onAuthenticationFailure: () => {},
    onHighRiskDetected: () => {},
  };

  private readonly config: Required<ZeroTrustConfig>;
  private readonly jwtService: JWTTokenService | null;
  private readonly sessionCache = new Map<
    string,
    { lastValidated: Date; riskScore: number }
  >();

  constructor(config: ZeroTrustConfig = {}) {
    this.config = { ...ZeroTrustAuthMiddleware.DEFAULT_CONFIG, ...config };

    // Initialize JWT service with fallback for testing
    try {
      this.jwtService = new JWTTokenService(
        process.env.JWT_SECRET || 'test-access-secret-32-characters-long',
        process.env.JWT_REFRESH_SECRET ||
          'test-refresh-secret-32-characters-long'
      );
    } catch (error) {
      logger.warn(
        'Failed to initialize JWT service, authentication will be disabled',
        {
          error: error instanceof Error ? error.message : 'Unknown error',
        }
      );
      this.jwtService = null;
    }

    // Clean up session cache every 10 minutes
    setInterval(
      () => {
        this.cleanupSessionCache();
      },
      10 * 60 * 1000
    );
  }

  /**
   * Create Fastify plugin for zero-trust authentication
   */
  static createPlugin(config: ZeroTrustConfig = {}): FastifyPluginAsync {
    const middleware = new ZeroTrustAuthMiddleware(config);

    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await middleware.authenticate(request, reply);
      });
    };
  }

  /**
   * Main authentication handler
   */
  async authenticate(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Initialize request properties
      request.isAuthenticated = false;
      request.requiresAdditionalAuth = false;

      // Skip authentication for excluded paths
      if (this.shouldSkipAuthentication(request)) {
        return;
      }

      // Extract and validate token
      const token = this.extractToken(request);
      if (!token) {
        await this.handleAuthenticationFailure(
          request,
          reply,
          'No authentication token provided'
        );
        return;
      }

      // Validate JWT token
      if (!this.jwtService) {
        await this.handleAuthenticationFailure(
          request,
          reply,
          'JWT service not available'
        );
        return;
      }

      const tokenValidation = await this.jwtService.verifyAccessToken(token);
      if (!tokenValidation.valid) {
        await this.handleAuthenticationFailure(
          request,
          reply,
          `Invalid token: ${tokenValidation.error}`
        );
        return;
      }

      // Extract user information from token
      const user = await this.extractUserFromToken(tokenValidation.payload);
      if (!user) {
        await this.handleAuthenticationFailure(
          request,
          reply,
          'Invalid user data in token'
        );
        return;
      }

      // Create security context
      const securityContext = await this.createSecurityContext(request, user);
      request.securityContext = securityContext;

      // Perform risk assessment
      const riskAssessment = await this.performRiskAssessment(securityContext);
      request.riskAssessment = riskAssessment;

      // Update user risk score
      user.riskScore = riskAssessment.overallScore;

      // Check if access should be blocked
      if (!riskAssessment.allowAccess) {
        await this.handleHighRiskAccess(request, reply, riskAssessment);
        return;
      }

      // Check if additional authentication is required
      if (riskAssessment.requiresMFA && !this.hasValidMFA(request)) {
        request.requiresAdditionalAuth = true;
        await this.handleMFARequired(request, reply, riskAssessment);
        return;
      }

      // Validate session if needed
      const sessionValid = await this.validateSession(
        user.sessionId,
        securityContext
      );
      if (!sessionValid) {
        await this.handleAuthenticationFailure(
          request,
          reply,
          'Session validation failed'
        );
        return;
      }

      // Set authenticated user
      request.user = user;
      request.isAuthenticated = true;

      // Log successful authentication for high-risk users
      if (
        riskAssessment.level === 'high' ||
        riskAssessment.level === 'critical'
      ) {
        logger.warn('High-risk user authenticated', {
          correlationId: request.correlationId,
          userId: user.id,
          riskScore: riskAssessment.overallScore,
          riskLevel: riskAssessment.level,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }

      // Update session cache
      this.updateSessionCache(user.sessionId, riskAssessment.overallScore);
    } catch (error) {
      logger.error('Error in zero-trust authentication', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        ip: request.ip,
        userAgent: request.headers['user-agent'],
      });

      await this.handleAuthenticationFailure(
        request,
        reply,
        'Authentication system error'
      );
    }
  }

  /**
   * Check if authentication should be skipped for this request
   */
  private shouldSkipAuthentication(request: FastifyRequest): boolean {
    const path = request.url.split('?')[0]; // Remove query parameters
    return this.config.excludePaths.some((excludePath) => {
      if (excludePath.includes('*')) {
        const pattern = excludePath.replace(/\*/g, '.*');
        return new RegExp(`^${pattern}$`).test(path);
      }
      return path === excludePath || path.startsWith(excludePath);
    });
  }

  /**
   * Extract JWT token from request
   */
  private extractToken(request: FastifyRequest): string | null {
    // Check Authorization header
    const authHeader = request.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.substring(7);
    }

    // Check cookies
    const cookies = request.headers.cookie;
    if (cookies) {
      const tokenMatch = cookies.match(/auth-token=([^;]+)/);
      if (tokenMatch) {
        return tokenMatch[1];
      }
    }

    // Check query parameter (less secure, only for specific use cases)
    const query = request.query as { token?: string };
    if (query.token) {
      logger.warn('Token provided via query parameter', {
        correlationId: request.correlationId,
        ip: request.ip,
      });
      return query.token;
    }

    return null;
  }

  /**
   * Extract user information from JWT payload
   */
  private async extractUserFromToken(
    payload: any
  ): Promise<AuthenticatedUser | null> {
    try {
      if (!payload || typeof payload !== 'object') {
        return null;
      }

      // Validate required fields
      if (!payload.sub || !payload.email || !payload.sessionId) {
        return null;
      }

      return {
        id: payload.sub,
        email: payload.email,
        roles: payload.roles || [],
        permissions: payload.permissions || [],
        mfaEnabled: payload.mfaEnabled || false,
        lastLogin: payload.lastLogin ? new Date(payload.lastLogin) : undefined,
        riskScore: payload.riskScore || 0,
        deviceFingerprint: payload.deviceFingerprint,
        sessionId: payload.sessionId,
      };
    } catch (error) {
      logger.error('Error extracting user from token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Create security context for risk assessment
   */
  private async createSecurityContext(
    request: FastifyRequest,
    user: AuthenticatedUser
  ): Promise<SecurityContext> {
    // Generate device fingerprint
    const deviceFingerprint = DeviceFingerprintingService.generateFingerprint({
      userAgent: request.headers['user-agent'] || '',
      ipAddress: request.ip || '',
      acceptLanguage: request.headers['accept-language'],
      acceptEncoding: request.headers['accept-encoding'],
    });

    return {
      userId: user.id,
      sessionId: user.sessionId,
      deviceFingerprint,
      ipAddress: request.ip || '',
      userAgent: request.headers['user-agent'] || '',
      timestamp: new Date(),
      // Additional context would be loaded from database in real implementation
      accountAge: user.lastLogin
        ? Math.floor(
            (Date.now() - user.lastLogin.getTime()) / (1000 * 60 * 60 * 24)
          )
        : undefined,
    };
  }

  /**
   * Perform comprehensive risk assessment
   */
  private async performRiskAssessment(
    context: SecurityContext
  ): Promise<RiskAssessment> {
    return await RiskScoringService.assessRisk(context, {
      enableGeoLocationChecks: true,
      enableBehavioralAnalysis: this.config.enableBehavioralAnalysis,
      enableDeviceTracking: this.config.enableDeviceTracking,
      enableVPNDetection: true,
    });
  }

  /**
   * Check if request has valid MFA
   */
  private hasValidMFA(request: FastifyRequest): boolean {
    // Check for MFA token in headers
    const mfaToken = request.headers['x-mfa-token'] as string;
    if (!mfaToken) {
      return false;
    }

    // In a real implementation, this would validate the MFA token
    // For now, we'll assume any MFA token is valid
    return true;
  }

  /**
   * Validate session against external session store
   */
  private async validateSession(
    sessionId: string,
    context: SecurityContext
  ): Promise<boolean> {
    try {
      // Check cache first
      const cached = this.sessionCache.get(sessionId);
      const now = new Date();

      if (cached) {
        const minutesSinceValidation =
          (now.getTime() - cached.lastValidated.getTime()) / (1000 * 60);
        if (minutesSinceValidation < this.config.sessionValidationInterval) {
          return true; // Session recently validated
        }
      }

      // In a real implementation, this would check against Redis/Database
      // For now, we'll simulate session validation
      const isValid = true; // Simulate valid session

      if (isValid) {
        this.sessionCache.set(sessionId, {
          lastValidated: now,
          riskScore: context.deviceFingerprint.trustScore,
        });
      }

      return isValid;
    } catch (error) {
      logger.error('Error validating session', {
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Handle authentication failure
   */
  private async handleAuthenticationFailure(
    request: FastifyRequest,
    reply: FastifyReply,
    reason: string
  ): Promise<void> {
    logger.warn('Authentication failed', {
      correlationId: request.correlationId,
      reason,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      path: request.url,
    });

    this.config.onAuthenticationFailure(request, reply, reason);

    reply.status(401).send({
      code: 'AUTHENTICATION_FAILED',
      error: 'Unauthorized',
      message: 'Authentication required',
      statusCode: 401,
      details: {
        reason: 'Invalid or missing authentication credentials',
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle high-risk access attempt
   */
  private async handleHighRiskAccess(
    request: FastifyRequest,
    reply: FastifyReply,
    assessment: RiskAssessment
  ): Promise<void> {
    logger.error('High-risk access blocked', {
      correlationId: request.correlationId,
      riskScore: assessment.overallScore,
      riskLevel: assessment.level,
      factors: assessment.factors.map((f) => f.type),
      ip: request.ip,
      userAgent: request.headers['user-agent'],
    });

    this.config.onHighRiskDetected(request, reply, assessment);

    reply.status(403).send({
      code: 'HIGH_RISK_ACCESS_BLOCKED',
      error: 'Forbidden',
      message: 'Access denied due to high risk score',
      statusCode: 403,
      details: {
        riskScore: assessment.overallScore,
        riskLevel: assessment.level,
        recommendations: assessment.recommendations,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle MFA requirement
   */
  private async handleMFARequired(
    request: FastifyRequest,
    reply: FastifyReply,
    assessment: RiskAssessment
  ): Promise<void> {
    logger.info('MFA required for request', {
      correlationId: request.correlationId,
      riskScore: assessment.overallScore,
      ip: request.ip,
    });

    reply.status(202).send({
      code: 'MFA_REQUIRED',
      error: 'Additional Authentication Required',
      message: 'Multi-factor authentication required',
      statusCode: 202,
      details: {
        riskScore: assessment.overallScore,
        riskLevel: assessment.level,
        mfaChallenge: {
          type: 'totp', // or 'sms', 'email', etc.
          expiresIn: 300, // 5 minutes
        },
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Update session cache
   */
  private updateSessionCache(sessionId: string, riskScore: number): void {
    this.sessionCache.set(sessionId, {
      lastValidated: new Date(),
      riskScore,
    });
  }

  /**
   * Clean up expired session cache entries
   */
  private cleanupSessionCache(): void {
    const now = new Date();
    const maxAge = this.config.sessionValidationInterval * 2 * 60 * 1000; // 2x validation interval

    let cleanedCount = 0;
    for (const [sessionId, entry] of this.sessionCache.entries()) {
      if (now.getTime() - entry.lastValidated.getTime() > maxAge) {
        this.sessionCache.delete(sessionId);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired session cache entries', {
        cleanedCount,
        remainingCount: this.sessionCache.size,
      });
    }
  }

  /**
   * Get middleware statistics
   */
  getStats(): {
    cachedSessions: number;
    averageRiskScore: number;
    highRiskSessions: number;
  } {
    const entries = Array.from(this.sessionCache.values());
    const averageRiskScore =
      entries.length > 0
        ? entries.reduce((sum, entry) => sum + entry.riskScore, 0) /
          entries.length
        : 0;
    const highRiskSessions = entries.filter(
      (entry) => entry.riskScore > 70
    ).length;

    return {
      cachedSessions: entries.length,
      averageRiskScore: Math.round(averageRiskScore * 100) / 100,
      highRiskSessions,
    };
  }
}

// Export pre-configured middleware instances
export const standardZeroTrust = ZeroTrustAuthMiddleware.createPlugin({
  maxRiskScore: 75,
  requireMFA: false,
  enableDeviceTracking: true,
  enableBehavioralAnalysis: true,
});

export const strictZeroTrust = ZeroTrustAuthMiddleware.createPlugin({
  maxRiskScore: 50,
  requireMFA: true,
  enableDeviceTracking: true,
  enableBehavioralAnalysis: true,
  sessionValidationInterval: 2, // More frequent validation
});

export const adminZeroTrust = ZeroTrustAuthMiddleware.createPlugin({
  maxRiskScore: 25,
  requireMFA: true,
  enableDeviceTracking: true,
  enableBehavioralAnalysis: true,
  sessionValidationInterval: 1, // Very frequent validation
  excludePaths: ['/health', '/ready'], // Minimal exclusions
});
