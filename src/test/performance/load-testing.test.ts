/**
 * Performance Load Testing Suite
 * Validates system performance under various load conditions
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../infrastructure/server/fastify-server';
import { logger } from '../../infrastructure/logging/winston-logger';
import { metricsManager } from '../../infrastructure/monitoring/prometheus-metrics';

describe('Performance Load Testing', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer();
    await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = `http://127.0.0.1:${server.server.address()?.port}`;

    // Start metrics collection
    metricsManager.startCollection(5000);
  });

  afterAll(async () => {
    metricsManager.stopCollection();
    if (server) {
      await server.close();
    }
  });

  describe('Authentication Performance', () => {
    it('should handle concurrent login requests within performance requirements', async () => {
      // Create test users first
      const testUsers = [];
      for (let i = 0; i < 50; i++) {
        const user = {
          email: `load-test-${i}@example.com`,
          password: 'LoadTestPassword123!',
          name: `Load Test User ${i}`,
        };

        const registerResponse = await fetch(
          `${baseUrl}/api/v1/auth/register`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(user),
          }
        );

        if (registerResponse.status === 201) {
          testUsers.push(user);
        }
      }

      expect(testUsers.length).toBeGreaterThan(20); // At least some users should be created

      // Concurrent login test
      const concurrentLogins = 100;
      const startTime = Date.now();

      const loginPromises = Array.from(
        { length: concurrentLogins },
        async (_, i) => {
          const user = testUsers[i % testUsers.length];
          const loginStart = Date.now();

          try {
            const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: user.email,
                password: user.password,
              }),
            });

            const loginEnd = Date.now();
            const responseTime = loginEnd - loginStart;

            return {
              status: response.status,
              responseTime,
              success: response.status === 200,
            };
          } catch (error) {
            return {
              status: 500,
              responseTime: Date.now() - loginStart,
              success: false,
              error: (error as Error).message,
            };
          }
        }
      );

      const results = await Promise.all(loginPromises);
      const totalTime = Date.now() - startTime;

      // Performance assertions
      const successfulLogins = results.filter((r) => r.success);
      const averageResponseTime =
        successfulLogins.reduce((sum, r) => sum + r.responseTime, 0) /
        successfulLogins.length;
      const maxResponseTime = Math.max(
        ...successfulLogins.map((r) => r.responseTime)
      );
      const successRate = (successfulLogins.length / results.length) * 100;

      logger.info('Concurrent login performance results', {
        totalRequests: concurrentLogins,
        successfulLogins: successfulLogins.length,
        successRate: `${successRate.toFixed(2)}%`,
        averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
        maxResponseTime: `${maxResponseTime}ms`,
        totalTime: `${totalTime}ms`,
        throughput: `${(concurrentLogins / (totalTime / 1000)).toFixed(2)} req/s`,
      });

      // Performance requirements validation
      expect(successRate).toBeGreaterThan(95); // 95% success rate
      expect(averageResponseTime).toBeLessThan(100); // Sub-100ms average response time
      expect(maxResponseTime).toBeLessThan(500); // Max 500ms response time
    });

    it('should maintain performance under sustained load', async () => {
      const testDuration = 30000; // 30 seconds
      const requestsPerSecond = 10;
      const interval = 1000 / requestsPerSecond;

      const results: Array<{
        responseTime: number;
        success: boolean;
        timestamp: number;
      }> = [];
      const startTime = Date.now();

      // Create a test user
      const testUser = {
        email: 'sustained-load-test@example.com',
        password: 'SustainedLoadTest123!',
        name: 'Sustained Load Test User',
      };

      await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testUser),
      });

      // Sustained load test
      const sustainedLoadPromise = new Promise<void>((resolve) => {
        const intervalId = setInterval(async () => {
          if (Date.now() - startTime >= testDuration) {
            clearInterval(intervalId);
            resolve();
            return;
          }

          const requestStart = Date.now();

          try {
            const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                email: testUser.email,
                password: testUser.password,
              }),
            });

            const responseTime = Date.now() - requestStart;
            results.push({
              responseTime,
              success: response.status === 200,
              timestamp: Date.now(),
            });
          } catch (error) {
            results.push({
              responseTime: Date.now() - requestStart,
              success: false,
              timestamp: Date.now(),
            });
          }
        }, interval);
      });

      await sustainedLoadPromise;

      // Analyze results
      const successfulRequests = results.filter((r) => r.success);
      const averageResponseTime =
        successfulRequests.reduce((sum, r) => sum + r.responseTime, 0) /
        successfulRequests.length;
      const successRate = (successfulRequests.length / results.length) * 100;

      // Check for performance degradation over time
      const firstHalf = results.slice(0, Math.floor(results.length / 2));
      const secondHalf = results.slice(Math.floor(results.length / 2));

      const firstHalfAvg =
        firstHalf
          .filter((r) => r.success)
          .reduce((sum, r) => sum + r.responseTime, 0) /
        firstHalf.filter((r) => r.success).length;
      const secondHalfAvg =
        secondHalf
          .filter((r) => r.success)
          .reduce((sum, r) => sum + r.responseTime, 0) /
        secondHalf.filter((r) => r.success).length;

      const performanceDegradation =
        ((secondHalfAvg - firstHalfAvg) / firstHalfAvg) * 100;

      logger.info('Sustained load test results', {
        duration: `${testDuration / 1000}s`,
        totalRequests: results.length,
        successRate: `${successRate.toFixed(2)}%`,
        averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
        performanceDegradation: `${performanceDegradation.toFixed(2)}%`,
      });

      // Performance assertions
      expect(successRate).toBeGreaterThan(98); // 98% success rate for sustained load
      expect(averageResponseTime).toBeLessThan(100); // Maintain sub-100ms response time
      expect(performanceDegradation).toBeLessThan(20); // Less than 20% performance degradation
    });
  });

  describe('Session Management Performance', () => {
    it('should efficiently handle session validation at scale', async () => {
      // Create multiple authenticated sessions
      const sessions = [];

      for (let i = 0; i < 20; i++) {
        const registerResponse = await fetch(
          `${baseUrl}/api/v1/auth/register`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: `session-perf-${i}@example.com`,
              password: 'SessionPerfTest123!',
              name: `Session Perf User ${i}`,
            }),
          }
        );

        if (registerResponse.status === 201) {
          const { tokens } = await registerResponse.json();
          sessions.push(tokens.accessToken);
        }
      }

      expect(sessions.length).toBeGreaterThan(10);

      // Concurrent session validation test
      const concurrentValidations = 200;
      const startTime = Date.now();

      const validationPromises = Array.from(
        { length: concurrentValidations },
        async (_, i) => {
          const token = sessions[i % sessions.length];
          const validationStart = Date.now();

          try {
            const response = await fetch(`${baseUrl}/api/v1/users/profile`, {
              headers: { Authorization: `Bearer ${token}` },
            });

            const responseTime = Date.now() - validationStart;

            return {
              status: response.status,
              responseTime,
              success: response.status === 200,
            };
          } catch (error) {
            return {
              status: 500,
              responseTime: Date.now() - validationStart,
              success: false,
            };
          }
        }
      );

      const results = await Promise.all(validationPromises);
      const totalTime = Date.now() - startTime;

      const successfulValidations = results.filter((r) => r.success);
      const averageResponseTime =
        successfulValidations.reduce((sum, r) => sum + r.responseTime, 0) /
        successfulValidations.length;
      const successRate = (successfulValidations.length / results.length) * 100;

      logger.info('Session validation performance results', {
        totalValidations: concurrentValidations,
        successRate: `${successRate.toFixed(2)}%`,
        averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
        throughput: `${(concurrentValidations / (totalTime / 1000)).toFixed(2)} validations/s`,
      });

      // Session validation should be very fast
      expect(successRate).toBeGreaterThan(95);
      expect(averageResponseTime).toBeLessThan(50); // Session validation should be under 50ms
    });
  });

  describe('Database Performance', () => {
    it('should handle database queries efficiently under load', async () => {
      const concurrentQueries = 100;
      const startTime = Date.now();

      // Test concurrent user profile queries (database reads)
      const queryPromises = Array.from(
        { length: concurrentQueries },
        async (_, i) => {
          const queryStart = Date.now();

          try {
            // This endpoint should trigger database queries
            const response = await fetch(`${baseUrl}/health/ready`);
            const responseTime = Date.now() - queryStart;

            return {
              status: response.status,
              responseTime,
              success: response.status === 200,
            };
          } catch (error) {
            return {
              status: 500,
              responseTime: Date.now() - queryStart,
              success: false,
            };
          }
        }
      );

      const results = await Promise.all(queryPromises);
      const totalTime = Date.now() - startTime;

      const successfulQueries = results.filter((r) => r.success);
      const averageResponseTime =
        successfulQueries.reduce((sum, r) => sum + r.responseTime, 0) /
        successfulQueries.length;
      const successRate = (successfulQueries.length / results.length) * 100;

      logger.info('Database query performance results', {
        totalQueries: concurrentQueries,
        successRate: `${successRate.toFixed(2)}%`,
        averageResponseTime: `${averageResponseTime.toFixed(2)}ms`,
        throughput: `${(concurrentQueries / (totalTime / 1000)).toFixed(2)} queries/s`,
      });

      expect(successRate).toBeGreaterThan(95);
      expect(averageResponseTime).toBeLessThan(200); // Database queries should be under 200ms
    });
  });

  describe('Memory and Resource Usage', () => {
    it('should maintain stable memory usage under load', async () => {
      const initialMemory = process.memoryUsage();

      // Generate load for memory testing
      const loadPromises = Array.from({ length: 50 }, async (_, i) => {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `memory-test-${i}-${Date.now()}@example.com`,
            password: 'MemoryTest123!',
            name: `Memory Test User ${i}`,
          }),
        });

        return response.status;
      });

      await Promise.all(loadPromises);

      // Force garbage collection if available
      if (global.gc) {
        global.gc();
      }

      // Wait a bit for cleanup
      await new Promise((resolve) => setTimeout(resolve, 2000));

      const finalMemory = process.memoryUsage();

      const memoryIncrease = finalMemory.heapUsed - initialMemory.heapUsed;
      const memoryIncreasePercent =
        (memoryIncrease / initialMemory.heapUsed) * 100;

      logger.info('Memory usage test results', {
        initialHeapUsed: `${(initialMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        finalHeapUsed: `${(finalMemory.heapUsed / 1024 / 1024).toFixed(2)}MB`,
        memoryIncrease: `${(memoryIncrease / 1024 / 1024).toFixed(2)}MB`,
        memoryIncreasePercent: `${memoryIncreasePercent.toFixed(2)}%`,
      });

      // Memory increase should be reasonable (less than 50% increase)
      expect(memoryIncreasePercent).toBeLessThan(50);

      // Total memory usage should be reasonable (less than 512MB for tests)
      expect(finalMemory.heapUsed).toBeLessThan(512 * 1024 * 1024);
    });
  });

  describe('API Rate Limiting Performance', () => {
    it('should efficiently enforce rate limits without performance degradation', async () => {
      const requestsWithinLimit = 50;
      const requestsExceedingLimit = 20;

      // Test requests within rate limit
      const withinLimitStart = Date.now();
      const withinLimitPromises = Array.from(
        { length: requestsWithinLimit },
        async (_, i) => {
          const response = await fetch(`${baseUrl}/health/ready`);
          return {
            status: response.status,
            responseTime: Date.now() - withinLimitStart,
          };
        }
      );

      const withinLimitResults = await Promise.all(withinLimitPromises);
      const withinLimitTime = Date.now() - withinLimitStart;

      // Test requests exceeding rate limit
      const exceedingLimitStart = Date.now();
      const exceedingLimitPromises = Array.from(
        { length: requestsExceedingLimit },
        async () => {
          const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'rate-limit-test@example.com',
              password: 'wrongpassword',
            }),
          });
          return response.status;
        }
      );

      const exceedingLimitResults = await Promise.all(exceedingLimitPromises);
      const exceedingLimitTime = Date.now() - exceedingLimitStart;

      const rateLimitedRequests = exceedingLimitResults.filter(
        (status) => status === 429
      ).length;
      const rateLimitEffectiveness =
        (rateLimitedRequests / requestsExceedingLimit) * 100;

      logger.info('Rate limiting performance results', {
        withinLimitRequests: requestsWithinLimit,
        withinLimitTime: `${withinLimitTime}ms`,
        exceedingLimitRequests: requestsExceedingLimit,
        rateLimitedRequests,
        rateLimitEffectiveness: `${rateLimitEffectiveness.toFixed(2)}%`,
        exceedingLimitTime: `${exceedingLimitTime}ms`,
      });

      // Rate limiting should be effective and not significantly slow down processing
      expect(rateLimitEffectiveness).toBeGreaterThan(50); // At least 50% of excessive requests should be rate limited
      expect(exceedingLimitTime / requestsExceedingLimit).toBeLessThan(100); // Average response time should still be fast
    });
  });

  describe('WebSocket Performance', () => {
    it('should handle multiple WebSocket connections efficiently', async () => {
      // This is a basic test - in a real scenario you'd use WebSocket clients
      const connectionAttempts = 10;
      const startTime = Date.now();

      const connectionPromises = Array.from(
        { length: connectionAttempts },
        async () => {
          try {
            const response = await fetch(`${baseUrl}/ws/events`, {
              headers: {
                Upgrade: 'websocket',
                Connection: 'Upgrade',
                'Sec-WebSocket-Key': 'dGhlIHNhbXBsZSBub25jZQ==',
                'Sec-WebSocket-Version': '13',
              },
            });

            return {
              status: response.status,
              success: [101, 426].includes(response.status), // 101 = Switching Protocols, 426 = Upgrade Required
            };
          } catch (error) {
            return {
              status: 500,
              success: false,
            };
          }
        }
      );

      const results = await Promise.all(connectionPromises);
      const totalTime = Date.now() - startTime;

      const successfulConnections = results.filter((r) => r.success).length;
      const successRate = (successfulConnections / connectionAttempts) * 100;

      logger.info('WebSocket connection performance results', {
        connectionAttempts,
        successfulConnections,
        successRate: `${successRate.toFixed(2)}%`,
        totalTime: `${totalTime}ms`,
        averageConnectionTime: `${(totalTime / connectionAttempts).toFixed(2)}ms`,
      });

      // WebSocket connections should be handled efficiently
      expect(totalTime / connectionAttempts).toBeLessThan(100); // Average connection time under 100ms
    });
  });
});
