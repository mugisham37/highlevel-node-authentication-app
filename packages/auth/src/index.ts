/**
 * Authentication Package Main Export
 * Provides a unified interface for all authentication and authorization functionality
 */

// Core authentication services
export * from './strategies/authentication.service';
export * from './strategies/passwordless-auth.service';

// MFA services
export * from './mfa/email-mfa.service';
export * from './mfa/mfa.service';
export * from './mfa/sms.service';
export * from './mfa/totp.service';

// WebAuthn
export * from './webauthn/webauthn.service';

// RBAC services
export * from './rbac/authorization.service';
export * from './rbac/role-management.service';

// Session management
export * from './session/session-management.service';

// Token services
export * from './tokens/jwt-token.service';
export * from './tokens/secure-id-generator.service';
export * from './tokens/secure-token-generator.service';

// Encryption services
export * from './encryption/cryptographic.service';
export * from './encryption/data-encryption.service';
export * from './encryption/password-hashing.service';

// Validation services
export * from './validation/device-fingerprinting.service';
export * from './validation/risk-scoring.service';

// Middleware
export * from './middleware/auth.middleware';

// Guards
export * from './guards/auth.guard';

// Decorators
export * from './decorators/auth.decorators';

// Interfaces
export * from './authentication.interface';
export * from './authorization.interface';

// Factories
export * from './authentication.factory';

// Types
export * from './types';

// Re-export commonly used types from shared package
export type { Permission, Role, Session, User } from '@company/shared';
