/**
 * Security Middleware Tests
 * Comprehensive tests for all security middleware components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import Fastify, { FastifyInstance } from 'fastify';

// Set up environment variables for testing
process.env.JWT_SECRET =
  'test-jwt-secret-32-characters-long-for-testing-with-sufficient-entropy-12345';
process.env.JWT_REFRESH_SECRET =
  'test-jwt-refresh-secret-32-characters-long-for-testing-with-sufficient-entropy-67890';
import { IntelligentRateLimiter } from '../../../../infrastructure/server/middleware/intelligent-rate-limiter';
import { ZeroTrustAuthMiddleware } from '../../../../infrastructure/server/middleware/zero-trust-auth';
import {
  RequestValidationMiddleware,
  commonSchemas,
} from '../../../../infrastructure/server/middleware/request-validation';
import { AuditLoggingMiddleware } from '../../../../infrastructure/server/middleware/audit-logging';
import { SecurityHeadersMiddleware } from '../../../../infrastructure/server/middleware/security-headers';
import { z } from 'zod';

describe('Security Middleware', () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = Fastify({ logger: false });
  });

  afterEach(async () => {
    await server.close();
  });

  describe('IntelligentRateLimiter', () => {
    it('should allow requests within rate limit', async () => {
      const rateLimiter = IntelligentRateLimiter.createPlugin({
        windowMs: 60000,
        baseLimit: 10,
        enableDynamicLimits: false,
      });

      await server.register(rateLimiter);

      server.get('/test', async () => ({ success: true }));

      const response = await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['x-ratelimit-remaining']).toBeDefined();
    });

    it('should block requests exceeding rate limit', async () => {
      const rateLimiter = IntelligentRateLimiter.createPlugin({
        windowMs: 60000,
        baseLimit: 1,
        enableDynamicLimits: false,
      });

      await server.register(rateLimiter);

      server.get('/test', async () => ({ success: true }));

      // First request should succeed
      const response1 = await server.inject({
        method: 'GET',
        url: '/test',
      });
      expect(response1.statusCode).toBe(200);

      // Second request should be rate limited
      const response2 = await server.inject({
        method: 'GET',
        url: '/test',
      });
      expect(response2.statusCode).toBe(429);
      expect(JSON.parse(response2.payload).code).toBe('RATE_LIMIT_EXCEEDED');
    });

    it('should provide rate limit statistics', () => {
      const limiter = new IntelligentRateLimiter({
        windowMs: 60000,
        baseLimit: 10,
      });

      const stats = limiter.getStats();
      expect(stats).toHaveProperty('totalEntries');
      expect(stats).toHaveProperty('highRiskEntries');
      expect(stats).toHaveProperty('averageRiskScore');
      expect(stats).toHaveProperty('topRiskyIPs');
    });
  });

  describe('ZeroTrustAuthMiddleware', () => {
    it('should allow access to excluded paths without authentication', async () => {
      const zeroTrust = ZeroTrustAuthMiddleware.createPlugin({
        excludePaths: ['/health', '/public'],
      });

      await server.register(zeroTrust);

      server.get('/health', async () => ({ status: 'ok' }));
      server.get('/public', async () => ({ data: 'public' }));

      const healthResponse = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const publicResponse = await server.inject({
        method: 'GET',
        url: '/public',
      });

      expect(healthResponse.statusCode).toBe(200);
      expect(publicResponse.statusCode).toBe(200);
    });

    it('should require authentication for protected paths', async () => {
      const zeroTrust = ZeroTrustAuthMiddleware.createPlugin({
        excludePaths: ['/health'],
      });

      await server.register(zeroTrust);

      server.get('/protected', async () => ({ data: 'protected' }));

      const response = await server.inject({
        method: 'GET',
        url: '/protected',
      });

      expect(response.statusCode).toBe(401);
      expect(JSON.parse(response.payload).code).toBe('AUTHENTICATION_FAILED');
    });

    it('should provide middleware statistics', () => {
      const middleware = new ZeroTrustAuthMiddleware();
      const stats = middleware.getStats();

      expect(stats).toHaveProperty('cachedSessions');
      expect(stats).toHaveProperty('averageRiskScore');
      expect(stats).toHaveProperty('highRiskSessions');
    });
  });

  describe('RequestValidationMiddleware', () => {
    it('should validate request body successfully', async () => {
      const validator = RequestValidationMiddleware.createValidator({
        body: z.object({
          name: z.string().min(1),
          email: z.string().email(),
        }),
      });

      await server.register(validator);

      server.post('/test', async (request) => {
        return { validated: request.validatedBody };
      });

      const response = await server.inject({
        method: 'POST',
        url: '/test',
        payload: {
          name: 'John Doe',
          email: 'john@example.com',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.validated.name).toBe('John Doe');
      expect(result.validated.email).toBe('john@example.com');
    });

    it('should reject invalid request body', async () => {
      const validator = RequestValidationMiddleware.createValidator({
        body: z.object({
          name: z.string().min(1),
          email: z.string().email(),
        }),
      });

      await server.register(validator);

      server.post('/test', async (request) => {
        return { validated: request.validatedBody };
      });

      const response = await server.inject({
        method: 'POST',
        url: '/test',
        payload: {
          name: '',
          email: 'invalid-email',
        },
      });

      expect(response.statusCode).toBe(400);
      const result = JSON.parse(response.payload);
      expect(result.code).toBe('VALIDATION_FAILED');
      expect(result.details.errors).toHaveLength(2);
    });

    it('should sanitize potentially dangerous input', async () => {
      const validator = RequestValidationMiddleware.createValidator(
        {
          body: z.object({
            content: z.string(),
          }),
        },
        {
          enableSanitization: true,
        }
      );

      await server.register(validator);

      server.post('/test', async (request) => {
        return { sanitized: request.validatedBody };
      });

      const response = await server.inject({
        method: 'POST',
        url: '/test',
        payload: {
          content: '<script>alert("xss")</script>Hello',
        },
      });

      expect(response.statusCode).toBe(200);
      const result = JSON.parse(response.payload);
      expect(result.sanitized.content).not.toContain('<script>');
      expect(result.sanitized.content).toContain('Hello');
    });

    it('should provide validation statistics', () => {
      const middleware = new RequestValidationMiddleware();
      const stats = middleware.getStats();

      expect(stats).toHaveProperty('trackedClients');
      expect(stats).toHaveProperty('rateLimitedClients');
      expect(stats).toHaveProperty('averageFailures');
    });
  });

  describe('AuditLoggingMiddleware', () => {
    it('should log request and response events', async () => {
      const auditLogger = AuditLoggingMiddleware.createPlugin({
        excludePaths: [],
      });

      await server.register(auditLogger);

      server.get('/test', async () => ({ success: true }));

      const response = await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(response.statusCode).toBe(200);
      // Audit events would be logged to Winston logger
    });

    it('should exclude specified paths from auditing', async () => {
      const auditLogger = AuditLoggingMiddleware.createPlugin({
        excludePaths: ['/health'],
      });

      await server.register(auditLogger);

      server.get('/health', async () => ({ status: 'ok' }));
      server.get('/test', async () => ({ success: true }));

      const healthResponse = await server.inject({
        method: 'GET',
        url: '/health',
      });

      const testResponse = await server.inject({
        method: 'GET',
        url: '/test',
      });

      expect(healthResponse.statusCode).toBe(200);
      expect(testResponse.statusCode).toBe(200);
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
    });
  });

  describe('SecurityHeadersMiddleware', () => {
    it('should add security headers to responses', async () => {
      const securityHeaders = SecurityHeadersMiddleware.createPlugin({
        enableCSP: true,
        enableHSTS: true,
      });

      await server.register(securityHeaders);

      server.get('/test', async () => ({ success: true }));

      const response = await server.inject({
        method: 'GET',
        url: '/test',
        headers: {
          'x-forwarded-proto': 'https',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['content-security-policy']).toBeDefined();
      expect(response.headers['strict-transport-security']).toBeDefined();
      expect(response.headers['x-content-type-options']).toBe('nosniff');
      expect(response.headers['x-frame-options']).toBe('DENY');
    });

    it('should build CSP header correctly', async () => {
      const securityHeaders = SecurityHeadersMiddleware.createPlugin({
        enableCSP: true,
        cspDirectives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'", "'unsafe-inline'"],
          styleSrc: ["'self'"],
        },
      });

      await server.register(securityHeaders);

      server.get('/test', async () => ({ success: true }));

      const response = await server.inject({
        method: 'GET',
        url: '/test',
      });

      const csp = response.headers['content-security-policy'] as string;
      expect(csp).toContain("default-src 'self'");
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
      expect(csp).toContain("style-src 'self'");
    });

    it('should provide CSP violation statistics', () => {
      const middleware = new SecurityHeadersMiddleware();
      const stats = middleware.getCSPStats();

      expect(stats).toHaveProperty('totalViolations');
      expect(stats).toHaveProperty('recentViolations');
      expect(stats).toHaveProperty('topViolatedDirectives');
      expect(stats).toHaveProperty('topBlockedUris');
      expect(stats).toHaveProperty('potentialAttacks');
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

  describe('Integration Tests', () => {
    it('should work with multiple middleware together', async () => {
      // Register multiple middleware
      await server.register(
        IntelligentRateLimiter.createPlugin({
          windowMs: 60000,
          baseLimit: 100,
        })
      );

      await server.register(
        RequestValidationMiddleware.createValidator({
          body: z.object({
            message: z.string().min(1),
          }),
        })
      );

      await server.register(AuditLoggingMiddleware.createPlugin());
      await server.register(SecurityHeadersMiddleware.createPlugin());

      server.post('/integrated-test', async (request) => {
        return {
          message: 'Success',
          validated: request.validatedBody,
          authenticated: request.isAuthenticated,
        };
      });

      const response = await server.inject({
        method: 'POST',
        url: '/integrated-test',
        payload: {
          message: 'Hello World',
        },
      });

      expect(response.statusCode).toBe(200);
      expect(response.headers['x-ratelimit-limit']).toBeDefined();
      expect(response.headers['content-security-policy']).toBeDefined();

      const result = JSON.parse(response.payload);
      expect(result.validated.message).toBe('Hello World');
    });
  });
});
