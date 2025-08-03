import { MemoryCache, MemoryCacheConfig } from './memory-cache';
import { RedisCache, RedisCacheConfig } from './redis-cache';
import { CacheOptions, CacheMetrics } from './cache-entry';
import { logger } from '../logging/winston-logger';

export interface CDNCacheConfig {
  enabled: boolean;
  baseUrl: string;
  apiKey: string;
  defaultTTL: number;
  purgeEndpoint: string;
}

export interface MultiLayerCacheConfig {
  l1: MemoryCacheConfig;
  l2: RedisCacheConfig;
  l3?: CDNCacheConfig;
  writeThrough: boolean; // Write to all layers simultaneously
  readThrough: boolean; // Populate upper layers on cache miss
  invalidationStrategy: 'cascade' | 'selective'; // How to handle invalidation
}

export interface CacheLayer {
  name: string;
  get<T>(key: string): Promise<T | null>;
  set<T>(key: string, value: T, options?: CacheOptions): Promise<void>;
  delete(key: string): Promise<boolean>;
  clear(): Promise<void>;
  invalidateByTag(tag: string): Promise<number>;
  invalidateByTags(tags: string[]): Promise<number>;
  has(key: string): Promise<boolean>;
  getStats(): any;
}

export class MultiLayerCache {
  private l1Cache: MemoryCache;
  private l2Cache: RedisCache;
  private l3Cache?: CDNCache;
  private layers: CacheLayer[];
  private metrics = new CacheMetrics();

  constructor(
    private config: MultiLayerCacheConfig,
    redisCache: RedisCache
  ) {
    // Initialize L1 (Memory) Cache
    this.l1Cache = new MemoryCache(config.l1);

    // Initialize L2 (Redis) Cache
    this.l2Cache = redisCache;

    // Initialize L3 (CDN) Cache if configured
    if (config.l3?.enabled) {
      this.l3Cache = new CDNCache(config.l3);
    }

    // Build layers array for iteration
    this.layers = [
      { name: 'L1', ...this.l1Cache },
      { name: 'L2', ...this.l2Cache },
    ];

    if (this.l3Cache) {
      this.layers.push({ name: 'L3', ...this.l3Cache });
    }

    logger.info('Multi-layer cache initialized', {
      layers: this.layers.map((l) => l.name),
      writeThrough: config.writeThrough,
      readThrough: config.readThrough,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const startTime = Date.now();
    let value: T | null = null;
    let hitLayer: string | null = null;

    try {
      // Try each layer in order (L1 -> L2 -> L3)
      for (const layer of this.layers) {
        value = await layer.get<T>(key);

        if (value !== null) {
          hitLayer = layer.name;
          break;
        }
      }

      if (value !== null && hitLayer) {
        this.metrics.recordHit();

        // Populate upper layers if read-through is enabled
        if (this.config.readThrough && hitLayer !== 'L1') {
          await this.populateUpperLayers(key, value, hitLayer);
        }

        logger.debug('Cache hit', {
          key,
          layer: hitLayer,
          duration: Date.now() - startTime,
        });
      } else {
        this.metrics.recordMiss();
        logger.debug('Cache miss', {
          key,
          duration: Date.now() - startTime,
        });
      }

      return value;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Multi-layer cache get error:', { key, error });
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const startTime = Date.now();

    try {
      if (this.config.writeThrough) {
        // Write to all layers simultaneously
        await Promise.allSettled(
          this.layers.map((layer) =>
            layer.set(key, value, options).catch((error) => {
              logger.warn(`Failed to write to ${layer.name}:`, { key, error });
            })
          )
        );
      } else {
        // Write to layers sequentially, starting with L1
        for (const layer of this.layers) {
          try {
            await layer.set(key, value, options);
          } catch (error) {
            logger.warn(`Failed to write to ${layer.name}:`, { key, error });
            // Continue to next layer
          }
        }
      }

      this.metrics.recordSet();
      logger.debug('Cache set completed', {
        key,
        layers: this.layers.map((l) => l.name),
        duration: Date.now() - startTime,
      });
    } catch (error) {
      this.metrics.recordError();
      logger.error('Multi-layer cache set error:', { key, error });
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    const startTime = Date.now();
    let deleted = false;

    try {
      // Delete from all layers
      const results = await Promise.allSettled(
        this.layers.map((layer) => layer.delete(key))
      );

      // Check if any layer successfully deleted the key
      deleted = results.some(
        (result) => result.status === 'fulfilled' && result.value === true
      );

      if (deleted) {
        this.metrics.recordDelete();
      }

      logger.debug('Cache delete completed', {
        key,
        deleted,
        duration: Date.now() - startTime,
      });

      return deleted;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Multi-layer cache delete error:', { key, error });
      return false;
    }
  }

  async clear(): Promise<void> {
    const startTime = Date.now();

    try {
      await Promise.allSettled(
        this.layers.map((layer) =>
          layer.clear().catch((error) => {
            logger.warn(`Failed to clear ${layer.name}:`, error);
          })
        )
      );

      logger.info('Multi-layer cache cleared', {
        duration: Date.now() - startTime,
      });
    } catch (error) {
      this.metrics.recordError();
      logger.error('Multi-layer cache clear error:', error);
      throw error;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    const startTime = Date.now();
    let totalInvalidated = 0;

    try {
      if (this.config.invalidationStrategy === 'cascade') {
        // Invalidate in all layers
        const results = await Promise.allSettled(
          this.layers.map((layer) => layer.invalidateByTag(tag))
        );

        totalInvalidated = results.reduce((sum, result) => {
          return sum + (result.status === 'fulfilled' ? result.value : 0);
        }, 0);
      } else {
        // Selective invalidation - start from lowest layer
        for (let i = this.layers.length - 1; i >= 0; i--) {
          const layer = this.layers[i];
          try {
            const invalidated = await layer.invalidateByTag(tag);
            totalInvalidated += invalidated;
          } catch (error) {
            logger.warn(`Failed to invalidate tag in ${layer.name}:`, {
              tag,
              error,
            });
          }
        }
      }

      logger.info('Tag invalidation completed', {
        tag,
        invalidated: totalInvalidated,
        strategy: this.config.invalidationStrategy,
        duration: Date.now() - startTime,
      });

      return totalInvalidated;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Multi-layer cache invalidate by tag error:', {
        tag,
        error,
      });
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
    try {
      // Check each layer in order
      for (const layer of this.layers) {
        const exists = await layer.has(key);
        if (exists) {
          return true;
        }
      }
      return false;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Multi-layer cache has error:', { key, error });
      return false;
    }
  }

  getStats() {
    const layerStats = this.layers.reduce(
      (stats, layer) => {
        stats[layer.name] = layer.getStats();
        return stats;
      },
      {} as Record<string, any>
    );

    return {
      overall: this.metrics.getStats(),
      layers: layerStats,
      config: {
        writeThrough: this.config.writeThrough,
        readThrough: this.config.readThrough,
        invalidationStrategy: this.config.invalidationStrategy,
      },
    };
  }

  private async populateUpperLayers<T>(
    key: string,
    value: T,
    hitLayer: string
  ): Promise<void> {
    try {
      const hitIndex = this.layers.findIndex((l) => l.name === hitLayer);

      // Populate all layers above the hit layer
      for (let i = 0; i < hitIndex; i++) {
        const layer = this.layers[i];
        try {
          await layer.set(key, value);
          logger.debug(`Populated ${layer.name} from ${hitLayer}`, { key });
        } catch (error) {
          logger.warn(`Failed to populate ${layer.name}:`, { key, error });
        }
      }
    } catch (error) {
      logger.error('Error populating upper layers:', { key, hitLayer, error });
    }
  }

  destroy(): void {
    this.l1Cache.destroy();
    // Redis cache cleanup is handled by the Redis client
    // CDN cache doesn't need cleanup
  }
}

// Simple CDN Cache implementation (placeholder)
class CDNCache implements CacheLayer {
  name = 'L3';
  private metrics = new CacheMetrics();

  constructor(private config: CDNCacheConfig) {}

  async get<T>(key: string): Promise<T | null> {
    // CDN cache is typically read-only and managed externally
    // This is a placeholder implementation
    this.metrics.recordMiss();
    return null;
  }

  async set<T>(key: string, value: T, options?: CacheOptions): Promise<void> {
    // CDN cache writes are typically handled through edge invalidation
    // This is a placeholder implementation
    this.metrics.recordSet();
    logger.debug('CDN cache set (placeholder)', { key });
  }

  async delete(key: string): Promise<boolean> {
    // CDN cache deletion is typically handled through purge APIs
    this.metrics.recordDelete();
    logger.debug('CDN cache delete (placeholder)', { key });
    return true;
  }

  async clear(): Promise<void> {
    logger.debug('CDN cache clear (placeholder)');
  }

  async invalidateByTag(tag: string): Promise<number> {
    logger.debug('CDN cache invalidate by tag (placeholder)', { tag });
    return 0;
  }

  async invalidateByTags(tags: string[]): Promise<number> {
    logger.debug('CDN cache invalidate by tags (placeholder)', { tags });
    return 0;
  }

  async has(key: string): Promise<boolean> {
    return false;
  }

  getStats() {
    return this.metrics.getStats();
  }
}
