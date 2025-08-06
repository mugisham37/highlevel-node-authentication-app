/**
 * Base Repository Implementation
 * Provides common functionality for all repositories including caching, metrics, and optimization
 */

import { Logger } from 'winston';
import {
  ICacheableRepository,
  IOptimizedRepository,
  IRepositoryMetrics,
} from '../interfaces/base-repository.interface';
import { MultiLayerCache } from '../../../cache/multi-layer-cache';
import { TransactionManager } from './transaction-manager';

export interface QueryMetric {
  operation: string;
  duration: number;
  success: boolean;
  timestamp: Date;
}

export interface CacheMetric {
  key: string;
  hit: boolean;
  timestamp: Date;
}

export abstract class BaseRepository
  implements ICacheableRepository<any>, IOptimizedRepository, IRepositoryMetrics
{
  protected queryMetrics: QueryMetric[] = [];
  protected cacheMetrics: CacheMetric[] = [];
  protected readonly maxMetricsHistory = 1000;
  protected transactionManager: TransactionManager | undefined;

  constructor(
    protected logger: Logger,
    protected cache?: MultiLayerCache,
    transactionManager?: TransactionManager
  ) {
    this.transactionManager = transactionManager;
  }

  // Cache operations
  async getCached(key: string): Promise<any | null> {
    if (!this.cache) return null;

    try {
      const result = await this.cache.get(key);
      this.recordCacheHit(key);
      return result;
    } catch (error) {
      this.recordCacheMiss(key);
      this.logger.warn('Cache get operation failed', { key, error });
      return null;
    }
  }

  async setCached(key: string, value: any, ttl: number = 3600): Promise<void> {
    if (!this.cache) return;

    try {
      await this.cache.set(key, value, { ttl });
    } catch (error) {
      this.logger.warn('Cache set operation failed', { key, error });
    }
  }

  async invalidateCache(pattern: string): Promise<void> {
    if (!this.cache) return;

    try {
      await this.cache.invalidatePattern(pattern);
      this.logger.debug('Cache invalidated', { pattern });
    } catch (error) {
      this.logger.warn('Cache invalidation failed', { pattern, error });
    }
  }

  // Cache-aware operations
  async findByIdCached(id: string, ttl: number = 3600): Promise<any | null> {
    const cacheKey = this.generateCacheKey('findById', { id });

    // Try cache first
    const cached = await this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const result = await this.findById(id);
    if (result) {
      await this.setCached(cacheKey, result, ttl);
    }

    return result;
  }

  async findManyCached(
    filters: any,
    cacheKey: string,
    ttl: number = 1800
  ): Promise<{ items: any[]; total: number }> {
    // Try cache first
    const cached = await this.getCached(cacheKey);
    if (cached) {
      return cached;
    }

    // Fallback to database
    const result = await this.findMany(filters);
    await this.setCached(cacheKey, result, ttl);

    return result;
  }

  // Query optimization
  async optimizeQuery<TResult>(
    query: () => Promise<TResult>,
    options: {
      cacheKey?: string;
      ttl?: number;
      preferReplica?: boolean;
    } = {}
  ): Promise<TResult> {
    const startTime = Date.now();
    let success = true;
    let result: TResult;

    try {
      // Check cache if key provided
      if (options.cacheKey) {
        const cached = await this.getCached(options.cacheKey);
        if (cached) {
          this.recordQuery('cached_query', Date.now() - startTime, true);
          return cached;
        }
      }

      // Execute query
      result = await query();

      // Cache result if key provided
      if (options.cacheKey && result) {
        await this.setCached(options.cacheKey, result, options.ttl);
      }

      return result;
    } catch (error) {
      success = false;
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      this.recordQuery('optimized_query', duration, success);

      // Log slow queries
      if (duration > 100) {
        this.logger.warn('Slow query detected', {
          duration,
          cacheKey: options.cacheKey,
          preferReplica: options.preferReplica,
        });
      }
    }
  }

  // Performance monitoring
  async getQueryStats(): Promise<{
    totalQueries: number;
    averageResponseTime: number;
    slowQueries: number;
    cacheHitRate: number;
  }> {
    const totalQueries = this.queryMetrics.length;
    const averageResponseTime =
      totalQueries > 0
        ? this.queryMetrics.reduce((sum, metric) => sum + metric.duration, 0) /
          totalQueries
        : 0;
    const slowQueries = this.queryMetrics.filter(
      (metric) => metric.duration > 100
    ).length;

    const totalCacheRequests = this.cacheMetrics.length;
    const cacheHits = this.cacheMetrics.filter((metric) => metric.hit).length;
    const cacheHitRate =
      totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0;

    return {
      totalQueries,
      averageResponseTime,
      slowQueries,
      cacheHitRate,
    };
  }

  // Metrics recording
  recordQuery(operation: string, duration: number, success: boolean): void {
    this.queryMetrics.push({
      operation,
      duration,
      success,
      timestamp: new Date(),
    });

    // Keep metrics history bounded
    if (this.queryMetrics.length > this.maxMetricsHistory) {
      this.queryMetrics = this.queryMetrics.slice(-this.maxMetricsHistory);
    }
  }

  recordCacheHit(key: string): void {
    this.cacheMetrics.push({
      key,
      hit: true,
      timestamp: new Date(),
    });

    this.boundCacheMetrics();
  }

  recordCacheMiss(key: string): void {
    this.cacheMetrics.push({
      key,
      hit: false,
      timestamp: new Date(),
    });

    this.boundCacheMetrics();
  }

  getMetrics(): {
    queries: { operation: string; count: number; avgDuration: number }[];
    cache: { hitRate: number; totalRequests: number };
  } {
    // Aggregate query metrics by operation
    const queryMap = new Map<
      string,
      { count: number; totalDuration: number }
    >();

    this.queryMetrics.forEach((metric) => {
      const existing = queryMap.get(metric.operation) || {
        count: 0,
        totalDuration: 0,
      };
      queryMap.set(metric.operation, {
        count: existing.count + 1,
        totalDuration: existing.totalDuration + metric.duration,
      });
    });

    const queries = Array.from(queryMap.entries()).map(
      ([operation, stats]) => ({
        operation,
        count: stats.count,
        avgDuration: stats.totalDuration / stats.count,
      })
    );

    // Calculate cache metrics
    const totalCacheRequests = this.cacheMetrics.length;
    const cacheHits = this.cacheMetrics.filter((metric) => metric.hit).length;
    const hitRate =
      totalCacheRequests > 0 ? (cacheHits / totalCacheRequests) * 100 : 0;

    return {
      queries,
      cache: {
        hitRate,
        totalRequests: totalCacheRequests,
      },
    };
  }

  // Utility methods
  protected generateCacheKey(
    operation: string,
    params: Record<string, any>
  ): string {
    const paramString = Object.keys(params)
      .sort()
      .map((key) => `${key}:${params[key]}`)
      .join('|');

    return `${this.constructor.name}:${operation}:${paramString}`;
  }

  protected boundCacheMetrics(): void {
    if (this.cacheMetrics.length > this.maxMetricsHistory) {
      this.cacheMetrics = this.cacheMetrics.slice(-this.maxMetricsHistory);
    }
  }

  // Abstract methods that must be implemented by concrete repositories
  abstract create(data: any): Promise<any>;
  abstract findById(id: string): Promise<any | null>;
  abstract update(id: string, data: any): Promise<any>;
  abstract delete(id: string): Promise<void>;
  abstract findByIds(ids: string[]): Promise<any[]>;
  abstract bulkCreate(data: any[]): Promise<any[]>;
  abstract bulkUpdate(
    updates: Array<{ id: string; data: any }>
  ): Promise<any[]>;
  abstract bulkDelete(ids: string[]): Promise<void>;
  abstract findMany(filters: any): Promise<{ items: any[]; total: number }>;
  abstract exists(id: string): Promise<boolean>;
  abstract count(filters?: any): Promise<number>;
}
