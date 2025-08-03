/**
 * Basic Monitoring System Tests
 * Simple tests for monitoring components without full system initialization
 */

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { metricsManager } from '../../../infrastructure/monitoring/prometheus-metrics';
import { performanceTracker } from '../../../infrastructure/monitoring/performance-tracker';
import {
  alertingSystem,
  SecurityEventType,
  AlertSeverity,
} from '../../../infrastructure/monitoring/alerting-system';
import {
  auditTrailManager,
  AuditHelpers,
} from '../../../infrastructure/monitoring/audit-trail';

describe('Basic Monitoring Components', () => {
  afterEach(() => {
    // Clean up after each test
    performanceTracker.clearCompletedMetrics();
  });

  describe('Metrics Manager', () => {
    it('should record authentication attempts', () => {
      // This should not throw an error
      expect(() => {
        metricsManager.recordAuthAttempt(
          'email_password',
          'internal',
          'success',
          'Mozilla/5.0',
          150
        );
      }).not.toThrow();
    });

    it('should record HTTP requests', () => {
      expect(() => {
        metricsManager.recordHttpRequest(
          'POST',
          '/auth/login',
          200,
          150,
          1024,
          512
        );
      }).not.toThrow();
    });

    it('should record database queries', () => {
      expect(() => {
        metricsManager.recordDatabaseQuery(
          'select',
          'users',
          'prisma',
          'success',
          25
        );
      }).not.toThrow();
    });

    it('should record security events', () => {
      expect(() => {
        metricsManager.recordSecurityEvent(
          'failed_login',
          'medium',
          'auth',
          0.6
        );
      }).not.toThrow();
    });

    it('should update active sessions count', () => {
      expect(() => {
        metricsManager.updateActiveSessions(150, 'regular');
      }).not.toThrow();
    });

    it('should update circuit breaker state', () => {
      expect(() => {
        metricsManager.updateCircuitBreakerState('database', 'CLOSED');
      }).not.toThrow();
    });

    it('should record cache operations', () => {
      expect(() => {
        metricsManager.recordCacheOperation('get', 'redis', 'hit', 5);
      }).not.toThrow();
    });

    it('should get metrics as string', async () => {
      const metrics = await metricsManager.getMetrics();
      expect(typeof metrics).toBe('string');
      expect(metrics.length).toBeGreaterThan(0);
    });
  });

  describe('Performance Tracker', () => {
    it('should start and stop tracking', () => {
      const metricId = performanceTracker.startTracking(
        'test_operation',
        'test_component',
        { testData: 'value' }
      );

      expect(metricId).toBeDefined();
      expect(typeof metricId).toBe('string');

      const activeMetrics = performanceTracker.getActiveMetrics();
      expect(activeMetrics.length).toBe(1);
      expect(activeMetrics[0].id).toBe(metricId);
      expect(activeMetrics[0].operation).toBe('test_operation');
      expect(activeMetrics[0].component).toBe('test_component');

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
      expect(completedMetrics[0].duration).toBeGreaterThan(0);
    });

    it('should track asynchronous operations', async () => {
      const result = await performanceTracker.track(
        'async_operation',
        'test_component',
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 10));
          return 'async_result';
        },
        { testData: 'value' }
      );

      expect(result).toBe('async_result');

      const completedMetrics = performanceTracker.getCompletedMetrics();
      expect(completedMetrics.length).toBe(1);
      expect(completedMetrics[0].operation).toBe('async_operation');
      expect(completedMetrics[0].status).toBe('success');
      expect(completedMetrics[0].duration).toBeGreaterThanOrEqual(10);
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

      const completedMetrics = performanceTracker.getCompletedMetrics();
      expect(completedMetrics.length).toBe(1);
      expect(completedMetrics[0].operation).toBe('failing_operation');
      expect(completedMetrics[0].status).toBe('error');
      expect(completedMetrics[0].error?.message).toBe('Test error');
    });

    it('should get performance statistics', () => {
      // Track some operations to generate stats
      performanceTracker.trackSync('test_op', 'test_comp', () => 'result1');
      performanceTracker.trackSync('test_op', 'test_comp', () => 'result2');

      const stats = performanceTracker.getStats('test_op', 'test_comp');
      expect(stats.length).toBeGreaterThan(0);
    });

    it('should update resource usage', () => {
      const metricId = performanceTracker.startTracking('test_op', 'test_comp');

      expect(() => {
        performanceTracker.incrementDatabaseQueries(metricId, 2);
        performanceTracker.incrementCacheOperations(metricId, 1);
        performanceTracker.incrementNetworkCalls(metricId, 3);
      }).not.toThrow();

      const metric = performanceTracker.stopTracking(metricId, 'success');
      expect(metric?.resourceUsage?.databaseQueries).toBe(2);
      expect(metric?.resourceUsage?.cacheOperations).toBe(1);
      expect(metric?.resourceUsage?.networkCalls).toBe(3);
    });
  });

  describe('Alerting System', () => {
    it('should record security events', () => {
      const event = alertingSystem.recordSecurityEvent(
        SecurityEventType.FAILED_LOGIN,
        AlertSeverity.MEDIUM,
        'auth',
        { reason: 'invalid_password' },
        0.6,
        'user123',
        'session456',
        '192.168.1.1',
        'Mozilla/5.0'
      );

      expect(event.id).toBeDefined();
      expect(event.type).toBe(SecurityEventType.FAILED_LOGIN);
      expect(event.severity).toBe(AlertSeverity.MEDIUM);
      expect(event.riskScore).toBe(0.6);
      expect(event.userId).toBe('user123');
      expect(event.sessionId).toBe('session456');
      expect(event.ipAddress).toBe('192.168.1.1');
    });

    it('should create alerts', async () => {
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
      expect(alert.title).toBe('Test Security Alert');
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
      expect(acknowledgedAlert?.acknowledgedAt).toBeDefined();
    });

    it('should resolve alerts', async () => {
      const alert = await alertingSystem.createAlert({
        type: 'performance',
        severity: 'low',
        title: 'Test Performance Alert',
        description: 'Test description',
        source: 'test',
      });

      const resolved = alertingSystem.resolveAlert(alert.id, 'admin456');
      expect(resolved).toBe(true);

      const alerts = alertingSystem.getAlerts();
      const resolvedAlert = alerts.find((a) => a.id === alert.id);
      expect(resolvedAlert?.status).toBe('resolved');
      expect(resolvedAlert?.resolvedBy).toBe('admin456');
      expect(resolvedAlert?.resolvedAt).toBeDefined();
    });

    it('should get alerts with filters', async () => {
      // Create multiple alerts
      await alertingSystem.createAlert({
        type: 'security',
        severity: 'high',
        title: 'Security Alert 1',
        description: 'Description 1',
        source: 'auth',
      });

      await alertingSystem.createAlert({
        type: 'performance',
        severity: 'medium',
        title: 'Performance Alert 1',
        description: 'Description 2',
        source: 'api',
      });

      // Test filtering
      const securityAlerts = alertingSystem.getAlerts('active', 'security');
      expect(securityAlerts.length).toBe(1);
      expect(securityAlerts[0].type).toBe('security');

      const highSeverityAlerts = alertingSystem.getAlerts(
        'active',
        undefined,
        'high'
      );
      expect(highSeverityAlerts.length).toBe(1);
      expect(highSeverityAlerts[0].severity).toBe('high');

      const allActiveAlerts = alertingSystem.getAlerts('active');
      expect(allActiveAlerts.length).toBe(2);
    });

    it('should get security events', () => {
      // Record multiple events
      alertingSystem.recordSecurityEvent(
        SecurityEventType.FAILED_LOGIN,
        AlertSeverity.MEDIUM,
        'auth',
        { reason: 'invalid_password' },
        0.6
      );

      alertingSystem.recordSecurityEvent(
        SecurityEventType.BRUTE_FORCE_ATTACK,
        AlertSeverity.HIGH,
        'auth',
        { attempts: 10 },
        0.9
      );

      const events = alertingSystem.getSecurityEvents();
      expect(events.length).toBe(2);

      const failedLoginEvents = alertingSystem.getSecurityEvents(
        SecurityEventType.FAILED_LOGIN
      );
      expect(failedLoginEvents.length).toBe(1);
      expect(failedLoginEvents[0].type).toBe(SecurityEventType.FAILED_LOGIN);

      const highSeverityEvents = alertingSystem.getSecurityEvents(
        undefined,
        AlertSeverity.HIGH
      );
      expect(highSeverityEvents.length).toBe(1);
      expect(highSeverityEvents[0].severity).toBe(AlertSeverity.HIGH);
    });
  });

  describe('Audit Trail Manager', () => {
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
      expect(event.integrity.chainIndex).toBeGreaterThan(0);
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

      expect(stats.totalEvents).toBeGreaterThanOrEqual(2);
      expect(stats.eventsByType.login).toBeGreaterThanOrEqual(1);
      expect(stats.eventsByType.logout).toBeGreaterThanOrEqual(1);
      expect(stats.eventsByActor['user:user123']).toBeGreaterThanOrEqual(2);
    });

    it('should verify chain integrity', async () => {
      // Record multiple events to create a chain
      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user1' },
        action: 'action1',
        resource: { type: 'resource1' },
        outcome: { result: 'success' },
      });

      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user2' },
        action: 'action2',
        resource: { type: 'resource2' },
        outcome: { result: 'success' },
      });

      const integrity = auditTrailManager.verifyChainIntegrity();
      expect(integrity.valid).toBe(true);
      expect(integrity.details).toBe('Chain integrity verified');
    });

    it('should export audit trail', async () => {
      // Record some events
      await auditTrailManager.recordEvent({
        actor: { type: 'user', id: 'user123' },
        action: 'test_action',
        resource: { type: 'test_resource' },
        outcome: { result: 'success' },
      });

      // Export as JSON
      const jsonExport = auditTrailManager.exportAuditTrail({}, 'json');
      expect(typeof jsonExport).toBe('string');
      expect(() => JSON.parse(jsonExport)).not.toThrow();

      // Export as CSV
      const csvExport = auditTrailManager.exportAuditTrail({}, 'csv');
      expect(typeof csvExport).toBe('string');
      expect(csvExport).toContain('ID,Timestamp,Actor Type');
    });
  });

  describe('Audit Helpers', () => {
    it('should create user actor', () => {
      const actor = AuditHelpers.createUserActor('user123', 'user', {
        name: 'John Doe',
        email: 'john@example.com',
        roles: ['user'],
      });

      expect(actor.type).toBe('user');
      expect(actor.id).toBe('user123');
      expect(actor.name).toBe('John Doe');
      expect(actor.email).toBe('john@example.com');
      expect(actor.roles).toEqual(['user']);
    });

    it('should create system actor', () => {
      const actor = AuditHelpers.createSystemActor(
        'auth-service',
        'Authentication Service'
      );

      expect(actor.type).toBe('system');
      expect(actor.id).toBe('auth-service');
      expect(actor.name).toBe('Authentication Service');
    });

    it('should create resource descriptor', () => {
      const resource = AuditHelpers.createResource(
        'user',
        'user123',
        'John Doe',
        { email: 'john@example.com' },
        { type: 'organization', id: 'org456' }
      );

      expect(resource.type).toBe('user');
      expect(resource.id).toBe('user123');
      expect(resource.name).toBe('John Doe');
      expect(resource.attributes?.email).toBe('john@example.com');
      expect(resource.parent?.type).toBe('organization');
      expect(resource.parent?.id).toBe('org456');
    });

    it('should create success outcome', () => {
      const outcome = AuditHelpers.createSuccessOutcome(0.2);

      expect(outcome.result).toBe('success');
      expect(outcome.riskScore).toBe(0.2);
    });

    it('should create failure outcome', () => {
      const outcome = AuditHelpers.createFailureOutcome(
        'Invalid credentials',
        'AUTH_001',
        'Username or password is incorrect',
        0.8
      );

      expect(outcome.result).toBe('failure');
      expect(outcome.reason).toBe('Invalid credentials');
      expect(outcome.errorCode).toBe('AUTH_001');
      expect(outcome.errorMessage).toBe('Username or password is incorrect');
      expect(outcome.riskScore).toBe(0.8);
    });

    it('should create changes descriptor', () => {
      const before = { name: 'John', email: 'john@old.com' };
      const after = { name: 'John Doe', email: 'john@new.com' };

      const changes = AuditHelpers.createChanges(before, after);

      expect(changes.before).toEqual(before);
      expect(changes.after).toEqual(after);
      expect(changes.delta).toBeDefined();
      expect(changes.delta?.length).toBe(2);

      const nameChange = changes.delta?.find((d) => d.field === 'name');
      expect(nameChange?.operation).toBe('update');
      expect(nameChange?.oldValue).toBe('John');
      expect(nameChange?.newValue).toBe('John Doe');

      const emailChange = changes.delta?.find((d) => d.field === 'email');
      expect(emailChange?.operation).toBe('update');
      expect(emailChange?.oldValue).toBe('john@old.com');
      expect(emailChange?.newValue).toBe('john@new.com');
    });
  });
});
