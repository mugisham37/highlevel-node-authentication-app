import { CacheEntry, CacheOptions, CacheMetrics } from './cache-entry';
import { logger } from '../logging/winston-logger';

export interface MemoryCacheConfig {
  maxSize: number; // Maximum number of entries
  maxMemory: number; // Maximum memory usage in bytes
  cleanupInterval: number; // Cleanup interval in milliseconds
  defaultTTL: number; // Default TTL in seconds
}

export class MemoryCache {
  private cache = new Map<string, CacheEntry>();
  private accessOrder = new Map<string, number>(); // For LRU eviction
  private tagIndex = new Map<string, Set<string>>(); // Tag to keys mapping
  private metrics = new CacheMetrics();
  private cleanupTimer: NodeJS.Timeout | null = null;
  private accessCounter = 0;

  constructor(private config: MemoryCacheConfig) {
    this.startCleanupTimer();
  }

  async get<T>(key: string): Promise<T | null> {
    try {
      const entry = this.cache.get(key);

      if (!entry) {
        this.metrics.recordMiss();
        return null;
      }

      if (entry.isExpired()) {
        this.delete(key);
        this.metrics.recordMiss();
        return null;
      }

      // Update access order for LRU
      this.accessOrder.set(key, ++this.accessCounter);
      this.metrics.recordHit();

      return entry.value as T;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Memory cache get error:', error);
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    try {
      const ttl = options.ttl || this.config.defaultTTL;
      const entry = new CacheEntry(value, { ...options, ttl });

      // Check if we need to evict entries
      await this.ensureCapacity();

      // Remove old entry if exists
      this.delete(key);

      // Add new entry
      this.cache.set(key, entry);
      this.accessOrder.set(key, ++this.accessCounter);

      // Update tag index
      if (entry.tags.length > 0) {
        entry.tags.forEach((tag) => {
          if (!this.tagIndex.has(tag)) {
            this.tagIndex.set(tag, new Set());
          }
          this.tagIndex.get(tag)!.add(key);
        });
      }

      this.metrics.recordSet();
    } catch (error) {
      this.metrics.recordError();
      logger.error('Memory cache set error:', error);
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    try {
      const entry = this.cache.get(key);

      if (!entry) {
        return false;
      }

      // Remove from cache
      this.cache.delete(key);
      this.accessOrder.delete(key);

      // Remove from tag index
      entry.tags.forEach((tag) => {
        const tagSet = this.tagIndex.get(tag);
        if (tagSet) {
          tagSet.delete(key);
          if (tagSet.size === 0) {
            this.tagIndex.delete(tag);
          }
        }
      });

      this.metrics.recordDelete();
      return true;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Memory cache delete error:', error);
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      this.cache.clear();
      this.accessOrder.clear();
      this.tagIndex.clear();
      this.accessCounter = 0;
      logger.info('Memory cache cleared');
    } catch (error) {
      this.metrics.recordError();
      logger.error('Memory cache clear error:', error);
      throw error;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    try {
      const keys = this.tagIndex.get(tag);
      if (!keys) {
        return 0;
      }

      let invalidated = 0;
      for (const key of keys) {
        if (await this.delete(key)) {
          invalidated++;
        }
      }

      logger.info(`Invalidated ${invalidated} entries by tag: ${tag}`);
      return invalidated;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Memory cache invalidate by tag error:', error);
      return 0;
    }
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    let totalInvalidated = 0;
    for (const tag of tags) {
      totalInvalidated += await this.invalidateByTag(tag);
    }
    return totalInvalidated;
  }

  async has(key: string): Promise<boolean> {
    const entry = this.cache.get(key);
    if (!entry) return false;

    if (entry.isExpired()) {
      await this.delete(key);
      return false;
    }

    return true;
  }

  async keys(): Promise<string[]> {
    const validKeys: string[] = [];

    for (const [key, entry] of this.cache.entries()) {
      if (!entry.isExpired()) {
        validKeys.push(key);
      } else {
        // Clean up expired entry
        await this.delete(key);
      }
    }

    return validKeys;
  }

  async size(): Promise<number> {
    await this.cleanupExpired();
    return this.cache.size;
  }

  getStats() {
    return {
      ...this.metrics.getStats(),
      size: this.cache.size,
      maxSize: this.config.maxSize,
      memoryUsage: this.getMemoryUsage(),
      maxMemory: this.config.maxMemory,
    };
  }

  private async ensureCapacity(): Promise<void> {
    // Check size limit
    if (this.cache.size >= this.config.maxSize) {
      await this.evictLRU();
    }

    // Check memory limit (simplified estimation)
    const memoryUsage = this.getMemoryUsage();
    if (memoryUsage >= this.config.maxMemory) {
      await this.evictLRU();
    }
  }

  private async evictLRU(): Promise<void> {
    if (this.cache.size === 0) return;

    // Find the least recently used key
    let lruKey: string | null = null;
    let lruAccess = Infinity;

    for (const [key, access] of this.accessOrder.entries()) {
      if (access < lruAccess) {
        lruAccess = access;
        lruKey = key;
      }
    }

    if (lruKey) {
      await this.delete(lruKey);
      this.metrics.recordEviction();
      logger.debug(`Evicted LRU entry: ${lruKey}`);
    }
  }

  private getMemoryUsage(): number {
    // Simplified memory usage estimation
    let totalSize = 0;

    for (const [key, entry] of this.cache.entries()) {
      totalSize += key.length * 2; // UTF-16 characters
      totalSize += JSON.stringify(entry.value).length * 2;
      totalSize += 100; // Overhead estimation
    }

    return totalSize;
  }

  private startCleanupTimer(): void {
    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired().catch((error) => {
        logger.error('Memory cache cleanup error:', error);
      });
    }, this.config.cleanupInterval);
  }

  private async cleanupExpired(): Promise<number> {
    let cleaned = 0;
    const now = Date.now();

    for (const [key, entry] of this.cache.entries()) {
      if (entry.isExpired()) {
        await this.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug(`Cleaned up ${cleaned} expired entries from memory cache`);
    }

    return cleaned;
  }

  destroy(): void {
    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
      this.cleanupTimer = null;
    }
    this.clear();
  }
}
