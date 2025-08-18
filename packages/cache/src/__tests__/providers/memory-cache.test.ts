import { MemoryCache } from '../../providers/memory-cache';

describe('MemoryCache', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache({
      maxSize: 100,
      maxMemory: 1024 * 1024, // 1MB
      defaultTTL: 300,
      cleanupInterval: 60000
    });
  });

  afterEach(async () => {
    await cache.clear();
  });

  describe('basic operations', () => {
    it('should set and get values', async () => {
      await cache.set('key1', 'value1');
      const result = await cache.get('key1');
      expect(result).toBe('value1');
    });

    it('should return null for non-existent keys', async () => {
      const result = await cache.get('non-existent');
      expect(result).toBeNull();
    });

    it('should delete values', async () => {
      await cache.set('key1', 'value1');
      await cache.delete('key1');
      const result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should check if key exists', async () => {
      await cache.set('key1', 'value1');
      const exists = await cache.has('key1');
      expect(exists).toBe(true);
      
      const notExists = await cache.has('non-existent');
      expect(notExists).toBe(false);
    });
  });

  describe('TTL functionality', () => {
    it('should expire entries after TTL', async () => {
      await cache.set('key1', 'value1', { ttl: 1 }); // 1 second
      
      // Should exist immediately
      let result = await cache.get('key1');
      expect(result).toBe('value1');
      
      // Wait for expiration
      await new Promise(resolve => setTimeout(resolve, 1100));
      
      result = await cache.get('key1');
      expect(result).toBeNull();
    });

    it('should use default TTL when not specified', async () => {
      await cache.set('key1', 'value1');
      const entry = cache.getEntry('key1');
      expect(entry?.ttl).toBe(300);
    });
  });

  describe('memory management', () => {
    it('should enforce max size limit', async () => {
      const smallCache = new MemoryCache({ maxSize: 2 });
      
      await smallCache.set('key1', 'value1');
      await smallCache.set('key2', 'value2');
      await smallCache.set('key3', 'value3'); // Should evict oldest
      
      const result1 = await smallCache.get('key1');
      const result3 = await smallCache.get('key3');
      
      expect(result1).toBeNull(); // Evicted
      expect(result3).toBe('value3'); // Still exists
    });
  });

  describe('statistics', () => {
    it('should track hit/miss statistics', async () => {
      await cache.set('key1', 'value1');
      
      // Hit
      await cache.get('key1');
      
      // Miss
      await cache.get('non-existent');
      
      const stats = cache.getStats();
      expect(stats.hits).toBe(1);
      expect(stats.misses).toBe(1);
      expect(stats.hitRate).toBe(0.5);
    });
  });
});