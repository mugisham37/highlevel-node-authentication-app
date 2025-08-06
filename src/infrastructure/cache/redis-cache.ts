import { RedisClient } from './redis-client';
import { CircuitBreaker } from './circuit-breaker';
import { CacheOptions, CacheMetrics } from './cache-entry';
import { logger } from '../logging/winston-logger';
import { Redis } from 'ioredis';

export interface RedisCacheConfig {
  keyPrefix: string;
  defaultTTL: number;
  maxRetries: number;
  retryDelay: number;
  compression: {
    enabled: boolean;
    threshold: number; // Compress if data size > threshold bytes
  };
  circuitBreaker: {
    enabled: boolean;
    failureThreshold: number;
    recoveryTimeout: number;
  };
}

export class RedisCache {
  private circuitBreaker: CircuitBreaker;
  private metrics = new CacheMetrics();

  constructor(
    private redisClient: RedisClient,
    private config: RedisCacheConfig
  ) {
    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: config.circuitBreaker.failureThreshold,
      recoveryTimeout: config.circuitBreaker.recoveryTimeout,
    });
  }

  async get<T>(key: string): Promise<T | null> {
    const prefixedKey = this.getPrefixedKey(key);

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        const data = await client.get(prefixedKey);
        return data;
      });

      if (!result) {
        this.metrics.recordMiss();
        return null;
      }

      const parsed = this.deserialize<T>(result);
      this.metrics.recordHit();
      return parsed;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache get error:', { key, error });
      return null;
    }
  }

  async set<T>(
    key: string,
    value: T,
    options: CacheOptions = {}
  ): Promise<void> {
    const prefixedKey = this.getPrefixedKey(key);
    const ttl = options.ttl || this.config.defaultTTL;

    try {
      await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        const serialized = this.serialize(value);

        if (ttl > 0) {
          await client.setex(prefixedKey, ttl, serialized);
        } else {
          await client.set(prefixedKey, serialized);
        }

        // Store tags for invalidation if provided
        if (options.tags && options.tags.length > 0) {
          await this.storeTags(key, options.tags, ttl);
        }
      });

      this.metrics.recordSet();
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache set error:', { key, error });
      throw error;
    }
  }

  async delete(key: string): Promise<boolean> {
    const prefixedKey = this.getPrefixedKey(key);

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        const deleted = await client.del(prefixedKey);
        return deleted > 0;
      });

      if (result) {
        // Also remove from tag indexes
        await this.removeFromTagIndexes(key);
        this.metrics.recordDelete();
      }

      return result;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache delete error:', { key, error });
      return false;
    }
  }

  async clear(): Promise<void> {
    try {
      await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        const pattern = `${this.config.keyPrefix}*`;

        if (client instanceof Redis) {
          // Single Redis instance
          const keys = await client.keys(pattern);
          if (keys.length > 0) {
            await client.del(...keys);
          }
        } else {
          // Redis Cluster
          const nodes = client.nodes('master');
          await Promise.all(
            nodes.map(async (node) => {
              const keys = await node.keys(pattern);
              if (keys.length > 0) {
                await node.del(...keys);
              }
            })
          );
        }
      });

      logger.info('Redis cache cleared');
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache clear error:', error);
      throw error;
    }
  }

  async invalidateByTag(tag: string): Promise<number> {
    const tagKey = this.getTagKey(tag);

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();

        // Get all keys with this tag
        const keys = await client.smembers(tagKey);

        if (keys.length === 0) {
          return 0;
        }

        // Delete all keys
        const prefixedKeys = keys.map((key) => this.getPrefixedKey(key));
        await client.del(...prefixedKeys);

        // Remove the tag index
        await client.del(tagKey);

        return keys.length;
      });

      logger.info(`Invalidated ${result} entries by tag: ${tag}`);
      return result;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache invalidate by tag error:', { tag, error });
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
    const prefixedKey = this.getPrefixedKey(key);

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        const exists = await client.exists(prefixedKey);
        return exists === 1;
      });

      return result;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache has error:', { key, error });
      return false;
    }
  }

  async keys(pattern?: string): Promise<string[]> {
    const searchPattern = pattern
      ? `${this.config.keyPrefix}${pattern}`
      : `${this.config.keyPrefix}*`;

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();

        if (client instanceof Redis) {
          return await client.keys(searchPattern);
        } else {
          // Redis Cluster
          const nodes = client.nodes('master');
          const allKeys = await Promise.all(
            nodes.map((node) => node.keys(searchPattern))
          );
          return allKeys.flat();
        }
      });

      // Remove prefix from keys
      return result.map((key) => key.replace(this.config.keyPrefix, ''));
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache keys error:', { pattern, error });
      return [];
    }
  }

  async ttl(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.ttl(prefixedKey);
      });

      return result;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache TTL error:', { key, error });
      return -1;
    }
  }

  async expire(key: string, ttl: number): Promise<boolean> {
    const prefixedKey = this.getPrefixedKey(key);

    try {
      const result = await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        const success = await client.expire(prefixedKey, ttl);
        return success === 1;
      });

      return result;
    } catch (error) {
      this.metrics.recordError();
      logger.error('Redis cache expire error:', { key, ttl, error });
      return false;
    }
  }

  getStats() {
    return {
      ...this.metrics.getStats(),
      circuitBreaker: this.circuitBreaker.getMetrics(),
    };
  }

  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    if (!this.config.circuitBreaker.enabled) {
      return await operation();
    }

    return await this.circuitBreaker.execute(operation, fallback);
  }

  private serialize<T>(value: T): string {
    const data = JSON.stringify(value);

    if (
      this.config.compression.enabled &&
      data.length > this.config.compression.threshold
    ) {
      // In a real implementation, you would use a compression library like zlib
      // For now, we'll just mark it as compressed
      return JSON.stringify({
        compressed: true,
        data: data, // In reality, this would be compressed
      });
    }

    return data;
  }

  private deserialize<T>(data: string): T {
    try {
      const parsed = JSON.parse(data);

      if (parsed.compressed) {
        // In a real implementation, you would decompress here
        return JSON.parse(parsed.data);
      }

      return parsed;
    } catch (error) {
      logger.error('Redis cache deserialize error:', error);
      throw error;
    }
  }

  private async storeTags(
    key: string,
    tags: string[],
    ttl: number
  ): Promise<void> {
    const client = this.redisClient.getClient();

    for (const tag of tags) {
      const tagKey = this.getTagKey(tag);
      await client.sadd(tagKey, key);

      if (ttl > 0) {
        await client.expire(tagKey, ttl);
      }
    }
  }

  private async removeFromTagIndexes(key: string): Promise<void> {
    try {
      const client = this.redisClient.getClient();
      const tagPattern = this.getTagKey('*');

      let tagKeys: string[];
      if (client instanceof Redis) {
        tagKeys = await client.keys(tagPattern);
      } else {
        const nodes = client.nodes('master');
        const allTagKeys = await Promise.all(
          nodes.map((node) => node.keys(tagPattern))
        );
        tagKeys = allTagKeys.flat();
      }

      for (const tagKey of tagKeys) {
        await client.srem(tagKey, key);
      }
    } catch (error) {
      logger.error('Error removing key from tag indexes:', { key, error });
    }
  }

  private getPrefixedKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  private getTagKey(tag: string): string {
    return `${this.config.keyPrefix}tag:${tag}`;
  }

  // Additional Redis operations for Dead Letter Queue Service
  async sadd(key: string, ...members: string[]): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.sadd(prefixedKey, ...members);
      });
    } catch (error) {
      logger.error('Redis sadd error:', { key, error });
      throw error;
    }
  }

  async smembers(key: string): Promise<string[]> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.smembers(prefixedKey);
      });
    } catch (error) {
      logger.error('Redis smembers error:', { key, error });
      throw error;
    }
  }

  async srem(key: string, ...members: string[]): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.srem(prefixedKey, ...members);
      });
    } catch (error) {
      logger.error('Redis srem error:', { key, error });
      throw error;
    }
  }

  async scard(key: string): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.scard(prefixedKey);
      });
    } catch (error) {
      logger.error('Redis scard error:', { key, error });
      throw error;
    }
  }

  async hset(key: string, field: string, value: string): Promise<number>;
  async hset(key: string, hash: Record<string, string>): Promise<number>;
  async hset(key: string, ...args: (string | Record<string, string>)[]): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        if (args.length === 2 && typeof args[0] === 'string' && typeof args[1] === 'string') {
          return await client.hset(prefixedKey, args[0], args[1]);
        } else if (args.length === 1 && typeof args[0] === 'object') {
          return await client.hset(prefixedKey, args[0]);
        } else {
          throw new Error('Invalid hset arguments');
        }
      });
    } catch (error) {
      logger.error('Redis hset error:', { key, error });
      throw error;
    }
  }

  async hget(key: string, field: string): Promise<string | null> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.hget(prefixedKey, field);
      });
    } catch (error) {
      logger.error('Redis hget error:', { key, field, error });
      throw error;
    }
  }

  async hgetall(key: string): Promise<Record<string, string>> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.hgetall(prefixedKey);
      });
    } catch (error) {
      logger.error('Redis hgetall error:', { key, error });
      throw error;
    }
  }

  async del(...keys: string[]): Promise<number> {
    const prefixedKeys = keys.map(key => this.getPrefixedKey(key));
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.del(...prefixedKeys);
      });
    } catch (error) {
      logger.error('Redis del error:', { keys, error });
      throw error;
    }
  }

  async hincrby(key: string, field: string, increment: number): Promise<number> {
    const prefixedKey = this.getPrefixedKey(key);
    try {
      return await this.executeWithCircuitBreaker(async () => {
        const client = this.redisClient.getClient();
        return await client.hincrby(prefixedKey, field, increment);
      });
    } catch (error) {
      logger.error('Redis hincrby error:', { key, field, increment, error });
      throw error;
    }
  }
}
