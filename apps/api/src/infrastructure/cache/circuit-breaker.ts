import { logger } from '../logging/winston-logger';

export enum CircuitBreakerState {
  CLOSED = 'CLOSED',
  OPEN = 'OPEN',
  HALF_OPEN = 'HALF_OPEN',
}

export interface CircuitBreakerOptions {
  failureThreshold: number;
  recoveryTimeout: number;
  monitoringPeriod: number;
  expectedErrors?: Array<new (...args: any[]) => Error>;
}

export interface CircuitBreakerMetrics {
  state: CircuitBreakerState;
  failures: number;
  successes: number;
  requests: number;
  nextAttempt: number;
  lastFailureTime: number;
  lastSuccessTime: number;
}

export class CircuitBreaker {
  private state: CircuitBreakerState = CircuitBreakerState.CLOSED;
  private failures = 0;
  private successes = 0;
  private requests = 0;
  private nextAttempt = 0;
  private lastFailureTime = 0;
  private lastSuccessTime = 0;
  private readonly options: CircuitBreakerOptions;

  constructor(options: Partial<CircuitBreakerOptions> = {}) {
    this.options = {
      failureThreshold: options.failureThreshold || 5,
      recoveryTimeout: options.recoveryTimeout || 60000, // 1 minute
      monitoringPeriod: options.monitoringPeriod || 300000, // 5 minutes
      expectedErrors: options.expectedErrors || [],
    };

    // Reset metrics periodically
    setInterval(() => {
      this.resetMetrics();
    }, this.options.monitoringPeriod);
  }

  async execute<T>(
    operation: () => Promise<T>,
    fallback?: () => Promise<T>
  ): Promise<T> {
    this.requests++;

    if (this.state === CircuitBreakerState.OPEN) {
      if (Date.now() < this.nextAttempt) {
        logger.warn('Circuit breaker is OPEN, rejecting request', {
          nextAttempt: new Date(this.nextAttempt),
          failures: this.failures,
        });

        if (fallback) {
          return await fallback();
        }

        throw new CircuitBreakerOpenError('Circuit breaker is OPEN');
      }

      // Transition to HALF_OPEN
      this.state = CircuitBreakerState.HALF_OPEN;
      logger.info('Circuit breaker transitioning to HALF_OPEN');
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure(error as Error);

      // Check if the state became OPEN after the failure
      if (fallback && (this.state as CircuitBreakerState) === CircuitBreakerState.OPEN) {
        logger.info('Circuit breaker OPEN, executing fallback');
        return await fallback();
      }

      throw error;
    }
  }

  private onSuccess(): void {
    this.successes++;
    this.lastSuccessTime = Date.now();

    if (this.state === CircuitBreakerState.HALF_OPEN) {
      logger.info('Circuit breaker healing, transitioning to CLOSED');
      this.state = CircuitBreakerState.CLOSED;
      this.failures = 0;
    }
  }

  private onFailure(error: Error): void {
    // Check if this is an expected error that shouldn't count as failure
    if (this.isExpectedError(error)) {
      return;
    }

    this.failures++;
    this.lastFailureTime = Date.now();

    logger.warn('Circuit breaker recorded failure', {
      failures: this.failures,
      threshold: this.options.failureThreshold,
      error: error.message,
    });

    if (this.failures >= this.options.failureThreshold) {
      this.state = CircuitBreakerState.OPEN;
      this.nextAttempt = Date.now() + this.options.recoveryTimeout;

      logger.error('Circuit breaker OPENED', {
        failures: this.failures,
        nextAttempt: new Date(this.nextAttempt),
      });
    }
  }

  private isExpectedError(error: Error): boolean {
    return this.options.expectedErrors!.some(
      (ExpectedError) => error instanceof ExpectedError
    );
  }

  private resetMetrics(): void {
    if (this.state === CircuitBreakerState.CLOSED) {
      this.failures = 0;
      this.successes = 0;
      this.requests = 0;
    }
  }

  getMetrics(): CircuitBreakerMetrics {
    return {
      state: this.state,
      failures: this.failures,
      successes: this.successes,
      requests: this.requests,
      nextAttempt: this.nextAttempt,
      lastFailureTime: this.lastFailureTime,
      lastSuccessTime: this.lastSuccessTime,
    };
  }

  getState(): CircuitBreakerState {
    return this.state;
  }

  isOpen(): boolean {
    return this.state === CircuitBreakerState.OPEN;
  }

  isClosed(): boolean {
    return this.state === CircuitBreakerState.CLOSED;
  }

  isHalfOpen(): boolean {
    return this.state === CircuitBreakerState.HALF_OPEN;
  }

  // Manual control methods for testing/admin purposes
  forceOpen(): void {
    this.state = CircuitBreakerState.OPEN;
    this.nextAttempt = Date.now() + this.options.recoveryTimeout;
    logger.warn('Circuit breaker manually forced OPEN');
  }

  forceClose(): void {
    this.state = CircuitBreakerState.CLOSED;
    this.failures = 0;
    this.nextAttempt = 0;
    logger.info('Circuit breaker manually forced CLOSED');
  }

  forceHalfOpen(): void {
    this.state = CircuitBreakerState.HALF_OPEN;
    logger.info('Circuit breaker manually forced HALF_OPEN');
  }
}

export class CircuitBreakerOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitBreakerOpenError';
  }
}
