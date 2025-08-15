/**
 * Prometheus Metrics Collection System
 * Provides comprehensive performance monitoring and metrics collection
 */

import {
  register,
  collectDefaultMetrics,
  Counter,
  Histogram,
  Gauge,
} from 'prom-client';
import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';

// Enable default metrics collection
collectDefaultMetrics({
  prefix: 'auth_backend_',
  gcDurationBuckets: [0.001, 0.01, 0.1, 1, 2, 5],
});

/**
 * Authentication Metrics
 */
export const authMetrics = {
  // Authentication attempts counter
  authAttempts: new Counter({
    name: 'auth_backend_authentication_attempts_total',
    help: 'Total number of authentication attempts',
    labelNames: ['method', 'provider', 'status', 'user_agent'],
  }),

  // Authentication duration histogram
  authDuration: new Histogram({
    name: 'auth_backend_authentication_duration_seconds',
    help: 'Authentication request duration in seconds',
    labelNames: ['method', 'provider', 'status'],
    buckets: [0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),

  // Active sessions gauge
  activeSessions: new Gauge({
    name: 'auth_backend_active_sessions',
    help: 'Number of currently active sessions',
    labelNames: ['user_type'],
  }),

  // Failed login attempts counter
  failedLogins: new Counter({
    name: 'auth_backend_failed_logins_total',
    help: 'Total number of failed login attempts',
    labelNames: ['reason', 'ip_address', 'user_agent'],
  }),

  // MFA attempts counter
  mfaAttempts: new Counter({
    name: 'auth_backend_mfa_attempts_total',
    help: 'Total number of MFA attempts',
    labelNames: ['method', 'status'],
  }),

  // Password reset requests counter
  passwordResets: new Counter({
    name: 'auth_backend_password_resets_total',
    help: 'Total number of password reset requests',
    labelNames: ['status'],
  }),

  // OAuth flow counter
  oauthFlows: new Counter({
    name: 'auth_backend_oauth_flows_total',
    help: 'Total number of OAuth authentication flows',
    labelNames: ['provider', 'status'],
  }),
};

/**
 * API Metrics
 */
export const apiMetrics = {
  // HTTP requests counter
  httpRequests: new Counter({
    name: 'auth_backend_http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['method', 'route', 'status_code'],
  }),

  // HTTP request duration histogram
  httpDuration: new Histogram({
    name: 'auth_backend_http_request_duration_seconds',
    help: 'HTTP request duration in seconds',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  }),

  // HTTP request size histogram
  httpRequestSize: new Histogram({
    name: 'auth_backend_http_request_size_bytes',
    help: 'HTTP request size in bytes',
    labelNames: ['method', 'route'],
    buckets: [100, 1000, 10000, 100000, 1000000],
  }),

  // HTTP response size histogram
  httpResponseSize: new Histogram({
    name: 'auth_backend_http_response_size_bytes',
    help: 'HTTP response size in bytes',
    labelNames: ['method', 'route', 'status_code'],
    buckets: [100, 1000, 10000, 100000, 1000000],
  }),

  // Rate limiting counter
  rateLimitHits: new Counter({
    name: 'auth_backend_rate_limit_hits_total',
    help: 'Total number of rate limit hits',
    labelNames: ['endpoint', 'ip_address'],
  }),
};

/**
 * Database Metrics
 */
export const databaseMetrics = {
  // Database queries counter
  dbQueries: new Counter({
    name: 'auth_backend_database_queries_total',
    help: 'Total number of database queries',
    labelNames: ['operation', 'table', 'orm', 'status'],
  }),

  // Database query duration histogram
  dbQueryDuration: new Histogram({
    name: 'auth_backend_database_query_duration_seconds',
    help: 'Database query duration in seconds',
    labelNames: ['operation', 'table', 'orm'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
  }),

  // Database connections gauge
  dbConnections: new Gauge({
    name: 'auth_backend_database_connections',
    help: 'Number of active database connections',
    labelNames: ['pool', 'state'],
  }),

  // Database errors counter
  dbErrors: new Counter({
    name: 'auth_backend_database_errors_total',
    help: 'Total number of database errors',
    labelNames: ['operation', 'table', 'orm', 'error_type'],
  }),
};

/**
 * Cache Metrics
 */
export const cacheMetrics = {
  // Cache operations counter
  cacheOperations: new Counter({
    name: 'auth_backend_cache_operations_total',
    help: 'Total number of cache operations',
    labelNames: ['operation', 'cache_type', 'status'],
  }),

  // Cache hit ratio gauge
  cacheHitRatio: new Gauge({
    name: 'auth_backend_cache_hit_ratio',
    help: 'Cache hit ratio',
    labelNames: ['cache_type'],
  }),

  // Cache operation duration histogram
  cacheOperationDuration: new Histogram({
    name: 'auth_backend_cache_operation_duration_seconds',
    help: 'Cache operation duration in seconds',
    labelNames: ['operation', 'cache_type'],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
  }),

  // Cache memory usage gauge
  cacheMemoryUsage: new Gauge({
    name: 'auth_backend_cache_memory_usage_bytes',
    help: 'Cache memory usage in bytes',
    labelNames: ['cache_type'],
  }),
};

/**
 * Security Metrics
 */
export const securityMetrics = {
  // Security events counter
  securityEvents: new Counter({
    name: 'auth_backend_security_events_total',
    help: 'Total number of security events',
    labelNames: ['event_type', 'severity', 'source'],
  }),

  // Suspicious activities counter
  suspiciousActivities: new Counter({
    name: 'auth_backend_suspicious_activities_total',
    help: 'Total number of suspicious activities detected',
    labelNames: ['activity_type', 'risk_score', 'action_taken'],
  }),

  // Account lockouts counter
  accountLockouts: new Counter({
    name: 'auth_backend_account_lockouts_total',
    help: 'Total number of account lockouts',
    labelNames: ['reason', 'duration'],
  }),

  // Risk scores histogram
  riskScores: new Histogram({
    name: 'auth_backend_risk_scores',
    help: 'Distribution of calculated risk scores',
    labelNames: ['event_type'],
    buckets: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1.0],
  }),
};

/**
 * System Metrics
 */
export const systemMetrics = {
  // Circuit breaker state gauge
  circuitBreakerState: new Gauge({
    name: 'auth_backend_circuit_breaker_state',
    help: 'Circuit breaker state (0=closed, 1=half-open, 2=open)',
    labelNames: ['circuit_name'],
  }),

  // Health check status gauge
  healthCheckStatus: new Gauge({
    name: 'auth_backend_health_check_status',
    help: 'Health check status (0=unhealthy, 1=degraded, 2=healthy)',
    labelNames: ['check_name'],
  }),

  // WebSocket connections gauge
  websocketConnections: new Gauge({
    name: 'auth_backend_websocket_connections',
    help: 'Number of active WebSocket connections',
    labelNames: ['connection_type'],
  }),

  // Background job metrics
  backgroundJobs: new Counter({
    name: 'auth_backend_background_jobs_total',
    help: 'Total number of background jobs processed',
    labelNames: ['job_type', 'status'],
  }),

  // Background job duration histogram
  backgroundJobDuration: new Histogram({
    name: 'auth_backend_background_job_duration_seconds',
    help: 'Background job duration in seconds',
    labelNames: ['job_type'],
    buckets: [0.1, 0.5, 1, 5, 10, 30, 60, 300, 600],
  }),
};

/**
 * Business Metrics
 */
export const businessMetrics = {
  // User registrations counter
  userRegistrations: new Counter({
    name: 'auth_backend_user_registrations_total',
    help: 'Total number of user registrations',
    labelNames: ['registration_method', 'user_type'],
  }),

  // Daily active users gauge
  dailyActiveUsers: new Gauge({
    name: 'auth_backend_daily_active_users',
    help: 'Number of daily active users',
  }),

  // Session duration histogram
  sessionDuration: new Histogram({
    name: 'auth_backend_session_duration_seconds',
    help: 'User session duration in seconds',
    labelNames: ['user_type', 'termination_reason'],
    buckets: [60, 300, 900, 1800, 3600, 7200, 14400, 28800, 86400],
  }),

  // API usage by client
  apiUsageByClient: new Counter({
    name: 'auth_backend_api_usage_by_client_total',
    help: 'Total API usage by client',
    labelNames: ['client_id', 'endpoint'],
  }),
};

/**
 * Metrics Collection Manager
 */
export class MetricsManager {
  private static instance: MetricsManager;
  private metricsCollectionInterval?: NodeJS.Timeout | undefined;
  private isCollecting = false;

  // Public metric references for external access
  public readonly apiMetrics = apiMetrics;
  public readonly databaseMetrics = databaseMetrics;
  public readonly cacheMetrics = cacheMetrics;
  public readonly authMetrics = authMetrics;
  public readonly securityMetrics = securityMetrics;
  public readonly systemMetrics = systemMetrics;

  private constructor() {}

  static getInstance(): MetricsManager {
    if (!MetricsManager.instance) {
      MetricsManager.instance = new MetricsManager();
    }
    return MetricsManager.instance;
  }

  /**
   * Start metrics collection
   */
  startCollection(intervalMs: number = 30000): void {
    if (this.isCollecting) {
      return;
    }

    this.isCollecting = true;
    this.metricsCollectionInterval = setInterval(() => {
      this.collectSystemMetrics();
    }, intervalMs);

    logger.info('Started Prometheus metrics collection', { intervalMs });
  }

  /**
   * Stop metrics collection
   */
  stopCollection(): void {
    if (this.metricsCollectionInterval) {
      clearInterval(this.metricsCollectionInterval);
      this.metricsCollectionInterval = undefined;
    }

    this.isCollecting = false;
    logger.info('Stopped Prometheus metrics collection');
  }

  /**
   * Collect system-level metrics
   */
  private async collectSystemMetrics(): Promise<void> {
    try {
      // Memory usage
      const memUsage = process.memoryUsage();
      systemMetrics.healthCheckStatus.set(
        { check_name: 'memory' },
        memUsage.heapUsed < 1024 * 1024 * 1024 ? 2 : 1 // 2=healthy, 1=degraded
      );

      // Update cache hit ratios (this would be called from cache implementations)
      // This is just an example - actual implementation would get real cache stats

      logger.debug('Collected system metrics', {
        memoryUsage: memUsage,
        correlationId: correlationIdManager.getCorrelationId(),
      });
    } catch (error) {
      logger.error('Failed to collect system metrics', {
        error: (error as Error).message,
        correlationId: correlationIdManager.getCorrelationId(),
      });
    }
  }

  /**
   * Get metrics registry
   */
  getRegistry() {
    return register;
  }

  /**
   * Get metrics as string
   */
  async getMetrics(): Promise<string> {
    return register.metrics();
  }

  /**
   * Clear all metrics
   */
  clearMetrics(): void {
    register.clear();
    logger.info('Cleared all Prometheus metrics');
  }

  /**
   * Record authentication attempt
   */
  recordAuthAttempt(
    method: string,
    provider: string,
    status: 'success' | 'failure',
    userAgent?: string,
    duration?: number
  ): void {
    authMetrics.authAttempts.inc({
      method,
      provider,
      status,
      user_agent: userAgent || 'unknown',
    });

    if (duration !== undefined) {
      authMetrics.authDuration.observe(
        { method, provider, status },
        duration / 1000 // Convert to seconds
      );
    }

    if (status === 'failure') {
      authMetrics.failedLogins.inc({
        reason: 'invalid_credentials',
        ip_address: 'unknown', // This would be passed from the request
        user_agent: userAgent || 'unknown',
      });
    }
  }

  /**
   * Record HTTP request
   */
  recordHttpRequest(
    method: string,
    route: string,
    statusCode: number,
    duration: number,
    requestSize?: number,
    responseSize?: number
  ): void {
    apiMetrics.httpRequests.inc({
      method,
      route,
      status_code: statusCode.toString(),
    });

    apiMetrics.httpDuration.observe(
      { method, route, status_code: statusCode.toString() },
      duration / 1000 // Convert to seconds
    );

    if (requestSize !== undefined) {
      apiMetrics.httpRequestSize.observe({ method, route }, requestSize);
    }

    if (responseSize !== undefined) {
      apiMetrics.httpResponseSize.observe(
        { method, route, status_code: statusCode.toString() },
        responseSize
      );
    }
  }

  /**
   * Record database query
   */
  recordDatabaseQuery(
    operation: string,
    table: string,
    orm: 'prisma' | 'drizzle',
    status: 'success' | 'error',
    duration: number,
    errorType?: string
  ): void {
    databaseMetrics.dbQueries.inc({ operation, table, orm, status });

    if (status === 'success') {
      databaseMetrics.dbQueryDuration.observe(
        { operation, table, orm },
        duration / 1000 // Convert to seconds
      );
    } else if (errorType) {
      databaseMetrics.dbErrors.inc({
        operation,
        table,
        orm,
        error_type: errorType,
      });
    }
  }

  /**
   * Record security event
   */
  recordSecurityEvent(
    eventType: string,
    severity: 'low' | 'medium' | 'high' | 'critical',
    source: string,
    riskScore?: number
  ): void {
    securityMetrics.securityEvents.inc({
      event_type: eventType,
      severity,
      source,
    });

    if (riskScore !== undefined) {
      securityMetrics.riskScores.observe({ event_type: eventType }, riskScore);
    }
  }

  /**
   * Update active sessions count
   */
  updateActiveSessions(count: number, userType: string = 'regular'): void {
    authMetrics.activeSessions.set({ user_type: userType }, count);
  }

  /**
   * Update circuit breaker state
   */
  updateCircuitBreakerState(
    circuitName: string,
    state: 'CLOSED' | 'HALF_OPEN' | 'OPEN'
  ): void {
    const stateValue = state === 'CLOSED' ? 0 : state === 'HALF_OPEN' ? 1 : 2;
    systemMetrics.circuitBreakerState.set(
      { circuit_name: circuitName },
      stateValue
    );
  }

  /**
   * Update health check status
   */
  updateHealthCheckStatus(
    checkName: string,
    status: 'unhealthy' | 'degraded' | 'healthy'
  ): void {
    const statusValue =
      status === 'unhealthy' ? 0 : status === 'degraded' ? 1 : 2;
    systemMetrics.healthCheckStatus.set({ check_name: checkName }, statusValue);
  }

  /**
   * Record cache operation
   */
  recordCacheOperation(
    operation: 'get' | 'set' | 'delete' | 'clear',
    cacheType: 'redis' | 'memory',
    status: 'hit' | 'miss' | 'success' | 'error',
    duration: number
  ): void {
    cacheMetrics.cacheOperations.inc({
      operation,
      cache_type: cacheType,
      status,
    });
    cacheMetrics.cacheOperationDuration.observe(
      { operation, cache_type: cacheType },
      duration / 1000 // Convert to seconds
    );
  }

  /**
   * Update cache hit ratio
   */
  updateCacheHitRatio(cacheType: 'redis' | 'memory', ratio: number): void {
    cacheMetrics.cacheHitRatio.set({ cache_type: cacheType }, ratio);
  }
}

// Export singleton instance
export const metricsManager = MetricsManager.getInstance();

// All metrics are already exported above, no need to re-export
