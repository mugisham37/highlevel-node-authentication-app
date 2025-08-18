/**
 * Cache warming strategies for preloading frequently accessed data
 */

export interface CacheWarmingStrategy {
  name: string;
  warm(cache: any, options: WarmingOptions): Promise<void>;
}

export interface WarmingOptions {
  keys?: string[];
  dataLoader?: (key: string) => Promise<any>;
  batchSize?: number;
  concurrency?: number;
  ttl?: number;
  tags?: string[];
}

/**
 * Preload warming strategy
 * Preloads specific keys with data
 */
export class PreloadWarmingStrategy implements CacheWarmingStrategy {
  name = 'preload';

  async warm(cache: any, options: WarmingOptions): Promise<void> {
    if (!options.keys || !options.dataLoader) {
      throw new Error('Preload warming requires keys and dataLoader');
    }

    const batchSize = options.batchSize || 10;
    const concurrency = options.concurrency || 5;

    // Process keys in batches
    for (let i = 0; i < options.keys.length; i += batchSize) {
      const batch = options.keys.slice(i, i + batchSize);
      
      // Process batch with limited concurrency
      const promises = batch.map(async (key) => {
        try {
          const data = await options.dataLoader!(key);
          await cache.set(key, data, {
            ttl: options.ttl || 3600,
            tags: options.tags || []
          });
        } catch (error) {
          console.error(`Failed to warm cache for key ${key}:`, error);
        }
      });

      // Wait for batch to complete with concurrency limit
      await this.limitConcurrency(promises, concurrency);
    }
  }

  private async limitConcurrency<T>(
    promises: Promise<T>[],
    limit: number
  ): Promise<T[]> {
    const results: T[] = [];
    
    for (let i = 0; i < promises.length; i += limit) {
      const batch = promises.slice(i, i + limit);
      const batchResults = await Promise.allSettled(batch);
      
      batchResults.forEach((result, index) => {
        if (result.status === 'fulfilled') {
          results[i + index] = result.value;
        }
      });
    }
    
    return results;
  }
}/*
*
 * Scheduled warming strategy
 * Warms cache on a schedule
 */
export class ScheduledWarmingStrategy implements CacheWarmingStrategy {
  name = 'scheduled';
  private intervals: Map<string, NodeJS.Timeout> = new Map();

  async warm(cache: any, options: WarmingOptions): Promise<void> {
    // This is typically set up with a scheduler
    throw new Error('Scheduled warming should be set up with scheduleWarming method');
  }

  scheduleWarming(
    cache: any,
    intervalMs: number,
    options: WarmingOptions
  ): void {
    const intervalId = setInterval(async () => {
      try {
        const preloadStrategy = new PreloadWarmingStrategy();
        await preloadStrategy.warm(cache, options);
      } catch (error) {
        console.error('Scheduled cache warming failed:', error);
      }
    }, intervalMs);

    this.intervals.set(`${cache.name || 'default'}`, intervalId);
  }

  stopWarming(cacheName: string = 'default'): void {
    const intervalId = this.intervals.get(cacheName);
    if (intervalId) {
      clearInterval(intervalId);
      this.intervals.delete(cacheName);
    }
  }
}

/**
 * Cache warming manager
 */
export class CacheWarmingManager {
  private strategies: Map<string, CacheWarmingStrategy> = new Map();

  constructor() {
    this.registerStrategy(new PreloadWarmingStrategy());
    this.registerStrategy(new ScheduledWarmingStrategy());
  }

  registerStrategy(strategy: CacheWarmingStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  async warm(
    cache: any,
    strategyName: string,
    options: WarmingOptions
  ): Promise<void> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown warming strategy: ${strategyName}`);
    }

    await strategy.warm(cache, options);
  }

  getStrategy(name: string): CacheWarmingStrategy | undefined {
    return this.strategies.get(name);
  }
}