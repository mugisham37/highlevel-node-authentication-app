/**
 * Intelligent Rate Limiting Middleware
 * Dynamic rate limiting based on risk scoring and user behavior
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { RiskScoringService } from '../../security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../security/device-fingerprinting.service';
import { SecurityContext } from '../../security/types';
import { logger } from '../../logging/winston-logger';

export interface RateLimitConfig {
  windowMs: number;
  baseLimit: number;
  skipSuccessfulRequests?: boolean | undefined;
  skipFailedRequests?: boolean | undefined;
  keyGenerator?: ((request: FastifyRequest) => string) | undefined;
  onLimitReached?: ((request: FastifyRequest, reply: FastifyReply) => void) | undefined;
  enableDynamicLimits?: boolean | undefined;
  riskBasedMultipliers?: {
    low: number;
    medium: number;
    high: number;
    critical: number;
  } | undefined;
}

export interface RateLimitEntry {
  count: number;
  resetTime: number;
  riskScore: number;
  lastRiskAssessment: Date;
  consecutiveFailures: number;
  deviceFingerprint?: string;
}

export class IntelligentRateLimiter {
  private static readonly DEFAULT_CONFIG: Required<RateLimitConfig> = {
    windowMs: 15 * 60 * 1000, // 15 minutes
    baseLimit: 100,
    skipSuccessfulRequests: false,
    skipFailedRequests: false,
    keyGenerator: (request) => request.ip || 'unknown',
    onLimitReached: () => {},
    enableDynamicLimits: true,
    riskBasedMultipliers: {
      low: 1.5, // 150% of base limit
      medium: 1.0, // 100% of base limit
      high: 0.5, // 50% of base limit
      critical: 0.1, // 10% of base limit
    },
  };

  private readonly store = new Map<string, RateLimitEntry>();
  private readonly config: Required<RateLimitConfig>;
  private readonly riskScoringService: RiskScoringService;
  private cleanupInterval: NodeJS.Timeout;

  constructor(config: Partial<RateLimitConfig> = {}) {
    this.config = { ...IntelligentRateLimiter.DEFAULT_CONFIG, ...config };
    this.riskScoringService = new RiskScoringService();

    // Clean up expired entries every 5 minutes
    this.cleanupInterval = setInterval(
      () => {
        this.cleanup();
      },
      5 * 60 * 1000
    );
  }

  /**
   * Create Fastify plugin for intelligent rate limiting
   */
  static createPlugin(config: Partial<RateLimitConfig> = {}): FastifyPluginAsync {
    const limiter = new IntelligentRateLimiter(config);

    return async (fastify) => {
      fastify.addHook('preHandler', async (request, reply) => {
        await limiter.handleRequest(request, reply);
      });

      // Cleanup on server close
      fastify.addHook('onClose', async () => {
        limiter.destroy();
      });
    };
  }

  /**
   * Handle incoming request and apply rate limiting
   */
  async handleRequest(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const key = this.config.keyGenerator!(request);
      const now = Date.now();

      // Get or create rate limit entry
      let entry = this.store.get(key);
      if (!entry || now > entry.resetTime) {
        entry = {
          count: 0,
          resetTime: now + this.config.windowMs,
          riskScore: 0,
          lastRiskAssessment: new Date(0),
          consecutiveFailures: 0,
        };
        this.store.set(key, entry);
      }

      // Assess risk if needed (every 5 minutes or on first request)
      const shouldAssessRisk =
        now - entry.lastRiskAssessment.getTime() > 5 * 60 * 1000 ||
        entry.lastRiskAssessment.getTime() === 0;

      if (shouldAssessRisk && this.config.enableDynamicLimits) {
        await this.updateRiskScore(request, entry);
      }

      // Calculate dynamic limit based on risk score
      const dynamicLimit = this.calculateDynamicLimit(entry.riskScore);

      // Check if limit is exceeded
      if (entry.count >= dynamicLimit) {
        await this.handleLimitExceeded(request, reply, entry, dynamicLimit);
        return;
      }

      // Increment counter
      entry.count++;

      // Add rate limit headers
      this.addRateLimitHeaders(reply, entry, dynamicLimit);

      // Log high-risk requests
      if (entry.riskScore > 70) {
        logger.warn('High-risk request allowed within rate limit', {
          correlationId: request.correlationId,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
          riskScore: entry.riskScore,
          requestCount: entry.count,
          limit: dynamicLimit,
        });
      }
    } catch (error) {
      logger.error('Error in intelligent rate limiter', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Fall back to basic rate limiting on error
      await this.handleBasicRateLimit(request, reply);
    }
  }

  /**
   * Update risk score for the request
   */
  private async updateRiskScore(
    request: FastifyRequest,
    entry: RateLimitEntry
  ): Promise<void> {
    try {
      // Create device fingerprint
      const deviceFingerprint = DeviceFingerprintingService.generateFingerprint(
        {
          userAgent: request.headers['user-agent'] || '',
          ipAddress: request.ip || '',
          acceptLanguage: request.headers['accept-language'] || undefined,
          acceptEncoding: request.headers['accept-encoding'] || undefined,
        }
      );

      // Create security context
      const securityContext: SecurityContext = {
        userId: 'anonymous', // Will be updated if user is authenticated
        sessionId: request.correlationId,
        deviceFingerprint,
        ipAddress: request.ip || '',
        userAgent: request.headers['user-agent'] || '',
        timestamp: new Date(),
        failedAttempts: entry.consecutiveFailures,
        accountAge: 0, // Default for anonymous users
      };

      // Assess risk
      const riskAssessment =
        await this.riskScoringService.assessRisk(securityContext);

      // Update entry
      entry.riskScore = riskAssessment.overallScore;
      entry.lastRiskAssessment = new Date();
      entry.deviceFingerprint = deviceFingerprint.id;

      // Log risk assessment for monitoring
      if (
        riskAssessment.level === 'high' ||
        riskAssessment.level === 'critical'
      ) {
        logger.warn('High-risk request detected in rate limiter', {
          correlationId: request.correlationId,
          ip: request.ip,
          riskScore: riskAssessment.overallScore,
          riskLevel: riskAssessment.level,
          factors: riskAssessment.factors.map((f: any) => f.type),
        });
      }
    } catch (error) {
      logger.error('Error updating risk score in rate limiter', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Use conservative risk score on error
      entry.riskScore = 50;
      entry.lastRiskAssessment = new Date();
    }
  }

  /**
   * Calculate dynamic limit based on risk score
   */
  private calculateDynamicLimit(riskScore: number): number {
    let multiplier: number;

    if (riskScore >= 90) {
      multiplier = this.config.riskBasedMultipliers!.critical;
    } else if (riskScore >= 75) {
      multiplier = this.config.riskBasedMultipliers!.high;
    } else if (riskScore >= 50) {
      multiplier = this.config.riskBasedMultipliers!.medium;
    } else {
      multiplier = this.config.riskBasedMultipliers!.low;
    }

    return Math.max(1, Math.floor(this.config.baseLimit * multiplier));
  }

  /**
   * Handle rate limit exceeded
   */
  private async handleLimitExceeded(
    request: FastifyRequest,
    reply: FastifyReply,
    entry: RateLimitEntry,
    limit: number
  ): Promise<void> {
    const resetTime = Math.ceil((entry.resetTime - Date.now()) / 1000);

    // Add rate limit headers
    reply.header('X-RateLimit-Limit', limit.toString());
    reply.header('X-RateLimit-Remaining', '0');
    reply.header('X-RateLimit-Reset', entry.resetTime.toString());
    reply.header('X-RateLimit-RetryAfter', resetTime.toString());
    reply.header('X-RateLimit-Risk-Score', entry.riskScore.toString());

    // Log rate limit exceeded
    logger.warn('Rate limit exceeded', {
      correlationId: request.correlationId,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      riskScore: entry.riskScore,
      requestCount: entry.count,
      limit,
      resetTime,
    });

    // Call custom handler if provided
    this.config.onLimitReached!(request, reply);

    // Send rate limit response
    reply.status(429).send({
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too Many Requests',
      message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
      statusCode: 429,
      details: {
        limit,
        remaining: 0,
        resetTime: entry.resetTime,
        retryAfter: resetTime,
        riskScore: entry.riskScore,
      },
    });
  }

  /**
   * Add rate limit headers to response
   */
  private addRateLimitHeaders(
    reply: FastifyReply,
    entry: RateLimitEntry,
    limit: number
  ): void {
    const remaining = Math.max(0, limit - entry.count);

    reply.header('X-RateLimit-Limit', limit.toString());
    reply.header('X-RateLimit-Remaining', remaining.toString());
    reply.header('X-RateLimit-Reset', entry.resetTime.toString());
    reply.header('X-RateLimit-Risk-Score', entry.riskScore.toString());

    if (remaining <= 5) {
      reply.header('X-RateLimit-Warning', 'Rate limit nearly exceeded');
    }
  }

  /**
   * Fallback to basic rate limiting on error
   */
  private async handleBasicRateLimit(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const key = this.config.keyGenerator!(request);
    const now = Date.now();

    let entry = this.store.get(key);
    if (!entry || now > entry.resetTime) {
      entry = {
        count: 0,
        resetTime: now + this.config.windowMs,
        riskScore: 50, // Conservative default
        lastRiskAssessment: new Date(),
        consecutiveFailures: 0,
      };
      this.store.set(key, entry);
    }

    if (entry.count >= this.config.baseLimit) {
      const resetTime = Math.ceil((entry.resetTime - now) / 1000);

      reply.status(429).send({
        code: 'RATE_LIMIT_EXCEEDED',
        error: 'Too Many Requests',
        message: `Rate limit exceeded. Try again in ${resetTime} seconds.`,
        statusCode: 429,
      });
      return;
    }

    entry.count++;
    this.addRateLimitHeaders(reply, entry, this.config.baseLimit);
  }

  /**
   * Update failure count for a key (called from authentication middleware)
   */
  updateFailureCount(key: string, failed: boolean): void {
    const entry = this.store.get(key);
    if (entry) {
      if (failed) {
        entry.consecutiveFailures++;
      } else {
        entry.consecutiveFailures = 0;
      }
    }
  }

  /**
   * Get current rate limit status for a key
   */
  getStatus(key: string): {
    count: number;
    limit: number;
    remaining: number;
    resetTime: number;
    riskScore: number;
  } | null {
    const entry = this.store.get(key);
    if (!entry) return null;

    const limit = this.calculateDynamicLimit(entry.riskScore);
    const remaining = Math.max(0, limit - entry.count);

    return {
      count: entry.count,
      limit,
      remaining,
      resetTime: entry.resetTime,
      riskScore: entry.riskScore,
    };
  }

  /**
   * Clean up expired entries
   */
  private cleanup(): void {
    const now = Date.now();
    let cleanedCount = 0;

    for (const [key, entry] of this.store.entries()) {
      if (now > entry.resetTime) {
        this.store.delete(key);
        cleanedCount++;
      }
    }

    if (cleanedCount > 0) {
      logger.debug('Cleaned up expired rate limit entries', {
        cleanedCount,
        remainingCount: this.store.size,
      });
    }
  }

  /**
   * Destroy the rate limiter and clean up resources
   */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }
    this.store.clear();
  }

  /**
   * Get statistics about the rate limiter
   */
  getStats(): {
    totalEntries: number;
    highRiskEntries: number;
    averageRiskScore: number;
    topRiskyIPs: Array<{ key: string; riskScore: number; count: number }>;
  } {
    const entries = Array.from(this.store.entries());
    const highRiskEntries = entries.filter(([, entry]) => entry.riskScore > 70);
    const averageRiskScore =
      entries.length > 0
        ? entries.reduce((sum, [, entry]) => sum + entry.riskScore, 0) /
          entries.length
        : 0;

    const topRiskyIPs = entries
      .map(([key, entry]) => ({
        key,
        riskScore: entry.riskScore,
        count: entry.count,
      }))
      .sort((a, b) => b.riskScore - a.riskScore)
      .slice(0, 10);

    return {
      totalEntries: entries.length,
      highRiskEntries: highRiskEntries.length,
      averageRiskScore: Math.round(averageRiskScore * 100) / 100,
      topRiskyIPs,
    };
  }
}

// Export default configurations for different use cases
export const authenticationRateLimiter = IntelligentRateLimiter.createPlugin({
  windowMs: 15 * 60 * 1000, // 15 minutes
  baseLimit: 10, // Stricter limit for auth endpoints
  enableDynamicLimits: true,
  riskBasedMultipliers: {
    low: 2.0, // 20 requests for low risk
    medium: 1.0, // 10 requests for medium risk
    high: 0.3, // 3 requests for high risk
    critical: 0.1, // 1 request for critical risk
  },
});

export const apiRateLimiter = IntelligentRateLimiter.createPlugin({
  windowMs: 15 * 60 * 1000, // 15 minutes
  baseLimit: 100, // Standard API limit
  enableDynamicLimits: true,
  riskBasedMultipliers: {
    low: 1.5, // 150 requests for low risk
    medium: 1.0, // 100 requests for medium risk
    high: 0.5, // 50 requests for high risk
    critical: 0.1, // 10 requests for critical risk
  },
});

export const strictRateLimiter = IntelligentRateLimiter.createPlugin({
  windowMs: 5 * 60 * 1000, // 5 minutes
  baseLimit: 5, // Very strict limit
  enableDynamicLimits: true,
  riskBasedMultipliers: {
    low: 2.0, // 10 requests for low risk
    medium: 1.0, // 5 requests for medium risk
    high: 0.4, // 2 requests for high risk
    critical: 0.2, // 1 request for critical risk
  },
});
