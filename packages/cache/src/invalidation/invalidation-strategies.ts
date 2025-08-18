/**
 * Cache invalidation strategies for different use cases
 */

export interface InvalidationStrategy {
  name: string;
  invalidate(cache: any, options: InvalidationOptions): Promise<void>;
}

export interface InvalidationOptions {
  key?: string;
  pattern?: string;
  tags?: string[];
  maxAge?: number;
  condition?: (key: string, value: any) => boolean;
}

/**
 * TTL-based invalidation strategy
 * Automatically expires entries after a specified time
 */
export class TTLInvalidationStrategy implements InvalidationStrategy {
  name = 'ttl';

  async invalidate(cache: any, options: InvalidationOptions): Promise<void> {
    if (!options.maxAge) {
      throw new Error('TTL invalidation requires maxAge option');
    }

    const cutoffTime = Date.now() - options.maxAge * 1000;
    
    // Get all keys and check their timestamps
    const keys = await cache.keys('*');
    const expiredKeys: string[] = [];

    for (const key of keys) {
      const entry = await cache.getEntry(key);
      if (entry && entry.createdAt < cutoffTime) {
        expiredKeys.push(key);
      }
    }

    // Remove expired keys
    if (expiredKeys.length > 0) {
      await cache.deleteMany(expiredKeys);
    }
  }
}

/**
 * Tag-based invalidation strategy
 * Invalidates all entries associated with specific tags
 */
export class TagBasedInvalidationStrategy implements InvalidationStrategy {
  name = 'tag-based';

  async invalidate(cache: any, options: InvalidationOptions): Promise<void> {
    if (!options.tags || options.tags.length === 0) {
      throw new Error('Tag-based invalidation requires tags option');
    }

    for (const tag of options.tags) {
      await cache.invalidateByTag(tag);
    }
  }
}

/**
 * Pattern-based invalidation strategy
 * Invalidates entries matching a specific pattern
 */
export class PatternBasedInvalidationStrategy implements InvalidationStrategy {
  name = 'pattern-based';

  async invalidate(cache: any, options: InvalidationOptions): Promise<void> {
    if (!options.pattern) {
      throw new Error('Pattern-based invalidation requires pattern option');
    }

    const keys = await cache.keys(options.pattern);
    if (keys.length > 0) {
      await cache.deleteMany(keys);
    }
  }
}

/**
 * Event-driven invalidation strategy
 * Invalidates cache based on external events
 */
export class EventDrivenInvalidationStrategy implements InvalidationStrategy {
  name = 'event-driven';
  private eventHandlers: Map<string, (data: any) => Promise<void>> = new Map();

  async invalidate(cache: any, options: InvalidationOptions): Promise<void> {
    // This strategy is typically set up with event listeners
    // The actual invalidation happens in response to events
    throw new Error('Event-driven invalidation should be set up with event listeners');
  }

  /**
   * Register an event handler for cache invalidation
   */
  onEvent(eventType: string, handler: (cache: any, data: any) => Promise<void>): void {
    this.eventHandlers.set(eventType, handler);
  }

  /**
   * Trigger invalidation based on an event
   */
  async triggerEvent(cache: any, eventType: string, data: any): Promise<void> {
    const handler = this.eventHandlers.get(eventType);
    if (handler) {
      await handler(cache, data);
    }
  }
}

/**
 * Conditional invalidation strategy
 * Invalidates entries based on custom conditions
 */
export class ConditionalInvalidationStrategy implements InvalidationStrategy {
  name = 'conditional';

  async invalidate(cache: any, options: InvalidationOptions): Promise<void> {
    if (!options.condition) {
      throw new Error('Conditional invalidation requires condition option');
    }

    const keys = await cache.keys('*');
    const keysToInvalidate: string[] = [];

    for (const key of keys) {
      const value = await cache.get(key);
      if (options.condition(key, value)) {
        keysToInvalidate.push(key);
      }
    }

    if (keysToInvalidate.length > 0) {
      await cache.deleteMany(keysToInvalidate);
    }
  }
}

/**
 * Hierarchical invalidation strategy
 * Invalidates parent and child entries in a hierarchy
 */
export class HierarchicalInvalidationStrategy implements InvalidationStrategy {
  name = 'hierarchical';

  async invalidate(cache: any, options: InvalidationOptions): Promise<void> {
    if (!options.key) {
      throw new Error('Hierarchical invalidation requires key option');
    }

    // Invalidate the key itself
    await cache.delete(options.key);

    // Invalidate all child keys (keys that start with the parent key)
    const childPattern = `${options.key}:*`;
    const childKeys = await cache.keys(childPattern);
    
    if (childKeys.length > 0) {
      await cache.deleteMany(childKeys);
    }

    // Optionally invalidate parent keys
    const keyParts = options.key.split(':');
    for (let i = keyParts.length - 1; i > 0; i--) {
      const parentKey = keyParts.slice(0, i).join(':');
      await cache.delete(parentKey);
    }
  }
}

/**
 * Invalidation manager that coordinates different strategies
 */
export class InvalidationManager {
  private strategies: Map<string, InvalidationStrategy> = new Map();

  constructor() {
    // Register default strategies
    this.registerStrategy(new TTLInvalidationStrategy());
    this.registerStrategy(new TagBasedInvalidationStrategy());
    this.registerStrategy(new PatternBasedInvalidationStrategy());
    this.registerStrategy(new EventDrivenInvalidationStrategy());
    this.registerStrategy(new ConditionalInvalidationStrategy());
    this.registerStrategy(new HierarchicalInvalidationStrategy());
  }

  registerStrategy(strategy: InvalidationStrategy): void {
    this.strategies.set(strategy.name, strategy);
  }

  async invalidate(
    cache: any,
    strategyName: string,
    options: InvalidationOptions
  ): Promise<void> {
    const strategy = this.strategies.get(strategyName);
    if (!strategy) {
      throw new Error(`Unknown invalidation strategy: ${strategyName}`);
    }

    await strategy.invalidate(cache, options);
  }

  getStrategy(name: string): InvalidationStrategy | undefined {
    return this.strategies.get(name);
  }

  listStrategies(): string[] {
    return Array.from(this.strategies.keys());
  }
}