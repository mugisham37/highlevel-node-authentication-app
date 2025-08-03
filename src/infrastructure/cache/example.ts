import { createCacheSystem, defaultCacheConfig } from './cache-factory';
import { logger } from '../logging/winston-logger';

async function demonstrateCacheSystem() {
  logger.info('🚀 Starting cache system demonstration...');

  try {
    // Create cache system with default configuration
    const cacheFactory = await createCacheSystem({
      ...defaultCacheConfig,
      redis: {
        ...defaultCacheConfig.redis,
        circuitBreaker: {
          enabled: false, // Disable for demo
          failureThreshold: 5,
          recoveryTimeout: 60000,
        },
      },
    });

    logger.info('✅ Cache system initialized successfully');

    // Get cache instances
    const multiLayerCache = cacheFactory.getMultiLayerCache();
    const sessionStorage = cacheFactory.getSessionStorage();

    // Demonstrate multi-layer cache
    logger.info('📦 Demonstrating multi-layer cache...');

    const testData = {
      message: 'Hello from cache!',
      timestamp: new Date().toISOString(),
      data: { nested: { value: 42 } },
    };

    // Set data with tags
    await multiLayerCache.set('demo:test', testData, {
      ttl: 300, // 5 minutes
      tags: ['demo', 'test-data'],
    });

    // Retrieve data
    const retrieved = await multiLayerCache.get('demo:test');
    logger.info('Retrieved data:', retrieved);

    // Demonstrate session storage
    logger.info('🔐 Demonstrating session storage...');

    const deviceInfo = {
      fingerprint: 'demo-device-123',
      platform: 'Windows',
      browser: 'Chrome',
      version: '120.0.0',
      isMobile: false,
      screenResolution: '1920x1080',
      timezone: 'UTC',
    };

    // Create a session
    const session = await sessionStorage.createSession(
      'demo-user-456',
      deviceInfo,
      '192.168.1.100',
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      { loginMethod: 'email', source: 'web' }
    );

    logger.info('Created session:', {
      id: session.id,
      userId: session.userId,
      expiresAt: new Date(session.expiresAt).toISOString(),
    });

    // Retrieve session by token
    const sessionByToken = await sessionStorage.getSessionByToken(
      session.token
    );
    logger.info('Retrieved session by token:', sessionByToken?.id);

    // Update session activity
    await sessionStorage.updateSessionActivity(
      session.id,
      '192.168.1.101',
      'Updated User Agent',
      0.2
    );

    logger.info('Updated session activity');

    // Demonstrate cache invalidation
    logger.info('🗑️ Demonstrating cache invalidation...');

    // Add more test data
    await multiLayerCache.set(
      'demo:user:123',
      { name: 'John Doe' },
      { tags: ['user:123'] }
    );
    await multiLayerCache.set(
      'demo:user:456',
      { name: 'Jane Smith' },
      { tags: ['user:456'] }
    );
    await multiLayerCache.set(
      'demo:shared',
      { shared: true },
      { tags: ['user:123', 'user:456'] }
    );

    // Invalidate by tag
    const invalidated = await multiLayerCache.invalidateByTag('user:123');
    logger.info(`Invalidated ${invalidated} entries with tag 'user:123'`);

    // Check health
    logger.info('🏥 Checking system health...');
    const health = await cacheFactory.healthCheck();
    logger.info('Health check results:', health);

    // Get statistics
    logger.info('📊 Getting cache statistics...');
    const stats = cacheFactory.getStats();
    logger.info('Cache statistics:', JSON.stringify(stats, null, 2));

    // Cleanup
    logger.info('🧹 Cleaning up...');
    await sessionStorage.deleteSession(session.id);
    await multiLayerCache.clear();
    await cacheFactory.shutdown();

    logger.info('✅ Cache system demonstration completed successfully');
  } catch (error) {
    logger.error('❌ Cache system demonstration failed:', error);

    if (error instanceof Error && error.message.includes('ECONNREFUSED')) {
      logger.warn(
        '💡 Redis server is not running. Please start Redis to test the full cache system.'
      );
      logger.info('   You can still use the memory cache layer independently.');
    }
  }
}

// Run the demonstration
if (require.main === module) {
  demonstrateCacheSystem().catch(console.error);
}

export { demonstrateCacheSystem };
