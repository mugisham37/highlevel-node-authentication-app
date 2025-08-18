import {
    InvalidationManager,
    PatternBasedInvalidationStrategy,
    TTLInvalidationStrategy,
    TagBasedInvalidationStrategy
} from '../../invalidation';
import { MemoryCache } from '../../providers/memory-cache';

describe('Invalidation Strategies', () => {
  let cache: MemoryCache;
  let invalidationManager: InvalidationManager;

  beforeEach(() => {
    cache = new MemoryCache({ maxSize: 100 });
    invalidationManager = new InvalidationManager();
  });

  afterEach(async () => {
    await cache.clear();
  });

  describe('TTLInvalidationStrategy', () => {
    it('should invalidate entries older than maxAge', async () => {
      const strategy = new TTLInvalidationStrategy();
      
      // Mock cache with timestamp tracking
      const mockCache = {
        keys: jest.fn().mockResolvedValue(['key1', 'key2']),
        getEntry: jest.fn()
          .mockResolvedValueOnce({ createdAt: Date.now() - 7200000 }) // 2 hours ago
          .mockResolvedValueOnce({ createdAt: Date.now() - 1800000 }), // 30 minutes ago
        deleteMany: jest.fn().mockResolvedValue(undefined)
      };

      await strategy.invalidate(mockCache, { maxAge: 3600 }); // 1 hour

      expect(mockCache.deleteMany).toHaveBeenCalledWith(['key1']);
    });

    it('should throw error when maxAge is not provided', async () => {
      const strategy = new TTLInvalidationStrategy();
      
      await expect(strategy.invalidate(cache, {}))
        .rejects.toThrow('TTL invalidation requires maxAge option');
    });
  });

  describe('TagBasedInvalidationStrategy', () => {
    it('should invalidate entries by tags', async () => {
      const strategy = new TagBasedInvalidationStrategy();
      
      const mockCache = {
        invalidateByTag: jest.fn().mockResolvedValue(undefined)
      };

      await strategy.invalidate(mockCache, { tags: ['user:123', 'profile'] });

      expect(mockCache.invalidateByTag).toHaveBeenCalledWith('user:123');
      expect(mockCache.invalidateByTag).toHaveBeenCalledWith('profile');
    });

    it('should throw error when tags are not provided', async () => {
      const strategy = new TagBasedInvalidationStrategy();
      
      await expect(strategy.invalidate(cache, {}))
        .rejects.toThrow('Tag-based invalidation requires tags option');
    });
  });

  describe('PatternBasedInvalidationStrategy', () => {
    it('should invalidate entries matching pattern', async () => {
      const strategy = new PatternBasedInvalidationStrategy();
      
      const mockCache = {
        keys: jest.fn().mockResolvedValue(['user:123', 'user:456']),
        deleteMany: jest.fn().mockResolvedValue(undefined)
      };

      await strategy.invalidate(mockCache, { pattern: 'user:*' });

      expect(mockCache.keys).toHaveBeenCalledWith('user:*');
      expect(mockCache.deleteMany).toHaveBeenCalledWith(['user:123', 'user:456']);
    });
  });

  describe('InvalidationManager', () => {
    it('should register and use strategies', async () => {
      const mockCache = {
        keys: jest.fn().mockResolvedValue([]),
        deleteMany: jest.fn().mockResolvedValue(undefined)
      };

      await invalidationManager.invalidate(mockCache, 'pattern-based', {
        pattern: 'test:*'
      });

      expect(mockCache.keys).toHaveBeenCalledWith('test:*');
    });

    it('should throw error for unknown strategy', async () => {
      await expect(
        invalidationManager.invalidate(cache, 'unknown-strategy', {})
      ).rejects.toThrow('Unknown invalidation strategy: unknown-strategy');
    });

    it('should list available strategies', () => {
      const strategies = invalidationManager.listStrategies();
      expect(strategies).toContain('ttl');
      expect(strategies).toContain('tag-based');
      expect(strategies).toContain('pattern-based');
    });
  });
});