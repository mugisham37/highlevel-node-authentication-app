/**
 * Enhanced Multi-Layer Cache with proper constructor support
 * Fixes the constructor parameter mismatch issue
 */

import { MemoryCache, MemoryCacheConfig } from './memory-cache';
import { RedisCache } from './redis-cache';
import { CacheOptions, CacheMetrics } from './cache-entry';
import { ILogger } from '../types/logger';

export interface MultiLayerCacheOptions {
  l1Config: MemoryCacheConfig;
  l2Config?: {
    keyPrefix?: string;
    defaultTTL?: number;
  };
  logger: ILogger;
}

export class EnhancedMultiLayerCache {
  private l1Cache: MemoryCache;
  private l2Cache?: RedisCache | undefined;
  private metrics = new CacheMetrics();
  private logger: ILogger;

  constructor(
    logger: ILogger,
    redisCache?: RedisCache,
    options?: Partial<MultiLayerCacheOptions>
  ) {
    this.logger = logger;
    this.l2Cache = redisCache || undefined;

    // Initialize L1 cache with default config if not provided
    const l1Config = options?.l1Config || {
      maxSize: 1000,
      maxMemory: 100 * 1024 * 1024, // 100MB
      cleanupInterval: 60000,
      defaultTTL: 300,
    };

    this.l1Cache = new MemoryCache(l1Config);

    this.logger.debug('Enhanced MultiLayerCache initialized', {
      hasRedisCache: !!this.l2Cache,
      l1Config,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();

    try {
      // Try L1 cache first
      let value = await this.l1Cache.get<T>(key);
      if (value !== null) {
        this.metrics.recordHit();
        this.logger.debug('Cache hit L1', { key, duration: Date.now() - startTime });
        return value;
      }

      // Try L2 cache if available
      if (this.l2Cache) {
        value = await this.l2Cache.get<T>(key);
        if (value !== null) {
          // Populate L1 cache
          await this.l1Cache.set(key, value);
          this.metrics.recordHit();
          this.logger.debug('Cache hit L2', { key, duration: Date.now() - startTime });
          return value;
        }
      }

      this.metrics.recordMiss();
      return null;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache get error', error as Error, { key });
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    const startTime = Date.now();

    try {
      // Set in L1 cache
      await this.l1Cache.set(key, value, options);

      // Set in L2 cache if available
      if (this.l2Cache) {
        await this.l2Cache.set(key, value, options);
      }

      this.metrics.recordSet();
      this.logger.debug('Cache set completed', { key, duration: Date.now() - startTime });
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache set error', error as Error, { key });
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const results = await Promise.allSettled([
        this.l1Cache.delete(key),
        this.l2Cache?.delete(key) || Promise.resolve(false),
      ]);

      const deleted = results.some((result) => 
        result.status === 'fulfilled' && result.value === true
      );

      if (deleted) {
        this.metrics.recordDelete();
      }

      return deleted;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache delete error', error as Error, { key });
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await Promise.allSettled([
        this.l1Cache.clear(),
        this.l2Cache?.clear() || Promise.resolve(),
      ]);

      this.logger.info('Cache cleared');
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache clear error', error as Error);
      throw error;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    try {
      const results = await Promise.allSettled([
        this.l1Cache.invalidateByTag(tag),
        this.l2Cache?.invalidateByTag(tag) || Promise.resolve(0),
      ]);

      const total = results.reduce((sum, result) => {
        return sum + (result.status === 'fulfilled' ? result.value : 0);
      }, 0);

      this.logger.debug('Cache invalidated by tag', { tag, total });
      return total;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache invalidate by tag error', error as Error, { tag });
      return 0;
    }
  }

  async has(key: string): Promise<boolean> {
    try {
      // Check L1 first
      if (await this.l1Cache.has(key)) {
        return true;
      }

      // Check L2 if available
      if (this.l2Cache && await this.l2Cache.has(key)) {
        return true;
      }

      return false;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache has error', error as Error, { key });
      return false;
    }
  }

  getStats() {
    return {
      overall: this.metrics.getStats(),
      l1: this.l1Cache.getStats(),
      l2: this.l2Cache?.getStats() || null,
    };
  }

  async ping(): Promise<void> {
    const testKey = `ping_${Date.now()}`;
    await this.set(testKey, 'ping', { ttl: 1 });
    const result = await this.get(testKey);
    if (result !== 'ping') {
      throw new Error('Cache ping failed');
    }
    await this.delete(testKey);
  }

  destroy(): void {
    // Cleanup resources
    this.l1Cache.destroy?.();
    // L2 cache cleanup is handled by Redis client
  }
}
