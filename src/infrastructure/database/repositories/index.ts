/**
 * Repository Pattern Implementation - Index
 * Exports all repository interfaces, implementations, and utilities
 */

// Base interfaces and implementations
export * from './interfaces/base-repository.interface';
export * from './base/base-repository';
export * from './base/transaction-manager';

// Repository interfaces
export * from './interfaces/user-repository.interface';
export * from './interfaces/session-repository.interface';

// Prisma repository implementations
export * from './prisma/prisma-user-repository-enhanced';

// Drizzle repository implementations
export * from './drizzle/drizzle-session-repository-enhanced';

// Repository factory
export * from './repository-factory';

// Legacy repositories (for backward compatibility)
export { PrismaUserRepository } from './prisma-user-repository';
export { DrizzleSessionRepository } from './drizzle-session-repository';
export { PrismaRoleRepository } from './prisma-role-repository';
export { PrismaPermissionRepository } from './prisma-permission-repository';
export { OAuthUserRepository } from './oauth-user.repository';
export { OAuthAccountRepository } from './oauth-account.repository';
export { OAuthStateRepository } from './oauth-state.repository';
export { OAuthAuthorizationCodeRepository } from './oauth-authorization-code.repository';
export { MFAChallengeRepository } from './mfa-challenge.repository';
