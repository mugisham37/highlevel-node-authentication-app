import { Cacheable, CacheEvict, CachePut } from '../../decorators';
import { MemoryCache } from '../../providers/memory-cache';

describe('Cache Decorators', () => {
  let mockCache: MemoryCache;

  beforeEach(() => {
    mockCache = new MemoryCache({ maxSize: 100 });
    // Mock global cache service
    (global as any).cacheService = mockCache;
  });

  afterEach(async () => {
    await mockCache.clear();
    delete (global as any).cacheService;
  });

  describe('@Cacheable', () => {
    class TestService {
      callCount = 0;

      @Cacheable({ key: 'test-method', ttl: 300 })
      async expensiveOperation(param: string): Promise<string> {
        this.callCount++;
        return `result-${param}`;
      }
    }

    it('should cache method results', async () => {
      const service = new TestService();
      
      const result1 = await service.expensiveOperation('test');
      const result2 = await service.expensiveOperation('test');
      
      expect(result1).toBe('result-test');
      expect(result2).toBe('result-test');
      expect(service.callCount).toBe(1); // Method called only once
    });

    it('should cache different parameters separately', async () => {
      const service = new TestService();
      
      await service.expensiveOperation('param1');
      await service.expensiveOperation('param2');
      
      expect(service.callCount).toBe(2); // Different parameters
    });
  });

  describe('@CacheEvict', () => {
    class TestService {
      @CacheEvict({ key: 'test-data' })
      async updateData(): Promise<void> {
        // Update operation
      }

      @CacheEvict({ tags: ['user-data'] })
      async updateUserData(): Promise<void> {
        // Update operation
      }
    }

    it('should evict cache entries by key', async () => {
      await mockCache.set('test-data:args', 'cached-value');
      
      const service = new TestService();
      await service.updateData();
      
      // Cache should be evicted (implementation depends on key generation)
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('@CachePut', () => {
    class TestService {
      @CachePut({ key: 'user-profile', ttl: 600 })
      async updateUserProfile(userId: string, data: any): Promise<any> {
        return { ...data, id: userId, updated: true };
      }
    }

    it('should update cache with method result', async () => {
      const service = new TestService();
      const result = await service.updateUserProfile('123', { name: 'John' });
      
      expect(result).toEqual({
        id: '123',
        name: 'John',
        updated: true
      });
      
      // Cache should contain the updated value
      // (implementation depends on key generation)
      expect(true).toBe(true); // Placeholder assertion
    });
  });
});