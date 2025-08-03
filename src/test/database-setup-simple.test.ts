import { describe, it, expect } from 'vitest';

describe('Database Infrastructure Setup (Simple)', () => {
  it('should validate database configuration', () => {
    // Test that configuration can be created
    expect(() => {
      process.env['DATABASE_URL'] =
        'postgresql://test:test@localhost:5432/test';
      const {
        createDatabaseConfig,
      } = require('../infrastructure/database/config');
      const config = createDatabaseConfig();
      expect(config).toBeDefined();
      expect(config.primary).toBeDefined();
      expect(config.retryConfig).toBeDefined();
    }).not.toThrow();
  });

  it('should validate simple connection manager structure', () => {
    const {
      SimpleDatabaseConnectionManager,
    } = require('../infrastructure/database/connection-manager-simple');
    expect(SimpleDatabaseConnectionManager).toBeDefined();
    expect(typeof SimpleDatabaseConnectionManager).toBe('function');
  });

  it('should validate drizzle session repository structure', () => {
    const {
      DrizzleSessionRepository,
    } = require('../infrastructure/database/repositories/drizzle-session-repository');

    expect(DrizzleSessionRepository).toBeDefined();
    expect(typeof DrizzleSessionRepository).toBe('function');
  });

  it('should validate schema exports', () => {
    const authSessionsSchema = require('../infrastructure/database/drizzle/schema/auth-sessions');
    const oauthCacheSchema = require('../infrastructure/database/drizzle/schema/oauth-cache');

    expect(authSessionsSchema.activeSessions).toBeDefined();
    expect(authSessionsSchema.authAttempts).toBeDefined();
    expect(authSessionsSchema.userAuthCache).toBeDefined();
    expect(oauthCacheSchema.oauthTokenCache).toBeDefined();
    expect(oauthCacheSchema.oauthStateTracking).toBeDefined();
  });

  it('should validate simple database module exports', () => {
    const databaseIndex = require('../infrastructure/database/index-simple');
    expect(databaseIndex.createSimpleDatabaseModule).toBeDefined();
    expect(databaseIndex.SimpleDatabaseConnectionManager).toBeDefined();
    expect(databaseIndex.DrizzleSessionRepository).toBeDefined();
  });
});
