/**
 * Security Middleware Index
 * Centralized exports for all security middleware components
 */

// Rate Limiting
export {
  IntelligentRateLimiter,
  authenticationRateLimiter,
  apiRateLimiter,
  strictRateLimiter,
  type RateLimitConfig,
  type RateLimitEntry,
} from './intelligent-rate-limiter';

// Zero-Trust Authentication
export {
  ZeroTrustAuthMiddleware,
  standardZeroTrust,
  strictZeroTrust,
  adminZeroTrust,
  type ZeroTrustConfig,
  type AuthenticatedUser,
} from './zero-trust-auth';

// Request Validation
export {
  RequestValidationMiddleware,
  createAuthValidator,
  createApiValidator,
  createStrictValidator,
  commonSchemas,
  type ValidationConfig,
  type ValidationError,
  type ValidationSchemas,
} from './request-validation';

// Audit Logging
export {
  AuditLoggingMiddleware,
  standardAuditLogger,
  securityAuditLogger,
  complianceAuditLogger,
  type AuditConfig,
  type AuditEvent,
  type AuditEventType,
} from './audit-logging';

// Security Headers
export {
  SecurityHeadersMiddleware,
  standardSecurityHeaders,
  strictSecurityHeaders,
  developmentSecurityHeaders,
  type SecurityHeadersConfig,
  type CSPDirectives,
} from './security-headers';

// Middleware factory functions for common use cases
export const createSecurityMiddlewareStack = {
  /**
   * Standard security stack for most applications
   */
  standard: () => ({
    rateLimiter: apiRateLimiter,
    zeroTrust: standardZeroTrust,
    auditLogger: standardAuditLogger,
    securityHeaders: standardSecurityHeaders,
  }),

  /**
   * Strict security stack for high-security applications
   */
  strict: () => ({
    rateLimiter: strictRateLimiter,
    zeroTrust: strictZeroTrust,
    auditLogger: securityAuditLogger,
    securityHeaders: strictSecurityHeaders,
  }),

  /**
   * Authentication-specific security stack
   */
  authentication: () => ({
    rateLimiter: authenticationRateLimiter,
    zeroTrust: strictZeroTrust,
    auditLogger: securityAuditLogger,
    securityHeaders: strictSecurityHeaders,
  }),

  /**
   * Admin interface security stack
   */
  admin: () => ({
    rateLimiter: strictRateLimiter,
    zeroTrust: adminZeroTrust,
    auditLogger: complianceAuditLogger,
    securityHeaders: strictSecurityHeaders,
  }),

  /**
   * Development-friendly security stack
   */
  development: () => ({
    rateLimiter: apiRateLimiter,
    zeroTrust: standardZeroTrust,
    auditLogger: standardAuditLogger,
    securityHeaders: developmentSecurityHeaders,
  }),
};
