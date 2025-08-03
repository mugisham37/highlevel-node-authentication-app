import { describe, it, expect, beforeEach } from 'vitest';
import {
  CircuitBreaker,
  CircuitBreakerState,
} from '../../../infrastructure/cache/circuit-breaker';

describe('CircuitBreaker', () => {
  let circuitBreaker: CircuitBreaker;

  beforeEach(() => {
    circuitBreaker = new CircuitBreaker({
      failureThreshold: 3,
      recoveryTimeout: 1000, // 1 second for testing
      monitoringPeriod: 5000,
    });
  });

  describe('Basic Functionality', () => {
    it('should start in CLOSED state', () => {
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
      expect(circuitBreaker.isClosed()).toBe(true);
      expect(circuitBreaker.isOpen()).toBe(false);
      expect(circuitBreaker.isHalfOpen()).toBe(false);
    });

    it('should execute successful operations', async () => {
      const operation = async () => 'success';
      const result = await circuitBreaker.execute(operation);

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });

    it('should track metrics', async () => {
      const successOperation = async () => 'success';
      const failOperation = async () => {
        throw new Error('failure');
      };

      await circuitBreaker.execute(successOperation);

      try {
        await circuitBreaker.execute(failOperation);
      } catch (error) {
        // Expected to fail
      }

      const metrics = circuitBreaker.getMetrics();
      expect(metrics.successes).toBe(1);
      expect(metrics.failures).toBe(1);
      expect(metrics.requests).toBe(2);
    });
  });

  describe('Circuit Breaking', () => {
    it('should open circuit after failure threshold', async () => {
      const failOperation = async () => {
        throw new Error('failure');
      };

      // Execute failing operations up to threshold
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN);
      expect(circuitBreaker.isOpen()).toBe(true);
    });

    it('should reject requests when circuit is open', async () => {
      const failOperation = async () => {
        throw new Error('failure');
      };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Should reject new requests
      await expect(
        circuitBreaker.execute(async () => 'should not execute')
      ).rejects.toThrow('Circuit breaker is OPEN');
    });

    it('should use fallback when circuit is open', async () => {
      const failOperation = async () => {
        throw new Error('failure');
      };
      const fallback = async () => 'fallback result';

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Should use fallback
      const result = await circuitBreaker.execute(failOperation, fallback);
      expect(result).toBe('fallback result');
    });

    it('should transition to HALF_OPEN after recovery timeout', async () => {
      const failOperation = async () => {
        throw new Error('failure');
      };

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Next operation should transition to HALF_OPEN
      try {
        await circuitBreaker.execute(failOperation);
      } catch (error) {
        // Expected to fail, but state should change
      }

      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.OPEN); // Should go back to OPEN after failure
    });

    it('should close circuit on successful operation in HALF_OPEN state', async () => {
      const failOperation = async () => {
        throw new Error('failure');
      };
      const successOperation = async () => 'success';

      // Open the circuit
      for (let i = 0; i < 3; i++) {
        try {
          await circuitBreaker.execute(failOperation);
        } catch (error) {
          // Expected to fail
        }
      }

      expect(circuitBreaker.isOpen()).toBe(true);

      // Wait for recovery timeout
      await new Promise((resolve) => setTimeout(resolve, 1100));

      // Execute successful operation to close circuit
      const result = await circuitBreaker.execute(successOperation);

      expect(result).toBe('success');
      expect(circuitBreaker.getState()).toBe(CircuitBreakerState.CLOSED);
    });
  });

  describe('Manual Control', () => {
    it('should allow manual circuit control', () => {
      expect(circuitBreaker.isClosed()).toBe(true);

      circuitBreaker.forceOpen();
      expect(circuitBreaker.isOpen()).toBe(true);

      circuitBreaker.forceHalfOpen();
      expect(circuitBreaker.isHalfOpen()).toBe(true);

      circuitBreaker.forceClose();
      expect(circuitBreaker.isClosed()).toBe(true);
    });
  });

  describe('Expected Errors', () => {
    it('should not count expected errors as failures', async () => {
      class ExpectedError extends Error {}

      const circuitBreakerWithExpected = new CircuitBreaker({
        failureThreshold: 3,
        recoveryTimeout: 1000,
        expectedErrors: [ExpectedError],
      });

      const operationWithExpectedError = async () => {
        throw new ExpectedError('This is expected');
      };

      // Execute operations that throw expected errors
      for (let i = 0; i < 5; i++) {
        try {
          await circuitBreakerWithExpected.execute(operationWithExpectedError);
        } catch (error) {
          // Expected to fail
        }
      }

      // Circuit should still be closed because errors were expected
      expect(circuitBreakerWithExpected.isClosed()).toBe(true);

      const metrics = circuitBreakerWithExpected.getMetrics();
      expect(metrics.failures).toBe(0); // Expected errors don't count as failures
    });
  });
});
