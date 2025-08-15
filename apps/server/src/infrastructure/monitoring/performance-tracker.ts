/**
 * Performance Tracking System for Authentication Operations
 * Provides comprehensive performance monitoring and analysis
 */

import { correlationIdManager } from '../tracing/correlation-id';
import { metricsManager } from './prometheus-metrics';
import { loggers } from './structured-logger';
import { createErrorLogContext, createPerformanceLogContext } from '../utils/monitoring-utils';
import { EventEmitter } from 'events';

export interface PerformanceMetric {
  id: string;
  operation: string;
  component: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  status: 'pending' | 'success' | 'error';
  metadata: Record<string, any>;
  correlationId?: string;
  spanId?: string;
  resourceUsage?: ResourceUsage;
  error?: Error;
}

export interface ResourceUsage {
  memoryBefore: NodeJS.MemoryUsage;
  memoryAfter?: NodeJS.MemoryUsage;
  memoryDelta?: {
    rss: number;
    heapUsed: number;
    heapTotal: number;
    external: number;
  };
  cpuUsage?: NodeJS.CpuUsage;
  databaseQueries?: number;
  cacheOperations?: number;
  networkCalls?: number;
}

export interface PerformanceThreshold {
  operation: string;
  component?: string;
  warningThreshold: number; // milliseconds
  errorThreshold: number; // milliseconds
  criticalThreshold: number; // milliseconds
  enabled: boolean;
}

export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  operation: string;
  component: string;
  threshold: PerformanceThreshold;
  actualDuration: number;
  severity: 'warning' | 'error' | 'critical';
  correlationId?: string;
  metadata: Record<string, any>;
}

export interface PerformanceStats {
  operation: string;
  component: string;
  count: number;
  totalDuration: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50: number;
  p95: number;
  p99: number;
  errorRate: number;
  throughput: number; // operations per second
  lastUpdated: Date;
}

/**
 * Performance Tracker Class
 */
export class PerformanceTracker extends EventEmitter {
  private activeMetrics = new Map<string, PerformanceMetric>();
  private completedMetrics: PerformanceMetric[] = [];
  private thresholds = new Map<string, PerformanceThreshold>();
  private stats = new Map<string, PerformanceStats>();
  private maxCompletedMetrics = 10000; // Keep last 10k metrics
  private cleanupInterval?: NodeJS.Timeout;
  private statsUpdateInterval?: NodeJS.Timeout;

  constructor() {
    super();
    this.setupDefaultThresholds();
    this.startCleanupTimer();
    this.startStatsUpdateTimer();
  }

  /**
   * Setup default performance thresholds
   */
  private setupDefaultThresholds(): void {
    const defaultThresholds: PerformanceThreshold[] = [
      // Authentication operations
      {
        operation: 'authenticate',
        component: 'auth',
        warningThreshold: 100,
        errorThreshold: 500,
        criticalThreshold: 1000,
        enabled: true,
      },
      {
        operation: 'validateToken',
        component: 'auth',
        warningThreshold: 50,
        errorThreshold: 200,
        criticalThreshold: 500,
        enabled: true,
      },
      {
        operation: 'refreshToken',
        component: 'auth',
        warningThreshold: 100,
        errorThreshold: 300,
        criticalThreshold: 800,
        enabled: true,
      },

      // Database operations
      {
        operation: 'query',
        component: 'database',
        warningThreshold: 50,
        errorThreshold: 200,
        criticalThreshold: 1000,
        enabled: true,
      },
      {
        operation: 'transaction',
        component: 'database',
        warningThreshold: 100,
        errorThreshold: 500,
        criticalThreshold: 2000,
        enabled: true,
      },

      // Cache operations
      {
        operation: 'get',
        component: 'cache',
        warningThreshold: 10,
        errorThreshold: 50,
        criticalThreshold: 100,
        enabled: true,
      },
      {
        operation: 'set',
        component: 'cache',
        warningThreshold: 20,
        errorThreshold: 100,
        criticalThreshold: 200,
        enabled: true,
      },

      // API operations
      {
        operation: 'http_request',
        component: 'api',
        warningThreshold: 200,
        errorThreshold: 1000,
        criticalThreshold: 5000,
        enabled: true,
      },

      // OAuth operations
      {
        operation: 'oauth_flow',
        component: 'oauth',
        warningThreshold: 500,
        errorThreshold: 2000,
        criticalThreshold: 5000,
        enabled: true,
      },

      // MFA operations
      {
        operation: 'mfa_verify',
        component: 'mfa',
        warningThreshold: 100,
        errorThreshold: 500,
        criticalThreshold: 1000,
        enabled: true,
      },

      // Session operations
      {
        operation: 'session_create',
        component: 'session',
        warningThreshold: 50,
        errorThreshold: 200,
        criticalThreshold: 500,
        enabled: true,
      },
      {
        operation: 'session_validate',
        component: 'session',
        warningThreshold: 25,
        errorThreshold: 100,
        criticalThreshold: 250,
        enabled: true,
      },
    ];

    defaultThresholds.forEach((threshold) => {
      this.setThreshold(threshold);
    });
  }

  /**
   * Start performance tracking for an operation
   */
  startTracking(
    operation: string,
    component: string,
    metadata: Record<string, any> = {}
  ): string {
    const id = this.generateMetricId();
    const correlationId = correlationIdManager.getCorrelationId();
    const span = correlationIdManager.startSpan(`${component}.${operation}`);

    const metric: PerformanceMetric = {
      id,
      operation,
      component,
      startTime: Date.now(),
      status: 'pending',
      metadata,
      ...(correlationId !== undefined && { correlationId }),
      spanId: span.spanId,
      resourceUsage: {
        memoryBefore: process.memoryUsage(),
        cpuUsage: process.cpuUsage(),
        databaseQueries: 0,
        cacheOperations: 0,
        networkCalls: 0,
      },
    };

    this.activeMetrics.set(id, metric);

    loggers.performance.debug(
      `Started tracking performance for ${component}.${operation}`,
      {
        metricId: id,
        operation,
        component,
        correlationId,
        spanId: span.spanId,
        metadata,
      }
    );

    return id;
  }

  /**
   * Stop performance tracking for an operation
   */
  stopTracking(
    metricId: string,
    status: 'success' | 'error' = 'success',
    error?: Error,
    additionalMetadata: Record<string, any> = {}
  ): PerformanceMetric | null {
    const metric = this.activeMetrics.get(metricId);
    if (!metric) {
      loggers.performance.warn(
        `Attempted to stop tracking non-existent metric`,
        {
          metricId,
        }
      );
      return null;
    }

    // Complete the metric
    metric.endTime = Date.now();
    metric.duration = metric.endTime - metric.startTime;
    metric.status = status;
    
    if (error !== undefined) {
      metric.error = error;
    }
    
    metric.metadata = { ...metric.metadata, ...additionalMetadata };

    // Update resource usage
    if (metric.resourceUsage) {
      metric.resourceUsage.memoryAfter = process.memoryUsage();
      metric.resourceUsage.memoryDelta = {
        rss:
          metric.resourceUsage.memoryAfter.rss -
          metric.resourceUsage.memoryBefore.rss,
        heapUsed:
          metric.resourceUsage.memoryAfter.heapUsed -
          metric.resourceUsage.memoryBefore.heapUsed,
        heapTotal:
          metric.resourceUsage.memoryAfter.heapTotal -
          metric.resourceUsage.memoryBefore.heapTotal,
        external:
          metric.resourceUsage.memoryAfter.external -
          metric.resourceUsage.memoryBefore.external,
      };
    }

    // Finish the span
    if (metric.spanId) {
      correlationIdManager.finishSpan(metric.spanId, error);
    }

    // Move to completed metrics
    this.activeMetrics.delete(metricId);
    this.completedMetrics.push(metric);

    // Trim completed metrics if needed
    if (this.completedMetrics.length > this.maxCompletedMetrics) {
      this.completedMetrics = this.completedMetrics.slice(
        -this.maxCompletedMetrics
      );
    }

    // Record Prometheus metrics
    this.recordPrometheusMetrics(metric);

    // Check thresholds and emit alerts
    this.checkThresholds(metric);

    // Log performance data
    this.logPerformanceData(metric);

    // Emit performance event
    this.emit('metric_completed', metric);

    return metric;
  }

  /**
   * Track an operation with automatic start/stop
   */
  async track<T>(
    operation: string,
    component: string,
    fn: () => Promise<T>,
    metadata: Record<string, any> = {}
  ): Promise<T> {
    const metricId = this.startTracking(operation, component, metadata);

    try {
      const result = await fn();
      this.stopTracking(metricId, 'success');
      return result;
    } catch (error) {
      this.stopTracking(metricId, 'error', error as Error);
      throw error;
    }
  }

  /**
   * Track a synchronous operation
   */
  trackSync<T>(
    operation: string,
    component: string,
    fn: () => T,
    metadata: Record<string, any> = {}
  ): T {
    const metricId = this.startTracking(operation, component, metadata);

    try {
      const result = fn();
      this.stopTracking(metricId, 'success');
      return result;
    } catch (error) {
      this.stopTracking(metricId, 'error', error as Error);
      throw error;
    }
  }

  /**
   * Update resource usage for an active metric
   */
  updateResourceUsage(metricId: string, updates: Partial<ResourceUsage>): void {
    const metric = this.activeMetrics.get(metricId);
    if (metric && metric.resourceUsage) {
      Object.assign(metric.resourceUsage, updates);
    }
  }

  /**
   * Increment database query count for a metric
   */
  incrementDatabaseQueries(metricId: string, count: number = 1): void {
    const metric = this.activeMetrics.get(metricId);
    if (metric && metric.resourceUsage) {
      metric.resourceUsage.databaseQueries =
        (metric.resourceUsage.databaseQueries || 0) + count;
    }
  }

  /**
   * Increment cache operation count for a metric
   */
  incrementCacheOperations(metricId: string, count: number = 1): void {
    const metric = this.activeMetrics.get(metricId);
    if (metric && metric.resourceUsage) {
      metric.resourceUsage.cacheOperations =
        (metric.resourceUsage.cacheOperations || 0) + count;
    }
  }

  /**
   * Increment network call count for a metric
   */
  incrementNetworkCalls(metricId: string, count: number = 1): void {
    const metric = this.activeMetrics.get(metricId);
    if (metric && metric.resourceUsage) {
      metric.resourceUsage.networkCalls =
        (metric.resourceUsage.networkCalls || 0) + count;
    }
  }

  /**
   * Set performance threshold
   */
  setThreshold(threshold: PerformanceThreshold): void {
    const key = this.getThresholdKey(threshold.operation, threshold.component);
    this.thresholds.set(key, threshold);

    loggers.performance.debug(`Set performance threshold`, {
      operation: threshold.operation,
      component: threshold.component,
      thresholds: {
        warning: threshold.warningThreshold,
        error: threshold.errorThreshold,
        critical: threshold.criticalThreshold,
      },
    });
  }

  /**
   * Get performance threshold
   */
  getThreshold(
    operation: string,
    component?: string
  ): PerformanceThreshold | null {
    const key = this.getThresholdKey(operation, component);
    return this.thresholds.get(key) || null;
  }

  /**
   * Get performance statistics
   */
  getStats(operation?: string, component?: string): PerformanceStats[] {
    if (operation && component) {
      const key = this.getStatsKey(operation, component);
      const stats = this.stats.get(key);
      return stats ? [stats] : [];
    }

    return Array.from(this.stats.values()).filter((stats) => {
      if (operation && stats.operation !== operation) return false;
      if (component && stats.component !== component) return false;
      return true;
    });
  }

  /**
   * Get active metrics
   */
  getActiveMetrics(): PerformanceMetric[] {
    return Array.from(this.activeMetrics.values());
  }

  /**
   * Get completed metrics
   */
  getCompletedMetrics(limit?: number): PerformanceMetric[] {
    const metrics = this.completedMetrics.slice();
    return limit ? metrics.slice(-limit) : metrics;
  }

  /**
   * Clear completed metrics
   */
  clearCompletedMetrics(): void {
    this.completedMetrics = [];
    loggers.performance.info('Cleared completed performance metrics');
  }

  /**
   * Generate metric ID
   */
  private generateMetricId(): string {
    return `perf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get threshold key
   */
  private getThresholdKey(operation: string, component?: string): string {
    return component ? `${component}.${operation}` : operation;
  }

  /**
   * Get stats key
   */
  private getStatsKey(operation: string, component: string): string {
    return `${component}.${operation}`;
  }

  /**
   * Record Prometheus metrics
   */
  private recordPrometheusMetrics(metric: PerformanceMetric): void {
    if (!metric.duration) return;

    // Record based on component type
    switch (metric.component) {
      case 'auth':
        metricsManager.recordAuthAttempt(
          metric.operation,
          'internal',
          metric.status === 'success' ? 'success' : 'failure',
          undefined,
          metric.duration
        );
        break;

      case 'database':
        metricsManager.recordDatabaseQuery(
          metric.operation,
          'unknown',
          'prisma',
          metric.status === 'success' ? 'success' : 'error',
          metric.duration,
          metric.error?.name
        );
        break;

      case 'api':
        // This would be handled by HTTP middleware
        break;

      default:
        // Generic performance metric
        break;
    }
  }

  /**
   * Check performance thresholds
   */
  private checkThresholds(metric: PerformanceMetric): void {
    if (!metric.duration) return;

    const threshold = this.getThreshold(metric.operation, metric.component);
    if (!threshold || !threshold.enabled) return;

    let severity: 'warning' | 'error' | 'critical' | null = null;

    if (metric.duration >= threshold.criticalThreshold) {
      severity = 'critical';
    } else if (metric.duration >= threshold.errorThreshold) {
      severity = 'error';
    } else if (metric.duration >= threshold.warningThreshold) {
      severity = 'warning';
    }

    if (severity) {
      const alert: PerformanceAlert = {
        id: this.generateMetricId(),
        timestamp: new Date(),
        operation: metric.operation,
        component: metric.component,
        threshold,
        actualDuration: metric.duration,
        severity,
        ...(metric.correlationId !== undefined && { correlationId: metric.correlationId }),
        metadata: metric.metadata,
      };

      this.emit('performance_alert', alert);

      loggers.performance.warn(`Performance threshold exceeded`, {
        alert,
        metric: {
          id: metric.id,
          operation: metric.operation,
          component: metric.component,
          duration: metric.duration,
          correlationId: metric.correlationId,
        },
      });
    }
  }

  /**
   * Log performance data
   */
  private logPerformanceData(metric: PerformanceMetric): void {
    const message = `Performance metric completed: ${metric.component}.${metric.operation}`;

    if (metric.status === 'error') {
      loggers.performance.error(message, createErrorLogContext(
        'PerformanceError',
        undefined,
        {
          metricId: metric.id,
          operation: metric.operation,
          component: metric.component,
          duration: metric.duration,
          status: metric.status,
          correlationId: metric.correlationId,
          spanId: metric.spanId,
          // Convert resourceUsage to a simple record for logging
          ...(metric.resourceUsage && { resourceUsage: JSON.stringify(metric.resourceUsage) }),
          metadata: metric.metadata,
          error: metric.error?.message,
        }
      ));
    } else {
      loggers.performance.info(message, createPerformanceLogContext(
        metric.operation,
        undefined,
        {
          metricId: metric.id,
          component: metric.component,
          duration: metric.duration,
          status: metric.status,
          correlationId: metric.correlationId,
          spanId: metric.spanId,
          metadata: metric.metadata,
        }
      ));
    }
  }

  /**
   * Update performance statistics
   */
  private updateStats(): void {
    const now = new Date();
    const recentMetrics = this.completedMetrics.filter(
      (metric) => now.getTime() - metric.startTime < 300000 // Last 5 minutes
    );

    // Group metrics by operation and component
    const groups = new Map<string, PerformanceMetric[]>();
    recentMetrics.forEach((metric) => {
      const key = this.getStatsKey(metric.operation, metric.component);
      if (!groups.has(key)) {
        groups.set(key, []);
      }
      groups.get(key)!.push(metric);
    });

    // Calculate stats for each group
    groups.forEach((metrics, key) => {
      const durations = metrics
        .filter((m) => m.duration !== undefined)
        .map((m) => m.duration!)
        .sort((a, b) => a - b);

      if (durations.length === 0) return;

      const errorCount = metrics.filter((m) => m.status === 'error').length;
      const totalDuration = durations.reduce((sum, d) => sum + (d || 0), 0);

      const stats: PerformanceStats = {
        operation: metrics[0]?.operation || 'unknown',
        component: metrics[0]?.component || 'unknown',
        count: metrics.length,
        totalDuration,
        averageDuration: totalDuration / durations.length,
        minDuration: durations[0] || 0,
        maxDuration: durations[durations.length - 1] || 0,
        p50: this.percentile(durations, 0.5) || 0,
        p95: this.percentile(durations, 0.95) || 0,
        p99: this.percentile(durations, 0.99) || 0,
        errorRate: errorCount / metrics.length,
        throughput: metrics.length / 300, // Operations per second over 5 minutes
        lastUpdated: now,
      };

      this.stats.set(key, stats);
    });
  }

  /**
   * Calculate percentile
   */
  private percentile(sortedArray: (number | undefined)[], p: number): number {
    if (sortedArray.length === 0) return 0;
    
    // Filter out undefined values and sort
    const validNumbers = sortedArray.filter((n): n is number => n !== undefined).sort((a, b) => a - b);
    
    if (validNumbers.length === 0) return 0;
    
    const index = Math.ceil(validNumbers.length * p) - 1;
    return validNumbers[Math.max(0, Math.min(index, validNumbers.length - 1))] || 0;
  }

  /**
   * Start cleanup timer
   */
  private startCleanupTimer(): void {
    this.cleanupInterval = setInterval(() => {
      // Clean up old active metrics (stuck metrics)
      const now = Date.now();
      const stuckThreshold = 300000; // 5 minutes

      for (const [id, metric] of this.activeMetrics.entries()) {
        if (now - metric.startTime > stuckThreshold) {
          loggers.performance.warn(`Cleaning up stuck performance metric`, {
            metricId: id,
            operation: metric.operation,
            component: metric.component,
            age: now - metric.startTime,
          });

          this.stopTracking(
            id,
            'error',
            new Error('Metric cleanup - operation timeout')
          );
        }
      }
    }, 60000); // Run every minute
  }

  /**
   * Start stats update timer
   */
  private startStatsUpdateTimer(): void {
    this.statsUpdateInterval = setInterval(() => {
      this.updateStats();
    }, 30000); // Update every 30 seconds
  }

  /**
   * Shutdown performance tracker
   */
  shutdown(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    if (this.statsUpdateInterval) {
      clearInterval(this.statsUpdateInterval);
    }

    // Complete any remaining active metrics
    for (const [id] of this.activeMetrics.entries()) {
      this.stopTracking(id, 'error', new Error('System shutdown'));
    }

    loggers.performance.info('Performance tracker shutdown complete');
  }
}

// Export singleton instance
export const performanceTracker = new PerformanceTracker();

// Export decorator for automatic performance tracking
export function trackPerformance(operation?: string, component?: string) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;
    const operationName = operation || propertyKey;
    const componentName = component || target.constructor.name;

    descriptor.value = async function (...args: any[]) {
      return performanceTracker.track(
        operationName,
        componentName,
        () => originalMethod.apply(this, args),
        { args: args.length }
      );
    };

    return descriptor;
  };
}
