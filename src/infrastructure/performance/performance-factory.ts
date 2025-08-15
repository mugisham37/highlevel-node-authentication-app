/**
 * Performance Module Factory
 * Creates and configures all performance optimization components
 */

import { QueryOptimizer, QueryOptimizationConfig } from './query-optimizer';
import {
  ConnectionPoolManager,
  PoolConfiguration,
  RoundRobinStrategy,
  LeastConnectionsStrategy,
  WeightedRoundRobinStrategy,
  ResponseTimeStrategy,
  RandomStrategy,
  LoadBalancingStrategy,
} from './connection-pool-manager';
import { CacheWarmingSystem, WarmingConfig } from './cache-warming';
import {
  ResponseOptimizer,
  OptimizationConfig,
  defaultOptimizationConfig,
} from './response-optimizer';
import { benchmarkSuite, BenchmarkSuite } from './benchmark-suite';
import { MultiLayerCache } from '../cache/multi-layer-cache';
import { DatabaseConnectionManager } from '../database/connection-manager';
import { logger } from '../logging/winston-logger';

export interface PerformanceModuleConfig {
  queryOptimization: QueryOptimizationConfig;
  connectionPooling: {
    enabled: boolean;
    strategy:
      | 'round_robin'
      | 'least_connections'
      | 'weighted_round_robin'
      | 'response_time'
      | 'random';
    pools: PoolConfiguration[];
  };
  cacheWarming: WarmingConfig;
  responseOptimization: OptimizationConfig;
  benchmarking: {
    enabled: boolean;
    scheduledBenchmarks: boolean;
  };
}

export interface PerformanceModule {
  queryOptimizer: QueryOptimizer;
  connectionPoolManager: ConnectionPoolManager;
  cacheWarmingSystem: CacheWarmingSystem;
  responseOptimizer: ResponseOptimizer;
  benchmarkSuite: BenchmarkSuite;

  // Lifecycle methods
  start(): Promise<void>;
  stop(): Promise<void>;
  getStatus(): PerformanceModuleStatus;
}

export interface PerformanceModuleStatus {
  queryOptimizer: {
    enabled: boolean;
    queryStats: any[];
  };
  connectionPoolManager: {
    enabled: boolean;
    totalPools: number;
    healthyPools: string[];
    unhealthyPools: string[];
    metrics: any[];
  };
  cacheWarmingSystem: {
    enabled: boolean;
    status: any;
    jobMetrics: any[];
  };
  responseOptimizer: {
    enabled: boolean;
    stats: any;
  };
  benchmarkSuite: {
    enabled: boolean;
    scheduledBenchmarks: boolean;
    recentResults: Map<string, any[]>;
  };
}

/**
 * Create and configure the performance optimization module
 */
export async function createPerformanceModule(
  config: PerformanceModuleConfig,
  cache: MultiLayerCache,
  dbManager: DatabaseConnectionManager
): Promise<PerformanceModule> {
  logger.info('Initializing performance optimization module', {
    queryOptimization: config.queryOptimization.enableQueryCache,
    connectionPooling: config.connectionPooling.enabled,
    cacheWarming: config.cacheWarming.enabled,
    responseOptimization: config.responseOptimization.compression.enabled,
    benchmarking: config.benchmarking.enabled,
  });

  // Initialize Query Optimizer
  const queryOptimizer = new QueryOptimizer(
    cache,
    dbManager,
    config.queryOptimization
  );

  // Initialize Connection Pool Manager
  const connectionPoolManager = new ConnectionPoolManager(
    createLoadBalancingStrategy(config.connectionPooling.strategy)
  );

  // Add configured pools
  if (config.connectionPooling.enabled) {
    for (const poolConfig of config.connectionPooling.pools) {
      connectionPoolManager.addPool(poolConfig);
    }
  }

  // Initialize Cache Warming System
  const cacheWarmingSystem = new CacheWarmingSystem(
    cache,
    dbManager,
    config.cacheWarming
  );

  // Initialize Response Optimizer
  const responseOptimizer = new ResponseOptimizer(config.responseOptimization);

  // Use the singleton benchmark suite
  const benchmarkSuiteInstance = benchmarkSuite;

  const performanceModule: PerformanceModule = {
    queryOptimizer,
    connectionPoolManager,
    cacheWarmingSystem,
    responseOptimizer,
    benchmarkSuite: benchmarkSuiteInstance,

    async start(): Promise<void> {
      logger.info('Starting performance optimization module');

      try {
        // Start cache warming system
        if (config.cacheWarming.enabled) {
          cacheWarmingSystem.start();
          logger.info('Cache warming system started');
        }

        // Start scheduled benchmarks
        if (
          config.benchmarking.enabled &&
          config.benchmarking.scheduledBenchmarks
        ) {
          benchmarkSuiteInstance.startScheduledBenchmarks();
          logger.info('Scheduled benchmarks started');
        }

        // Set up event listeners for monitoring
        setupEventListeners(performanceModule);

        logger.info('Performance optimization module started successfully');
      } catch (error) {
        logger.error('Failed to start performance optimization module', {
          error: (error as Error).message,
        });
        throw error;
      }
    },

    async stop(): Promise<void> {
      logger.info('Stopping performance optimization module');

      try {
        // Stop cache warming system
        cacheWarmingSystem.stop();

        // Stop scheduled benchmarks
        benchmarkSuiteInstance.stopScheduledBenchmarks();

        // Shutdown connection pool manager
        await connectionPoolManager.shutdown();

        // Clear response optimizer caches
        responseOptimizer.clearCaches();

        logger.info('Performance optimization module stopped successfully');
      } catch (error) {
        logger.error('Error stopping performance optimization module', {
          error: (error as Error).message,
        });
        throw error;
      }
    },

    getStatus(): PerformanceModuleStatus {
      return {
        queryOptimizer: {
          enabled: config.queryOptimization.enableQueryCache,
          queryStats: queryOptimizer.getQueryStats(),
        },
        connectionPoolManager: {
          enabled: config.connectionPooling.enabled,
          totalPools: connectionPoolManager.getAllMetrics().length,
          healthyPools: connectionPoolManager.getHealthyPools(),
          unhealthyPools: connectionPoolManager.getUnhealthyPools(),
          metrics: connectionPoolManager.getAllMetrics(),
        },
        cacheWarmingSystem: {
          enabled: config.cacheWarming.enabled,
          status: cacheWarmingSystem.getSystemStatus(),
          jobMetrics: cacheWarmingSystem.getJobMetrics(),
        },
        responseOptimizer: {
          enabled: config.responseOptimization.compression.enabled,
          stats: responseOptimizer.getStats(),
        },
        benchmarkSuite: {
          enabled: config.benchmarking.enabled,
          scheduledBenchmarks: config.benchmarking.scheduledBenchmarks,
          recentResults: benchmarkSuiteInstance.getBenchmarkResults(),
        },
      };
    },
  };

  return performanceModule;
}

/**
 * Create load balancing strategy based on configuration
 */
function createLoadBalancingStrategy(
  strategyName: string
): LoadBalancingStrategy {
  switch (strategyName) {
    case 'round_robin':
      return new RoundRobinStrategy();
    case 'least_connections':
      return new LeastConnectionsStrategy();
    case 'weighted_round_robin':
      return new WeightedRoundRobinStrategy();
    case 'response_time':
      return new ResponseTimeStrategy();
    case 'random':
      return new RandomStrategy();
    default:
      logger.warn(
        `Unknown load balancing strategy: ${strategyName}, using round_robin`
      );
      return new RoundRobinStrategy();
  }
}

/**
 * Set up event listeners for performance monitoring
 */
function setupEventListeners(performanceModule: PerformanceModule): void {
  // Query Optimizer events would be handled here if needed

  // Connection Pool Manager events
  performanceModule.connectionPoolManager.on('pool_error', (event) => {
    logger.error('Connection pool error', {
      poolName: event.poolName,
      error: event.error.message,
    });
  });

  performanceModule.connectionPoolManager.on('health_check_failed', (event) => {
    logger.warn('Connection pool health check failed', {
      poolName: event.poolName,
      error: event.error.message,
    });
  });

  // Cache Warming System events
  performanceModule.cacheWarmingSystem.on('job_completed', (job) => {
    logger.debug('Cache warming job completed', {
      jobId: job.id,
      jobName: job.name,
      cacheKey: job.cacheKey,
    });
  });

  performanceModule.cacheWarmingSystem.on('job_failed', (job, error) => {
    logger.warn('Cache warming job failed', {
      jobId: job.id,
      jobName: job.name,
      error: (error as Error).message,
    });
  });

  // Benchmark Suite events
  performanceModule.benchmarkSuite.on('benchmark_completed', (result) => {
    logger.info('Benchmark completed', {
      name: result.name,
      duration: result.duration,
      throughput: result.throughput,
      errorRate: result.errorRate,
    });
  });

  performanceModule.benchmarkSuite.on('benchmark_failed', (event) => {
    logger.error('Benchmark failed', {
      name: event.name,
      error: (event.error as Error).message,
    });
  });
}

/**
 * Default performance module configuration
 */
export const defaultPerformanceConfig: PerformanceModuleConfig = {
  queryOptimization: {
    enableQueryCache: true,
    defaultCacheTTL: 300, // 5 minutes
    maxCacheKeyLength: 250,
    compressionThreshold: 1024, // 1KB
    slowQueryThreshold: 100, // 100ms
    enableQueryPlan: true,
    enableReadReplicas: true,
    replicaPreference: 'round_robin',
  },
  connectionPooling: {
    enabled: true,
    strategy: 'round_robin',
    pools: [
      {
        name: 'primary',
        connectionString: process.env.DATABASE_URL || '',
        weight: 1,
        priority: 1,
        healthCheckInterval: 30000,
        maxRetries: 3,
        retryDelay: 1000,
        connectionTimeout: 5000,
        queryTimeout: 30000,
        max: 20,
        min: 2,
      },
    ],
  },
  cacheWarming: {
    enabled: true,
    maxConcurrentJobs: 5,
    jobTimeout: 30000,
    retryAttempts: 3,
    retryDelay: 5000,
    healthCheckInterval: 60000,
    cleanupInterval: 300000,
  },
  responseOptimization: defaultOptimizationConfig,
  benchmarking: {
    enabled: true,
    scheduledBenchmarks: true,
  },
};
