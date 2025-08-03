import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import {
  createDatabaseModule,
  DatabaseModule,
} from '../infrastructure/database';
import { createLogger } from 'winston';

describe('Database Infrastructure Setup', () => {
  let databaseModule: DatabaseModule;
  let logger: any;

  beforeAll(async () => {
    // Create a test logger
    logger = createLogger({
      level: 'error', // Reduce noise in tests
      silent: true,
    });

    // Skip actual database connection in tests
    // In a real scenario, you'd use a test database
  });

  afterAll(async () => {
    if (databaseModule?.connectionManager) {
      await databaseModule.connectionManager.shutdown();
    }
  });

  it('should create database configuration', () => {
    // Test that configuration can be created
    expect(() => {
      process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test';
      const {
        createDatabaseConfig,
      } = require('../infrastructure/database/config');
      const config = createDatabaseConfig();
      expect(config).toBeDefined();
      expect(config.primary).toBeDefined();
      expect(config.retryConfig).toBeDefined();
    }).not.toThrow();
  });

  it('should validate database connection manager structure', () => {
    const {
      DatabaseConnectionManager,
    } = require('../infrastructure/database/connection-manager');
    expect(DatabaseConnectionManager).toBeDefined();
    expect(typeof DatabaseConnectionManager).toBe('function');
  });

  it('should validate repository structures', () => {
    const {
      PrismaUserRepository,
    } = require('../infrastructure/database/repositories/prisma-user-repository');
    const {
      DrizzleSessionRepository,
    } = require('../infrastructure/database/repositories/drizzle-session-repository');

    expect(PrismaUserRepository).toBeDefined();
    expect(DrizzleSessionRepository).toBeDefined();
    expect(typeof PrismaUserRepository).toBe('function');
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

  it('should validate database initializer', () => {
    const {
      DatabaseInitializer,
    } = require('../infrastructure/database/migrations/init');
    expect(DatabaseInitializer).toBeDefined();
    expect(typeof DatabaseInitializer).toBe('function');
  });

  it('should validate main database module exports', () => {
    const databaseIndex = require('../infrastructure/database');
    expect(databaseIndex.createDatabaseModule).toBeDefined();
    expect(databaseIndex.DatabaseConnectionManager).toBeDefined();
    expect(databaseIndex.PrismaUserRepository).toBeDefined();
    expect(databaseIndex.DrizzleSessionRepository).toBeDefined();
  });
});
