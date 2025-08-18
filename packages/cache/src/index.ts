// Core cache providers
export * from './providers';

// Cache strategies
export * from './strategies';

// Cache decorators
export * from './decorators';

// Serialization
export * from './serializers';

// Invalidation strategies
export * from './invalidation';

// Cache warming
export * from './warming';

// Partitioning
export * from './partitioning';

// Compression
export * from './compression';

// Monitoring
export * from './monitoring';

// Re-export main cache factory and types
export {
    CacheFactory,
    createCacheSystem,
    defaultCacheConfig,
    type CacheSystemConfig
} from './providers/cache-factory';

export {
    RedisClient,
    createRedisClient,
    getRedisClient,
    type RedisConfig
} from './providers/redis-client';

export {
    MemoryCache,
    type MemoryCacheConfig
} from './providers/memory-cache';

export {
    RedisCache,
    type RedisCacheConfig
} from './providers/redis-cache';

export {
    MultiLayerCache,
    type MultiLayerCacheConfig
} from './strategies/multi-layer-cache';

export {
    SessionStorage, type DeviceInfo, type SessionData, type SessionStorageConfig
} from './providers/session-storage';

export {
    CacheEntry, type CacheMetrics, type CacheOptions, type CacheStats
} from './providers/cache-entry';
