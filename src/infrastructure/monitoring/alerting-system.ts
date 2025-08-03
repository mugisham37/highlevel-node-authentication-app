/**
 * Alerting System for Security Events and Anomalies
 * Provides comprehensive alerting and notification capabilities
 */

import { EventEmitter } from 'events';
import { correlationIdManager } from '../tracing/correlation-id';
import { loggers } from './structured-logger';
import { metricsManager } from './prometheus-metrics';
import { performanceTracker, PerformanceAlert } from './performance-tracker';

export interface Alert {
  id: string;
  timestamp: Date;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  source: string;
  correlationId?: string;
  metadata: Record<string, any>;
  status: AlertStatus;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  escalationLevel: number;
  suppressUntil?: Date;
}

export enum AlertType {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  SYSTEM = 'system',
  BUSINESS = 'business',
  COMPLIANCE = 'compliance',
}

export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  SUPPRESSED = 'suppressed',
}

export interface AlertRule {
  id: string;
  name: string;
  type: AlertType;
  severity: AlertSeverity;
  enabled: boolean;
  condition: AlertCondition;
  threshold: AlertThreshold;
  cooldownPeriod: number; // milliseconds
  escalationRules: EscalationRule[];
  suppressionRules: SuppressionRule[];
  notificationChannels: string[];
  metadata: Record<string, any>;
}

export interface AlertCondition {
  metric: string;
  operator: 'gt' | 'gte' | 'lt' | 'lte' | 'eq' | 'neq' | 'contains' | 'matches';
  value: any;
  timeWindow?: number; // milliseconds
  aggregation?: 'count' | 'sum' | 'avg' | 'min' | 'max';
}

export interface AlertThreshold {
  warning?: number;
  error?: number;
  critical?: number;
}

export interface EscalationRule {
  level: number;
  delay: number; // milliseconds
  channels: string[];
  condition?: string; // JavaScript expression
}

export interface SuppressionRule {
  condition: string; // JavaScript expression
  duration: number; // milliseconds
  reason: string;
}

export interface NotificationChannel {
  id: string;
  name: string;
  type: 'email' | 'slack' | 'webhook' | 'sms' | 'pagerduty';
  config: Record<string, any>;
  enabled: boolean;
  rateLimits: {
    maxPerMinute: number;
    maxPerHour: number;
    maxPerDay: number;
  };
}

export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: SecurityEventType;
  severity: AlertSeverity;
  source: string;
  userId?: string;
  sessionId?: string;
  ipAddress?: string;
  userAgent?: string;
  details: Record<string, any>;
  riskScore: number;
  correlationId?: string;
}

export enum SecurityEventType {
  FAILED_LOGIN = 'failed_login',
  ACCOUNT_LOCKOUT = 'account_lockout',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  DATA_ACCESS_VIOLATION = 'data_access_violation',
  RATE_LIMIT_EXCEEDED = 'rate_limit_exceeded',
  INVALID_TOKEN = 'invalid_token',
  SESSION_HIJACKING = 'session_hijacking',
  BRUTE_FORCE_ATTACK = 'brute_force_attack',
  SQL_INJECTION_ATTEMPT = 'sql_injection_attempt',
  XSS_ATTEMPT = 'xss_attempt',
  CSRF_ATTEMPT = 'csrf_attempt',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  ANOMALOUS_BEHAVIOR = 'anomalous_behavior',
}

/**
 * Alerting System Class
 */
export class AlertingSystem extends EventEmitter {
  private alerts = new Map<string, Alert>();
  private alertRules = new Map<string, AlertRule>();
  private notificationChannels = new Map<string, NotificationChannel>();
  private alertCooldowns = new Map<string, number>();
  private securityEvents: SecurityEvent[] = [];
  private maxSecurityEvents = 10000;
  private anomalyDetector: AnomalyDetector;
  private cleanupInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.anomalyDetector = new AnomalyDetector();
    this.setupDefaultRules();
    this.setupEventListeners();
    this.startCleanupTimer();
  }

  /**
   * Setup default alert rules
   */
  private setupDefaultRules(): void {
    const defaultRules: AlertRule[] = [
      // Security Rules
      {
        id: 'failed_login_threshold',
        name: 'Failed Login Threshold',
        type: AlertType.SECURITY,
        severity: AlertSeverity.HIGH,
        enabled: true,
        condition: {
          metric: 'failed_logins',
          operator: 'gte',
          value: 5,
          timeWindow: 300000, // 5 minutes
          aggregation: 'count',
        },
        threshold: { warning: 3, error: 5, critical: 10 },
        cooldownPeriod: 300000, // 5 minutes
        escalationRules: [
          { level: 1, delay: 0, channels: ['security-team'] },
          {
            level: 2,
            delay: 900000,
            channels: ['security-team', 'management'],
          }, // 15 minutes
        ],
        suppressionRules: [],
        notificationChannels: ['security-team'],
        metadata: {},
      },
      {
        id: 'brute_force_detection',
        name: 'Brute Force Attack Detection',
        type: AlertType.SECURITY,
        severity: AlertSeverity.CRITICAL,
        enabled: true,
        condition: {
          metric: 'failed_logins_per_ip',
          operator: 'gte',
          value: 10,
          timeWindow: 600000, // 10 minutes
          aggregation: 'count',
        },
        threshold: { critical: 10 },
        cooldownPeriod: 600000, // 10 minutes
        escalationRules: [
          { level: 1, delay: 0, channels: ['security-team', 'ops-team'] },
        ],
        suppressionRules: [],
        notificationChannels: ['security-team', 'ops-team'],
        metadata: {},
      },
      {
        id: 'suspicious_activity',
        name: 'Suspicious Activity Detection',
        type: AlertType.SECURITY,
        severity: AlertSeverity.MEDIUM,
        enabled: true,
        condition: {
          metric: 'risk_score',
          operator: 'gte',
          value: 0.8,
          timeWindow: 300000, // 5 minutes
        },
        threshold: { warning: 0.6, error: 0.8, critical: 0.9 },
        cooldownPeriod: 300000,
        escalationRules: [{ level: 1, delay: 0, channels: ['security-team'] }],
        suppressionRules: [],
        notificationChannels: ['security-team'],
        metadata: {},
      },

      // Performance Rules
      {
        id: 'high_response_time',
        name: 'High Response Time',
        type: AlertType.PERFORMANCE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        condition: {
          metric: 'response_time',
          operator: 'gte',
          value: 1000,
          timeWindow: 300000,
          aggregation: 'avg',
        },
        threshold: { warning: 500, error: 1000, critical: 2000 },
        cooldownPeriod: 300000,
        escalationRules: [
          { level: 1, delay: 0, channels: ['ops-team'] },
          { level: 2, delay: 600000, channels: ['ops-team', 'dev-team'] },
        ],
        suppressionRules: [],
        notificationChannels: ['ops-team'],
        metadata: {},
      },
      {
        id: 'high_error_rate',
        name: 'High Error Rate',
        type: AlertType.PERFORMANCE,
        severity: AlertSeverity.HIGH,
        enabled: true,
        condition: {
          metric: 'error_rate',
          operator: 'gte',
          value: 0.05, // 5%
          timeWindow: 300000,
          aggregation: 'avg',
        },
        threshold: { warning: 0.02, error: 0.05, critical: 0.1 },
        cooldownPeriod: 300000,
        escalationRules: [{ level: 1, delay: 0, channels: ['ops-team'] }],
        suppressionRules: [],
        notificationChannels: ['ops-team'],
        metadata: {},
      },

      // System Rules
      {
        id: 'high_memory_usage',
        name: 'High Memory Usage',
        type: AlertType.SYSTEM,
        severity: AlertSeverity.HIGH,
        enabled: true,
        condition: {
          metric: 'memory_usage',
          operator: 'gte',
          value: 0.9, // 90%
          timeWindow: 300000,
        },
        threshold: { warning: 0.8, error: 0.9, critical: 0.95 },
        cooldownPeriod: 300000,
        escalationRules: [{ level: 1, delay: 0, channels: ['ops-team'] }],
        suppressionRules: [],
        notificationChannels: ['ops-team'],
        metadata: {},
      },
      {
        id: 'database_connection_failure',
        name: 'Database Connection Failure',
        type: AlertType.SYSTEM,
        severity: AlertSeverity.CRITICAL,
        enabled: true,
        condition: {
          metric: 'database_errors',
          operator: 'gte',
          value: 5,
          timeWindow: 300000,
          aggregation: 'count',
        },
        threshold: { critical: 5 },
        cooldownPeriod: 300000,
        escalationRules: [
          { level: 1, delay: 0, channels: ['ops-team', 'dev-team'] },
        ],
        suppressionRules: [],
        notificationChannels: ['ops-team', 'dev-team'],
        metadata: {},
      },
    ];

    defaultRules.forEach((rule) => {
      this.addAlertRule(rule);
    });
  }

  /**
   * Setup event listeners
   */
  private setupEventListeners(): void {
    // Listen to performance alerts
    performanceTracker.on('performance_alert', (alert: PerformanceAlert) => {
      this.handlePerformanceAlert(alert);
    });

    // Listen to security events (would be emitted by security components)
    this.on('security_event', (event: SecurityEvent) => {
      this.handleSecurityEvent(event);
    });
  }

  /**
   * Record security event
   */
  recordSecurityEvent(
    type: SecurityEventType,
    severity: AlertSeverity,
    source: string,
    details: Record<string, any>,
    riskScore: number = 0,
    userId?: string,
    sessionId?: string,
    ipAddress?: string,
    userAgent?: string
  ): SecurityEvent {
    const event: SecurityEvent = {
      id: this.generateId(),
      timestamp: new Date(),
      type,
      severity,
      source,
      userId,
      sessionId,
      ipAddress,
      userAgent,
      details,
      riskScore,
      correlationId: correlationIdManager.getCorrelationId(),
    };

    // Store event
    this.securityEvents.push(event);
    if (this.securityEvents.length > this.maxSecurityEvents) {
      this.securityEvents = this.securityEvents.slice(-this.maxSecurityEvents);
    }

    // Record metrics
    metricsManager.recordSecurityEvent(type, severity, source, riskScore);

    // Log event
    loggers.security.security(`Security event recorded: ${type}`, {
      eventType: type,
      severity,
      source,
      userId,
      sessionId,
      ipAddress,
      userAgent,
      riskScore,
      details,
    });

    // Emit for processing
    this.emit('security_event', event);

    return event;
  }

  /**
   * Handle security event
   */
  private async handleSecurityEvent(event: SecurityEvent): Promise<void> {
    // Check for anomalies
    const anomaly = await this.anomalyDetector.detectAnomaly(event);
    if (anomaly) {
      await this.createAlert({
        type: AlertType.SECURITY,
        severity: event.severity,
        title: `Security Anomaly Detected: ${event.type}`,
        description: `Anomalous security event detected: ${anomaly.description}`,
        source: event.source,
        correlationId: event.correlationId,
        metadata: {
          securityEvent: event,
          anomaly,
        },
      });
    }

    // Check alert rules
    await this.evaluateAlertRules(event);
  }

  /**
   * Handle performance alert
   */
  private async handlePerformanceAlert(
    perfAlert: PerformanceAlert
  ): Promise<void> {
    await this.createAlert({
      type: AlertType.PERFORMANCE,
      severity: perfAlert.severity as AlertSeverity,
      title: `Performance Threshold Exceeded: ${perfAlert.operation}`,
      description: `Operation ${perfAlert.component}.${perfAlert.operation} took ${perfAlert.actualDuration}ms, exceeding ${perfAlert.severity} threshold of ${perfAlert.threshold[`${perfAlert.severity}Threshold` as keyof AlertThreshold]}ms`,
      source: perfAlert.component,
      correlationId: perfAlert.correlationId,
      metadata: {
        performanceAlert: perfAlert,
      },
    });
  }

  /**
   * Create alert
   */
  async createAlert(alertData: {
    type: AlertType;
    severity: AlertSeverity;
    title: string;
    description: string;
    source: string;
    correlationId?: string;
    metadata?: Record<string, any>;
  }): Promise<Alert> {
    const alert: Alert = {
      id: this.generateId(),
      timestamp: new Date(),
      type: alertData.type,
      severity: alertData.severity,
      title: alertData.title,
      description: alertData.description,
      source: alertData.source,
      correlationId: alertData.correlationId,
      metadata: alertData.metadata || {},
      status: AlertStatus.ACTIVE,
      escalationLevel: 0,
    };

    // Store alert
    this.alerts.set(alert.id, alert);

    // Log alert
    loggers.security.warn(`Alert created: ${alert.title}`, {
      alertId: alert.id,
      type: alert.type,
      severity: alert.severity,
      source: alert.source,
      correlationId: alert.correlationId,
      metadata: alert.metadata,
    });

    // Send notifications
    await this.sendNotifications(alert);

    // Emit alert event
    this.emit('alert_created', alert);

    return alert;
  }

  /**
   * Acknowledge alert
   */
  acknowledgeAlert(alertId: string, acknowledgedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert || alert.status !== AlertStatus.ACTIVE) {
      return false;
    }

    alert.status = AlertStatus.ACKNOWLEDGED;
    alert.acknowledgedBy = acknowledgedBy;
    alert.acknowledgedAt = new Date();

    loggers.security.info(`Alert acknowledged`, {
      alertId,
      acknowledgedBy,
      title: alert.title,
    });

    this.emit('alert_acknowledged', alert);
    return true;
  }

  /**
   * Resolve alert
   */
  resolveAlert(alertId: string, resolvedBy: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = AlertStatus.RESOLVED;
    alert.resolvedBy = resolvedBy;
    alert.resolvedAt = new Date();

    loggers.security.info(`Alert resolved`, {
      alertId,
      resolvedBy,
      title: alert.title,
    });

    this.emit('alert_resolved', alert);
    return true;
  }

  /**
   * Suppress alert
   */
  suppressAlert(alertId: string, duration: number, reason: string): boolean {
    const alert = this.alerts.get(alertId);
    if (!alert) {
      return false;
    }

    alert.status = AlertStatus.SUPPRESSED;
    alert.suppressUntil = new Date(Date.now() + duration);
    alert.metadata.suppressionReason = reason;

    loggers.security.info(`Alert suppressed`, {
      alertId,
      duration,
      reason,
      title: alert.title,
    });

    this.emit('alert_suppressed', alert);
    return true;
  }

  /**
   * Add alert rule
   */
  addAlertRule(rule: AlertRule): void {
    this.alertRules.set(rule.id, rule);
    loggers.security.info(`Alert rule added: ${rule.name}`, {
      ruleId: rule.id,
      type: rule.type,
      severity: rule.severity,
    });
  }

  /**
   * Remove alert rule
   */
  removeAlertRule(ruleId: string): boolean {
    const removed = this.alertRules.delete(ruleId);
    if (removed) {
      loggers.security.info(`Alert rule removed`, { ruleId });
    }
    return removed;
  }

  /**
   * Add notification channel
   */
  addNotificationChannel(channel: NotificationChannel): void {
    this.notificationChannels.set(channel.id, channel);
    loggers.security.info(`Notification channel added: ${channel.name}`, {
      channelId: channel.id,
      type: channel.type,
    });
  }

  /**
   * Get alerts
   */
  getAlerts(
    status?: AlertStatus,
    type?: AlertType,
    severity?: AlertSeverity,
    limit?: number
  ): Alert[] {
    let alerts = Array.from(this.alerts.values());

    if (status) {
      alerts = alerts.filter((alert) => alert.status === status);
    }

    if (type) {
      alerts = alerts.filter((alert) => alert.type === type);
    }

    if (severity) {
      alerts = alerts.filter((alert) => alert.severity === severity);
    }

    // Sort by timestamp (newest first)
    alerts.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return limit ? alerts.slice(0, limit) : alerts;
  }

  /**
   * Get security events
   */
  getSecurityEvents(
    type?: SecurityEventType,
    severity?: AlertSeverity,
    limit?: number
  ): SecurityEvent[] {
    let events = [...this.securityEvents];

    if (type) {
      events = events.filter((event) => event.type === type);
    }

    if (severity) {
      events = events.filter((event) => event.severity === severity);
    }

    // Sort by timestamp (newest first)
    events.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());

    return limit ? events.slice(0, limit) : events;
  }

  /**
   * Evaluate alert rules
   */
  private async evaluateAlertRules(event: SecurityEvent): Promise<void> {
    for (const rule of this.alertRules.values()) {
      if (!rule.enabled || rule.type !== AlertType.SECURITY) {
        continue;
      }

      // Check cooldown
      const cooldownKey = `${rule.id}_${event.source}`;
      const lastAlert = this.alertCooldowns.get(cooldownKey);
      if (lastAlert && Date.now() - lastAlert < rule.cooldownPeriod) {
        continue;
      }

      // Evaluate condition
      const shouldAlert = await this.evaluateCondition(rule.condition, event);
      if (shouldAlert) {
        await this.createAlert({
          type: rule.type,
          severity: rule.severity,
          title: rule.name,
          description: `Alert rule triggered: ${rule.name}`,
          source: event.source,
          correlationId: event.correlationId,
          metadata: {
            rule,
            triggeringEvent: event,
          },
        });

        // Set cooldown
        this.alertCooldowns.set(cooldownKey, Date.now());
      }
    }
  }

  /**
   * Evaluate alert condition
   */
  private async evaluateCondition(
    condition: AlertCondition,
    event: SecurityEvent
  ): Promise<boolean> {
    // This is a simplified implementation
    // In a real system, this would query metrics and evaluate complex conditions

    switch (condition.metric) {
      case 'risk_score':
        return this.compareValues(
          event.riskScore,
          condition.operator,
          condition.value
        );

      case 'failed_logins':
        // Would query recent failed login events
        const recentFailedLogins = this.securityEvents.filter(
          (e) =>
            e.type === SecurityEventType.FAILED_LOGIN &&
            Date.now() - e.timestamp.getTime() <
              (condition.timeWindow || 300000)
        ).length;
        return this.compareValues(
          recentFailedLogins,
          condition.operator,
          condition.value
        );

      default:
        return false;
    }
  }

  /**
   * Compare values based on operator
   */
  private compareValues(actual: any, operator: string, expected: any): boolean {
    switch (operator) {
      case 'gt':
        return actual > expected;
      case 'gte':
        return actual >= expected;
      case 'lt':
        return actual < expected;
      case 'lte':
        return actual <= expected;
      case 'eq':
        return actual === expected;
      case 'neq':
        return actual !== expected;
      case 'contains':
        return String(actual).includes(String(expected));
      case 'matches':
        return new RegExp(expected).test(String(actual));
      default:
        return false;
    }
  }

  /**
   * Send notifications
   */
  private async sendNotifications(alert: Alert): Promise<void> {
    // Find applicable alert rule
    const rule = Array.from(this.alertRules.values()).find(
      (r) => r.type === alert.type && r.severity === alert.severity
    );

    const channels = rule?.notificationChannels || [];

    for (const channelId of channels) {
      const channel = this.notificationChannels.get(channelId);
      if (channel && channel.enabled) {
        try {
          await this.sendNotification(channel, alert);
        } catch (error) {
          loggers.security.error(`Failed to send notification`, {
            channelId,
            alertId: alert.id,
            error: (error as Error).message,
          });
        }
      }
    }
  }

  /**
   * Send notification to specific channel
   */
  private async sendNotification(
    channel: NotificationChannel,
    alert: Alert
  ): Promise<void> {
    // This would implement actual notification sending
    // For now, just log the notification
    loggers.security.info(`Notification sent`, {
      channelId: channel.id,
      channelType: channel.type,
      alertId: alert.id,
      title: alert.title,
      severity: alert.severity,
    });
  }

  /**
   * Generate unique ID
   */
  private generateId(): string {
    return `alert_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      this.cleanupOldAlerts();
      this.cleanupOldSecurityEvents();
      this.cleanupCooldowns();
    }, 3600000); // Run every hour
  }

  /**
   * Cleanup old alerts
   */
  private cleanupOldAlerts(): void {
    const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000; // 7 days
    let cleaned = 0;

    for (const [id, alert] of this.alerts.entries()) {
      if (
        alert.timestamp.getTime() < cutoff &&
        alert.status === AlertStatus.RESOLVED
      ) {
        this.alerts.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      loggers.security.info(`Cleaned up old alerts`, { count: cleaned });
    }
  }

  /**
   * Cleanup old security events
   */
  private cleanupOldSecurityEvents(): void {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000; // 30 days
    const originalLength = this.securityEvents.length;

    this.securityEvents = this.securityEvents.filter(
      (event) => event.timestamp.getTime() >= cutoff
    );

    const cleaned = originalLength - this.securityEvents.length;
    if (cleaned > 0) {
      loggers.security.info(`Cleaned up old security events`, {
        count: cleaned,
      });
    }
  }

  /**
   * Cleanup old cooldowns
   */
  private cleanupCooldowns(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [key, timestamp] of this.alertCooldowns.entries()) {
      if (now - timestamp > 24 * 60 * 60 * 1000) {
        // 24 hours
        this.alertCooldowns.delete(key);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      loggers.security.info(`Cleaned up old cooldowns`, { count: cleaned });
    }
  }

  /**
   * Shutdown alerting system
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    loggers.security.info('Alerting system shutdown complete');
  }
}

/**
 * Anomaly Detector Class
 */
class AnomalyDetector {
  private baselines = new Map<string, number[]>();
  private readonly maxBaselineSize = 1000;

  /**
   * Detect anomaly in security event
   */
  async detectAnomaly(
    event: SecurityEvent
  ): Promise<{ description: string; score: number } | null> {
    // Simple anomaly detection based on frequency
    const key = `${event.type}_${event.source}`;
    const baseline = this.baselines.get(key) || [];

    // Add current timestamp to baseline
    baseline.push(event.timestamp.getTime());
    if (baseline.length > this.maxBaselineSize) {
      baseline.shift();
    }
    this.baselines.set(key, baseline);

    // Check for frequency anomalies
    if (baseline.length >= 10) {
      const recentEvents = baseline.filter(
        (timestamp) => event.timestamp.getTime() - timestamp < 300000 // 5 minutes
      );

      const averageFrequency =
        (baseline.length / (baseline[baseline.length - 1] - baseline[0])) *
        300000;
      const currentFrequency = recentEvents.length;

      if (currentFrequency > averageFrequency * 3) {
        return {
          description: `Unusual frequency of ${event.type} events from ${event.source}`,
          score: Math.min(currentFrequency / averageFrequency / 3, 1),
        };
      }
    }

    return null;
  }
}

// Export singleton instance
export const alertingSystem = new AlertingSystem();
