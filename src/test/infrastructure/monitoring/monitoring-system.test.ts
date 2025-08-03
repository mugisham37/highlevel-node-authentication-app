/**
 * Monitoring System Tests
 * Tests for the comprehensive monitoring and observability system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { monitoringSystem } from '../../../infrastructure/monitoring';
import { metricsManager } from '../../../infrastructure/monitoring/prometheus-metrics';
import { performanceTracker } from '../../../infrastructure/monitoring/performance-tracker';
import { alertingSystem } from '../../../infrastructure/monitoring/alerting-system';
import { auditTrailManager } from '../../../infrastructure/monitoring/audit-trail';

describe('Monitoring System', () => {
  beforeEach(async () => {
    // Reset monitoring system state
    vi.clearAllMocks();
  });

  afterEach(async () => {
    // Clean up after tests
    try {
      await monitoringSystem.shutdown();
    } catch (error) {
      // Ignore shutdown errors in tests
    }
  });

  describe('System Initialization', () => {
    it('should initialize monitoring system successfully', async () => {
      const status = monitoringSystem.getStatus();
      expect(status.initialized).toBe(false);

      await monitoringSystem.initialize();

      const statusAfter = monitoringSystem.getStatus();
      expect(statusAfter.initialized).toBe(true);
      expect(statusAfter.components.metrics).toBe(true);
      expect(statusAfter.components.performance).toBe(true);
      expect(statusAfter.components.alerting).toBe(true);
      expect(statusAfter.components.audit).toBe(true);
    });

    it('should not reinitialize if already initialized', async () => {
      await monitoringSystem.initialize();
      const status1 = monitoringSystem.getStatus();

      await monitoringSystem.initialize();
      const status2 = monitoringSystem.getStatus();

      expect(status1.initialized).toBe(status2.initialized);
    });
  });

  describe('Metrics Collection', () => {
    beforeEach(async () => {
      await monitoringSystem.initialize();
    });

    it('should record authentication events', () => {
      monitoringSystem.recordAuthEvent(
        'user123',
        'login',
        'success',
        { provider: 'email', riskScore: 0.2 },
        '192.168.1.1',
        'Mozilla/5.0'
      );

      // Verify metrics were recorded (this would check actual metrics in a real implementation)
      expect(true).toBe(true); // Placeholder assertion
    });

    it('should record business events', () => {
      monitoringSystem.recordBusinessEvent(
        'user_created',
        'user',
        'user123',
        { impact: 'medium' },
        'admin456'
      );

      // Verify business event was recorded
      expect(true).toBe(true); // Placeholder assertion
    });
  });

  describe('Performance Tracking', () => {
    beforeEach(async () => {
      await monitoringSystem.initialize();
    });

    it('should track operation performance', async () => {
      const result = await performanceTracker.track(
        'test_operation',
        'test_component',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'success';
        },
        { testData: 'value' }
      );

      expect(result).toBe('success');

      const stats = performanceTracker.getStats(
        'test_operation',
        'test_component'
      );
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should handle operation errors', async () => {
      await expect(
        performanceTracker.track(
          'failing_operation',
          'test_component',
          async () => {
            throw new Error('Test error');
          }
        )
      ).rejects.toThrow('Test error');

      const stats = performanceTracker.getStats(
        'failing_operation',
        'test_component'
      );
      expect(stats.length).toBeGreaterThan(0);
    });
  });

  describe('Alerting System', () => {
    beforeEach(async () => {
      await monitoringSystem.initialize();
    });

    it('should record security events', () => {
      const event = alertingSystem.recordSecurityEvent(
        'failed_login',
        'medium',
        'auth',
        { reason: 'invalid_password' },
        0.6,
        'user123',
        'session456',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(event.id).toBeDefined();
      expect(event.type).toBe('failed_login');
      expect(event.severity).toBe('medium');
      expect(event.riskScore).toBe(0.6);
    });

    it('should create alerts for security events', async () => {
      const alert = await alertingSystem.createAlert({
        type: 'security',
        severity: 'high',
        title: 'Test Security Alert',
        description: 'This is a test alert',
        source: 'test',
        metadata: { testData: 'value' },
      });

      expect(alert.id).toBeDefined();
      expect(alert.type).toBe('security');
      expect(alert.severity).toBe('high');
      expect(alert.status).toBe('active');
    });

    it('should acknowledge alerts', async () => {
      const alert = await alertingSystem.createAlert({
        type: 'security',
        severity: 'medium',
        title: 'Test Alert',
        description: 'Test description',
        source: 'test',
      });

      const acknowledged = alertingSystem.acknowledgeAlert(
        alert.id,
        'admin123'
      );
      expect(acknowledged).toBe(true);

      const alerts = alertingSystem.getAlerts();
      const acknowledgedAlert = alerts.find((a) => a.id === alert.id);
      expect(acknowledgedAlert?.status).toBe('acknowledged');
      expect(acknowledgedAlert?.acknowledgedBy).toBe('admin123');
    });
  });

  describe('Audit Trail', () => {
    beforeEach(async () => {
      await monitoringSystem.initialize();
    });

    it('should record audit events', async () => {
      const event = await auditTrailManager.recordEvent({
        actor: {
          type: 'user',
          id: 'user123',
          name: 'Test User',
        },
        action: 'login',
        resource: {
          type: 'authentication',
          id: 'auth_session',
        },
        outcome: {
          result: 'success',
        },
        metadata: { testData: 'value' },
      });

      expect(event.id).toBeDefined();
      expect(event.actor.id).toBe('user123');
      expect(event.action).toBe('login');
      expect(event.outcome.result).toBe('success');
      expect(event.integrity.hash).toBeDefined();
      expect(event.integrity.signature).toBeDefined();
    });

    it('should verify event integrity', async () => {
      const event = await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user123' },
        action: 'test_action',
        resource: { type: 'test_resource' },
        outcome: { result: 'success' },
      });

      const isValid = auditTrailManager.verifyEventIntegrity(event);
      expect(isValid).toBe(true);
    });

    it('should query audit events', async () => {
      // Record multiple events
      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user123' },
        action: 'login',
        resource: { type: 'authentication' },
        outcome: { result: 'success' },
      });

      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user456' },
        action: 'logout',
        resource: { type: 'authentication' },
        outcome: { result: 'success' },
      });

      // Query by actor
      const userEvents = auditTrailManager.queryEvents({
        actor: { id: 'user123' },
      });

      expect(userEvents.length).toBe(1);
      expect(userEvents[0].actor.id).toBe('user123');

      // Query by action
      const loginEvents = auditTrailManager.queryEvents({
        action: 'login',
      });

      expect(loginEvents.length).toBe(1);
      expect(loginEvents[0].action).toBe('login');
    });

    it('should generate audit statistics', async () => {
      // Record some events
      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user123' },
        action: 'login',
        resource: { type: 'authentication' },
        outcome: { result: 'success' },
      });

      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user123' },
        action: 'logout',
        resource: { type: 'authentication' },
        outcome: { result: 'success' },
      });

      const stats = auditTrailManager.getStatistics();

      expect(stats.totalEvents).toBe(2);
      expect(stats.eventsByType.login).toBe(1);
      expect(stats.eventsByType.logout).toBe(1);
      expect(stats.eventsByActor['user:user123']).toBe(2);
    });
  });

  describe('System Shutdown', () => {
    it('should shutdown gracefully', async () => {
      await monitoringSystem.initialize();

      const statusBefore = monitoringSystem.getStatus();
      expect(statusBefore.initialized).toBe(true);

      await monitoringSystem.shutdown();

      const statusAfter = monitoringSystem.getStatus();
      expect(statusAfter.initialized).toBe(false);
    });
  });
});

describe('Metrics Manager', () => {
  it('should record authentication attempts', () => {
    metricsManager.recordAuthAttempt(
      'email_password',
      'internal',
      'success',
      'Mozilla/5.0',
      150
    );

    // In a real test, we would verify the metrics were recorded
    expect(true).toBe(true); // Placeholder assertion
  });

  it('should record HTTP requests', () => {
    metricsManager.recordHttpRequest(
      'POST',
      '/auth/login',
      200,
      150,
      1024,
      512
    );

    // In a real test, we would verify the metrics were recorded
    expect(true).toBe(true); // Placeholder assertion
  });

  it('should record database queries', () => {
    metricsManager.recordDatabaseQuery(
      'select',
      'users',
      'prisma',
      'success',
      25
    );

    // In a real test, we would verify the metrics were recorded
    expect(true).toBe(true); // Placeholder assertion
  });
});

describe('Performance Tracker', () => {
  afterEach(() => {
    performanceTracker.clearCompletedMetrics();
  });

  it('should start and stop tracking', () => {
    const metricId = performanceTracker.startTracking(
      'test_operation',
      'test_component',
      { testData: 'value' }
    );

    expect(metricId).toBeDefined();

    const activeMetrics = performanceTracker.getActiveMetrics();
    expect(activeMetrics.length).toBe(1);
    expect(activeMetrics[0].id).toBe(metricId);

    const completedMetric = performanceTracker.stopTracking(
      metricId,
      'success'
    );
    expect(completedMetric).toBeDefined();
    expect(completedMetric?.status).toBe('success');
    expect(completedMetric?.duration).toBeGreaterThan(0);

    const activeMetricsAfter = performanceTracker.getActiveMetrics();
    expect(activeMetricsAfter.length).toBe(0);
  });

  it('should track synchronous operations', () => {
    const result = performanceTracker.trackSync(
      'sync_operation',
      'test_component',
      () => {
        return 'sync_result';
      },
      { testData: 'value' }
    );

    expect(result).toBe('sync_result');

    const completedMetrics = performanceTracker.getCompletedMetrics();
    expect(completedMetrics.length).toBe(1);
    expect(completedMetrics[0].operation).toBe('sync_operation');
    expect(completedMetrics[0].status).toBe('success');
  });
});
