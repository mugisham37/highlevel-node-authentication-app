/**
 * Health Check System for System Monitoring
 * Provides comprehensive health monitoring and status endpoints
 */

import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { circuitBreakerManager } from '../resilience/circuit-breaker';
import { degradationManagers } from '../resilience/graceful-degradation';

export interface HealthCheckResult {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  timestamp: Date;
  details?: Record<string, any>;
  error?: string;
}

export interface SystemHealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  timestamp: Date;
  uptime: number;
  version?: string;
  environment?: string;
  checks: HealthCheckResult[];
  summary: {
    total: number;
    healthy: number;
    degraded: number;
    unhealthy: number;
  };
  correlationId?: string;
}

export interface HealthCheckOptions {
  timeout: number;
  interval?: number;
  retries?: number;
  critical?: boolean;
  tags?: string[];
}

export type HealthCheckFunction = () => Promise<HealthCheckResult>;

/**
 * Individual Health Check
 */
export class HealthCheck {
  private readonly name: string;
  private readonly checkFunction: () => Promise<void>;
  private readonly options: Required<HealthCheckOptions>;
  private lastResult?: HealthCheckResult;
  private consecutiveFailures = 0;

  constructor(
    name: string,
    checkFunction: () => Promise<void>,
    options: Partial<HealthCheckOptions> = {}
  ) {
    this.name = name;
    this.checkFunction = checkFunction;
    this.options = {
      timeout: 5000,
      interval: 30000,
      retries: 2,
      critical: false,
      tags: [],
      ...options,
    };
  }

  /**
   * Execute health check
   */
  async execute(): Promise<HealthCheckResult> {
    const startTime = Date.now();
    const correlationId = correlationIdManager.getCorrelationId();

    try {
      // Execute with timeout
      await Promise.race([this.checkFunction(), this.createTimeoutPromise()]);

      const responseTime = Date.now() - startTime;
      this.consecutiveFailures = 0;

      this.lastResult = {
        name: this.name,
        status: 'healthy',
        responseTime,
        timestamp: new Date(),
        details: {
          consecutiveFailures: this.consecutiveFailures,
          critical: this.options.critical,
          tags: this.options.tags,
        },
      };

      logger.debug('Health check passed', {
        name: this.name,
        responseTime,
        correlationId,
      });

      return this.lastResult;
    } catch (error) {
      const responseTime = Date.now() - startTime;
      this.consecutiveFailures++;

      const status =
        this.consecutiveFailures >= this.options.retries
          ? 'unhealthy'
          : 'degraded';

      this.lastResult = {
        name: this.name,
        status,
        responseTime,
        timestamp: new Date(),
        error: (error as Error).message,
        details: {
          consecutiveFailures: this.consecutiveFailures,
          critical: this.options.critical,
          tags: this.options.tags,
          retries: this.options.retries,
        },
      };

      logger.warn('Health check failed', {
        name: this.name,
        status,
        responseTime,
        consecutiveFailures: this.consecutiveFailures,
        error: (error as Error).message,
        correlationId,
      });

      return this.lastResult;
    }
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(`Health check timeout after ${this.options.timeout}ms`)
        );
      }, this.options.timeout);
    });
  }

  /**
   * Get last result
   */
  getLastResult(): HealthCheckResult | undefined {
    return this.lastResult;
  }

  /**
   * Get check name
   */
  getName(): string {
    return this.name;
  }

  /**
   * Check if this is a critical health check
   */
  isCritical(): boolean {
    return this.options.critical;
  }

  /**
   * Get consecutive failure count
   */
  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }

  /**
   * Reset consecutive failures
   */
  resetFailures(): void {
    this.consecutiveFailures = 0;
  }
}

/**
 * Health Check Manager
 */
export class HealthCheckManager {
  private readonly checks = new Map<string, HealthCheck>();
  private readonly startTime = Date.now();
  private intervalTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private readonly version?: string,
    private readonly environment?: string
  ) {}

  /**
   * Register a health check
   */
  register(
    name: string,
    checkFunction: () => Promise<void>,
    options?: Partial<HealthCheckOptions>
  ): void {
    if (this.checks.has(name)) {
      throw new Error(`Health check '${name}' is already registered`);
    }

    const healthCheck = new HealthCheck(name, checkFunction, options);
    this.checks.set(name, healthCheck);

    logger.info('Health check registered', {
      name,
      options,
      totalChecks: this.checks.size,
    });
  }

  /**
   * Unregister a health check
   */
  unregister(name: string): boolean {
    const removed = this.checks.delete(name);

    if (removed) {
      logger.info('Health check unregistered', {
        name,
        totalChecks: this.checks.size,
      });
    }

    return removed;
  }

  /**
   * Execute all health checks
   */
  async checkHealth(): Promise<SystemHealthStatus> {
    const correlationId = correlationIdManager.getCorrelationId();
    const startTime = Date.now();

    logger.debug('Starting system health check', {
      totalChecks: this.checks.size,
      correlationId,
    });

    // Execute all health checks in parallel
    const checkPromises = Array.from(this.checks.values()).map((check) =>
      check.execute().catch((error) => ({
        name: check.getName(),
        status: 'unhealthy' as const,
        responseTime: 0,
        timestamp: new Date(),
        error: error.message,
      }))
    );

    const results = await Promise.all(checkPromises);
    const duration = Date.now() - startTime;

    // Calculate summary
    const summary = {
      total: results.length,
      healthy: results.filter((r) => r.status === 'healthy').length,
      degraded: results.filter((r) => r.status === 'degraded').length,
      unhealthy: results.filter((r) => r.status === 'unhealthy').length,
    };

    // Determine overall system status
    let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    // Check for critical failures
    const criticalFailures = results.filter(
      (r) => r.status === 'unhealthy' && this.checks.get(r.name)?.isCritical()
    );

    if (criticalFailures.length > 0) {
      overallStatus = 'unhealthy';
    } else if (summary.unhealthy > 0 || summary.degraded > 0) {
      overallStatus = 'degraded';
    }

    const systemHealth: SystemHealthStatus = {
      status: overallStatus,
      timestamp: new Date(),
      uptime: Date.now() - this.startTime,
      version: this.version,
      environment: this.environment,
      checks: results,
      summary,
      correlationId,
    };

    logger.info('System health check completed', {
      status: overallStatus,
      duration,
      summary,
      correlationId,
    });

    return systemHealth;
  }

  /**
   * Execute specific health check
   */
  async checkSpecific(name: string): Promise<HealthCheckResult> {
    const check = this.checks.get(name);
    if (!check) {
      throw new Error(`Health check '${name}' not found`);
    }

    return await check.execute();
  }

  /**
   * Get all registered health check names
   */
  getCheckNames(): string[] {
    return Array.from(this.checks.keys());
  }

  /**
   * Get health check by name
   */
  getCheck(name: string): HealthCheck | undefined {
    return this.checks.get(name);
  }

  /**
   * Start periodic health checking
   */
  startPeriodicChecking(interval: number = 60000): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.intervalTimer = setInterval(async () => {
      try {
        await this.checkHealth();
      } catch (error) {
        logger.error('Periodic health check failed', {
          error: (error as Error).message,
        });
      }
    }, interval);

    logger.info('Started periodic health checking', { interval });
  }

  /**
   * Stop periodic health checking
   */
  stopPeriodicChecking(): void {
    if (this.intervalTimer) {
      clearInterval(this.intervalTimer);
      this.intervalTimer = undefined;
    }

    this.isRunning = false;
    logger.info('Stopped periodic health checking');
  }

  /**
   * Get system uptime
   */
  getUptime(): number {
    return Date.now() - this.startTime;
  }

  /**
   * Check if manager is running periodic checks
   */
  isPeriodicCheckingEnabled(): boolean {
    return this.isRunning;
  }
}

/**
 * Common Health Checks
 */
export class CommonHealthChecks {
  /**
   * Database connectivity check
   */
  static database(
    connectionTest: () => Promise<void>,
    name: string = 'database'
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      connectionTest,
      {
        timeout: 5000,
        critical: true,
        tags: ['database', 'infrastructure'],
      },
    ];
  }

  /**
   * Redis connectivity check
   */
  static redis(
    pingTest: () => Promise<void>,
    name: string = 'redis'
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      pingTest,
      {
        timeout: 3000,
        critical: false,
        tags: ['cache', 'redis', 'infrastructure'],
      },
    ];
  }

  /**
   * External API health check
   */
  static externalApi(
    apiTest: () => Promise<void>,
    name: string,
    critical: boolean = false
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      apiTest,
      {
        timeout: 10000,
        critical,
        tags: ['external-api', 'integration'],
      },
    ];
  }

  /**
   * Memory usage check
   */
  static memory(
    maxMemoryMB: number = 1024,
    name: string = 'memory'
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      async () => {
        const memUsage = process.memoryUsage();
        const memUsageMB = memUsage.heapUsed / 1024 / 1024;

        if (memUsageMB > maxMemoryMB) {
          throw new Error(
            `Memory usage ${memUsageMB.toFixed(2)}MB exceeds limit ${maxMemoryMB}MB`
          );
        }
      },
      {
        timeout: 1000,
        critical: true,
        tags: ['system', 'memory'],
      },
    ];
  }

  /**
   * Disk space check
   */
  static diskSpace(
    path: string,
    minFreeGB: number = 1,
    name: string = 'disk-space'
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      async () => {
        const fs = await import('fs/promises');
        const stats = await fs.statfs(path);
        const freeGB = (stats.free * stats.bavail) / 1024 ** 3;

        if (freeGB < minFreeGB) {
          throw new Error(
            `Free disk space ${freeGB.toFixed(2)}GB is below minimum ${minFreeGB}GB`
          );
        }
      },
      {
        timeout: 2000,
        critical: true,
        tags: ['system', 'disk'],
      },
    ];
  }

  /**
   * Circuit breaker status check
   */
  static circuitBreakers(
    name: string = 'circuit-breakers'
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      async () => {
        const stats = circuitBreakerManager.getAllStats();
        const openCircuits = Object.entries(stats).filter(
          ([_, stat]) => stat.state === 'OPEN'
        );

        if (openCircuits.length > 0) {
          throw new Error(
            `Circuit breakers open: ${openCircuits.map(([name]) => name).join(', ')}`
          );
        }
      },
      {
        timeout: 1000,
        critical: false,
        tags: ['resilience', 'circuit-breaker'],
      },
    ];
  }

  /**
   * Degradation status check
   */
  static degradationStatus(
    name: string = 'degradation-status'
  ): [string, () => Promise<void>, Partial<HealthCheckOptions>] {
    return [
      name,
      async () => {
        const degradedServices = Object.entries(degradationManagers)
          .filter(([_, manager]) => manager.getState().isDegraded)
          .map(([name]) => name);

        if (degradedServices.length > 0) {
          throw new Error(
            `Services in degraded state: ${degradedServices.join(', ')}`
          );
        }
      },
      {
        timeout: 1000,
        critical: false,
        tags: ['resilience', 'degradation'],
      },
    ];
  }
}

// Global health check manager instance
export const healthCheckManager = new HealthCheckManager(
  process.env.APP_VERSION,
  process.env.NODE_ENV
);
