/**
 * Graceful Degradation Strategies
 * Implements fallback mechanisms for system failures
 */

import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { circuitBreakerManager } from './circuit-breaker';
import { RetryManager, RetryUtils } from './retry';
import {
  ServiceUnavailableError,
  ExternalServiceError,
  CacheError,
  DatabaseError,
} from '../../application/errors/base.errors';

export interface DegradationOptions {
  enableFallback: boolean;
  fallbackTimeout: number;
  healthCheckInterval: number;
  maxDegradationTime: number;
  alertThreshold: number;
  name?: string;
}

export interface FallbackStrategy<T> {
  name: string;
  priority: number;
  execute: () => Promise<T>;
  healthCheck?: () => Promise<boolean>;
  isAvailable?: () => boolean;
}

export interface DegradationState {
  isHealthy: boolean;
  isDegraded: boolean;
  activeFallbacks: string[];
  lastHealthCheck: Date;
  degradationStartTime?: Date;
  totalDegradationTime: number;
  failureCount: number;
  successCount: number;
}

/**
 * Graceful Degradation Manager
 */
export class GracefulDegradationManager<T = any> {
  private readonly options: Required<DegradationOptions>;
  private readonly fallbackStrategies: FallbackStrategy<T>[] = [];
  private state: DegradationState = {
    isHealthy: true,
    isDegraded: false,
    activeFallbacks: [],
    lastHealthCheck: new Date(),
    totalDegradationTime: 0,
    failureCount: 0,
    successCount: 0,
  };
  private healthCheckTimer?: NodeJS.Timeout;
  private readonly retryManager: RetryManager;

  constructor(options: Partial<DegradationOptions> = {}) {
    this.options = {
      enableFallback: true,
      fallbackTimeout: 5000,
      healthCheckInterval: 30000, // 30 seconds
      maxDegradationTime: 300000, // 5 minutes
      alertThreshold: 3,
      name: 'GracefulDegradation',
      ...options,
    };

    this.retryManager = new RetryManager({
      maxAttempts: 2,
      baseDelay: 1000,
      maxDelay: 5000,
      name: `${this.options.name}Retry`,
    });

    this.startHealthChecking();
  }

  /**
   * Add fallback strategy
   */
  addFallback(strategy: FallbackStrategy<T>): void {
    this.fallbackStrategies.push(strategy);
    // Sort by priority (higher priority first)
    this.fallbackStrategies.sort((a, b) => b.priority - a.priority);

    logger.info('Added fallback strategy', {
      name: this.options.name,
      strategy: strategy.name,
      priority: strategy.priority,
      totalStrategies: this.fallbackStrategies.length,
    });
  }

  /**
   * Execute operation with graceful degradation
   */
  async execute(
    primaryOperation: () => Promise<T>,
    operationName?: string
  ): Promise<T> {
    const correlationId = correlationIdManager.getCorrelationId();
    const startTime = Date.now();

    try {
      // Try primary operation first
      logger.debug('Executing primary operation', {
        name: this.options.name,
        operation: operationName,
        correlationId,
      });

      const result = await primaryOperation();
      this.onSuccess();
      return result;
    } catch (error) {
      logger.warn('Primary operation failed, attempting graceful degradation', {
        name: this.options.name,
        operation: operationName,
        error: (error as Error).message,
        correlationId,
      });

      this.onFailure(error as Error);

      // Try fallback strategies if enabled
      if (this.options.enableFallback && this.fallbackStrategies.length > 0) {
        return await this.executeFallbacks(operationName, correlationId);
      }

      // No fallbacks available, throw original error
      throw error;
    } finally {
      const duration = Date.now() - startTime;
      logger.debug('Operation completed', {
        name: this.options.name,
        operation: operationName,
        duration,
        correlationId,
      });
    }
  }

  /**
   * Execute fallback strategies in priority order
   */
  private async executeFallbacks(
    operationName?: string,
    correlationId?: string
  ): Promise<T> {
    const availableStrategies = this.fallbackStrategies.filter(
      (strategy) => !strategy.isAvailable || strategy.isAvailable()
    );

    if (availableStrategies.length === 0) {
      throw new ServiceUnavailableError(
        'No fallback strategies available',
        this.options.name,
        Math.ceil(this.options.fallbackTimeout / 1000),
        { correlationId, operation: operationName }
      );
    }

    let lastError: Error | undefined;

    for (const strategy of availableStrategies) {
      try {
        logger.info('Attempting fallback strategy', {
          name: this.options.name,
          strategy: strategy.name,
          priority: strategy.priority,
          operation: operationName,
          correlationId,
        });

        // Execute with timeout
        const result = await Promise.race([
          strategy.execute(),
          this.createTimeoutPromise(strategy.name),
        ]);

        this.state.activeFallbacks.push(strategy.name);
        this.state.isDegraded = true;

        if (!this.state.degradationStartTime) {
          this.state.degradationStartTime = new Date();
        }

        logger.info('Fallback strategy succeeded', {
          name: this.options.name,
          strategy: strategy.name,
          operation: operationName,
          correlationId,
        });

        return result;
      } catch (error) {
        lastError = error as Error;

        logger.warn('Fallback strategy failed', {
          name: this.options.name,
          strategy: strategy.name,
          error: lastError.message,
          operation: operationName,
          correlationId,
        });
      }
    }

    // All fallback strategies failed
    throw new ServiceUnavailableError(
      `All fallback strategies failed. Last error: ${lastError?.message}`,
      this.options.name,
      Math.ceil(this.options.fallbackTimeout / 1000),
      { correlationId, operation: operationName }
    );
  }

  /**
   * Create timeout promise for fallback operations
   */
  private createTimeoutPromise(strategyName: string): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(
          new Error(
            `Fallback strategy ${strategyName} timed out after ${this.options.fallbackTimeout}ms`
          )
        );
      }, this.options.fallbackTimeout);
    });
  }

  /**
   * Handle successful operation
   */
  private onSuccess(): void {
    this.state.successCount++;

    if (this.state.isDegraded) {
      this.state.isHealthy = true;
      this.state.isDegraded = false;
      this.state.activeFallbacks = [];

      if (this.state.degradationStartTime) {
        this.state.totalDegradationTime +=
          Date.now() - this.state.degradationStartTime.getTime();
        this.state.degradationStartTime = undefined;
      }

      logger.info('System recovered from degraded state', {
        name: this.options.name,
        successCount: this.state.successCount,
        totalDegradationTime: this.state.totalDegradationTime,
      });
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error): void {
    this.state.failureCount++;
    this.state.isHealthy = false;

    if (this.state.failureCount >= this.options.alertThreshold) {
      logger.error('Degradation alert threshold reached', {
        name: this.options.name,
        failureCount: this.state.failureCount,
        threshold: this.options.alertThreshold,
        error: error.message,
      });
    }
  }

  /**
   * Start periodic health checking
   */
  private startHealthChecking(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    this.healthCheckTimer = setInterval(async () => {
      await this.performHealthCheck();
    }, this.options.healthCheckInterval);

    logger.debug('Started health checking', {
      name: this.options.name,
      interval: this.options.healthCheckInterval,
    });
  }

  /**
   * Perform health check on fallback strategies
   */
  private async performHealthCheck(): Promise<void> {
    this.state.lastHealthCheck = new Date();

    for (const strategy of this.fallbackStrategies) {
      if (strategy.healthCheck) {
        try {
          const isHealthy = await strategy.healthCheck();

          logger.debug('Fallback strategy health check', {
            name: this.options.name,
            strategy: strategy.name,
            isHealthy,
          });
        } catch (error) {
          logger.warn('Fallback strategy health check failed', {
            name: this.options.name,
            strategy: strategy.name,
            error: (error as Error).message,
          });
        }
      }
    }

    // Check if we've been degraded too long
    if (this.state.degradationStartTime) {
      const degradationTime =
        Date.now() - this.state.degradationStartTime.getTime();

      if (degradationTime > this.options.maxDegradationTime) {
        logger.error('Maximum degradation time exceeded', {
          name: this.options.name,
          degradationTime,
          maxDegradationTime: this.options.maxDegradationTime,
        });
      }
    }
  }

  /**
   * Get current degradation state
   */
  getState(): DegradationState {
    return { ...this.state };
  }

  /**
   * Get available fallback strategies
   */
  getFallbackStrategies(): FallbackStrategy<T>[] {
    return [...this.fallbackStrategies];
  }

  /**
   * Force degradation mode (for testing)
   */
  forceDegradation(): void {
    this.state.isHealthy = false;
    this.state.isDegraded = true;
    this.state.degradationStartTime = new Date();

    logger.warn('Forced degradation mode activated', {
      name: this.options.name,
    });
  }

  /**
   * Force recovery (for testing)
   */
  forceRecovery(): void {
    this.onSuccess();

    logger.info('Forced recovery activated', {
      name: this.options.name,
    });
  }

  /**
   * Stop health checking and cleanup
   */
  destroy(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = undefined;
    }

    logger.info('Graceful degradation manager destroyed', {
      name: this.options.name,
    });
  }
}

/**
 * Common degradation strategies for different services
 */
export class DegradationStrategies {
  /**
   * Cache degradation: Redis -> In-memory -> No cache
   */
  static createCacheStrategies<T>(
    redisCache: () => Promise<T>,
    memoryCache: () => Promise<T>,
    noCache: () => Promise<T>
  ): FallbackStrategy<T>[] {
    return [
      {
        name: 'redis-cache',
        priority: 100,
        execute: redisCache,
        healthCheck: async () => {
          try {
            await redisCache();
            return true;
          } catch {
            return false;
          }
        },
      },
      {
        name: 'memory-cache',
        priority: 50,
        execute: memoryCache,
        isAvailable: () => true,
      },
      {
        name: 'no-cache',
        priority: 10,
        execute: noCache,
        isAvailable: () => true,
      },
    ];
  }

  /**
   * Database degradation: Primary -> Read replica -> Cached data
   */
  static createDatabaseStrategies<T>(
    primaryDb: () => Promise<T>,
    replicaDb: () => Promise<T>,
    cachedData: () => Promise<T>
  ): FallbackStrategy<T>[] {
    return [
      {
        name: 'primary-database',
        priority: 100,
        execute: primaryDb,
      },
      {
        name: 'replica-database',
        priority: 75,
        execute: replicaDb,
      },
      {
        name: 'cached-data',
        priority: 25,
        execute: cachedData,
        isAvailable: () => true,
      },
    ];
  }

  /**
   * Authentication degradation: Full auth -> Basic auth -> Read-only
   */
  static createAuthStrategies<T>(
    fullAuth: () => Promise<T>,
    basicAuth: () => Promise<T>,
    readOnlyAccess: () => Promise<T>
  ): FallbackStrategy<T>[] {
    return [
      {
        name: 'full-authentication',
        priority: 100,
        execute: fullAuth,
      },
      {
        name: 'basic-authentication',
        priority: 50,
        execute: basicAuth,
      },
      {
        name: 'read-only-access',
        priority: 10,
        execute: readOnlyAccess,
        isAvailable: () => true,
      },
    ];
  }

  /**
   * External service degradation: Live API -> Cached response -> Default response
   */
  static createExternalServiceStrategies<T>(
    liveApi: () => Promise<T>,
    cachedResponse: () => Promise<T>,
    defaultResponse: () => Promise<T>
  ): FallbackStrategy<T>[] {
    return [
      {
        name: 'live-api',
        priority: 100,
        execute: liveApi,
      },
      {
        name: 'cached-response',
        priority: 50,
        execute: cachedResponse,
      },
      {
        name: 'default-response',
        priority: 10,
        execute: defaultResponse,
        isAvailable: () => true,
      },
    ];
  }
}

/**
 * Global degradation manager instances for common services
 */
export const degradationManagers = {
  cache: new GracefulDegradationManager({ name: 'CacheDegradation' }),
  database: new GracefulDegradationManager({ name: 'DatabaseDegradation' }),
  authentication: new GracefulDegradationManager({ name: 'AuthDegradation' }),
  externalApi: new GracefulDegradationManager({
    name: 'ExternalApiDegradation',
  }),
};
