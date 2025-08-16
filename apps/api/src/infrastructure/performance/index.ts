/**
 * Performance Optimization and Caching Module
 * Exports all performance optimization components and utilities
 */

// Query Optimization
export { QueryOptimizer } from './query-optimizer';
export type {
  QueryCacheOptions,
  QueryOptimizationConfig,
  QueryMetrics,
  QueryPlan,
} from './query-optimizer';

// Connection Pool Management
export {
  ConnectionPoolManager,
  RoundRobinStrategy,
  LeastConnectionsStrategy,
  WeightedRoundRobinStrategy,
  ResponseTimeStrategy,
  RandomStrategy,
} from './connection-pool-manager';
export type {
  PoolConfiguration,
  ConnectionMetrics,
  LoadBalancingStrategy,
  QueryExecutionOptions,
} from './connection-pool-manager';

// Cache Warming
export { CacheWarmingSystem } from './cache-warming';
export type {
  WarmingStrategy,
  WarmingJob,
  WarmingConfig,
} from './cache-warming';

// Response Optimization
export {
  ResponseOptimizer,
  defaultOptimizationConfig,
} from './response-optimizer';
export type {
  CompressionConfig,
  CacheConfig,
  OptimizationConfig,
  ResponseMetrics,
} from './response-optimizer';

// Benchmarking
export { benchmarkSuite, BenchmarkSuite } from './benchmark-suite';
export type {
  BenchmarkConfig,
  BenchmarkResult,
  LoadTestConfig,
  LoadTestResult,
  EndpointStats,
} from './benchmark-suite';

// Performance Factory
export { createPerformanceModule } from './performance-factory';
export type { PerformanceModule } from './performance-factory';
