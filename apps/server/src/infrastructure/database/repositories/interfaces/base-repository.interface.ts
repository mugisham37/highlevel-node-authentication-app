/**
 * Base Repository Interface
 * Defines common repository operations following dependency inversion principle
 */

export interface IBaseRepository<T, TCreate, TUpdate, TFilters = any> {
  // Basic CRUD operations
  create(data: TCreate): Promise<T>;
  findById(id: string): Promise<T | null>;
  update(id: string, data: TUpdate): Promise<T>;
  delete(id: string): Promise<void>;

  // Batch operations
  findByIds(ids: string[]): Promise<T[]>;
  bulkCreate(data: TCreate[]): Promise<T[]>;
  bulkUpdate(updates: Array<{ id: string; data: TUpdate }>): Promise<T[]>;
  bulkDelete(ids: string[]): Promise<void>;

  // Query operations
  findMany(filters: TFilters): Promise<{ items: T[]; total: number }>;
  exists(id: string): Promise<boolean>;
  count(filters?: Partial<TFilters>): Promise<number>;
}

export interface ITransactionContext {
  // Prisma transaction context
  prisma?: any;
  // Drizzle transaction context
  drizzle?: any;
}

export interface ITransactionalRepository {
  // Execute operations within a transaction
  withTransaction<T>(
    operation: (context: ITransactionContext) => Promise<T>
  ): Promise<T>;
}

export interface ICacheableRepository<T> {
  // Cache operations
  getCached(key: string): Promise<T | null>;
  setCached(key: string, value: T, ttl?: number): Promise<void>;
  invalidateCache(pattern: string): Promise<void>;

  // Cache-aware operations
  findByIdCached(id: string, ttl?: number): Promise<T | null>;
  findManyCached(
    filters: any,
    cacheKey: string,
    ttl?: number
  ): Promise<{ items: T[]; total: number }>;
}

export interface IOptimizedRepository {
  // Query optimization
  optimizeQuery<TResult>(
    query: () => Promise<TResult>,
    options?: {
      cacheKey?: string;
      ttl?: number;
      preferReplica?: boolean;
    }
  ): Promise<TResult>;

  // Performance monitoring
  getQueryStats(): Promise<{
    totalQueries: number;
    averageResponseTime: number;
    slowQueries: number;
    cacheHitRate: number;
  }>;
}

export interface IRepositoryMetrics {
  recordQuery(operation: string, duration: number, success: boolean): void;
  recordCacheHit(key: string): void;
  recordCacheMiss(key: string): void;
  getMetrics(): {
    queries: { operation: string; count: number; avgDuration: number }[];
    cache: { hitRate: number; totalRequests: number };
  };
}
