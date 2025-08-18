# @company/cache

Comprehensive caching infrastructure package with Redis, memory cache, and multi-layer strategies for the fullstack monolith.

## Features

- **Multi-layer caching**: Memory, Redis, and CDN support
- **Cache decorators**: `@Cacheable`, `@CacheEvict`, `@CachePut`
- **Invalidation strategies**: TTL, tag-based, pattern-based, event-driven
- **Cache warming**: Preload and scheduled warming strategies
- **Compression**: GZIP and Deflate compression support
- **Partitioning**: Hash-based and consistent hashing
- **Serialization**: JSON, Binary, and MessagePack serializers
- **Monitoring**: Circuit breaker, metrics, and health checks

## Installation

```bash
npm install @company/cache
```

## Quick Start

```typescript
import { createCacheSystem, Cacheable } from '@company/cache';

// Initialize cache system
const cacheFactory = await createCacheSystem();
const cache = cacheFactory.getMultiLayerCache();

// Basic operations
await cache.set('user:123', userData, { ttl: 3600, tags: ['user'] });
const user = await cache.get('user:123');
await cache.invalidateByTag('user');

// Using decorators
class UserService {
  @Cacheable({ key: 'user-profile', ttl: 3600 })
  async getUserProfile(userId: string) {
    return await this.database.findUser(userId);
  }

  @CacheEvict({ tags: ['user'] })
  async updateUser(userId: string, data: any) {
    return await this.database.updateUser(userId, data);
  }
}
```

## Configuration

```typescript
const cacheConfig = {
  redis: {
    host: 'localhost',
    port: 6379,
    keyPrefix: 'app:',
    defaultTTL: 3600
  },
  memory: {
    maxSize: 10000,
    maxMemory: 100 * 1024 * 1024, // 100MB
    defaultTTL: 300
  }
};
```

## API Reference

### Cache Providers

- `MemoryCache`: In-memory LRU cache
- `RedisCache`: Redis-based distributed cache
- `MultiLayerCache`: Coordinated multi-layer caching

### Decorators

- `@Cacheable(options)`: Cache method results
- `@CacheEvict(options)`: Invalidate cache entries
- `@CachePut(options)`: Update cache with method result

### Invalidation Strategies

- `TTLInvalidationStrategy`: Time-based expiration
- `TagBasedInvalidationStrategy`: Tag-based invalidation
- `PatternBasedInvalidationStrategy`: Pattern matching
- `EventDrivenInvalidationStrategy`: Event-based invalidation

### Cache Warming

- `PreloadWarmingStrategy`: Preload specific keys
- `ScheduledWarmingStrategy`: Scheduled cache warming

## Testing

```bash
npm test
npm run test:coverage
```

## License

Private - Internal use only