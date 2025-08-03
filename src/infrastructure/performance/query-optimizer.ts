/**
 * Query Optimization System with Intelligent Caching
 * Provides advanced query optimization, caching strategies, and performance monitoring
 */

import { MultiLayerCache } from '../cache/multi-layer-cache';
import { DatabaseConnectionManager } from '../database/connection-manager';
import { performanceTracker } from '../monitoring/performance-tracker';
import { metricsManager } from '../monitoring/prometheus-metrics';
import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { createHash } from 'crypto';

export interface QueryCacheOptions {
  ttl?: number; // Time to live in seconds
  tags?: string[]; // Cache tags for invalidation
  skipCache?: boolean; // Skip cache for this query
  cacheKey?: string; // Custom cache key
  warmCache?: boolean; // Pre-warm cache after execution
  compressionEnabled?: boolean; // Enable result compression
}

export interface QueryOptimizationConfig {
  enableQueryCache: boolean;
  defaultCacheTTL: number;
  maxCacheKeyLength: number;
  compressionThreshold: number; // Bytes
  slowQueryThreshold: number; // Milliseconds
  enableQueryPlan: boolean;
  enableReadReplicas: boolean;
  replicaPreference: 'round_robin' | 'least_connections' | 'response_time';
}

export interface QueryMetrics {
  queryHash: string;
  executionCount: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  cacheHitRate: number;
  lastExecuted: Date;
  slowQueryCount: number;
  errorCount: number;
}

export interface QueryPlan {
  query: string;
  estimatedCost: number;
  estimatedRows: number;
  indexUsage: string[];
  recommendations: string[];
}

export class QueryOptimizer {
  private queryMetrics = new Map<string, QueryMetrics>();
  private queryPlans = new Map<string, QueryPlan>();
  private warmingQueue = new Set<string>();
  private compressionCache = new Map<string, Buffer>();

  constructor(
    private cache: MultiLayerCache,
    private dbManager: DatabaseConnectionManager,
    private config: QueryOptimizationConfig
  ) {
    this.startMetricsCollection();
    this.startCacheWarming();
  }

  /**
   * Execute optimized query with intelligent caching
   */
  async executeOptimizedQuery<T>(
    queryFn: () => Promise<T>,
    queryKey: string,
    options: QueryCacheOptions = {}
  ): Promise<T> {
    const metricId = performanceTracker.startTracking(
      'optimized_query',
      'query_optimizer',
      { queryKey, options }
    );

    try {
      const cacheKey = this.generateCacheKey(queryKey, options);
      const queryHash = this.generateQueryHash(queryKey);

      // Update query metrics
      this.updateQueryMetrics(queryHash, 'start');

      // Try cache first if enabled
      if (this.config.enableQueryCache && !options.skipCache) {
        const cachedResult = await this.getCachedResult<T>(cacheKey);
        if (cachedResult !== null) {
          this.updateQueryMetrics(queryHash, 'cache_hit');
          performanceTracker.stopTracking(metricId, 'success', undefined, {
            source: 'cache',
            cacheKey,
          });

          metricsManager.recordCacheOperation(
            'get',
            'redis',
            'hit',
            Date.now() - parseInt(metricId.split('_')[1])
          );

          return cachedResult;
        }

        this.updateQueryMetrics(queryHash, 'cache_miss');
        metricsManager.recordCacheOperation('get', 'redis', 'miss', 0);
      }

      // Execute query with performance tracking
      const startTime = Date.now();
      const result = await this.executeWithOptimization(queryFn, queryKey);
      const duration = Date.now() - startTime;

      // Update metrics
      this.updateQueryMetrics(queryHash, 'execution', duration);
      performanceTracker.incrementDatabaseQueries(metricId);

      // Cache result if enabled
      if (this.config.enableQueryCache && !options.skipCache) {
        await this.cacheResult(cacheKey, result, options);
      }

      // Warm cache if requested
      if (options.warmCache) {
        this.scheduleWarmCache(cacheKey, queryFn, options);
      }

      // Check for slow queries
      if (duration > this.config.slowQueryThreshold) {
        this.handleSlowQuery(queryKey, duration, queryHash);
      }

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        source: 'database',
        duration,
        cacheKey,
      });

      return result;
    } catch (error) {
      const queryHash = this.generateQueryHash(queryKey);
      this.updateQueryMetrics(queryHash, 'error');
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      throw error;
    }
  }

  /**
   * Execute query with read replica optimization
   */
  async executeWithReadReplica<T>(
    queryFn: (isReplica: boolean) => Promise<T>,
    queryKey: string,
    options: QueryCacheOptions = {}
  ): Promise<T> {
    if (!this.config.enableReadReplicas) {
      return queryFn(false);
    }

    const metricId = performanceTracker.startTracking(
      'replica_query',
      'query_optimizer',
      { queryKey }
    );

    try {
      // Try replica first for read operations
      const result = await this.dbManager.executeQuery(
        async (db) => queryFn(true),
        { preferReplica: true }
      );

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        source: 'replica',
      });

      return result;
    } catch (error) {
      logger.warn('Replica query failed, falling back to primary', {
        queryKey,
        error: (error as Error).message,
        correlationId: correlationIdManager.getCorrelationId(),
      });

      // Fallback to primary
      const result = await queryFn(false);
      performanceTracker.stopTracking(metricId, 'success', undefined, {
        source: 'primary_fallback',
      });

      return result;
    }
  }

  /**
   * Batch execute multiple queries with optimization
   */
  async executeBatch<T>(
    queries: Array<{
      queryFn: () => Promise<T>;
      queryKey: string;
      options?: QueryCacheOptions;
    }>
  ): Promise<T[]> {
    const metricId = performanceTracker.startTracking(
      'batch_query',
      'query_optimizer',
      { batchSize: queries.length }
    );

    try {
      // Group queries by cache availability
      const cachedResults = new Map<number, T>();
      const uncachedQueries: Array<{
        index: number;
        query: (typeof queries)[0];
      }> = [];

      // Check cache for all queries
      if (this.config.enableQueryCache) {
        for (let i = 0; i < queries.length; i++) {
          const query = queries[i];
          if (!query.options?.skipCache) {
            const cacheKey = this.generateCacheKey(
              query.queryKey,
              query.options
            );
            const cachedResult = await this.getCachedResult<T>(cacheKey);

            if (cachedResult !== null) {
              cachedResults.set(i, cachedResult);
            } else {
              uncachedQueries.push({ index: i, query });
            }
          } else {
            uncachedQueries.push({ index: i, query });
          }
        }
      } else {
        uncachedQueries.push(
          ...queries.map((query, index) => ({ index, query }))
        );
      }

      // Execute uncached queries in parallel
      const uncachedResults = await Promise.allSettled(
        uncachedQueries.map(async ({ query }) => {
          return this.executeOptimizedQuery(
            query.queryFn,
            query.queryKey,
            query.options
          );
        })
      );

      // Combine results
      const results: T[] = new Array(queries.length);

      // Fill cached results
      cachedResults.forEach((result, index) => {
        results[index] = result;
      });

      // Fill uncached results
      uncachedResults.forEach((result, i) => {
        const originalIndex = uncachedQueries[i].index;
        if (result.status === 'fulfilled') {
          results[originalIndex] = result.value;
        } else {
          throw result.reason;
        }
      });

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        totalQueries: queries.length,
        cachedQueries: cachedResults.size,
        executedQueries: uncachedQueries.length,
      });

      return results;
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      throw error;
    }
  }

  /**
   * Invalidate cache by tags
   */
  async invalidateByTags(tags: string[]): Promise<number> {
    const metricId = performanceTracker.startTracking(
      'cache_invalidation',
      'query_optimizer',
      { tags }
    );

    try {
      const invalidatedCount = await this.cache.invalidateByTags(tags);

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        invalidatedCount,
        tags,
      });

      logger.info('Cache invalidated by tags', {
        tags,
        invalidatedCount,
        correlationId: correlationIdManager.getCorrelationId(),
      });

      return invalidatedCount;
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      throw error;
    }
  }

  /**
   * Get query performance statistics
   */
  getQueryStats(queryKey?: string): QueryMetrics[] {
    if (queryKey) {
      const queryHash = this.generateQueryHash(queryKey);
      const metrics = this.queryMetrics.get(queryHash);
      return metrics ? [metrics] : [];
    }

    return Array.from(this.queryMetrics.values());
  }

  /**
   * Get query execution plan
   */
  async getQueryPlan(query: string): Promise<QueryPlan | null> {
    if (!this.config.enableQueryPlan) {
      return null;
    }

    const queryHash = this.generateQueryHash(query);
    const cached = this.queryPlans.get(queryHash);

    if (cached) {
      return cached;
    }

    try {
      // This would execute EXPLAIN ANALYZE on the query
      // Implementation depends on the specific database
      const plan: QueryPlan = {
        query,
        estimatedCost: 0,
        estimatedRows: 0,
        indexUsage: [],
        recommendations: [],
      };

      this.queryPlans.set(queryHash, plan);
      return plan;
    } catch (error) {
      logger.error('Failed to get query plan', {
        query,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Warm cache for frequently accessed queries
   */
  async warmCache(
    queryFn: () => Promise<any>,
    queryKey: string,
    options: QueryCacheOptions = {}
  ): Promise<void> {
    const cacheKey = this.generateCacheKey(queryKey, options);

    if (this.warmingQueue.has(cacheKey)) {
      return; // Already warming
    }

    this.warmingQueue.add(cacheKey);

    try {
      const result = await queryFn();
      await this.cacheResult(cacheKey, result, options);

      logger.debug('Cache warmed successfully', {
        queryKey,
        cacheKey,
        correlationId: correlationIdManager.getCorrelationId(),
      });
    } catch (error) {
      logger.error('Cache warming failed', {
        queryKey,
        cacheKey,
        error: (error as Error).message,
      });
    } finally {
      this.warmingQueue.delete(cacheKey);
    }
  }

  /**
   * Generate cache key for query
   */
  private generateCacheKey(
    queryKey: string,
    options: QueryCacheOptions = {}
  ): string {
    if (options.cacheKey) {
      return options.cacheKey;
    }

    const keyData = {
      query: queryKey,
      correlationId: correlationIdManager.getCorrelationId(),
      timestamp: Math.floor(
        Date.now() / (options.ttl || this.config.defaultCacheTTL)
      ),
    };

    const hash = createHash('sha256')
      .update(JSON.stringify(keyData))
      .digest('hex')
      .substring(0, 16);

    const key = `query:${hash}`;

    if (key.length > this.config.maxCacheKeyLength) {
      return `query:${createHash('sha256').update(key).digest('hex').substring(0, 32)}`;
    }

    return key;
  }

  /**
   * Generate query hash for metrics
   */
  private generateQueryHash(queryKey: string): string {
    return createHash('sha256').update(queryKey).digest('hex').substring(0, 16);
  }

  /**
   * Get cached result with decompression
   */
  private async getCachedResult<T>(cacheKey: string): Promise<T | null> {
    try {
      const cached = await this.cache.get<string | Buffer>(cacheKey);
      if (cached === null) {
        return null;
      }

      // Handle compressed results
      if (Buffer.isBuffer(cached)) {
        const decompressed = await this.decompress(cached);
        return JSON.parse(decompressed);
      }

      return typeof cached === 'string' ? JSON.parse(cached) : cached;
    } catch (error) {
      logger.error('Failed to get cached result', {
        cacheKey,
        error: (error as Error).message,
      });
      return null;
    }
  }

  /**
   * Cache result with compression if needed
   */
  private async cacheResult<T>(
    cacheKey: string,
    result: T,
    options: QueryCacheOptions = {}
  ): Promise<void> {
    try {
      const serialized = JSON.stringify(result);
      const ttl = options.ttl || this.config.defaultCacheTTL;

      let dataToCache: string | Buffer = serialized;

      // Compress if result is large
      if (
        options.compressionEnabled !== false &&
        serialized.length > this.config.compressionThreshold
      ) {
        dataToCache = await this.compress(serialized);
      }

      await this.cache.set(cacheKey, dataToCache, {
        ttl,
        tags: options.tags,
      });

      metricsManager.recordCacheOperation('set', 'redis', 'success', 0);
    } catch (error) {
      logger.error('Failed to cache result', {
        cacheKey,
        error: (error as Error).message,
      });
      metricsManager.recordCacheOperation('set', 'redis', 'error', 0);
    }
  }

  /**
   * Execute query with optimization strategies
   */
  private async executeWithOptimization<T>(
    queryFn: () => Promise<T>,
    queryKey: string
  ): Promise<T> {
    // Add query optimization logic here
    // This could include query rewriting, index hints, etc.
    return queryFn();
  }

  /**
   * Update query metrics
   */
  private updateQueryMetrics(
    queryHash: string,
    event: 'start' | 'cache_hit' | 'cache_miss' | 'execution' | 'error',
    duration?: number
  ): void {
    let metrics = this.queryMetrics.get(queryHash);

    if (!metrics) {
      metrics = {
        queryHash,
        executionCount: 0,
        totalDuration: 0,
        averageDuration: 0,
        minDuration: Infinity,
        maxDuration: 0,
        cacheHitRate: 0,
        lastExecuted: new Date(),
        slowQueryCount: 0,
        errorCount: 0,
      };
      this.queryMetrics.set(queryHash, metrics);
    }

    switch (event) {
      case 'execution':
        if (duration !== undefined) {
          metrics.executionCount++;
          metrics.totalDuration += duration;
          metrics.averageDuration =
            metrics.totalDuration / metrics.executionCount;
          metrics.minDuration = Math.min(metrics.minDuration, duration);
          metrics.maxDuration = Math.max(metrics.maxDuration, duration);
          metrics.lastExecuted = new Date();

          if (duration > this.config.slowQueryThreshold) {
            metrics.slowQueryCount++;
          }
        }
        break;
      case 'error':
        metrics.errorCount++;
        break;
      case 'cache_hit':
        // Update cache hit rate calculation
        break;
    }
  }

  /**
   * Handle slow query detection
   */
  private handleSlowQuery(
    queryKey: string,
    duration: number,
    queryHash: string
  ): void {
    logger.warn('Slow query detected', {
      queryKey,
      duration,
      queryHash,
      threshold: this.config.slowQueryThreshold,
      correlationId: correlationIdManager.getCorrelationId(),
    });

    // Record slow query metric
    metricsManager.recordDatabaseQuery(
      'slow_query',
      'unknown',
      'unknown',
      'success',
      duration,
      'slow_query'
    );
  }

  /**
   * Schedule cache warming
   */
  private scheduleWarmCache(
    cacheKey: string,
    queryFn: () => Promise<any>,
    options: QueryCacheOptions
  ): void {
    // Schedule warming after a delay to avoid immediate re-execution
    setTimeout(() => {
      this.warmCache(queryFn, cacheKey, options).catch((error) => {
        logger.error('Scheduled cache warming failed', {
          cacheKey,
          error: (error as Error).message,
        });
      });
    }, 5000); // 5 second delay
  }

  /**
   * Compress data
   */
  private async compress(data: string): Promise<Buffer> {
    const { gzip } = await import('zlib');
    const { promisify } = await import('util');
    const gzipAsync = promisify(gzip);

    return gzipAsync(Buffer.from(data, 'utf8'));
  }

  /**
   * Decompress data
   */
  private async decompress(data: Buffer): Promise<string> {
    const { gunzip } = await import('zlib');
    const { promisify } = await import('util');
    const gunzipAsync = promisify(gunzip);

    const decompressed = await gunzipAsync(data);
    return decompressed.toString('utf8');
  }

  /**
   * Start metrics collection
   */
  private startMetricsCollection(): void {
    setInterval(() => {
      this.collectMetrics();
    }, 60000); // Every minute
  }

  /**
   * Start cache warming process
   */
  private startCacheWarming(): void {
    setInterval(() => {
      this.performCacheWarming();
    }, 300000); // Every 5 minutes
  }

  /**
   * Collect and report metrics
   */
  private collectMetrics(): void {
    const totalQueries = Array.from(this.queryMetrics.values()).reduce(
      (sum, metrics) => sum + metrics.executionCount,
      0
    );

    const slowQueries = Array.from(this.queryMetrics.values()).reduce(
      (sum, metrics) => sum + metrics.slowQueryCount,
      0
    );

    logger.info('Query optimizer metrics', {
      totalQueries,
      slowQueries,
      uniqueQueries: this.queryMetrics.size,
      warmingQueueSize: this.warmingQueue.size,
    });
  }

  /**
   * Perform cache warming for frequently accessed queries
   */
  private performCacheWarming(): void {
    // This would implement intelligent cache warming based on query frequency
    // For now, it's a placeholder
    logger.debug('Performing cache warming cycle', {
      warmingQueueSize: this.warmingQueue.size,
    });
  }

  /**
   * Shutdown query optimizer
   */
  shutdown(): void {
    this.queryMetrics.clear();
    this.queryPlans.clear();
    this.warmingQueue.clear();
    this.compressionCache.clear();

    logger.info('Query optimizer shutdown complete');
  }
}
