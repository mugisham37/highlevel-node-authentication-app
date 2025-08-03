/**
 * Circuit Breaker Pattern Implementation
 * Prevents cascading failures by monitoring external service calls
 */

import { logger } from '../logging/winston-logger';
import {
  ExternalServiceError,
  ServiceUnavailableError,
} from '../../application/errors/base.errors';

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: string[];
  name?: string;
}

export interface CircuitBreakerStats {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  requests: number;
  lastFailureTime?: Date;
  nextAttemptTime?: Date;
  uptime: number;
}

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private requests = 0;
  private lastFailureTime?: Date;
  private nextAttemptTime?: Date;
  private readonly options: Required<CircuitBreakerOptions>;
  private readonly startTime = Date.now();

  constructor(options: CircuitBreakerOptions) {
    this.options = {
      failureThreshold: 5,
      recoveryTimeout: 60000, // 1 minute
      monitoringPeriod: 300000, // 5 minutes
      expectedErrors: [],
      name: 'CircuitBreaker',
      ...options,
    };

    logger.info('Circuit breaker initialized', {
      name: this.options.name,
      options: this.options,
    });
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    operation: () => Promise<T>,
    correlationId?: string
  ): Promise<T> {
    this.requests++;

    // Check if circuit is open
    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < (this.nextAttemptTime?.getTime() || 0)) {
        const error = new ServiceUnavailableError(
          `Circuit breaker is OPEN for ${this.options.name}`,
          this.options.name,
          Math.ceil(
            ((this.nextAttemptTime?.getTime() || 0) - Date.now()) / 1000
          ),
          { correlationId, operation: this.options.name }
        );

        logger.warn('Circuit breaker blocked request', {
          name: this.options.name,
          state: this.state,
          correlationId,
          nextAttemptTime: this.nextAttemptTime,
        });

        throw error;
      }

      // Transition to half-open for testing
      this.state = CircuitBreakerState.HALF_OPEN;
      logger.info('Circuit breaker transitioning to HALF_OPEN', {
        name: this.options.name,
        correlationId,
      });
    }

    try {
      const result = await operation();
      this.onSuccess(correlationId);
      return result;
    } catch (error) {
      this.onFailure(error as Error, correlationId);
      throw error;
    }
  }

  /**
   * Handle successful operation
   */
  private onSuccess(correlationId?: string): void {
    this.successes++;
    this.failures = 0;

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      this.state = CircuitBreakerState.CLOSED;
      this.nextAttemptTime = undefined;

      logger.info('Circuit breaker recovered to CLOSED state', {
        name: this.options.name,
        correlationId,
        stats: this.getStats(),
      });
    }
  }

  /**
   * Handle failed operation
   */
  private onFailure(error: Error, correlationId?: string): void {
    // Check if this is an expected error that shouldn't trigger circuit breaker
    if (this.isExpectedError(error)) {
      logger.debug('Expected error, not counting towards circuit breaker', {
        name: this.options.name,
        error: error.message,
        correlationId,
      });
      return;
    }

    this.failures++;
    this.lastFailureTime = new Date();

    logger.warn('Circuit breaker recorded failure', {
      name: this.options.name,
      failures: this.failures,
      threshold: this.options.failureThreshold,
      error: error.message,
      correlationId,
    });

    // Check if we should open the circuit
    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttemptTime = new Date(
        Date.now() + this.options.recoveryTimeout
      );

      logger.error('Circuit breaker opened due to failures', {
        name: this.options.name,
        failures: this.failures,
        threshold: this.options.failureThreshold,
        nextAttemptTime: this.nextAttemptTime,
        correlationId,
      });
    }
  }

  /**
   * Check if error is expected and shouldn't trigger circuit breaker
   */
  private isExpectedError(error: Error): boolean {
    return this.options.expectedErrors.some(
      (expectedError) =>
        error.name === expectedError ||
        error.message.includes(expectedError) ||
        (error as any).code === expectedError
    );
  }

  /**
   * Get current circuit breaker statistics
   */
  getStats(): CircuitBreakerStats {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      lastFailureTime: this.lastFailureTime,
      nextAttemptTime: this.nextAttemptTime,
      uptime: Date.now() - this.startTime,
    };
  }

  /**
   * Get current state
   */
  getState(): CircuitBreakerState {
    return this.state;
  }

  /**
   * Force circuit breaker to open (for testing or manual intervention)
   */
  forceOpen(recoveryTimeout?: number): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttemptTime = new Date(
      Date.now() + (recoveryTimeout || this.options.recoveryTimeout)
    );

    logger.warn('Circuit breaker manually forced to OPEN state', {
      name: this.options.name,
      nextAttemptTime: this.nextAttemptTime,
    });
  }

  /**
   * Force circuit breaker to close (for testing or manual intervention)
   */
  forceClose(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.nextAttemptTime = undefined;

    logger.info('Circuit breaker manually forced to CLOSED state', {
      name: this.options.name,
    });
  }

  /**
   * Reset circuit breaker statistics
   */
  reset(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.successes = 0;
    this.requests = 0;
    this.lastFailureTime = undefined;
    this.nextAttemptTime = undefined;

    logger.info('Circuit breaker reset', {
      name: this.options.name,
    });
  }
}

/**
 * Circuit Breaker Manager for managing multiple circuit breakers
 */
export class CircuitBreakerManager {
  private circuitBreakers = new Map<string, CircuitBreaker>();

  /**
   * Create or get circuit breaker for a service
   */
  getCircuitBreaker(
    serviceName: string,
    options?: Partial<CircuitBreakerOptions>
  ): CircuitBreaker {
    if (!this.circuitBreakers.has(serviceName)) {
      const circuitBreaker = new CircuitBreaker({
        name: serviceName,
        failureThreshold: 5,
        recoveryTimeout: 60000,
        monitoringPeriod: 300000,
        expectedErrors: [],
        ...options,
      });

      this.circuitBreakers.set(serviceName, circuitBreaker);
    }

    return this.circuitBreakers.get(serviceName)!;
  }

  /**
   * Execute operation with circuit breaker protection
   */
  async execute<T>(
    serviceName: string,
    operation: () => Promise<T>,
    options?: Partial<CircuitBreakerOptions>,
    correlationId?: string
  ): Promise<T> {
    const circuitBreaker = this.getCircuitBreaker(serviceName, options);
    return circuitBreaker.execute(operation, correlationId);
  }

  /**
   * Get all circuit breaker statistics
   */
  getAllStats(): Record<string, CircuitBreakerStats> {
    const stats: Record<string, CircuitBreakerStats> = {};

    for (const [name, circuitBreaker] of this.circuitBreakers) {
      stats[name] = circuitBreaker.getStats();
    }

    return stats;
  }

  /**
   * Get circuit breaker by name
   */
  getByName(name: string): CircuitBreaker | undefined {
    return this.circuitBreakers.get(name);
  }

  /**
   * Remove circuit breaker
   */
  remove(name: string): boolean {
    return this.circuitBreakers.delete(name);
  }

  /**
   * Clear all circuit breakers
   */
  clear(): void {
    this.circuitBreakers.clear();
  }

  /**
   * Get list of all circuit breaker names
   */
  getNames(): string[] {
    return Array.from(this.circuitBreakers.keys());
  }
}

// Global circuit breaker manager instance
export const circuitBreakerManager = new CircuitBreakerManager();
