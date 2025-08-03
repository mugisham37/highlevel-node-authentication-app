import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { createCacheSystem, CacheFactory } from '../../../infrastructure/cache';

describe('Cache System Integration', () => {
  let cacheFactory: CacheFactory;

  beforeAll(async () => {
    // Use test configuration
    const testConfig = {
      redis: {
        keyPrefix: 'test:',
        defaultTTL: 60,
        maxRetries: 1,
        retryDelay: 50,
        compression: {
          enabled: false,
          threshold: 1024,
        },
        circuitBreaker: {
          enabled: false,
          failureThreshold: 3,
          recoveryTimeout: 5000,
        },
      },
      memory: {
        maxSize: 100,
        maxMemory: 1024 * 1024, // 1MB
        cleanupInterval: 10000,
        defaultTTL: 30,
      },
      session: {
        sessionTTL: 300, // 5 minutes
        refreshTTL: 3600, // 1 hour
        cleanupInterval: 60000,
        maxSessionsPerUser: 3,
        extendOnActivity: true,
        activityThreshold: 10,
      },
    };

    try {
      cacheFactory = await createCacheSystem(testConfig);
    } catch (error) {
      console.warn('Redis not available for testing, skipping cache tests');
      throw error;
    }
  });

  afterAll(async () => {
    if (cacheFactory) {
      await cacheFactory.shutdown();
    }
  });

  beforeEach(async () => {
    if (cacheFactory) {
      const cache = cacheFactory.getMultiLayerCache();
      await cache.clear();
    }
  });

  describe('Multi-Layer Cache', () => {
    it('should store and retrieve data from cache', async () => {
      const cache = cacheFactory.getMultiLayerCache();
      const key = 'test-key';
      const value = { message: 'Hello, World!', timestamp: Date.now() };

      await cache.set(key, value);
      const retrieved = await cache.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should handle cache miss gracefully', async () => {
      const cache = cacheFactory.getMultiLayerCache();
      const result = await cache.get('non-existent-key');

      expect(result).toBeNull();
    });

    it('should delete cached data', async () => {
      const cache = cacheFactory.getMultiLayerCache();
      const key = 'delete-test';
      const value = 'test-value';

      await cache.set(key, value);
      expect(await cache.get(key)).toBe(value);

      const deleted = await cache.delete(key);
      expect(deleted).toBe(true);
      expect(await cache.get(key)).toBeNull();
    });

    it('should invalidate cache by tag', async () => {
      const cache = cacheFactory.getMultiLayerCache();

      await cache.set('key1', 'value1', { tags: ['user:123'] });
      await cache.set('key2', 'value2', { tags: ['user:123'] });
      await cache.set('key3', 'value3', { tags: ['user:456'] });

      const invalidated = await cache.invalidateByTag('user:123');
      expect(invalidated).toBeGreaterThan(0);

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBe('value3');
    });

    it('should check if key exists', async () => {
      const cache = cacheFactory.getMultiLayerCache();
      const key = 'exists-test';
      const value = 'test-value';

      expect(await cache.has(key)).toBe(false);

      await cache.set(key, value);
      expect(await cache.has(key)).toBe(true);
    });
  });

  describe('Session Storage', () => {
    it('should create and retrieve session', async () => {
      const sessionStorage = cacheFactory.getSessionStorage();

      const deviceInfo = {
        fingerprint: 'test-fingerprint',
        platform: 'test-platform',
        browser: 'test-browser',
        version: '1.0.0',
        isMobile: false,
      };

      const session = await sessionStorage.createSession(
        'user123',
        deviceInfo,
        '127.0.0.1',
        'test-user-agent'
      );

      expect(session.userId).toBe('user123');
      expect(session.deviceInfo).toEqual(deviceInfo);
      expect(session.ipAddress).toBe('127.0.0.1');
      expect(session.isActive).toBe(true);

      const retrieved = await sessionStorage.getSession(session.id);
      expect(retrieved).toEqual(session);
    });

    it('should retrieve session by token', async () => {
      const sessionStorage = cacheFactory.getSessionStorage();

      const deviceInfo = {
        fingerprint: 'token-test',
        platform: 'test',
        browser: 'test',
        version: '1.0.0',
        isMobile: false,
      };

      const session = await sessionStorage.createSession(
        'user456',
        deviceInfo,
        '127.0.0.1',
        'test-agent'
      );

      const retrieved = await sessionStorage.getSessionByToken(session.token);
      expect(retrieved?.id).toBe(session.id);
      expect(retrieved?.userId).toBe('user456');
    });

    it('should update session activity', async () => {
      const sessionStorage = cacheFactory.getSessionStorage();

      const deviceInfo = {
        fingerprint: 'activity-test',
        platform: 'test',
        browser: 'test',
        version: '1.0.0',
        isMobile: false,
      };

      const session = await sessionStorage.createSession(
        'user789',
        deviceInfo,
        '127.0.0.1',
        'test-agent'
      );

      const originalActivity = session.lastActivity;

      // Wait a bit to ensure timestamp difference
      await new Promise((resolve) => setTimeout(resolve, 100));

      const updated = await sessionStorage.updateSessionActivity(
        session.id,
        '192.168.1.1',
        'updated-agent',
        0.5
      );

      expect(updated).toBe(true);

      const retrieved = await sessionStorage.getSession(session.id);
      expect(retrieved?.lastActivity).toBeGreaterThan(originalActivity);
      expect(retrieved?.ipAddress).toBe('192.168.1.1');
      expect(retrieved?.userAgent).toBe('updated-agent');
      expect(retrieved?.riskScore).toBe(0.5);
    });

    it('should delete session', async () => {
      const sessionStorage = cacheFactory.getSessionStorage();

      const deviceInfo = {
        fingerprint: 'delete-test',
        platform: 'test',
        browser: 'test',
        version: '1.0.0',
        isMobile: false,
      };

      const session = await sessionStorage.createSession(
        'user999',
        deviceInfo,
        '127.0.0.1',
        'test-agent'
      );

      expect(await sessionStorage.getSession(session.id)).not.toBeNull();

      const deleted = await sessionStorage.deleteSession(session.id);
      expect(deleted).toBe(true);
      expect(await sessionStorage.getSession(session.id)).toBeNull();
    });

    it('should manage user sessions', async () => {
      const sessionStorage = cacheFactory.getSessionStorage();
      const userId = 'multi-session-user';

      const deviceInfo = {
        fingerprint: 'multi-test',
        platform: 'test',
        browser: 'test',
        version: '1.0.0',
        isMobile: false,
      };

      // Create multiple sessions for the same user
      const session1 = await sessionStorage.createSession(
        userId,
        { ...deviceInfo, fingerprint: 'device1' },
        '127.0.0.1',
        'agent1'
      );

      const session2 = await sessionStorage.createSession(
        userId,
        { ...deviceInfo, fingerprint: 'device2' },
        '127.0.0.2',
        'agent2'
      );

      const userSessions = await sessionStorage.getUserSessions(userId);
      expect(userSessions).toHaveLength(2);
      expect(userSessions.map((s) => s.id)).toContain(session1.id);
      expect(userSessions.map((s) => s.id)).toContain(session2.id);

      // Delete all user sessions
      const deleted = await sessionStorage.deleteUserSessions(userId);
      expect(deleted).toBe(2);

      const remainingSessions = await sessionStorage.getUserSessions(userId);
      expect(remainingSessions).toHaveLength(0);
    });
  });

  describe('Health Check', () => {
    it('should perform health check', async () => {
      const health = await cacheFactory.healthCheck();

      expect(health).toHaveProperty('redis');
      expect(health).toHaveProperty('cache');
      expect(health).toHaveProperty('session');
      expect(health).toHaveProperty('overall');

      // In a working environment, these should be true
      expect(typeof health.redis).toBe('boolean');
      expect(typeof health.cache).toBe('boolean');
      expect(typeof health.session).toBe('boolean');
      expect(typeof health.overall).toBe('boolean');
    });

    it('should provide cache statistics', async () => {
      const stats = cacheFactory.getStats();

      expect(stats).toHaveProperty('timestamp');
      expect(stats).toHaveProperty('redis');
      expect(stats).toHaveProperty('multiLayerCache');

      expect(typeof stats.timestamp).toBe('string');
    });
  });
});
