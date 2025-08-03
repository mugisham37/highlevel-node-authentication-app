/**
 * Basic Security Middleware Tests
 * Simple tests to verify middleware functionality
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { IntelligentRateLimiter } from '../../../../infrastructure/server/middleware/intelligent-rate-limiter';
import {
  RequestValidationMiddleware,
  commonSchemas,
} from '../../../../infrastructure/server/middleware/request-validation';
import { AuditLoggingMiddleware } from '../../../../infrastructure/server/middleware/audit-logging';
import { SecurityHeadersMiddleware } from '../../../../infrastructure/server/middleware/security-headers';
import { RiskScoringService } from '../../../../infrastructure/security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../../../infrastructure/security/device-fingerprinting.service';
import { z } from 'zod';

// Set up environment variables for testing
process.env.JWT_SECRET =
  'test-jwt-secret-32-characters-long-for-testing-with-sufficient-entropy-12345';
process.env.JWT_REFRESH_SECRET =
  'test-jwt-refresh-secret-32-characters-long-for-testing-with-sufficient-entropy-67890';

describe('Security Middleware Basic Tests', () => {
  describe('IntelligentRateLimiter', () => {
    it('should create rate limiter instance', () => {
      const limiter = new IntelligentRateLimiter({
        windowMs: 60000,
        baseLimit: 10,
      });

      expect(limiter).toBeDefined();
      expect(typeof limiter.getStats).toBe('function');
    });

    it('should provide statistics', () => {
      const limiter = new IntelligentRateLimiter();
      const stats = limiter.getStats();

      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('highRiskEntries');
      expect(stats).toHaveProperty('averageRiskScore');
      expect(stats).toHaveProperty('topRiskyIPs');
      expect(typeof stats.totalEntries).toBe('number');
    });
  });

  describe('RequestValidationMiddleware', () => {
    it('should create validation middleware instance', () => {
      const middleware = new RequestValidationMiddleware({
        enableSanitization: true,
      });

      expect(middleware).toBeDefined();
      expect(typeof middleware.getStats).toBe('function');
    });

    it('should provide validation statistics', () => {
      const middleware = new RequestValidationMiddleware();
      const stats = middleware.getStats();

      expect(stats).toHaveProperty('trackedClients');
      expect(stats).toHaveProperty('rateLimitedClients');
      expect(stats).toHaveProperty('averageFailures');
      expect(typeof stats.trackedClients).toBe('number');
    });
  });

  describe('AuditLoggingMiddleware', () => {
    it('should create audit logging middleware instance', () => {
      const middleware = new AuditLoggingMiddleware({
        enableRequestLogging: true,
      });

      expect(middleware).toBeDefined();
      expect(typeof middleware.getStats).toBe('function');
    });

    it('should provide audit statistics', () => {
      const middleware = new AuditLoggingMiddleware();
      const stats = middleware.getStats();

      expect(stats).toHaveProperty('totalEvents');
      expect(stats).toHaveProperty('securityEvents');
      expect(stats).toHaveProperty('errorEvents');
      expect(stats).toHaveProperty('averageRiskScore');
      expect(stats).toHaveProperty('topEventTypes');
      expect(stats).toHaveProperty('recentHighRiskEvents');
      expect(typeof stats.totalEvents).toBe('number');
    });

    it('should search events by criteria', () => {
      const middleware = new AuditLoggingMiddleware();
      const events = middleware.searchEvents({
        userId: 'test-user',
        minRiskScore: 50,
      });

      expect(Array.isArray(events)).toBe(true);
    });
  });

  describe('SecurityHeadersMiddleware', () => {
    it('should create security headers middleware instance', () => {
      const middleware = new SecurityHeadersMiddleware({
        enableCSP: true,
      });

      expect(middleware).toBeDefined();
      expect(typeof middleware.getCSPStats).toBe('function');
    });

    it('should provide CSP violation statistics', () => {
      const middleware = new SecurityHeadersMiddleware();
      const stats = middleware.getCSPStats();

      expect(stats).toHaveProperty('totalViolations');
      expect(stats).toHaveProperty('recentViolations');
      expect(stats).toHaveProperty('topViolatedDirectives');
      expect(stats).toHaveProperty('topBlockedUris');
      expect(stats).toHaveProperty('potentialAttacks');
      expect(typeof stats.totalViolations).toBe('number');
    });
  });

  describe('Common Schemas', () => {
    it('should validate email correctly', () => {
      const validEmail = 'test@example.com';
      const invalidEmail = 'invalid-email';

      expect(() => commonSchemas.email.parse(validEmail)).not.toThrow();
      expect(() => commonSchemas.email.parse(invalidEmail)).toThrow();
    });

    it('should validate password correctly', () => {
      const validPassword = 'StrongP@ssw0rd';
      const weakPassword = '123';

      expect(() => commonSchemas.password.parse(validPassword)).not.toThrow();
      expect(() => commonSchemas.password.parse(weakPassword)).toThrow();
    });

    it('should validate UUID correctly', () => {
      const validUuid = '123e4567-e89b-12d3-a456-426614174000';
      const invalidUuid = 'not-a-uuid';

      expect(() => commonSchemas.uuid.parse(validUuid)).not.toThrow();
      expect(() => commonSchemas.uuid.parse(invalidUuid)).toThrow();
    });

    it('should validate pagination correctly', () => {
      const validPagination = { page: '1', limit: '20' };
      const invalidPagination = { page: '0', limit: '200' };

      const result = commonSchemas.pagination.parse(validPagination);
      expect(result.page).toBe(1);
      expect(result.limit).toBe(20);

      expect(() => commonSchemas.pagination.parse(invalidPagination)).toThrow();
    });
  });

  describe('RiskScoringService', () => {
    it('should assess risk for security context', async () => {
      const context = {
        userId: 'test-user',
        sessionId: 'test-session',
        deviceFingerprint: DeviceFingerprintingService.generateFingerprint({
          userAgent:
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
          ipAddress: '192.168.1.1',
        }),
        ipAddress: '192.168.1.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        timestamp: new Date(),
      };

      const assessment = await RiskScoringService.assessRisk(context);

      expect(assessment).toHaveProperty('overallScore');
      expect(assessment).toHaveProperty('level');
      expect(assessment).toHaveProperty('factors');
      expect(assessment).toHaveProperty('recommendations');
      expect(assessment).toHaveProperty('requiresMFA');
      expect(assessment).toHaveProperty('allowAccess');
      expect(typeof assessment.overallScore).toBe('number');
      expect(assessment.overallScore).toBeGreaterThanOrEqual(0);
      expect(assessment.overallScore).toBeLessThanOrEqual(100);
    });
  });

  describe('DeviceFingerprintingService', () => {
    it('should generate device fingerprint', () => {
      const input = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.1',
        acceptLanguage: 'en-US,en;q=0.9',
        timezone: 'America/New_York',
      };

      const fingerprint =
        DeviceFingerprintingService.generateFingerprint(input);

      expect(fingerprint).toHaveProperty('id');
      expect(fingerprint).toHaveProperty('userAgent');
      expect(fingerprint).toHaveProperty('ipAddress');
      expect(fingerprint).toHaveProperty('trustScore');
      expect(fingerprint).toHaveProperty('createdAt');
      expect(typeof fingerprint.id).toBe('string');
      expect(fingerprint.id).toMatch(/^fp_/);
    });

    it('should analyze device characteristics', () => {
      const input = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.1',
      };

      const analysis = DeviceFingerprintingService.analyzeDevice(input);

      expect(analysis).toHaveProperty('fingerprint');
      expect(analysis).toHaveProperty('riskFactors');
      expect(analysis).toHaveProperty('trustScore');
      expect(analysis).toHaveProperty('isBot');
      expect(analysis).toHaveProperty('deviceType');
      expect(analysis).toHaveProperty('browserFamily');
      expect(analysis).toHaveProperty('osFamily');
      expect(typeof analysis.isBot).toBe('boolean');
      expect(Array.isArray(analysis.riskFactors)).toBe(true);
    });

    it('should compare fingerprints', () => {
      const input1 = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.1',
      };

      const input2 = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.2', // Different IP
      };

      const fp1 = DeviceFingerprintingService.generateFingerprint(input1);
      const fp2 = DeviceFingerprintingService.generateFingerprint(input2);

      const comparison = DeviceFingerprintingService.compareFingerprints(
        fp1,
        fp2
      );

      expect(comparison).toHaveProperty('similarity');
      expect(comparison).toHaveProperty('matchingFields');
      expect(comparison).toHaveProperty('differentFields');
      expect(comparison).toHaveProperty('isSameDevice');
      expect(typeof comparison.similarity).toBe('number');
      expect(comparison.similarity).toBeGreaterThanOrEqual(0);
      expect(comparison.similarity).toBeLessThanOrEqual(100);
      expect(Array.isArray(comparison.matchingFields)).toBe(true);
      expect(Array.isArray(comparison.differentFields)).toBe(true);
    });
  });
});
