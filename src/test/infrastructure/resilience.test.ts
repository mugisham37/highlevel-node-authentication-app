/**
 * Resilience System Tests
 * Comprehensive tests for error handling and resilience components
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
  circuitBreakerManager,
  RetryManager,
  RetryUtils,
  GracefulDegradationManager,
  DegradationStrategies,
  correlationIdManager,
  healthCheckManager,
  CommonHealthChecks,
  BaseError,
  ValidationError,
  AuthenticationError,
  ExternalServiceError,
  ServiceUnavailableError,
} from '../../infrastructure/resilience';

describe('Circuit Breaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000,
      monitoringPeriod: 5000,
      name: 'test-circuit-breaker',
    });
  });

  it('should start in CLOSED state', () => {
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should execute successful operations', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await circuitBreaker.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledOnce();
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });

  it('should open circuit after failure threshold', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new Error('Service unavailable'));

    // Trigger failures to reach threshold
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
  });

  it('should reject requests when circuit is open', async () => {
    const operation = vi
      .fn()
      .mockRejectedValue(new Error('Service unavailable'));

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to fail
      }
    }

    // Should reject without calling operation
    await expect(circuitBreaker.execute(operation)).rejects.toThrow(
      ServiceUnavailableError
    );
    expect(operation).toHaveBeenCalledTimes(3); // Only the initial failures
  });

  it('should transition to half-open after recovery timeout', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('Fail'))
      .mockRejectedValueOnce(new Error('Fail'))
      .mockRejectedValueOnce(new Error('Fail'))
      .mockResolvedValue('success');

    // Open the circuit
    for (let i = 0; i < 3; i++) {
      try {
        await circuitBreaker.execute(operation);
      } catch (error) {
        // Expected to fail
      }
    }

    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);

    // Wait for recovery timeout
    await new Promise((resolve) => setTimeout(resolve, 1100));

    // Next call should transition to half-open and succeed
    const result = await circuitBreaker.execute(operation);
    expect(result).toBe('success');
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
  });
});

describe('Retry Manager', () => {
  let retryManager: RetryManager;

  beforeEach(() => {
    retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 100,
      maxDelay: 1000,
      backoffMultiplier: 2,
      jitter: false,
      name: 'test-retry',
    });
  });

  it('should succeed on first attempt', async () => {
    const operation = vi.fn().mockResolvedValue('success');
    const result = await retryManager.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledOnce();
  });

  it('should retry on retryable errors', async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockRejectedValueOnce(new Error('ETIMEDOUT'))
      .mockResolvedValue('success');

    const result = await retryManager.execute(operation);

    expect(result).toBe('success');
    expect(operation).toHaveBeenCalledTimes(3);
  });

  it('should not retry on non-retryable errors', async () => {
    const validationError = new ValidationError({ field: 'Invalid' });
    const operation = vi.fn().mockRejectedValue(validationError);

    await expect(retryManager.execute(operation)).rejects.toThrow();
    expect(operation).toHaveBeenCalledOnce();
  });

  it('should fail after max attempts', async () => {
    const operation = vi.fn().mockRejectedValue(new Error('ECONNRESET'));

    await expect(retryManager.execute(operation)).rejects.toThrow();
    expect(operation).toHaveBeenCalledTimes(3);
  });
});

describe('Graceful Degradation Manager', () => {
  let degradationManager: GracefulDegradationManager<string>;

  beforeEach(() => {
    degradationManager = new GracefulDegradationManager({
      enableFallback: true,
      fallbackTimeout: 1000,
      name: 'test-degradation',
    });
  });

  afterEach(() => {
    degradationManager.destroy();
  });

  it('should execute primary operation successfully', async () => {
    const primaryOperation = vi.fn().mockResolvedValue('primary-success');
    const result = await degradationManager.execute(primaryOperation);

    expect(result).toBe('primary-success');
    expect(primaryOperation).toHaveBeenCalledOnce();
  });

  it('should fallback when primary operation fails', async () => {
    const primaryOperation = vi
      .fn()
      .mockRejectedValue(new Error('Primary failed'));
    const fallbackOperation = vi.fn().mockResolvedValue('fallback-success');

    degradationManager.addFallback({
      name: 'fallback-1',
      priority: 100,
      execute: fallbackOperation,
    });

    const result = await degradationManager.execute(primaryOperation);

    expect(result).toBe('fallback-success');
    expect(primaryOperation).toHaveBeenCalledOnce();
    expect(fallbackOperation).toHaveBeenCalledOnce();
  });

  it('should try fallbacks in priority order', async () => {
    const primaryOperation = vi
      .fn()
      .mockRejectedValue(new Error('Primary failed'));
    const fallback1 = vi.fn().mockRejectedValue(new Error('Fallback 1 failed'));
    const fallback2 = vi.fn().mockResolvedValue('fallback-2-success');

    degradationManager.addFallback({
      name: 'fallback-1',
      priority: 100,
      execute: fallback1,
    });

    degradationManager.addFallback({
      name: 'fallback-2',
      priority: 50,
      execute: fallback2,
    });

    const result = await degradationManager.execute(primaryOperation);

    expect(result).toBe('fallback-2-success');
    expect(fallback1).toHaveBeenCalledOnce();
    expect(fallback2).toHaveBeenCalledOnce();
  });

  it('should track degradation state', async () => {
    const primaryOperation = vi
      .fn()
      .mockRejectedValue(new Error('Primary failed'));
    const fallbackOperation = vi.fn().mockResolvedValue('fallback-success');

    degradationManager.addFallback({
      name: 'fallback-1',
      priority: 100,
      execute: fallbackOperation,
    });

    await degradationManager.execute(primaryOperation);

    const state = degradationManager.getState();
    expect(state.isDegraded).toBe(true);
    expect(state.activeFallbacks).toContain('fallback-1');
  });
});

describe('Correlation ID Manager', () => {
  beforeEach(() => {
    correlationIdManager.clearActiveSpans();
  });

  it('should generate correlation IDs', () => {
    const correlationId = correlationIdManager.generateCorrelationId();
    expect(correlationId).toBeDefined();
    expect(typeof correlationId).toBe('string');
    expect(correlationId.length).toBeGreaterThan(0);
  });

  it('should run code with correlation context', () => {
    const testCorrelationId = 'test-correlation-id';

    correlationIdManager.run({ correlationId: testCorrelationId }, () => {
      const currentId = correlationIdManager.getCorrelationId();
      expect(currentId).toBe(testCorrelationId);
    });
  });

  it('should create and manage trace spans', () => {
    correlationIdManager.run({ correlationId: 'test-id' }, () => {
      const span = correlationIdManager.startSpan('test-operation', {
        tag1: 'value1',
      });

      expect(span.operation).toBe('test-operation');
      expect(span.tags.tag1).toBe('value1');
      expect(span.status).toBe('pending');

      const finishedSpan = correlationIdManager.finishSpan(span.spanId);
      expect(finishedSpan?.status).toBe('success');
      expect(finishedSpan?.duration).toBeDefined();
    });
  });

  it('should handle span errors', () => {
    correlationIdManager.run({ correlationId: 'test-id' }, () => {
      const span = correlationIdManager.startSpan('test-operation');
      const error = new Error('Test error');

      const finishedSpan = correlationIdManager.finishSpan(span.spanId, error);
      expect(finishedSpan?.status).toBe('error');
      expect(finishedSpan?.error).toBe(error);
    });
  });
});

describe('Health Check Manager', () => {
  beforeEach(() => {
    // Clear any existing health checks
    const checkNames = healthCheckManager.getCheckNames();
    checkNames.forEach((name) => healthCheckManager.unregister(name));
  });

  it('should register and execute health checks', async () => {
    const checkFunction = vi.fn().mockResolvedValue(undefined);

    healthCheckManager.register('test-check', checkFunction, {
      timeout: 1000,
      critical: true,
    });

    const result = await healthCheckManager.checkSpecific('test-check');

    expect(result.name).toBe('test-check');
    expect(result.status).toBe('healthy');
    expect(checkFunction).toHaveBeenCalledOnce();
  });

  it('should handle failing health checks', async () => {
    const checkFunction = vi
      .fn()
      .mockRejectedValue(new Error('Health check failed'));

    healthCheckManager.register('failing-check', checkFunction);

    const result = await healthCheckManager.checkSpecific('failing-check');

    expect(result.name).toBe('failing-check');
    expect(result.status).toBe('degraded');
    expect(result.error).toBe('Health check failed');
  });

  it('should perform system health check', async () => {
    const healthyCheck = vi.fn().mockResolvedValue(undefined);
    const failingCheck = vi.fn().mockRejectedValue(new Error('Failed'));

    healthCheckManager.register('healthy-check', healthyCheck);
    healthCheckManager.register('failing-check', failingCheck, {
      critical: true,
    });

    const systemHealth = await healthCheckManager.checkHealth();

    expect(systemHealth.status).toBe('degraded'); // Check failed but not marked as unhealthy yet
    expect(systemHealth.summary.total).toBe(2);
    expect(systemHealth.summary.healthy).toBe(1);
    expect(systemHealth.summary.degraded).toBe(1);
  });

  it('should create common health checks', () => {
    const [name, checkFn, options] = CommonHealthChecks.database(async () => {
      /* mock db check */
    }, 'test-db');

    expect(name).toBe('test-db');
    expect(typeof checkFn).toBe('function');
    expect(options.critical).toBe(true);
    expect(options.tags).toContain('database');
  });
});

describe('Error Hierarchy', () => {
  it('should create base errors with proper structure', () => {
    const error = new BaseError('Test error', { correlationId: 'test-id' });

    expect(error.message).toBe('Test error');
    expect(error.correlationId).toBe('test-id');
    expect(error.timestamp).toBeInstanceOf(Date);
    expect(error.isOperational).toBe(true);
  });

  it('should create validation errors with details', () => {
    const details = { email: 'Invalid email format', password: 'Too short' };
    const error = new ValidationError(details, 'Validation failed');

    expect(error.code).toBe('VALIDATION_ERROR');
    expect(error.statusCode).toBe(400);
    expect(error.details).toEqual(details);
  });

  it('should create authentication errors', () => {
    const error = new AuthenticationError(
      'Invalid credentials',
      'wrong_password'
    );

    expect(error.code).toBe('AUTHENTICATION_ERROR');
    expect(error.statusCode).toBe(401);
    expect(error.reason).toBe('wrong_password');
  });

  it('should create external service errors', () => {
    const originalError = new Error('Connection failed');
    const error = new ExternalServiceError(
      'payment-service',
      'Payment processing failed',
      'process_payment',
      originalError
    );

    expect(error.code).toBe('EXTERNAL_SERVICE_ERROR');
    expect(error.statusCode).toBe(502);
    expect(error.service).toBe('payment-service');
    expect(error.operation).toBe('process_payment');
    expect(error.originalError).toBe(originalError);
  });

  it('should serialize errors to JSON', () => {
    const error = new ValidationError({ field: 'Invalid' }, 'Test error', {
      correlationId: 'test-id',
    });

    const json = error.toJSON();

    expect(json.code).toBe('VALIDATION_ERROR');
    expect(json.message).toBe('Test error');
    expect(json.correlationId).toBe('test-id');
    expect(json.details).toEqual({ field: 'Invalid' });
  });

  it('should create safe API responses', () => {
    const error = new ValidationError({ field: 'Invalid' }, 'Test error');
    const apiResponse = error.toApiResponse();

    expect(apiResponse.error.code).toBe('VALIDATION_ERROR');
    expect(apiResponse.error.message).toBe('Test error');
    expect(apiResponse.error.details).toEqual({ field: 'Invalid' });
  });
});

describe('Retry Utilities', () => {
  it('should create database retry manager', () => {
    const retryManager = RetryUtils.forDatabase();
    expect(retryManager).toBeInstanceOf(RetryManager);
  });

  it('should create HTTP retry manager', () => {
    const retryManager = RetryUtils.forHttp();
    expect(retryManager).toBeInstanceOf(RetryManager);
  });

  it('should create cache retry manager', () => {
    const retryManager = RetryUtils.forCache();
    expect(retryManager).toBeInstanceOf(RetryManager);
  });

  it('should create external API retry manager', () => {
    const retryManager = RetryUtils.forExternalApi();
    expect(retryManager).toBeInstanceOf(RetryManager);
  });
});

describe('Degradation Strategies', () => {
  it('should create cache degradation strategies', () => {
    const redisCache = vi.fn().mockResolvedValue('redis-data');
    const memoryCache = vi.fn().mockResolvedValue('memory-data');
    const noCache = vi.fn().mockResolvedValue('fresh-data');

    const strategies = DegradationStrategies.createCacheStrategies(
      redisCache,
      memoryCache,
      noCache
    );

    expect(strategies).toHaveLength(3);
    expect(strategies[0].name).toBe('redis-cache');
    expect(strategies[0].priority).toBe(100);
    expect(strategies[1].name).toBe('memory-cache');
    expect(strategies[2].name).toBe('no-cache');
  });

  it('should create database degradation strategies', () => {
    const primaryDb = vi.fn().mockResolvedValue('primary-data');
    const replicaDb = vi.fn().mockResolvedValue('replica-data');
    const cachedData = vi.fn().mockResolvedValue('cached-data');

    const strategies = DegradationStrategies.createDatabaseStrategies(
      primaryDb,
      replicaDb,
      cachedData
    );

    expect(strategies).toHaveLength(3);
    expect(strategies[0].name).toBe('primary-database');
    expect(strategies[1].name).toBe('replica-database');
    expect(strategies[2].name).toBe('cached-data');
  });
});

describe('Integration Tests', () => {
  it('should integrate circuit breaker with retry manager', async () => {
    const circuitBreaker = new CircuitBreaker({
      failureThreshold: 2,
      recoveryTimeout: 1000,
      name: 'integration-test',
    });

    const retryManager = new RetryManager({
      maxAttempts: 3,
      baseDelay: 10,
      name: 'integration-retry',
    });

    const failingOperation = vi.fn().mockRejectedValue(new Error('ECONNRESET')); // Use retryable error

    // This should retry and eventually fail
    await expect(
      retryManager.execute(() => circuitBreaker.execute(failingOperation))
    ).rejects.toThrow();

    // Should be called 2 times before circuit breaker opens
    expect(failingOperation).toHaveBeenCalledTimes(2);

    // Circuit breaker should open after multiple failures
    expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
  });

  it('should integrate correlation ID with error handling', () => {
    const testCorrelationId = 'integration-test-id';

    correlationIdManager.run({ correlationId: testCorrelationId }, () => {
      const error = new ValidationError({ field: 'Invalid' }, 'Test error', {
        correlationId: correlationIdManager.getCorrelationId(),
      });

      expect(error.correlationId).toBe(testCorrelationId);
    });
  });
});
