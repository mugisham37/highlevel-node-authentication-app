import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryCache } from '../../../infrastructure/cache/memory-cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    const config = {
      maxSize: 100,
      maxMemory: 1024 * 1024, // 1MB
      cleanupInterval: 10000,
      defaultTTL: 60,
    };
    cache = new MemoryCache(config);
  });

  afterEach(() => {
    cache.destroy();
  });

  describe('Basic Operations', () => {
    it('should store and retrieve data', async () => {
      const key = 'test-key';
      const value = { message: 'Hello, World!', timestamp: Date.now() };

      await cache.set(key, value);
      const retrieved = await cache.get(key);

      expect(retrieved).toEqual(value);
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent-key');
      expect(result).toBeNull();
    });

    it('should delete cached data', async () => {
      const key = 'delete-test';
      const value = 'test-value';

      await cache.set(key, value);
      expect(await cache.get(key)).toBe(value);

      const deleted = await cache.delete(key);
      expect(deleted).toBe(true);
      expect(await cache.get(key)).toBeNull();
    });

    it('should check if key exists', async () => {
      const key = 'exists-test';
      const value = 'test-value';

      expect(await cache.has(key)).toBe(false);

      await cache.set(key, value);
      expect(await cache.has(key)).toBe(true);
    });

    it('should clear all cached data', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      expect(await cache.size()).toBe(3);

      await cache.clear();
      expect(await cache.size()).toBe(0);
    });

    it('should return all keys', async () => {
      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');
      await cache.set('key3', 'value3');

      const keys = await cache.keys();
      expect(keys).toHaveLength(3);
      expect(keys).toContain('key1');
      expect(keys).toContain('key2');
      expect(keys).toContain('key3');
    });
  });

  describe('TTL and Expiration', () => {
    it('should expire entries after TTL', async () => {
      const key = 'ttl-test';
      const value = 'test-value';
      const ttl = 1; // 1 second

      await cache.set(key, value, { ttl });
      expect(await cache.get(key)).toBe(value);

      // Wait for expiration
      await new Promise((resolve) => setTimeout(resolve, 1100));
      expect(await cache.get(key)).toBeNull();
    });

    it('should handle entries without TTL', async () => {
      const key = 'no-ttl-test';
      const value = 'test-value';

      await cache.set(key, value, { ttl: 0 }); // No expiration
      expect(await cache.get(key)).toBe(value);

      // Should still be there after some time
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(await cache.get(key)).toBe(value);
    });
  });

  describe('Tag-based Invalidation', () => {
    it('should invalidate entries by tag', async () => {
      await cache.set('key1', 'value1', { tags: ['user:123'] });
      await cache.set('key2', 'value2', { tags: ['user:123'] });
      await cache.set('key3', 'value3', { tags: ['user:456'] });

      const invalidated = await cache.invalidateByTag('user:123');
      expect(invalidated).toBe(2);

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBe('value3');
    });

    it('should invalidate entries by multiple tags', async () => {
      await cache.set('key1', 'value1', { tags: ['user:123', 'session'] });
      await cache.set('key2', 'value2', { tags: ['user:456', 'session'] });
      await cache.set('key3', 'value3', { tags: ['user:789'] });

      const invalidated = await cache.invalidateByTags(['user:123', 'session']);
      expect(invalidated).toBe(2);

      expect(await cache.get('key1')).toBeNull();
      expect(await cache.get('key2')).toBeNull();
      expect(await cache.get('key3')).toBe('value3');
    });

    it('should handle invalidation of non-existent tags', async () => {
      const invalidated = await cache.invalidateByTag('non-existent-tag');
      expect(invalidated).toBe(0);
    });
  });

  describe('Statistics', () => {
    it('should track cache statistics', async () => {
      // Perform some operations
      await cache.set('key1', 'value1');
      await cache.get('key1'); // Hit
      await cache.get('key2'); // Miss
      await cache.delete('key1');

      const stats = cache.getStats();

      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.sets).toBe(1);
      expect(stats.deletes).toBe(1);
      expect(stats.hitRate).toBe(0.5); // 1 hit out of 2 requests
    });

    it('should track cache size', async () => {
      const stats1 = cache.getStats();
      expect(stats1.size).toBe(0);

      await cache.set('key1', 'value1');
      await cache.set('key2', 'value2');

      const stats2 = cache.getStats();
      expect(stats2.size).toBe(2);
    });
  });

  describe('LRU Eviction', () => {
    it('should evict least recently used entries when size limit is reached', async () => {
      // Create cache with small size limit
      const smallCache = new MemoryCache({
        maxSize: 2,
        maxMemory: 1024 * 1024,
        cleanupInterval: 10000,
        defaultTTL: 60,
      });

      try {
        await smallCache.set('key1', 'value1');
        await smallCache.set('key2', 'value2');

        // Access key1 to make it more recently used
        await smallCache.get('key1');

        // Add key3, should evict key2 (least recently used)
        await smallCache.set('key3', 'value3');

        expect(await smallCache.get('key1')).toBe('value1'); // Should still exist
        expect(await smallCache.get('key2')).toBeNull(); // Should be evicted
        expect(await smallCache.get('key3')).toBe('value3'); // Should exist
      } finally {
        smallCache.destroy();
      }
    });
  });
});
