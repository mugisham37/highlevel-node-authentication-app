/**
 * Performance Optimization and Caching Tests
 * Comprehensive test suite for performance optimization components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { QueryOptimizer } from '../../infrastructure/performance/query-optimizer';
import {
  ConnectionPoolManager,
  RoundRobinStrategy,
} from '../../infrastructure/performance/connection-pool-manager';
import { CacheWarmingSystem } from '../../infrastructure/performance/cache-warming';
import {
  ResponseOptimizer,
  defaultOptimizationConfig,
} from '../../infrastructure/performance/response-optimizer';
import { BenchmarkSuite } from '../../infrastructure/performance/benchmark-suite';
import {
  createPerformanceModule,
  defaultPerformanceConfig,
} from '../../infrastructure/performance/performance-factory';

// Mock dependencies
const mockCache = {
  get: vi.fn(),
  set: vi.fn(),
  delete: vi.fn(),
  has: vi.fn(),
  invalidateByTags: vi.fn(),
  getStats: vi.fn(),
};

const mockDbManager = {
  executeQuery: vi.fn(),
  getPrismaClient: vi.fn(),
  getDrizzleDb: vi.fn(),
  executeWithRetry: vi.fn(),
  getHealthStatus: vi.fn(),
  shutdown: vi.fn(),
};

describe('Performance Optimization and Caching', () => {
  describe('QueryOptimizer', () => {
    let queryOptimizer: QueryOptimizer;

    beforeEach(() => {
      vi.clearAllMocks();
      queryOptimizer = new QueryOptimizer(
        mockCache as any,
        mockDbManager as any,
        {
          enableQueryCache: true,
          defaultCacheTTL: 300,
          maxCacheKeyLength: 250,
          compressionThreshold: 1024,
          slowQueryThreshold: 100,
          enableQueryPlan: true,
          enableReadReplicas: true,
          replicaPreference: 'round_robin',
        }
      );
    });

    afterEach(() => {
      queryOptimizer.shutdown();
    });

    it('should execute optimized query with cache hit', async () => {
      // Arrange
      const cachedResult = { id: 1, name: 'test' };
      mockCache.get.mockResolvedValue(JSON.stringify(cachedResult));

      const queryFn = vi.fn().mockResolvedValue({ id: 2, name: 'fresh' });

      // Act
      const result = await queryOptimizer.executeOptimizedQuery(
        queryFn,
        'test_query',
        { ttl: 300 }
      );

      // Assert
      expect(result).toEqual(cachedResult);
      expect(queryFn).not.toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalled();
    });

    it('should execute query and cache result on cache miss', async () => {
      // Arrange
      const freshResult = { id: 2, name: 'fresh' };
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);

      const queryFn = vi.fn().mockResolvedValue(freshResult);

      // Act
      const result = await queryOptimizer.executeOptimizedQuery(
        queryFn,
        'test_query',
        { ttl: 300 }
      );

      // Assert
      expect(result).toEqual(freshResult);
      expect(queryFn).toHaveBeenCalled();
      expect(mockCache.get).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalled();
    });

    it('should execute batch queries efficiently', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);

      const queries = [
        {
          queryFn: vi.fn().mockResolvedValue({ id: 1 }),
          queryKey: 'query1',
        },
        {
          queryFn: vi.fn().mockResolvedValue({ id: 2 }),
          queryKey: 'query2',
        },
        {
          queryFn: vi.fn().mockResolvedValue({ id: 3 }),
          queryKey: 'query3',
        },
      ];

      // Act
      const results = await queryOptimizer.executeBatch(queries);

      // Assert
      expect(results).toHaveLength(3);
      expect(results[0]).toEqual({ id: 1 });
      expect(results[1]).toEqual({ id: 2 });
      expect(results[2]).toEqual({ id: 3 });

      queries.forEach((query) => {
        expect(query.queryFn).toHaveBeenCalled();
      });
    });

    it('should invalidate cache by tags', async () => {
      // Arrange
      const tags = ['user', 'auth'];
      mockCache.invalidateByTags.mockResolvedValue(5);

      // Act
      const invalidatedCount = await queryOptimizer.invalidateByTags(tags);

      // Assert
      expect(invalidatedCount).toBe(5);
      expect(mockCache.invalidateByTags).toHaveBeenCalledWith(tags);
    });

    it('should track query performance metrics', async () => {
      // Arrange
      mockCache.get.mockResolvedValue(null);
      mockCache.set.mockResolvedValue(undefined);

      const queryFn = vi
        .fn()
        .mockImplementation(
          () =>
            new Promise((resolve) => setTimeout(() => resolve({ id: 1 }), 50))
        );

      // Act
      await queryOptimizer.executeOptimizedQuery(queryFn, 'slow_query');
      const stats = queryOptimizer.getQueryStats('slow_query');

      // Assert
      expect(stats).toHaveLength(1);
      expect(stats[0].executionCount).toBe(1);
      expect(stats[0].averageDuration).toBeGreaterThan(0);
    });
  });

  describe('ConnectionPoolManager', () => {
    let poolManager: ConnectionPoolManager;

    beforeEach(() => {
      poolManager = new ConnectionPoolManager(new RoundRobinStrategy());
    });

    afterEach(async () => {
      await poolManager.shutdown();
    });

    it('should add and manage connection pools', () => {
      // Arrange
      const poolConfig = {
        name: 'test_pool',
        connectionString: 'postgresql://test',
        weight: 1,
        priority: 1,
        healthCheckInterval: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        connectionTimeout: 5000,
        queryTimeout: 30000,
        max: 10,
        min: 1,
      };

      // Act
      poolManager.addPool(poolConfig);
      const metrics = poolManager.getAllMetrics();

      // Assert
      expect(metrics).toHaveLength(1);
      expect(metrics[0].poolName).toBe('test_pool');
    });

    it('should handle pool removal', async () => {
      // Arrange
      const poolConfig = {
        name: 'test_pool',
        connectionString: 'postgresql://test',
        weight: 1,
        priority: 1,
        healthCheckInterval: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        connectionTimeout: 5000,
        queryTimeout: 30000,
        max: 10,
        min: 1,
      };

      poolManager.addPool(poolConfig);

      // Act
      await poolManager.removePool('test_pool');
      const metrics = poolManager.getAllMetrics();

      // Assert
      expect(metrics).toHaveLength(0);
    });

    it('should track healthy and unhealthy pools', () => {
      // Arrange
      const poolConfig1 = {
        name: 'healthy_pool',
        connectionString: 'postgresql://test1',
        weight: 1,
        priority: 1,
        healthCheckInterval: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        connectionTimeout: 5000,
        queryTimeout: 30000,
        max: 10,
        min: 1,
      };

      const poolConfig2 = {
        name: 'unhealthy_pool',
        connectionString: 'postgresql://test2',
        weight: 1,
        priority: 1,
        healthCheckInterval: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        connectionTimeout: 5000,
        queryTimeout: 30000,
        max: 10,
        min: 1,
      };

      // Act
      poolManager.addPool(poolConfig1);
      poolManager.addPool(poolConfig2);

      const healthyPools = poolManager.getHealthyPools();
      const unhealthyPools = poolManager.getUnhealthyPools();

      // Assert
      expect(healthyPools.length + unhealthyPools.length).toBe(2);
    });
  });

  describe('CacheWarmingSystem', () => {
    let cacheWarmingSystem: CacheWarmingSystem;

    beforeEach(() => {
      cacheWarmingSystem = new CacheWarmingSystem(
        mockCache as any,
        mockDbManager as any,
        {
          enabled: true,
          maxConcurrentJobs: 5,
          jobTimeout: 30000,
          retryAttempts: 3,
          retryDelay: 5000,
          healthCheckInterval: 60000,
          cleanupInterval: 300000,
        }
      );
    });

    afterEach(() => {
      cacheWarmingSystem.stop();
    });

    it('should register and execute warming jobs', async () => {
      // Arrange
      const testData = { id: 1, name: 'test' };
      const dataLoader = vi.fn().mockResolvedValue(testData);
      mockCache.set.mockResolvedValue(undefined);

      const jobId = cacheWarmingSystem.registerJob({
        name: 'test_job',
        strategy: 'test',
        cacheKey: 'test:key',
        dataLoader,
        options: { ttl: 300 },
        schedule: {},
      });

      // Act
      await cacheWarmingSystem.executeJob(jobId);

      // Assert
      expect(dataLoader).toHaveBeenCalled();
      expect(mockCache.set).toHaveBeenCalledWith('test:key', testData, {
        ttl: 300,
      });
    });

    it('should handle job failures and retries', async () => {
      // Arrange
      const dataLoader = vi.fn().mockRejectedValue(new Error('Test error'));

      const jobId = cacheWarmingSystem.registerJob({
        name: 'failing_job',
        strategy: 'test',
        cacheKey: 'test:key',
        dataLoader,
        options: {},
        schedule: {},
      });

      // Act & Assert
      await expect(cacheWarmingSystem.executeJob(jobId)).rejects.toThrow();
      expect(dataLoader).toHaveBeenCalled();
    });

    it('should track job metrics', async () => {
      // Arrange
      const testData = { id: 1, name: 'test' };
      const dataLoader = vi.fn().mockResolvedValue(testData);
      mockCache.set.mockResolvedValue(undefined);

      const jobId = cacheWarmingSystem.registerJob({
        name: 'metrics_job',
        strategy: 'test',
        cacheKey: 'test:key',
        dataLoader,
        options: {},
        schedule: {},
      });

      // Act
      await cacheWarmingSystem.executeJob(jobId);
      const metrics = cacheWarmingSystem.getJobMetrics();

      // Assert
      const jobMetrics = metrics.find((m) => m.id === jobId);
      expect(jobMetrics).toBeDefined();
      expect(jobMetrics!.metrics.executionCount).toBe(1);
      expect(jobMetrics!.metrics.successCount).toBe(1);
    });

    it('should start and stop the warming system', () => {
      // Act
      cacheWarmingSystem.start();
      let status = cacheWarmingSystem.getSystemStatus();
      expect(status.isRunning).toBe(true);

      cacheWarmingSystem.stop();
      status = cacheWarmingSystem.getSystemStatus();
      expect(status.isRunning).toBe(false);
    });
  });

  describe('ResponseOptimizer', () => {
    let responseOptimizer: ResponseOptimizer;
    let mockRequest: any;
    let mockReply: any;

    beforeEach(() => {
      responseOptimizer = new ResponseOptimizer(defaultOptimizationConfig);

      mockRequest = {
        method: 'GET',
        url: '/api/test',
        headers: {
          'accept-encoding': 'gzip, deflate, br',
          'user-agent': 'test-agent',
        },
        query: {},
      };

      mockReply = {
        code: vi.fn().mockReturnThis(),
        header: vi.fn().mockReturnThis(),
        getHeader: vi.fn().mockReturnValue('application/json'),
        statusCode: 200,
      };
    });

    it('should optimize response with compression', async () => {
      // Arrange
      const largePayload = { data: 'x'.repeat(2000) }; // Larger than compression threshold
      mockReply.getHeader.mockReturnValue('application/json');

      // Act
      const result = await responseOptimizer.optimizeResponse(
        mockRequest,
        mockReply,
        largePayload
      );

      // Assert
      expect(result).toBeDefined();
      expect(mockReply.header).toHaveBeenCalledWith(
        'Content-Encoding',
        expect.any(String)
      );
    });

    it('should handle ETag validation', async () => {
      // Arrange
      const payload = { id: 1, name: 'test' };
      const etag = '"test-etag"';
      mockRequest.headers['if-none-match'] = etag;

      // Mock ETag generation to return the same value
      vi.spyOn(responseOptimizer as any, 'generateETag').mockReturnValue(etag);

      // Act
      const result = await responseOptimizer.optimizeResponse(
        mockRequest,
        mockReply,
        payload
      );

      // Assert
      expect(mockReply.code).toHaveBeenCalledWith(304);
      expect(result).toBe('');
    });

    it('should cache responses appropriately', async () => {
      // Arrange
      const payload = { id: 1, name: 'test' };
      mockRequest.method = 'GET';
      mockRequest.url = '/api/cacheable';

      // Act
      const result = await responseOptimizer.optimizeResponse(
        mockRequest,
        mockReply,
        payload
      );

      // Assert
      expect(result).toEqual(payload);
      expect(mockReply.header).toHaveBeenCalledWith('X-Cache', 'MISS');
    });

    it('should skip compression for small payloads', async () => {
      // Arrange
      const smallPayload = { id: 1 }; // Smaller than compression threshold

      // Act
      const result = await responseOptimizer.optimizeResponse(
        mockRequest,
        mockReply,
        smallPayload
      );

      // Assert
      expect(result).toEqual(smallPayload);
      expect(mockReply.header).not.toHaveBeenCalledWith(
        'Content-Encoding',
        expect.any(String)
      );
    });

    it('should provide optimization statistics', () => {
      // Act
      const stats = responseOptimizer.getStats();

      // Assert
      expect(stats).toHaveProperty('responseCacheSize');
      expect(stats).toHaveProperty('compressionCacheSize');
      expect(stats).toHaveProperty('config');
    });
  });

  describe('BenchmarkSuite', () => {
    let benchmarkSuite: BenchmarkSuite;

    beforeEach(() => {
      benchmarkSuite = new BenchmarkSuite();
    });

    afterEach(() => {
      benchmarkSuite.stopScheduledBenchmarks();
    });

    it('should register and run benchmarks', async () => {
      // Arrange
      const testFunction = vi.fn().mockResolvedValue(undefined);

      benchmarkSuite.registerBenchmark(
        {
          name: 'test_benchmark',
          description: 'Test benchmark',
          iterations: 10,
          warmupIterations: 2,
          concurrency: 2,
          timeout: 5000,
          enabled: true,
        },
        testFunction
      );

      // Act
      const result = await benchmarkSuite.runBenchmark('test_benchmark');

      // Assert
      expect(result).toBeDefined();
      expect(result.name).toBe('test_benchmark');
      expect(result.iterations).toBe(10);
      expect(testFunction).toHaveBeenCalled();
    });

    it('should handle benchmark failures', async () => {
      // Arrange
      const failingFunction = vi
        .fn()
        .mockRejectedValue(new Error('Test error'));

      benchmarkSuite.registerBenchmark(
        {
          name: 'failing_benchmark',
          description: 'Failing benchmark',
          iterations: 5,
          warmupIterations: 0,
          concurrency: 1,
          timeout: 5000,
          enabled: true,
        },
        failingFunction
      );

      // Act & Assert
      await expect(
        benchmarkSuite.runBenchmark('failing_benchmark')
      ).rejects.toThrow();
    });

    it('should run all enabled benchmarks', async () => {
      // Arrange
      const testFunction1 = vi.fn().mockResolvedValue(undefined);
      const testFunction2 = vi.fn().mockResolvedValue(undefined);

      benchmarkSuite.registerBenchmark(
        {
          name: 'benchmark1',
          description: 'First benchmark',
          iterations: 5,
          warmupIterations: 0,
          concurrency: 1,
          timeout: 5000,
          enabled: true,
        },
        testFunction1
      );

      benchmarkSuite.registerBenchmark(
        {
          name: 'benchmark2',
          description: 'Second benchmark',
          iterations: 5,
          warmupIterations: 0,
          concurrency: 1,
          timeout: 5000,
          enabled: true,
        },
        testFunction2
      );

      // Act
      const results = await benchmarkSuite.runAllBenchmarks();

      // Assert
      expect(results.size).toBe(2);
      expect(results.has('benchmark1')).toBe(true);
      expect(results.has('benchmark2')).toBe(true);
    });

    it('should generate performance reports', async () => {
      // Arrange
      const testFunction = vi.fn().mockResolvedValue(undefined);

      benchmarkSuite.registerBenchmark(
        {
          name: 'report_benchmark',
          description: 'Benchmark for report',
          iterations: 5,
          warmupIterations: 0,
          concurrency: 1,
          timeout: 5000,
          enabled: true,
        },
        testFunction
      );

      await benchmarkSuite.runBenchmark('report_benchmark');

      // Act
      const report = benchmarkSuite.generateReport();

      // Assert
      expect(report).toContain('# Performance Benchmark Report');
      expect(report).toContain('report_benchmark');
    });
  });

  describe('Performance Module Factory', () => {
    it('should create performance module with default configuration', async () => {
      // Act
      const performanceModule = await createPerformanceModule(
        defaultPerformanceConfig,
        mockCache as any,
        mockDbManager as any
      );

      // Assert
      expect(performanceModule).toBeDefined();
      expect(performanceModule.queryOptimizer).toBeDefined();
      expect(performanceModule.connectionPoolManager).toBeDefined();
      expect(performanceModule.cacheWarmingSystem).toBeDefined();
      expect(performanceModule.responseOptimizer).toBeDefined();
      expect(performanceModule.benchmarkSuite).toBeDefined();

      // Cleanup
      await performanceModule.stop();
    });

    it('should provide module status', async () => {
      // Arrange
      const performanceModule = await createPerformanceModule(
        defaultPerformanceConfig,
        mockCache as any,
        mockDbManager as any
      );

      // Act
      const status = performanceModule.getStatus();

      // Assert
      expect(status).toHaveProperty('queryOptimizer');
      expect(status).toHaveProperty('connectionPoolManager');
      expect(status).toHaveProperty('cacheWarmingSystem');
      expect(status).toHaveProperty('responseOptimizer');
      expect(status).toHaveProperty('benchmarkSuite');

      // Cleanup
      await performanceModule.stop();
    });

    it('should start and stop performance module', async () => {
      // Arrange
      const performanceModule = await createPerformanceModule(
        defaultPerformanceConfig,
        mockCache as any,
        mockDbManager as any
      );

      // Act
      await performanceModule.start();
      const statusAfterStart = performanceModule.getStatus();

      await performanceModule.stop();
      const statusAfterStop = performanceModule.getStatus();

      // Assert
      expect(statusAfterStart.cacheWarmingSystem.status.isRunning).toBe(true);
      expect(statusAfterStop.cacheWarmingSystem.status.isRunning).toBe(false);
    });
  });
});
