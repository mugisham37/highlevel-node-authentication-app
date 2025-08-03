import { RedisClient, createRedisClient } from './redis-client';
import { RedisCache } from './redis-cache';
import { MultiLayerCache, MultiLayerCacheConfig } from './multi-layer-cache';
import { SessionStorage } from './session-storage';
import { config } from '../config/environment';
import { logger } from '../logging/winston-logger';

export interface CacheSystemConfig {
  redis: {
    keyPrefix: string;
    defaultTTL: number;
    maxRetries: number;
    retryDelay: number;
    compression: {
      enabled: boolean;
      threshold: number;
    };
    circuitBreaker: {
      enabled: boolean;
      failureThreshold: number;
      recoveryTimeout: number;
    };
  };
  memory: {
    maxSize: number;
    maxMemory: number;
    cleanupInterval: number;
    defaultTTL: number;
  };
  multiLayer: {
    writeThrough: boolean;
    readThrough: boolean;
    invalidationStrategy: 'cascade' | 'selective';
  };
  session: {
    sessionTTL: number;
    refreshTTL: number;
    cleanupInterval: number;
    maxSessionsPerUser: number;
    extendOnActivity: boolean;
    activityThreshold: number;
  };
}

export class CacheFactory {
  private static instance: CacheFactory | null = null;
  private redisClient: RedisClient | null = null;
  private redisCache: RedisCache | null = null;
  private multiLayerCache: MultiLayerCache | null = null;
  private sessionStorage: SessionStorage | null = null;

  private constructor(private cacheConfig: CacheSystemConfig) { }

  static getInstance(cacheConfig?: CacheSystemConfig): CacheFactory {
    if (!CacheFactory.instance) {
      if (!cacheConfig) {
        throw new Error(
          'CacheFactory not initialized. Provide cacheConfig on first call.'
        );
      }
      CacheFactory.instance = new CacheFactory(cacheConfig);
    }
    return CacheFactory.instance;
  }

  async initialize(): Promise<void> {
    try {
      logger.info('Initializing cache system...');

      // Initialize Redis client with proper type casting
      const redisConfig: any = {
        host: config.redis.host,
        port: config.redis.port,
        db: config.redis.db,
        cluster: config.redis.cluster,
        maxRetriesPerRequest: config.redis.maxRetriesPerRequest,
        lazyConnect: config.redis.lazyConnect,
        keepAlive: config.redis.keepAlive,
        connectTimeout: config.redis.connectTimeout,
        commandTimeout: config.redis.commandTimeout,
      };

      // Only add password if it's defined
      if (config.redis.password !== undefined) {
        redisConfig.password = config.redis.password;
      }

      this.redisClient = createRedisClient(redisConfig);
      await this.redisClient.connect();

      // Initialize Redis cache
      this.redisCache = new RedisCache(
        this.redisClient,
        this.cacheConfig.redis
      );

      // Initialize multi-layer cache
      const multiLayerConfig: MultiLayerCacheConfig = {
        l1: this.cacheConfig.memory,
        l2: this.cacheConfig.redis,
        writeThrough: this.cacheConfig.multiLayer.writeThrough,
        readThrough: this.cacheConfig.multiLayer.readThrough,
        invalidationStrategy: this.cacheConfig.multiLayer.invalidationStrategy,
      };

      this.multiLayerCache = new MultiLayerCache(
        multiLayerConfig,
        this.redisCache
      );

      // Initialize session storage
      this.sessionStorage = new SessionStorage(
        this.multiLayerCache,
        this.cacheConfig.session
      );

      logger.info('Cache system initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize cache system:', error);
      throw error;
    }
  }

  getRedisClient(): RedisClient {
    if (!this.redisClient) {
      throw new Error('Redis client not initialized. Call initialize() first.');
    }
    return this.redisClient;
  }

  getRedisCache(): RedisCache {
    if (!this.redisCache) {
      throw new Error('Redis cache not initialized. Call initialize() first.');
    }
    return this.redisCache;
  }

  getMultiLayerCache(): MultiLayerCache {
    if (!this.multiLayerCache) {
      throw new Error(
        'Multi-layer cache not initialized. Call initialize() first.'
      );
    }
    return this.multiLayerCache;
  }

  getSessionStorage(): SessionStorage {
    if (!this.sessionStorage) {
      throw new Error(
        'Session storage not initialized. Call initialize() first.'
      );
    }
    return this.sessionStorage;
  }

  async healthCheck(): Promise<{
    redis: boolean;
    cache: boolean;
    session: boolean;
    overall: boolean;
  }> {
    const health = {
      redis: false,
      cache: false,
      session: false,
      overall: false,
    };

    try {
      // Check Redis health
      if (this.redisClient) {
        await this.redisClient.ping();
        health.redis = this.redisClient.isHealthy();
      }

      // Check cache health (simple test)
      if (this.multiLayerCache) {
        const testKey = `health_check_${Date.now()}`;
        const testValue = 'test';

        await this.multiLayerCache.set(testKey, testValue, { ttl: 10 });
        const retrieved = await this.multiLayerCache.get(testKey);
        health.cache = retrieved === testValue;

        // Cleanup
        await this.multiLayerCache.delete(testKey);
      }

      // Check session storage health
      if (this.sessionStorage) {
        // Session storage health is dependent on cache health
        health.session = health.cache;
      }

      health.overall = health.redis && health.cache && health.session;
    } catch (error) {
      logger.error('Cache health check failed:', error);
    }

    return health;
  }

  getStats() {
    const stats: any = {
      timestamp: new Date().toISOString(),
    };

    if (this.redisClient) {
      stats.redis = {
        connected: this.redisClient.isHealthy(),
      };
    }

    if (this.redisCache) {
      stats.redisCache = this.redisCache.getStats();
    }

    if (this.multiLayerCache) {
      stats.multiLayerCache = this.multiLayerCache.getStats();
    }

    return stats;
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down cache system...');

    try {
      // Cleanup session storage
      if (this.sessionStorage) {
        this.sessionStorage.destroy();
        this.sessionStorage = null;
      }

      // Cleanup multi-layer cache
      if (this.multiLayerCache) {
        this.multiLayerCache.destroy();
        this.multiLayerCache = null;
      }

      // Cleanup Redis cache
      this.redisCache = null;

      // Disconnect Redis client
      if (this.redisClient) {
        await this.redisClient.disconnect();
        this.redisClient = null;
      }

      logger.info('Cache system shutdown completed');
    } catch (error) {
      logger.error('Error during cache system shutdown:', error);
      throw error;
    }
  }
}

// Default configuration
export const defaultCacheConfig: CacheSystemConfig = {
  redis: {
    keyPrefix: 'auth:',
    defaultTTL: 3600, // 1 hour
    maxRetries: 3,
    retryDelay: 100,
    compression: {
      enabled: true,
      threshold: 1024, // 1KB
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
    },
  },
  memory: {
    maxSize: 10000, // 10k entries
    maxMemory: 100 * 1024 * 1024, // 100MB
    cleanupInterval: 60000, // 1 minute
    defaultTTL: 300, // 5 minutes
  },
  multiLayer: {
    writeThrough: true,
    readThrough: true,
    invalidationStrategy: 'cascade',
  },
  session: {
    sessionTTL: 900, // 15 minutes
    refreshTTL: 604800, // 7 days
    cleanupInterval: 300000, // 5 minutes
    maxSessionsPerUser: 10,
    extendOnActivity: true,
    activityThreshold: 60, // 1 minute
  },
};

// Convenience function to create and initialize cache system
export async function createCacheSystem(
  customConfig?: Partial<CacheSystemConfig>
): Promise<CacheFactory> {
  const finalConfig = customConfig
    ? { ...defaultCacheConfig, ...customConfig }
    : defaultCacheConfig;

  const cacheFactory = CacheFactory.getInstance(finalConfig);
  await cacheFactory.initialize();

  return cacheFactory;
}
