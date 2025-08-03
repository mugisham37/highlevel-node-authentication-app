/**
 * Retry Mechanism with Exponential Backoff
 * Implements intelligent retry strategies for transient failures
 */

import { logger } from '../logging/winston-logger';
import {
  ExternalServiceError,
  ServiceUnavailableError,
} from '../../application/errors/base.errors';

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  jitter: boolean;
  retryableErrors?: string[];
  nonRetryableErrors?: string[];
  onRetry?: (attempt: number, error: Error, delay: number) => void;
  name?: string;
}

export interface RetryResult<T> {
  result: T;
  attempts: number;
  totalTime: number;
  errors: Error[];
}

export class RetryManager {
  private readonly options: Required<RetryOptions>;

  constructor(options: Partial<RetryOptions> = {}) {
    this.options = {
      maxAttempts: 3,
      baseDelay: 1000, // 1 second
      maxDelay: 30000, // 30 seconds
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        'SERVICE_UNAVAILABLE',
        'EXTERNAL_SERVICE_ERROR',
      ],
      nonRetryableErrors: [
        'AUTHENTICATION_ERROR',
        'AUTHORIZATION_ERROR',
        'VALIDATION_ERROR',
        'NOT_FOUND',
        'CONFLICT',
      ],
      onRetry: () => {},
      name: 'RetryManager',
      ...options,
    };
  }

  /**
   * Execute operation with retry logic
   */
  async execute<T>(
    operation: () => Promise<T>,
    correlationId?: string,
    operationName?: string
  ): Promise<T> {
    const startTime = Date.now();
    const errors: Error[] = [];
    let lastError: Error;

    for (let attempt = 1; attempt <= this.options.maxAttempts; attempt++) {
      try {
        logger.debug('Executing operation with retry', {
          name: this.options.name,
          operation: operationName,
          attempt,
          maxAttempts: this.options.maxAttempts,
          correlationId,
        });

        const result = await operation();

        if (attempt > 1) {
          logger.info('Operation succeeded after retry', {
            name: this.options.name,
            operation: operationName,
            attempt,
            totalTime: Date.now() - startTime,
            correlationId,
          });
        }

        return result;
      } catch (error) {
        lastError = error as Error;
        errors.push(lastError);

        logger.warn('Operation failed, checking retry eligibility', {
          name: this.options.name,
          operation: operationName,
          attempt,
          maxAttempts: this.options.maxAttempts,
          error: lastError.message,
          errorName: lastError.name,
          correlationId,
        });

        // Check if we should retry
        if (
          attempt === this.options.maxAttempts ||
          !this.shouldRetry(lastError)
        ) {
          break;
        }

        // Calculate delay with exponential backoff and jitter
        const delay = this.calculateDelay(attempt);

        logger.info('Retrying operation after delay', {
          name: this.options.name,
          operation: operationName,
          attempt,
          nextAttempt: attempt + 1,
          delay,
          correlationId,
        });

        // Call retry callback
        this.options.onRetry(attempt, lastError, delay);

        // Wait before retry
        await this.sleep(delay);
      }
    }

    // All attempts failed
    const totalTime = Date.now() - startTime;

    logger.error('Operation failed after all retry attempts', {
      name: this.options.name,
      operation: operationName,
      attempts: this.options.maxAttempts,
      totalTime,
      errors: errors.map((e) => ({ name: e.name, message: e.message })),
      correlationId,
    });

    // Throw the last error with additional context
    throw this.createRetryExhaustedError(
      lastError!,
      this.options.maxAttempts,
      totalTime,
      correlationId
    );
  }

  /**
   * Determine if error is retryable
   */
  private shouldRetry(error: Error): boolean {
    const errorCode = (error as any).code;
    const errorName = error.name;
    const errorMessage = error.message;

    // Check non-retryable errors first
    if (
      this.options.nonRetryableErrors.some(
        (nonRetryable) =>
          errorCode === nonRetryable ||
          errorName === nonRetryable ||
          errorMessage.includes(nonRetryable)
      )
    ) {
      logger.debug('Error is non-retryable', {
        name: this.options.name,
        error: errorName,
        code: errorCode,
        nonRetryableErrors: this.options.nonRetryableErrors,
      });
      return false;
    }

    // Check retryable errors
    const isRetryable = this.options.retryableErrors.some(
      (retryable) =>
        errorCode === retryable ||
        errorName === retryable ||
        errorMessage.includes(retryable)
    );

    logger.debug('Error retry eligibility determined', {
      name: this.options.name,
      error: errorName,
      code: errorCode,
      isRetryable,
      retryableErrors: this.options.retryableErrors,
    });

    return isRetryable;
  }

  /**
   * Calculate delay with exponential backoff and optional jitter
   */
  private calculateDelay(attempt: number): number {
    // Exponential backoff: baseDelay * (backoffMultiplier ^ (attempt - 1))
    let delay =
      this.options.baseDelay *
      Math.pow(this.options.backoffMultiplier, attempt - 1);

    // Apply maximum delay limit
    delay = Math.min(delay, this.options.maxDelay);

    // Add jitter to prevent thundering herd
    if (this.options.jitter) {
      // Add random jitter of ±25%
      const jitterRange = delay * 0.25;
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(0, delay + jitter);
    }

    return Math.floor(delay);
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Create error when all retry attempts are exhausted
   */
  private createRetryExhaustedError(
    lastError: Error,
    attempts: number,
    totalTime: number,
    correlationId?: string
  ): Error {
    if (lastError instanceof ExternalServiceError) {
      return new ExternalServiceError(
        lastError.service,
        `Operation failed after ${attempts} attempts (${totalTime}ms): ${lastError.message}`,
        lastError.operation,
        lastError,
        { correlationId, operation: this.options.name }
      );
    }

    return new ServiceUnavailableError(
      `Operation failed after ${attempts} attempts (${totalTime}ms): ${lastError.message}`,
      this.options.name,
      Math.ceil(this.options.maxDelay / 1000),
      { correlationId, operation: this.options.name }
    );
  }
}

/**
 * Retry decorator for methods
 */
export function retry(options: Partial<RetryOptions> = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const retryManager = new RetryManager({
      ...options,
      name: options.name || `${target.constructor.name}.${propertyKey}`,
    });

    descriptor.value = async function (...args: any[]) {
      const correlationId = args.find(
        (arg) => typeof arg === 'object' && arg?.correlationId
      )?.correlationId;

      return retryManager.execute(
        () => originalMethod.apply(this, args),
        correlationId,
        propertyKey
      );
    };

    return descriptor;
  };
}

/**
 * Utility functions for common retry scenarios
 */
export class RetryUtils {
  /**
   * Create retry manager for database operations
   */
  static forDatabase(options: Partial<RetryOptions> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 3,
      baseDelay: 500,
      maxDelay: 5000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'CONNECTION_ERROR',
        'POOL_EXHAUSTED',
        'DEADLOCK',
      ],
      nonRetryableErrors: [
        'VALIDATION_ERROR',
        'CONSTRAINT_VIOLATION',
        'DUPLICATE_KEY',
      ],
      name: 'DatabaseRetry',
      ...options,
    });
  }

  /**
   * Create retry manager for HTTP requests
   */
  static forHttp(options: Partial<RetryOptions> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'EAI_AGAIN',
        'NETWORK_ERROR',
        'TIMEOUT_ERROR',
        '502',
        '503',
        '504',
      ],
      nonRetryableErrors: ['400', '401', '403', '404', '409', '422'],
      name: 'HttpRetry',
      ...options,
    });
  }

  /**
   * Create retry manager for cache operations
   */
  static forCache(options: Partial<RetryOptions> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 2,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'REDIS_CONNECTION_ERROR',
        'CACHE_UNAVAILABLE',
      ],
      nonRetryableErrors: ['INVALID_KEY', 'SERIALIZATION_ERROR'],
      name: 'CacheRetry',
      ...options,
    });
  }

  /**
   * Create retry manager for external API calls
   */
  static forExternalApi(options: Partial<RetryOptions> = {}): RetryManager {
    return new RetryManager({
      maxAttempts: 4,
      baseDelay: 2000,
      maxDelay: 30000,
      backoffMultiplier: 2,
      jitter: true,
      retryableErrors: [
        'ECONNRESET',
        'ECONNREFUSED',
        'ETIMEDOUT',
        'ENOTFOUND',
        'NETWORK_ERROR',
        'RATE_LIMIT_EXCEEDED',
        '429',
        '502',
        '503',
        '504',
      ],
      nonRetryableErrors: ['400', '401', '403', '404', '409', '422'],
      name: 'ExternalApiRetry',
      ...options,
    });
  }
}
