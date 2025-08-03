/**
 * Advanced Database Connection Pool Manager with Load Balancing
 * Provides intelligent connection pooling, load balancing, and performance optimization
 */

import { Pool, PoolClient, PoolConfig } from 'pg';
import { performanceTracker } from '../monitoring/performance-tracker';
import { metricsManager } from '../monitoring/prometheus-metrics';
import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { EventEmitter } from 'events';

export interface PoolConfiguration extends PoolConfig {
  name: string;
  weight: number; // Load balancing weight
  priority: number; // Connection priority (1 = highest)
  healthCheckInterval: number; // Health check interval in ms
  maxRetries: number;
  retryDelay: number;
  connectionTimeout: number;
  queryTimeout: number;
}

export interface ConnectionMetrics {
  poolName: string;
  totalConnections: number;
  activeConnections: number;
  idleConnections: number;
  waitingClients: number;
  totalQueries: number;
  averageQueryTime: number;
  errorRate: number;
  lastHealthCheck: Date;
  isHealthy: boolean;
  responseTime: number;
}

export interface LoadBalancingStrategy {
  name:
    | 'round_robin'
    | 'least_connections'
    | 'weighted_round_robin'
    | 'response_time'
    | 'random';
  selectPool(
    pools: ManagedPool[],
    excludeUnhealthy?: boolean
  ): ManagedPool | null;
}

export interface QueryExecutionOptions {
  timeout?: number;
  retries?: number;
  preferredPool?: string;
  excludePools?: string[];
  requireHealthy?: boolean;
  priority?: 'low' | 'normal' | 'high';
}

class ManagedPool extends EventEmitter {
  private pool: Pool;
  private metrics: ConnectionMetrics;
  private healthCheckTimer?: NodeJS.Timeout;
  private queryTimes: number[] = [];
  private maxQueryTimeHistory = 100;

  constructor(private config: PoolConfiguration) {
    super();

    this.pool = new Pool({
      ...config,
      max: config.max || 20,
      min: config.min || 2,
      idleTimeoutMillis: config.idleTimeoutMillis || 30000,
      connectionTimeoutMillis: config.connectionTimeout || 5000,
    });

    this.metrics = {
      poolName: config.name,
      totalConnections: 0,
      activeConnections: 0,
      idleConnections: 0,
      waitingClients: 0,
      totalQueries: 0,
      averageQueryTime: 0,
      errorRate: 0,
      lastHealthCheck: new Date(),
      isHealthy: true,
      responseTime: 0,
    };

    this.setupEventListeners();
    this.startHealthChecks();
  }

  private setupEventListeners(): void {
    this.pool.on('connect', (client) => {
      this.metrics.totalConnections++;
      logger.debug(`New connection established in pool ${this.config.name}`, {
        totalConnections: this.metrics.totalConnections,
      });
    });

    this.pool.on('remove', (client) => {
      this.metrics.totalConnections--;
      logger.debug(`Connection removed from pool ${this.config.name}`, {
        totalConnections: this.metrics.totalConnections,
      });
    });

    this.pool.on('error', (error) => {
      logger.error(`Pool error in ${this.config.name}`, {
        error: error.message,
        poolName: this.config.name,
      });
      this.emit('pool_error', error);
    });
  }

  async executeQuery<T>(
    queryText: string,
    values?: any[],
    options: QueryExecutionOptions = {}
  ): Promise<T> {
    const metricId = performanceTracker.startTracking(
      'pool_query',
      'connection_pool',
      { poolName: this.config.name, queryText: queryText.substring(0, 100) }
    );

    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      // Get connection with timeout
      client = await this.getConnection(
        options.timeout || this.config.connectionTimeout
      );

      // Execute query with timeout
      const queryTimeout = options.timeout || this.config.queryTimeout || 30000;
      const result = await Promise.race([
        client.query(queryText, values),
        this.createTimeoutPromise(queryTimeout, 'Query timeout'),
      ]);

      const duration = Date.now() - startTime;

      // Update metrics
      this.updateQueryMetrics(duration, true);
      this.metrics.totalQueries++;

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        duration,
        poolName: this.config.name,
      });

      metricsManager.recordDatabaseQuery(
        'query',
        'unknown',
        'pg',
        'success',
        duration
      );

      return result.rows as T;
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateQueryMetrics(duration, false);

      performanceTracker.stopTracking(metricId, 'error', error as Error);

      metricsManager.recordDatabaseQuery(
        'query',
        'unknown',
        'pg',
        'error',
        duration,
        (error as Error).name
      );

      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  async executeTransaction<T>(
    transactionFn: (client: PoolClient) => Promise<T>,
    options: QueryExecutionOptions = {}
  ): Promise<T> {
    const metricId = performanceTracker.startTracking(
      'pool_transaction',
      'connection_pool',
      { poolName: this.config.name }
    );

    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      client = await this.getConnection(
        options.timeout || this.config.connectionTimeout
      );

      await client.query('BEGIN');

      const result = await transactionFn(client);

      await client.query('COMMIT');

      const duration = Date.now() - startTime;
      this.updateQueryMetrics(duration, true);

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        duration,
        poolName: this.config.name,
      });

      return result;
    } catch (error) {
      if (client) {
        try {
          await client.query('ROLLBACK');
        } catch (rollbackError) {
          logger.error('Transaction rollback failed', {
            poolName: this.config.name,
            error: (rollbackError as Error).message,
          });
        }
      }

      const duration = Date.now() - startTime;
      this.updateQueryMetrics(duration, false);

      performanceTracker.stopTracking(metricId, 'error', error as Error);

      throw error;
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  private async getConnection(timeout: number): Promise<PoolClient> {
    return Promise.race([
      this.pool.connect(),
      this.createTimeoutPromise(timeout, 'Connection timeout'),
    ]);
  }

  private createTimeoutPromise<T>(
    timeout: number,
    message: string
  ): Promise<T> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error(message)), timeout);
    });
  }

  private updateQueryMetrics(duration: number, success: boolean): void {
    this.queryTimes.push(duration);

    if (this.queryTimes.length > this.maxQueryTimeHistory) {
      this.queryTimes.shift();
    }

    this.metrics.averageQueryTime =
      this.queryTimes.reduce((sum, time) => sum + time, 0) /
      this.queryTimes.length;

    if (!success) {
      this.metrics.errorRate = this.metrics.errorRate * 0.9 + 0.1; // Exponential moving average
    } else {
      this.metrics.errorRate = this.metrics.errorRate * 0.95; // Decay error rate
    }
  }

  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  private async performHealthCheck(): Promise<void> {
    const startTime = Date.now();

    try {
      await this.executeQuery('SELECT 1 as health_check', [], {
        timeout: 5000,
      });

      const responseTime = Date.now() - startTime;
      this.metrics.responseTime = responseTime;
      this.metrics.isHealthy = true;
      this.metrics.lastHealthCheck = new Date();

      // Update Prometheus metrics
      metricsManager.updateHealthCheckStatus(
        `pool_${this.config.name}`,
        'healthy'
      );

      logger.debug(`Health check passed for pool ${this.config.name}`, {
        responseTime,
        poolName: this.config.name,
      });
    } catch (error) {
      this.metrics.isHealthy = false;
      this.metrics.lastHealthCheck = new Date();

      metricsManager.updateHealthCheckStatus(
        `pool_${this.config.name}`,
        'unhealthy'
      );

      logger.error(`Health check failed for pool ${this.config.name}`, {
        error: (error as Error).message,
        poolName: this.config.name,
      });

      this.emit('health_check_failed', error);
    }
  }

  getMetrics(): ConnectionMetrics {
    // Update real-time metrics from pool
    this.metrics.activeConnections = this.pool.totalCount - this.pool.idleCount;
    this.metrics.idleConnections = this.pool.idleCount;
    this.metrics.waitingClients = this.pool.waitingCount;
    this.metrics.totalConnections = this.pool.totalCount;

    return { ...this.metrics };
  }

  getConfig(): PoolConfiguration {
    return { ...this.config };
  }

  async shutdown(): Promise<void> {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    try {
      await this.pool.end();
      logger.info(`Pool ${this.config.name} shutdown complete`);
    } catch (error) {
      logger.error(`Error shutting down pool ${this.config.name}`, {
        error: (error as Error).message,
      });
    }
  }
}

export class ConnectionPoolManager extends EventEmitter {
  private pools = new Map<string, ManagedPool>();
  private loadBalancingStrategy: LoadBalancingStrategy;
  private metricsCollectionTimer?: NodeJS.Timeout;
  private roundRobinIndex = 0;

  constructor(
    loadBalancingStrategy: LoadBalancingStrategy = new RoundRobinStrategy()
  ) {
    super();
    this.loadBalancingStrategy = loadBalancingStrategy;
    this.startMetricsCollection();
  }

  addPool(config: PoolConfiguration): void {
    if (this.pools.has(config.name)) {
      throw new Error(`Pool with name ${config.name} already exists`);
    }

    const pool = new ManagedPool(config);

    pool.on('pool_error', (error) => {
      this.emit('pool_error', { poolName: config.name, error });
    });

    pool.on('health_check_failed', (error) => {
      this.emit('health_check_failed', { poolName: config.name, error });
    });

    this.pools.set(config.name, pool);

    logger.info(`Added connection pool: ${config.name}`, {
      poolName: config.name,
      maxConnections: config.max,
      weight: config.weight,
      priority: config.priority,
    });
  }

  removePool(poolName: string): Promise<void> {
    const pool = this.pools.get(poolName);
    if (!pool) {
      throw new Error(`Pool ${poolName} not found`);
    }

    this.pools.delete(poolName);
    return pool.shutdown();
  }

  async executeQuery<T>(
    queryText: string,
    values?: any[],
    options: QueryExecutionOptions = {}
  ): Promise<T> {
    const pool = this.selectPool(options);
    if (!pool) {
      throw new Error('No healthy pools available');
    }

    const metricId = performanceTracker.startTracking(
      'pooled_query',
      'pool_manager',
      { selectedPool: pool.getConfig().name }
    );

    try {
      const result = await pool.executeQuery<T>(queryText, values, options);

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        poolName: pool.getConfig().name,
      });

      return result;
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);

      // Try with different pool if retries are enabled
      if (options.retries && options.retries > 0) {
        const retryOptions = { ...options, retries: options.retries - 1 };
        return this.executeQuery(queryText, values, retryOptions);
      }

      throw error;
    }
  }

  async executeTransaction<T>(
    transactionFn: (client: PoolClient) => Promise<T>,
    options: QueryExecutionOptions = {}
  ): Promise<T> {
    const pool = this.selectPool(options);
    if (!pool) {
      throw new Error('No healthy pools available');
    }

    return pool.executeTransaction(transactionFn, options);
  }

  private selectPool(options: QueryExecutionOptions): ManagedPool | null {
    let availablePools = Array.from(this.pools.values());

    // Filter by preferred pool
    if (options.preferredPool) {
      const preferred = this.pools.get(options.preferredPool);
      if (
        preferred &&
        (!options.requireHealthy || preferred.getMetrics().isHealthy)
      ) {
        return preferred;
      }
    }

    // Filter by excluded pools
    if (options.excludePools) {
      availablePools = availablePools.filter(
        (pool) => !options.excludePools!.includes(pool.getConfig().name)
      );
    }

    // Filter by health requirement
    if (options.requireHealthy !== false) {
      availablePools = availablePools.filter(
        (pool) => pool.getMetrics().isHealthy
      );
    }

    // Filter by priority if specified
    if (options.priority) {
      const priorityMap = { low: 3, normal: 2, high: 1 };
      const requiredPriority = priorityMap[options.priority];
      availablePools = availablePools.filter(
        (pool) => pool.getConfig().priority <= requiredPriority
      );
    }

    if (availablePools.length === 0) {
      return null;
    }

    return this.loadBalancingStrategy.selectPool(availablePools);
  }

  getAllMetrics(): ConnectionMetrics[] {
    return Array.from(this.pools.values()).map((pool) => pool.getMetrics());
  }

  getPoolMetrics(poolName: string): ConnectionMetrics | null {
    const pool = this.pools.get(poolName);
    return pool ? pool.getMetrics() : null;
  }

  getHealthyPools(): string[] {
    return Array.from(this.pools.values())
      .filter((pool) => pool.getMetrics().isHealthy)
      .map((pool) => pool.getConfig().name);
  }

  getUnhealthyPools(): string[] {
    return Array.from(this.pools.values())
      .filter((pool) => !pool.getMetrics().isHealthy)
      .map((pool) => pool.getConfig().name);
  }

  setLoadBalancingStrategy(strategy: LoadBalancingStrategy): void {
    this.loadBalancingStrategy = strategy;
    logger.info(`Load balancing strategy changed to: ${strategy.name}`);
  }

  private startMetricsCollection(): void {
    this.metricsCollectionTimer = setInterval(() => {
      this.collectAndReportMetrics();
    }, 30000); // Every 30 seconds
  }

  private collectAndReportMetrics(): void {
    const allMetrics = this.getAllMetrics();

    allMetrics.forEach((metrics) => {
      // Update Prometheus metrics
      metricsManager.databaseMetrics.dbConnections.set(
        { pool: metrics.poolName, state: 'active' },
        metrics.activeConnections
      );

      metricsManager.databaseMetrics.dbConnections.set(
        { pool: metrics.poolName, state: 'idle' },
        metrics.idleConnections
      );

      metricsManager.databaseMetrics.dbConnections.set(
        { pool: metrics.poolName, state: 'waiting' },
        metrics.waitingClients
      );
    });

    const totalPools = this.pools.size;
    const healthyPools = this.getHealthyPools().length;
    const unhealthyPools = this.getUnhealthyPools().length;

    logger.info('Connection pool metrics', {
      totalPools,
      healthyPools,
      unhealthyPools,
      totalConnections: allMetrics.reduce(
        (sum, m) => sum + m.totalConnections,
        0
      ),
      totalQueries: allMetrics.reduce((sum, m) => sum + m.totalQueries, 0),
      correlationId: correlationIdManager.getCorrelationId(),
    });
  }

  async shutdown(): Promise<void> {
    if (this.metricsCollectionTimer) {
      clearInterval(this.metricsCollectionTimer);
    }

    const shutdownPromises = Array.from(this.pools.values()).map((pool) =>
      pool.shutdown()
    );

    await Promise.allSettled(shutdownPromises);
    this.pools.clear();

    logger.info('Connection pool manager shutdown complete');
  }
}

// Load Balancing Strategies
export class RoundRobinStrategy implements LoadBalancingStrategy {
  name = 'round_robin' as const;
  private index = 0;

  selectPool(pools: ManagedPool[]): ManagedPool | null {
    if (pools.length === 0) return null;

    const pool = pools[this.index % pools.length];
    this.index = (this.index + 1) % pools.length;
    return pool;
  }
}

export class LeastConnectionsStrategy implements LoadBalancingStrategy {
  name = 'least_connections' as const;

  selectPool(pools: ManagedPool[]): ManagedPool | null {
    if (pools.length === 0) return null;

    return pools.reduce((best, current) => {
      const bestMetrics = best.getMetrics();
      const currentMetrics = current.getMetrics();

      return currentMetrics.activeConnections < bestMetrics.activeConnections
        ? current
        : best;
    });
  }
}

export class WeightedRoundRobinStrategy implements LoadBalancingStrategy {
  name = 'weighted_round_robin' as const;
  private weightedPools: ManagedPool[] = [];
  private index = 0;

  selectPool(pools: ManagedPool[]): ManagedPool | null {
    if (pools.length === 0) return null;

    // Rebuild weighted pool list if needed
    if (this.weightedPools.length === 0) {
      this.buildWeightedPools(pools);
    }

    const pool = this.weightedPools[this.index % this.weightedPools.length];
    this.index = (this.index + 1) % this.weightedPools.length;
    return pool;
  }

  private buildWeightedPools(pools: ManagedPool[]): void {
    this.weightedPools = [];

    pools.forEach((pool) => {
      const weight = pool.getConfig().weight || 1;
      for (let i = 0; i < weight; i++) {
        this.weightedPools.push(pool);
      }
    });
  }
}

export class ResponseTimeStrategy implements LoadBalancingStrategy {
  name = 'response_time' as const;

  selectPool(pools: ManagedPool[]): ManagedPool | null {
    if (pools.length === 0) return null;

    return pools.reduce((best, current) => {
      const bestMetrics = best.getMetrics();
      const currentMetrics = current.getMetrics();

      return currentMetrics.responseTime < bestMetrics.responseTime
        ? current
        : best;
    });
  }
}

export class RandomStrategy implements LoadBalancingStrategy {
  name = 'random' as const;

  selectPool(pools: ManagedPool[]): ManagedPool | null {
    if (pools.length === 0) return null;

    const randomIndex = Math.floor(Math.random() * pools.length);
    return pools[randomIndex];
  }
}
