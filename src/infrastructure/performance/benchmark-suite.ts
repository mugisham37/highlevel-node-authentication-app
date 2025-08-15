/**
 * Performance Benchmarking and Monitoring Suite
 * Provides comprehensive performance testing, benchmarking, and continuous monitoring
 */

import { performanceTracker } from '../monitoring/performance-tracker';
import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { EventEmitter } from 'events';

export interface BenchmarkConfig {
  name: string;
  description: string;
  iterations: number;
  warmupIterations: number;
  concurrency: number;
  timeout: number; // milliseconds
  enabled: boolean;
  schedule?: {
    interval?: number; // milliseconds
    cron?: string;
  };
}

export interface BenchmarkResult {
  name: string;
  timestamp: Date;
  iterations: number;
  concurrency: number;
  duration: number; // Total duration in ms
  averageTime: number; // Average per operation in ms
  minTime: number;
  maxTime: number;
  p50: number;
  p95: number;
  p99: number;
  throughput: number; // Operations per second
  errorRate: number;
  memoryUsage: {
    before: NodeJS.MemoryUsage;
    after: NodeJS.MemoryUsage;
    peak: NodeJS.MemoryUsage;
  };
  cpuUsage: NodeJS.CpuUsage;
  errors: Error[];
  metadata: Record<string, any>;
}

export interface LoadTestConfig {
  name: string;
  targetRPS: number; // Requests per second
  duration: number; // Test duration in seconds
  rampUpTime: number; // Ramp up time in seconds
  maxConcurrency: number;
  timeout: number;
  endpoints: LoadTestEndpoint[];
}

export interface LoadTestEndpoint {
  path: string;
  method: 'GET' | 'POST' | 'PUT' | 'DELETE';
  weight: number; // Relative weight for request distribution
  headers?: Record<string, string>;
  body?: any;
  expectedStatus?: number[];
}

export interface LoadTestResult {
  name: string;
  timestamp: Date;
  duration: number;
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  averageResponseTime: number;
  minResponseTime: number;
  maxResponseTime: number;
  p50: number;
  p95: number;
  p99: number;
  actualRPS: number;
  errorRate: number;
  errors: Map<string, number>;
  endpointStats: Map<string, EndpointStats>;
}

export interface EndpointStats {
  path: string;
  method: string;
  requests: number;
  successes: number;
  failures: number;
  averageTime: number;
  minTime: number;
  maxTime: number;
  errors: Map<string, number>;
}

export class BenchmarkSuite extends EventEmitter {
  private benchmarks = new Map<string, BenchmarkConfig>();
  private results = new Map<string, BenchmarkResult[]>();
  private scheduledBenchmarks = new Map<string, NodeJS.Timeout>();
  private isRunning = false;
  private maxResultsPerBenchmark = 100;

  constructor() {
    super();
    this.setupDefaultBenchmarks();
  }

  /**
   * Register a benchmark
   */
  registerBenchmark(
    config: BenchmarkConfig,
    testFunction: () => Promise<void>
  ): void {
    this.benchmarks.set(config.name, config);

    // Store the test function
    (this as any)[`_test_${config.name}`] = testFunction;

    logger.info('Benchmark registered', {
      name: config.name,
      iterations: config.iterations,
      concurrency: config.concurrency,
    });

    this.emit('benchmark_registered', config);
  }

  /**
   * Run a specific benchmark
   */
  async runBenchmark(name: string): Promise<BenchmarkResult> {
    const config = this.benchmarks.get(name);
    if (!config) {
      throw new Error(`Benchmark ${name} not found`);
    }

    if (!config.enabled) {
      throw new Error(`Benchmark ${name} is disabled`);
    }

    const testFunction = (this as any)[`_test_${name}`];
    if (!testFunction) {
      throw new Error(`Test function for benchmark ${name} not found`);
    }

    logger.info('Starting benchmark', {
      name,
      iterations: config.iterations,
      concurrency: config.concurrency,
    });

    const metricId = performanceTracker.startTracking(
      'benchmark_execution',
      'benchmark_suite',
      { benchmarkName: name }
    );

    try {
      const result = await this.executeBenchmark(config, testFunction);

      // Store result
      if (!this.results.has(name)) {
        this.results.set(name, []);
      }

      const results = this.results.get(name)!;
      results.push(result);

      // Trim old results
      if (results.length > this.maxResultsPerBenchmark) {
        results.splice(0, results.length - this.maxResultsPerBenchmark);
      }

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        benchmarkName: name,
        duration: result.duration,
        throughput: result.throughput,
      });

      logger.info('Benchmark completed', {
        name,
        duration: result.duration,
        averageTime: result.averageTime,
        throughput: result.throughput,
        errorRate: result.errorRate,
      });

      this.emit('benchmark_completed', result);
      return result;
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      logger.error('Benchmark failed', {
        name,
        error: (error as Error).message,
      });

      this.emit('benchmark_failed', { name, error });
      throw error;
    }
  }

  /**
   * Run all enabled benchmarks
   */
  async runAllBenchmarks(): Promise<Map<string, BenchmarkResult>> {
    const results = new Map<string, BenchmarkResult>();
    const enabledBenchmarks = Array.from(this.benchmarks.entries()).filter(
      ([_, config]) => config.enabled
    );

    logger.info('Running all benchmarks', {
      totalBenchmarks: enabledBenchmarks.length,
    });

    for (const [name, _] of enabledBenchmarks) {
      try {
        const result = await this.runBenchmark(name);
        results.set(name, result);
      } catch (error) {
        logger.error('Benchmark execution failed', {
          benchmarkName: name,
          error: (error as Error).message,
        });
      }
    }

    logger.info('All benchmarks completed', {
      totalRun: results.size,
      totalFailed: enabledBenchmarks.length - results.size,
    });

    return results;
  }

  /**
   * Execute load test
   */
  async runLoadTest(config: LoadTestConfig): Promise<LoadTestResult> {
    logger.info('Starting load test', {
      name: config.name,
      targetRPS: config.targetRPS,
      duration: config.duration,
      endpoints: config.endpoints.length,
    });

    const metricId = performanceTracker.startTracking(
      'load_test',
      'benchmark_suite',
      { testName: config.name }
    );

    try {
      const result = await this.executeLoadTest(config);

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        testName: config.name,
        totalRequests: result.totalRequests,
        actualRPS: result.actualRPS,
        errorRate: result.errorRate,
      });

      logger.info('Load test completed', {
        name: config.name,
        totalRequests: result.totalRequests,
        actualRPS: result.actualRPS,
        averageResponseTime: result.averageResponseTime,
        errorRate: result.errorRate,
      });

      this.emit('load_test_completed', result);
      return result;
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      logger.error('Load test failed', {
        name: config.name,
        error: (error as Error).message,
      });

      this.emit('load_test_failed', { name: config.name, error });
      throw error;
    }
  }

  /**
   * Execute benchmark with concurrency control
   */
  private async executeBenchmark(
    config: BenchmarkConfig,
    testFunction: () => Promise<void>
  ): Promise<BenchmarkResult> {
    const startTime = Date.now();
    const memoryBefore = process.memoryUsage();
    const cpuBefore = process.cpuUsage();

    let peakMemory = memoryBefore;
    const times: number[] = [];
    const errors: Error[] = [];

    // Warmup iterations
    if (config.warmupIterations > 0) {
      logger.debug('Running warmup iterations', {
        warmupIterations: config.warmupIterations,
      });

      for (let i = 0; i < config.warmupIterations; i++) {
        try {
          await testFunction();
        } catch (error) {
          // Ignore warmup errors
        }
      }
    }

    // Main benchmark execution
    const batches = Math.ceil(config.iterations / config.concurrency);

    for (let batch = 0; batch < batches; batch++) {
      const batchSize = Math.min(
        config.concurrency,
        config.iterations - batch * config.concurrency
      );

      const batchPromises: Promise<void>[] = [];

      for (let i = 0; i < batchSize; i++) {
        const promise = this.executeWithTimeout(testFunction, config.timeout)
          .then((duration) => {
            times.push(duration);

            // Update peak memory usage
            const currentMemory = process.memoryUsage();
            if (currentMemory.heapUsed > peakMemory.heapUsed) {
              peakMemory = currentMemory;
            }
          })
          .catch((error) => {
            errors.push(error);
          });

        batchPromises.push(promise);
      }

      await Promise.allSettled(batchPromises);
    }

    const endTime = Date.now();
    const memoryAfter = process.memoryUsage();
    const cpuAfter = process.cpuUsage(cpuBefore);

    // Calculate statistics
    const duration = endTime - startTime;
    const sortedTimes = times.sort((a, b) => a - b);
    const successfulIterations = times.length;

    const result: BenchmarkResult = {
      name: config.name,
      timestamp: new Date(),
      iterations: config.iterations,
      concurrency: config.concurrency,
      duration,
      averageTime:
        times.length > 0 ? times.reduce((a, b) => a + b, 0) / times.length : 0,
      minTime: times.length > 0 ? Math.min(...times) : 0,
      maxTime: times.length > 0 ? Math.max(...times) : 0,
      p50: this.percentile(sortedTimes, 0.5),
      p95: this.percentile(sortedTimes, 0.95),
      p99: this.percentile(sortedTimes, 0.99),
      throughput: successfulIterations / (duration / 1000), // Operations per second
      errorRate: errors.length / config.iterations,
      memoryUsage: {
        before: memoryBefore,
        after: memoryAfter,
        peak: peakMemory,
      },
      cpuUsage: cpuAfter,
      errors,
      metadata: {
        successfulIterations,
        failedIterations: errors.length,
        correlationId: correlationIdManager.getCorrelationId(),
      },
    };

    return result;
  }

  /**
   * Execute load test
   */
  private async executeLoadTest(
    config: LoadTestConfig
  ): Promise<LoadTestResult> {
    const startTime = Date.now();
    const endTime = startTime + config.duration * 1000;
    const rampUpEndTime = startTime + config.rampUpTime * 1000;

    const responseTimes: number[] = [];
    const errors = new Map<string, number>();
    const endpointStats = new Map<string, EndpointStats>();

    let totalRequests = 0;
    let successfulRequests = 0;
    let failedRequests = 0;

    // Initialize endpoint stats
    config.endpoints.forEach((endpoint) => {
      const key = `${endpoint.method} ${endpoint.path}`;
      endpointStats.set(key, {
        path: endpoint.path,
        method: endpoint.method,
        requests: 0,
        successes: 0,
        failures: 0,
        averageTime: 0,
        minTime: Infinity,
        maxTime: 0,
        errors: new Map(),
      });
    });

    // Calculate request distribution
    const totalWeight = config.endpoints.reduce(
      (sum, ep) => sum + ep.weight,
      0
    );
    const endpointDistribution = config.endpoints.map((ep) => ({
      ...ep,
      probability: ep.weight / totalWeight,
    }));

    let currentConcurrency = 1;
    const maxConcurrency = config.maxConcurrency;

    const activeRequests = new Set<Promise<void>>();

    while (Date.now() < endTime) {
      const now = Date.now();

      // Ramp up concurrency
      if (now < rampUpEndTime) {
        const rampUpProgress = (now - startTime) / (rampUpEndTime - startTime);
        currentConcurrency = Math.min(
          maxConcurrency,
          Math.ceil(1 + (maxConcurrency - 1) * rampUpProgress)
        );
      } else {
        currentConcurrency = maxConcurrency;
      }

      // Maintain target concurrency
      while (activeRequests.size < currentConcurrency && Date.now() < endTime) {
        const endpoint = this.selectEndpoint(endpointDistribution);
        const requestPromise = this.executeLoadTestRequest(
          endpoint,
          config.timeout
        )
          .then((result) => {
            totalRequests++;

            if (result.success) {
              successfulRequests++;
              responseTimes.push(result.responseTime);
            } else {
              failedRequests++;
              const errorKey = result.error?.message || 'Unknown error';
              errors.set(errorKey, (errors.get(errorKey) || 0) + 1);
            }

            // Update endpoint stats
            const key = `${endpoint.method} ${endpoint.path}`;
            const stats = endpointStats.get(key)!;
            stats.requests++;

            if (result.success) {
              stats.successes++;
              stats.minTime = Math.min(stats.minTime, result.responseTime);
              stats.maxTime = Math.max(stats.maxTime, result.responseTime);
              stats.averageTime =
                (stats.averageTime * (stats.successes - 1) +
                  result.responseTime) /
                stats.successes;
            } else {
              stats.failures++;
              if (result.error) {
                const errorKey = result.error.message;
                stats.errors.set(
                  errorKey,
                  (stats.errors.get(errorKey) || 0) + 1
                );
              }
            }
          })
          .finally(() => {
            activeRequests.delete(requestPromise);
          });

        activeRequests.add(requestPromise);
      }

      // Small delay to prevent tight loop
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    // Wait for remaining requests to complete
    await Promise.allSettled(Array.from(activeRequests));

    const actualDuration = Date.now() - startTime;
    const sortedTimes = responseTimes.sort((a, b) => a - b);

    const result: LoadTestResult = {
      name: config.name,
      timestamp: new Date(),
      duration: actualDuration,
      totalRequests,
      successfulRequests,
      failedRequests,
      averageResponseTime:
        responseTimes.length > 0
          ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
          : 0,
      minResponseTime:
        responseTimes.length > 0 ? Math.min(...responseTimes) : 0,
      maxResponseTime:
        responseTimes.length > 0 ? Math.max(...responseTimes) : 0,
      p50: this.percentile(sortedTimes, 0.5),
      p95: this.percentile(sortedTimes, 0.95),
      p99: this.percentile(sortedTimes, 0.99),
      actualRPS: totalRequests / (actualDuration / 1000),
      errorRate: failedRequests / totalRequests,
      errors,
      endpointStats,
    };

    return result;
  }

  /**
   * Execute single request with timeout
   */
  private async executeWithTimeout(
    testFunction: () => Promise<void>,
    timeout: number
  ): Promise<number> {
    const startTime = Date.now();

    await Promise.race([
      testFunction(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      ),
    ]);

    return Date.now() - startTime;
  }

  /**
   * Execute load test request
   */
  private async executeLoadTestRequest(
    endpoint: LoadTestEndpoint,
    timeout: number
  ): Promise<{ success: boolean; responseTime: number; error?: Error }> {
    const startTime = Date.now();

    try {
      // Create a promise that will be resolved/rejected based on timeout
      const requestPromise = new Promise<void>((resolve) => {
        // This would make an actual HTTP request to the endpoint in a real implementation
        // For now, we'll simulate the request based on endpoint configuration
        const simulatedLatency = endpoint.weight ? endpoint.weight * 10 : Math.random() * 100;
        setTimeout(resolve, simulatedLatency);
      });

      const timeoutPromise = new Promise<void>((_, reject) => {
        setTimeout(() => reject(new Error(`Request timeout after ${timeout}ms`)), timeout);
      });

      // Race between request and timeout
      await Promise.race([requestPromise, timeoutPromise]);

      const responseTime = Date.now() - startTime;
      return { success: true, responseTime };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      return { success: false, responseTime, error: error as Error };
    }
  }

  /**
   * Select endpoint based on weight distribution
   */
  private selectEndpoint(
    endpoints: (LoadTestEndpoint & { probability: number })[]
  ): LoadTestEndpoint {
    if (endpoints.length === 0) {
      throw new Error('No endpoints available for selection');
    }

    const random = Math.random();
    let cumulativeProbability = 0;

    for (const endpoint of endpoints) {
      cumulativeProbability += endpoint.probability;
      if (random <= cumulativeProbability) {
        return endpoint;
      }
    }

    // Fallback to last endpoint if no match found (this should never happen with proper probability distribution)
    const lastEndpoint = endpoints[endpoints.length - 1];
    if (!lastEndpoint) {
      throw new Error('No fallback endpoint available');
    }
    return lastEndpoint;
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: number[], p: number): number {
    if (sortedArray.length === 0) return 0;
    const index = Math.ceil(sortedArray.length * p) - 1;
    const clampedIndex = Math.max(0, Math.min(index, sortedArray.length - 1));
    const value = sortedArray[clampedIndex];
    return value ?? 0;
  }

  /**
   * Start scheduled benchmarks
   */
  startScheduledBenchmarks() {
    if (this.isRunning) return;

    this.isRunning = true;

    for (const [name, config] of this.benchmarks.entries()) {
      if (config.schedule?.interval) {
        const timer = setInterval(() => {
          this.runBenchmark(name).catch((error) => {
            logger.error('Scheduled benchmark failed', {
              benchmarkName: name,
              error: (error as Error).message,
            });
          });
        }, config.schedule.interval);

        this.scheduledBenchmarks.set(name, timer);
      }
    }

    logger.info('Scheduled benchmarks started', {
      scheduledCount: this.scheduledBenchmarks.size,
    });
  }

  /**
   * Stop scheduled benchmarks
   */
  stopScheduledBenchmarks() {
    if (!this.isRunning) return;

    this.isRunning = false;

    for (const timer of this.scheduledBenchmarks.values()) {
      clearInterval(timer);
    }

    this.scheduledBenchmarks.clear();
    logger.info('Scheduled benchmarks stopped');
  }

  /**
   * Get benchmark results
   */
  getBenchmarkResults(name?: string): Map<string, BenchmarkResult[]> {
    if (name) {
      const results = this.results.get(name);
      return results ? new Map([[name, results]]) : new Map();
    }

    return new Map(this.results);
  }

  /**
   * Setup default benchmarks
   */
  private setupDefaultBenchmarks() {
    // Authentication benchmark
    this.registerBenchmark(
      {
        name: 'authentication_performance',
        description: 'Test authentication endpoint performance',
        iterations: 1000,
        warmupIterations: 100,
        concurrency: 10,
        timeout: 5000,
        enabled: true,
        schedule: {
          interval: 3600000, // Every hour
        },
      },
      async () => {
        // Simulate authentication request
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 50));
      }
    );

    // Database query benchmark
    this.registerBenchmark(
      {
        name: 'database_query_performance',
        description: 'Test database query performance',
        iterations: 500,
        warmupIterations: 50,
        concurrency: 5,
        timeout: 10000,
        enabled: true,
        schedule: {
          interval: 1800000, // Every 30 minutes
        },
      },
      async () => {
        // Simulate database query
        await new Promise((resolve) =>
          setTimeout(resolve, Math.random() * 100)
        );
      }
    );

    // Cache performance benchmark
    this.registerBenchmark(
      {
        name: 'cache_performance',
        description: 'Test cache operation performance',
        iterations: 2000,
        warmupIterations: 200,
        concurrency: 20,
        timeout: 2000,
        enabled: true,
        schedule: {
          interval: 900000, // Every 15 minutes
        },
      },
      async () => {
        // Simulate cache operation
        await new Promise((resolve) => setTimeout(resolve, Math.random() * 10));
      }
    );
  }

  /**
   * Generate performance report
   */
  generateReport(): string {
    const results = this.getBenchmarkResults();
    let report = '# Performance Benchmark Report\n\n';

    report += `Generated: ${new Date().toISOString()}\n\n`;

    for (const [name, benchmarkResults] of results.entries()) {
      if (benchmarkResults.length === 0) continue;

      const latest = benchmarkResults[benchmarkResults.length - 1];
      if (!latest) continue;

      report += `## ${name}\n\n`;
      report += `- **Iterations**: ${latest.iterations}\n`;
      report += `- **Concurrency**: ${latest.concurrency}\n`;
      report += `- **Duration**: ${latest.duration}ms\n`;
      report += `- **Average Time**: ${latest.averageTime.toFixed(2)}ms\n`;
      report += `- **Throughput**: ${latest.throughput.toFixed(2)} ops/sec\n`;
      report += `- **Error Rate**: ${(latest.errorRate * 100).toFixed(2)}%\n`;
      report += `- **P95**: ${latest.p95.toFixed(2)}ms\n`;
      report += `- **P99**: ${latest.p99.toFixed(2)}ms\n\n`;
    }

    return report;
  }
}

/**
 * Weighted Endpoint Selector for Load Testing
 */
export class WeightedEndpointSelector {
  private endpoints: (LoadTestEndpoint & { probability: number })[] = [];

  constructor(endpoints: LoadTestEndpoint[]) {
    this.setupWeightedEndpoints(endpoints);
  }

  /**
   * Setup weighted endpoints with probability distribution
   */
  private setupWeightedEndpoints(endpoints: LoadTestEndpoint[]): void {
    const totalWeight = endpoints.reduce((sum, endpoint) => sum + (endpoint.weight || 1), 0);
    
    this.endpoints = endpoints.map(endpoint => ({
      ...endpoint,
      probability: (endpoint.weight || 1) / totalWeight
    }));
  }

  /**
   * Select random endpoint based on weights
   */
  select(): LoadTestEndpoint {
    if (this.endpoints.length === 0) {
      throw new Error('No endpoints available for selection');
    }

    const random = Math.random();
    let cumulativeProbability = 0;

    for (const endpoint of this.endpoints) {
      cumulativeProbability += endpoint.probability;
      if (random <= cumulativeProbability) {
        const { probability, ...endpointWithoutProbability } = endpoint;
        return endpointWithoutProbability;
      }
    }

    // Fallback to last endpoint
    const lastEndpoint = this.endpoints[this.endpoints.length - 1];
    if (!lastEndpoint) {
      throw new Error('No endpoints available for fallback selection');
    }
    const { probability, ...endpointWithoutProbability } = lastEndpoint;
    return endpointWithoutProbability;
  }

  /**
   * Get endpoint by index with null safety
   */
  getEndpoint(index: number): LoadTestEndpoint | null {
    const endpoint = this.endpoints[index];
    if (!endpoint) {
      return null;
    }
    const { probability, ...endpointWithoutProbability } = endpoint;
    return endpointWithoutProbability;
  }

  /**
   * Get endpoint count
   */
  getEndpointCount(): number {
    return this.endpoints.length;
  }
}

// Export singleton instance
export const benchmarkSuite = new BenchmarkSuite();
