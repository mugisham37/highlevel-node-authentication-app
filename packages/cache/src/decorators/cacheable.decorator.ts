import { CacheOptions } from '../providers/cache-entry';

/**
 * Cacheable decorator for method-level caching
 * Automatically caches method results based on parameters
 */
export function Cacheable(options: CacheableOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const cacheKey = options.key || `${target.constructor.name}:${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const cache = this.cacheService || global.cacheService;
      if (!cache) {
        return originalMethod.apply(this, args);
      }

      const key = generateCacheKey(cacheKey, args, options.keyGenerator);
      
      // Try to get from cache first
      const cached = await cache.get(key);
      if (cached !== null && cached !== undefined) {
        return cached;
      }

      // Execute original method
      const result = await originalMethod.apply(this, args);
      
      // Cache the result
      await cache.set(key, result, {
        ttl: options.ttl || 300,
        tags: options.tags || [],
        ...options.cacheOptions
      });

      return result;
    };

    return descriptor;
  };
}

/**
 * CacheEvict decorator for invalidating cache entries
 */
export function CacheEvict(options: CacheEvictOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      const cache = this.cacheService || global.cacheService;
      if (cache) {
        if (options.allEntries) {
          await cache.clear();
        } else if (options.key) {
          const key = generateCacheKey(options.key, args, options.keyGenerator);
          await cache.delete(key);
        } else if (options.tags) {
          for (const tag of options.tags) {
            await cache.invalidateByTag(tag);
          }
        }
      }

      return result;
    };

    return descriptor;
  };
}

/**
 * CachePut decorator for updating cache entries
 */
export function CachePut(options: CachePutOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const cacheKey = options.key || `${target.constructor.name}:${propertyKey}`;

    descriptor.value = async function (...args: any[]) {
      const result = await originalMethod.apply(this, args);
      
      const cache = this.cacheService || global.cacheService;
      if (cache) {
        const key = generateCacheKey(cacheKey, args, options.keyGenerator);
        await cache.set(key, result, {
          ttl: options.ttl || 300,
          tags: options.tags || [],
          ...options.cacheOptions
        });
      }

      return result;
    };

    return descriptor;
  };
}

// Helper function to generate cache keys
function generateCacheKey(
  baseKey: string,
  args: any[],
  keyGenerator?: (args: any[]) => string
): string {
  if (keyGenerator) {
    return `${baseKey}:${keyGenerator(args)}`;
  }
  
  const argsKey = args
    .map(arg => {
      if (typeof arg === 'object' && arg !== null) {
        return JSON.stringify(arg);
      }
      return String(arg);
    })
    .join(':');
    
  return `${baseKey}:${argsKey}`;
}

// Type definitions
export interface CacheableOptions {
  key?: string;
  ttl?: number;
  tags?: string[];
  keyGenerator?: (args: any[]) => string;
  cacheOptions?: Partial<CacheOptions>;
}

export interface CacheEvictOptions {
  key?: string;
  tags?: string[];
  allEntries?: boolean;
  keyGenerator?: (args: any[]) => string;
}

export interface CachePutOptions {
  key?: string;
  ttl?: number;
  tags?: string[];
  keyGenerator?: (args: any[]) => string;
  cacheOptions?: Partial<CacheOptions>;
}