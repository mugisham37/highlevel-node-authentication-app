/**
 * Simple Cache Implementation for Repository Factory
 * Provides a minimal cache implementation that matches MultiLayerCache interface
 */

import { MemoryCache, MemoryCacheConfig } from './memory-cache';
import { CacheOptions, CacheMetrics } from './cache-entry';
import { Logger } from 'winston';
import { ICache } from '../types/cache';

export class SimpleCacheAdapter implements ICache {
  private l1Cache: MemoryCache;
  private metrics = new CacheMetrics();
  // Add missing properties to match MultiLayerCache interface
  public l2Cache: undefined = undefined;

  constructor(
    private logger: Logger,
    config?: Partial<MemoryCacheConfig>
  ) {
    const defaultConfig: MemoryCacheConfig = {
      maxSize: 1000,
      maxMemory: 100 * 1024 * 1024, // 100MB
      cleanupInterval: 60000, // 1 minute
      defaultTTL: 3600, // 1 hour
      ...config,
    };

    this.l1Cache = new MemoryCache(defaultConfig);
    this.logger.debug('Simple cache adapter initialized', { config: defaultConfig });
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const value = await this.l1Cache.get<T>(key);
      if (value !== null) {
        this.metrics.recordHit();
      } else {
        this.metrics.recordMiss();
      }
      return value;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache get error', { error, key });
      return null;
    }
  }

  async set<T>(key: string, value: T, options: CacheOptions = {}): Promise<void> {
    try {
      await this.l1Cache.set(key, value, options);
      this.metrics.recordSet();
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache set error', { error, key });
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const result = await this.l1Cache.delete(key);
      if (result) {
        this.metrics.recordDelete();
      }
      return result;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache delete error', { error, key });
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.l1Cache.clear();
      this.logger.debug('Cache cleared');
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache clear error', { error });
      throw error;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    try {
      const result = await this.l1Cache.invalidateByTag(tag);
      this.logger.debug('Cache invalidated by tag', { tag, count: result });
      return result;
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache invalidate by tag error', { error, tag });
      return 0;
    }
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let total = 0;
    for (const tag of tags) {
      total += await this.invalidateByTag(tag);
    }
    return total;
  }

  async has(key: string): Promise<boolean> {
    try {
      return await this.l1Cache.has(key);
    } catch (error) {
      this.metrics.recordError();
      this.logger.error('Cache has error', { error, key });
      return false;
    }
  }

  getStats() {
    return {
      overall: this.metrics.getStats(),
      l1: this.l1Cache.getStats(),
    };
  }

  // Additional methods to match MultiLayerCache interface
  async invalidatePattern(pattern: string): Promise<number> {
    // Simple pattern matching - in production you'd want regex support
    try {
      const allKeys = Array.from((this.l1Cache as any).cache.keys()) as string[];
      let invalidated = 0;
      
      for (const key of allKeys) {
        if (typeof key === 'string' && key.includes(pattern)) {
          if (await this.delete(key)) {
            invalidated++;
          }
        }
      }
      
      this.logger.debug('Cache invalidated by pattern', { pattern, count: invalidated });
      return invalidated;
    } catch (error) {
      this.logger.error('Cache invalidate by pattern error', { error, pattern });
      return 0;
    }
  }

  destroy(): void {
    this.l1Cache.destroy?.();
  }

  // Properties to match MultiLayerCache interface
  get layers() {
    return [
      {
        name: 'L1',
        get: this.l1Cache.get.bind(this.l1Cache),
        set: this.l1Cache.set.bind(this.l1Cache),
        delete: this.l1Cache.delete.bind(this.l1Cache),
        clear: this.l1Cache.clear.bind(this.l1Cache),
        has: this.l1Cache.has.bind(this.l1Cache),
        getStats: this.l1Cache.getStats.bind(this.l1Cache),
      }
    ];
  }

  get config() {
    return {
      writeThrough: true,
      readThrough: true,
      invalidationStrategy: 'cascade' as const,
    };
  }
}
