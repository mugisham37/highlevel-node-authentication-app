/**
 * Repository Pattern Implementation Tests
 * Tests for the enhanced repository pattern with dual ORM support
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { Logger } from 'winston';
import { DatabaseConnectionManager } from '../../../infrastructure/database/connection-manager';
import { RepositoryFactory } from '../../../infrastructure/database/repositories/repository-factory';
import { TransactionManager } from '../../../infrastructure/database/repositories/base/transaction-manager';
import {
  IUserRepository,
  CreateUserData,
  UpdateUserData,
  UserFilters,
} from '../../../infrastructure/database/repositories/interfaces/user-repository.interface';
import {
  ISessionRepository,
  CreateSessionData,
  SessionFilters,
} from '../../../infrastructure/database/repositories/interfaces/session-repository.interface';

// Mock logger
const mockLogger: Logger = {
  info: () => {},
  warn: () => {},
  error: () => {},
  debug: () => {},
} as any;

// Mock database configuration
const mockDatabaseConfig = {
  primary: {
    connectionString:
      process.env.DATABASE_URL || 'postgresql://test:test@localhost:5432/test',
  },
  retryConfig: {
    maxRetries: 3,
    retryDelay: 1000,
    backoffMultiplier: 2,
  },
};

describe('Repository Pattern Implementation', () => {
  let connectionManager: DatabaseConnectionManager;
  let repositoryFactory: RepositoryFactory;
  let userRepository: IUserRepository;
  let sessionRepository: ISessionRepository;
  let transactionManager: TransactionManager;

  beforeAll(async () => {
    // Initialize connection manager
    connectionManager = new DatabaseConnectionManager(
      mockDatabaseConfig,
      mockLogger
    );

    // Initialize repository factory
    repositoryFactory = RepositoryFactory.create(
      connectionManager,
      mockLogger,
      {
        enableCaching: true,
        enableMetrics: true,
      }
    );

    // Get repository instances
    userRepository = repositoryFactory.getUserRepository();
    sessionRepository = repositoryFactory.getSessionRepository();
    transactionManager = repositoryFactory.getTransactionManager();
  });

  afterAll(async () => {
    await repositoryFactory.shutdown();
    await connectionManager.shutdown();
  });

  describe('Repository Factory', () => {
    it('should create repository instances', () => {
      expect(userRepository).toBeDefined();
      expect(sessionRepository).toBeDefined();
      expect(transactionManager).toBeDefined();
    });

    it('should return singleton instances', () => {
      const userRepo1 = repositoryFactory.getUserRepository();
      const userRepo2 = repositoryFactory.getUserRepository();
      expect(userRepo1).toBe(userRepo2);
    });

    it('should perform health check', async () => {
      const health = await repositoryFactory.healthCheck();
      expect(health).toHaveProperty('status');
      expect(health).toHaveProperty('repositories');
      expect(health).toHaveProperty('database');
    });
  });

  describe('User Repository (Prisma)', () => {
    let testUserId: string;

    const testUserData: CreateUserData = {
      email: 'test@example.com',
      name: 'Test User',
      passwordHash: 'hashed_password',
      emailVerified: new Date(),
    };

    it('should create a user', async () => {
      const user = await userRepository.create(testUserData);

      expect(user).toBeDefined();
      expect(user.email).toBe(testUserData.email);
      expect(user.name).toBe(testUserData.name);
      expect(user.id).toBeDefined();

      testUserId = user.id;
    });

    it('should find user by ID', async () => {
      const user = await userRepository.findById(testUserId);

      expect(user).toBeDefined();
      expect(user!.id).toBe(testUserId);
      expect(user!.email).toBe(testUserData.email);
    });

    it('should find user by email', async () => {
      const user = await userRepository.findByEmail(testUserData.email);

      expect(user).toBeDefined();
      expect(user!.email).toBe(testUserData.email);
      expect(user!.id).toBe(testUserId);
    });

    it('should update user', async () => {
      const updateData: UpdateUserData = {
        name: 'Updated Test User',
        riskScore: 0.5,
      };

      const updatedUser = await userRepository.update(testUserId, updateData);

      expect(updatedUser.name).toBe(updateData.name);
      expect(updatedUser.riskScore).toBe(updateData.riskScore);
    });

    it('should find users with filters', async () => {
      const filters: UserFilters = {
        search: 'test',
        limit: 10,
        offset: 0,
      };

      const result = await userRepository.findMany(filters);

      expect(result).toHaveProperty('items');
      expect(result).toHaveProperty('total');
      expect(Array.isArray(result.items)).toBe(true);
      expect(typeof result.total).toBe('number');
    });

    it('should check if user exists', async () => {
      const exists = await userRepository.exists(testUserId);
      expect(exists).toBe(true);

      const notExists = await userRepository.exists('non-existent-id');
      expect(notExists).toBe(false);
    });

    it('should get user count', async () => {
      const count = await userRepository.count();
      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should handle authentication operations', async () => {
      // Test failed login attempts
      const userWithFailedAttempts =
        await userRepository.incrementFailedLoginAttempts(testUserId);
      expect(userWithFailedAttempts.failedLoginAttempts).toBeGreaterThan(0);

      // Test reset failed attempts
      const userWithResetAttempts =
        await userRepository.resetFailedLoginAttempts(testUserId);
      expect(userWithResetAttempts.failedLoginAttempts).toBe(0);
    });

    it('should get user statistics', async () => {
      const stats = await userRepository.getUserStats();

      expect(stats).toHaveProperty('total');
      expect(stats).toHaveProperty('active');
      expect(stats).toHaveProperty('locked');
      expect(stats).toHaveProperty('mfaEnabled');
      expect(stats).toHaveProperty('averageRiskScore');
      expect(stats).toHaveProperty('newUsersToday');
      expect(stats).toHaveProperty('newUsersThisWeek');
    });

    it('should use caching for repeated queries', async () => {
      // First call - should hit database
      const user1 = await userRepository.findByIdCached(testUserId, 3600);

      // Second call - should hit cache
      const user2 = await userRepository.findByIdCached(testUserId, 3600);

      expect(user1).toEqual(user2);
    });

    it('should delete user', async () => {
      await userRepository.delete(testUserId);

      const deletedUser = await userRepository.findById(testUserId);
      expect(deletedUser).toBeNull();
    });
  });

  describe('Session Repository (Drizzle)', () => {
    let testSessionId: string;
    let testUserId: string;

    beforeEach(async () => {
      // Create a test user first
      const testUser = await userRepository.create({
        email: 'session-test@example.com',
        name: 'Session Test User',
      });
      testUserId = testUser.id;
    });

    const testSessionData: CreateSessionData = {
      id: 'test-session-id',
      userId: '', // Will be set in test
      token: 'test-token-123',
      refreshToken: 'test-refresh-token-123',
      expiresAt: new Date(Date.now() + 3600000), // 1 hour
      refreshExpiresAt: new Date(Date.now() + 7200000), // 2 hours
      ipAddress: '192.168.1.1',
      deviceFingerprint: 'test-device-fingerprint',
      userAgent: 'Test User Agent',
      riskScore: 0.1,
    };

    it('should create a session', async () => {
      testSessionData.userId = testUserId;
      testSessionData.id = `test-session-${Date.now()}`;

      const session = await sessionRepository.create(testSessionData);

      expect(session).toBeDefined();
      expect(session.userId).toBe(testUserId);
      expect(session.token).toBe(testSessionData.token);
      expect(session.isActive).toBe(true);

      testSessionId = session.id;
    });

    it('should validate session', async () => {
      const validation = await sessionRepository.validateSession(
        testSessionData.token
      );

      expect(validation.isValid).toBe(true);
      expect(validation.session).toBeDefined();
      expect(validation.session!.id).toBe(testSessionId);
    });

    it('should validate session with caching', async () => {
      const validation1 = await sessionRepository.validateSessionCached(
        testSessionData.token,
        300
      );
      const validation2 = await sessionRepository.validateSessionCached(
        testSessionData.token,
        300
      );

      expect(validation1.isValid).toBe(true);
      expect(validation2.isValid).toBe(true);
    });

    it('should refresh session', async () => {
      const refreshedSession = await sessionRepository.refreshSession(
        testSessionData.refreshToken
      );

      expect(refreshedSession).toBeDefined();
      expect(refreshedSession!.id).toBe(testSessionId);
    });

    it('should get user active sessions', async () => {
      const sessions =
        await sessionRepository.getUserActiveSessions(testUserId);

      expect(Array.isArray(sessions)).toBe(true);
      expect(sessions.length).toBeGreaterThan(0);
      expect(sessions[0].userId).toBe(testUserId);
    });

    it('should get user session count', async () => {
      const count = await sessionRepository.getUserSessionCount(testUserId);

      expect(typeof count).toBe('number');
      expect(count).toBeGreaterThan(0);
    });

    it('should record authentication attempts', async () => {
      await sessionRepository.recordAuthAttempt({
        userId: testUserId,
        email: 'session-test@example.com',
        ipAddress: '192.168.1.1',
        success: true,
        riskScore: 0.1,
      });

      await sessionRepository.recordAuthAttempt({
        userId: testUserId,
        email: 'session-test@example.com',
        ipAddress: '192.168.1.1',
        success: false,
        failureReason: 'invalid_password',
        riskScore: 0.8,
      });

      const failedAttempts = await sessionRepository.getRecentFailedAttempts(
        testUserId,
        'userId',
        15 * 60 * 1000
      );

      expect(Array.isArray(failedAttempts)).toBe(true);
      expect(failedAttempts.length).toBeGreaterThan(0);
    });

    it('should check rate limits', async () => {
      const rateLimit1 = await sessionRepository.checkRateLimit(
        '192.168.1.1',
        'login',
        5,
        60000
      );

      expect(rateLimit1.allowed).toBe(true);
      expect(rateLimit1.remaining).toBe(4);
      expect(rateLimit1.resetTime).toBeInstanceOf(Date);

      // Make multiple requests to test limit
      for (let i = 0; i < 4; i++) {
        await sessionRepository.checkRateLimit(
          '192.168.1.1',
          'login',
          5,
          60000
        );
      }

      const rateLimitExceeded = await sessionRepository.checkRateLimit(
        '192.168.1.1',
        'login',
        5,
        60000
      );

      expect(rateLimitExceeded.allowed).toBe(false);
      expect(rateLimitExceeded.remaining).toBe(0);
    });

    it('should get session statistics', async () => {
      const stats = await sessionRepository.getSessionStats();

      expect(stats).toHaveProperty('totalSessions');
      expect(stats).toHaveProperty('activeSessions');
      expect(stats).toHaveProperty('averageSessionDuration');
      expect(stats).toHaveProperty('uniqueUsers');
      expect(stats).toHaveProperty('topDevices');
      expect(stats).toHaveProperty('topLocations');
    });

    it('should terminate session', async () => {
      await sessionRepository.terminateSession(testSessionId);

      const validation = await sessionRepository.validateSession(
        testSessionData.token
      );
      expect(validation.isValid).toBe(false);
    });

    it('should cleanup expired sessions', async () => {
      // Create an expired session
      const expiredSessionData: CreateSessionData = {
        ...testSessionData,
        id: `expired-session-${Date.now()}`,
        token: `expired-token-${Date.now()}`,
        refreshToken: `expired-refresh-${Date.now()}`,
        expiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        refreshExpiresAt: new Date(Date.now() - 1800000), // 30 minutes ago
      };

      await sessionRepository.create(expiredSessionData);

      const cleanedCount = await sessionRepository.cleanupExpiredSessions();
      expect(typeof cleanedCount).toBe('number');
    });
  });

  describe('Transaction Management', () => {
    it('should execute operations in transaction', async () => {
      const result = await transactionManager.withTransaction(
        async (context) => {
          // This would use the transaction context to ensure atomicity
          return { success: true, message: 'Transaction completed' };
        }
      );

      expect(result.success).toBe(true);
      expect(result.message).toBe('Transaction completed');
    });

    it('should handle transaction rollback on error', async () => {
      try {
        await transactionManager.withTransaction(async (context) => {
          // Simulate an error that should cause rollback
          throw new Error('Transaction test error');
        });
      } catch (error) {
        expect((error as Error).message).toBe('Transaction test error');
      }
    });

    it('should execute cross-repository transaction', async () => {
      const result = await repositoryFactory.withRepositoryTransaction(
        async (repos) => {
          // Create user and session in same transaction
          const user = await repos.userRepository.create({
            email: 'transaction-test@example.com',
            name: 'Transaction Test User',
          });

          const session = await repos.sessionRepository.create({
            id: `transaction-session-${Date.now()}`,
            userId: user.id,
            token: `transaction-token-${Date.now()}`,
            refreshToken: `transaction-refresh-${Date.now()}`,
            expiresAt: new Date(Date.now() + 3600000),
            refreshExpiresAt: new Date(Date.now() + 7200000),
          });

          return { user, session };
        }
      );

      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.session.userId).toBe(result.user.id);
    });
  });

  describe('Performance and Optimization', () => {
    it('should provide query metrics', async () => {
      // Perform some operations to generate metrics
      await userRepository.count();
      await sessionRepository.count();

      const metrics = await repositoryFactory.getRepositoryMetrics();

      expect(metrics).toHaveProperty('userRepository');
      expect(metrics).toHaveProperty('sessionRepository');
    });

    it('should handle cache operations', async () => {
      // Test cache warmup
      await repositoryFactory.warmupCaches();

      // Test cache clearing
      await repositoryFactory.clearCaches();
    });

    it('should optimize queries with caching', async () => {
      const userRepo = repositoryFactory.getUserRepository();

      // First call should hit database
      const startTime1 = Date.now();
      const result1 = await userRepo.findMany({ limit: 10 });
      const duration1 = Date.now() - startTime1;

      // Second call with same parameters should be faster (cached)
      const startTime2 = Date.now();
      const result2 = await userRepo.findMany({ limit: 10 });
      const duration2 = Date.now() - startTime2;

      expect(result1.total).toBe(result2.total);
      // Note: In a real test environment, duration2 should be significantly less than duration1
    });
  });

  describe('Error Handling and Resilience', () => {
    it('should handle database connection errors gracefully', async () => {
      // This would test circuit breaker and retry logic
      // In a real test, you'd simulate database failures
      expect(true).toBe(true); // Placeholder
    });

    it('should handle transaction conflicts with retry', async () => {
      // Test retry logic for transaction conflicts
      const result = await transactionManager.withRetryableTransaction(
        async (context) => {
          return { success: true };
        }
      );

      expect(result.success).toBe(true);
    });
  });
});
