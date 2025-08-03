export interface CacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Tags for cache invalidation
  compress?: boolean; // Whether to compress the data
  serialize?: boolean; // Whether to serialize the data
}

export class CacheEntry<T = any> {
  public readonly value: T;
  public readonly createdAt: number;
  public readonly expiresAt: number;
  public readonly tags: string[];
  public readonly compressed: boolean;
  public readonly serialized: boolean;

  constructor(value: T, options: CacheOptions = {}) {
    this.value = value;
    this.createdAt = Date.now();
    this.expiresAt = options.ttl ? this.createdAt + options.ttl * 1000 : 0;
    this.tags = options.tags || [];
    this.compressed = options.compress || false;
    this.serialized = options.serialize !== false; // Default to true
  }

  isExpired(): boolean {
    if (this.expiresAt === 0) return false; // No expiration
    return Date.now() > this.expiresAt;
  }

  getRemainingTTL(): number {
    if (this.expiresAt === 0) return -1; // No expiration
    const remaining = Math.max(0, this.expiresAt - Date.now());
    return Math.ceil(remaining / 1000); // Return in seconds
  }

  hasTag(tag: string): boolean {
    return this.tags.includes(tag);
  }

  hasTags(tags: string[]): boolean {
    return tags.some((tag) => this.hasTag(tag));
  }

  getAge(): number {
    return Date.now() - this.createdAt;
  }

  toJSON(): object {
    return {
      value: this.value,
      createdAt: this.createdAt,
      expiresAt: this.expiresAt,
      tags: this.tags,
      compressed: this.compressed,
      serialized: this.serialized,
      isExpired: this.isExpired(),
      remainingTTL: this.getRemainingTTL(),
      age: this.getAge(),
    };
  }
}

export interface CacheStats {
  hits: number;
  misses: number;
  sets: number;
  deletes: number;
  evictions: number;
  errors: number;
  hitRate: number;
  totalRequests: number;
}

export class CacheMetrics {
  private stats: CacheStats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    evictions: 0,
    errors: 0,
    hitRate: 0,
    totalRequests: 0,
  };

  recordHit(): void {
    this.stats.hits++;
    this.updateHitRate();
  }

  recordMiss(): void {
    this.stats.misses++;
    this.updateHitRate();
  }

  recordSet(): void {
    this.stats.sets++;
  }

  recordDelete(): void {
    this.stats.deletes++;
  }

  recordEviction(): void {
    this.stats.evictions++;
  }

  recordError(): void {
    this.stats.errors++;
  }

  private updateHitRate(): void {
    this.stats.totalRequests = this.stats.hits + this.stats.misses;
    this.stats.hitRate =
      this.stats.totalRequests > 0
        ? this.stats.hits / this.stats.totalRequests
        : 0;
  }

  getStats(): CacheStats {
    return { ...this.stats };
  }

  reset(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      evictions: 0,
      errors: 0,
      hitRate: 0,
      totalRequests: 0,
    };
  }
}
