/**
 * Health Check Types and Interfaces
 * Provides comprehensive type definitions for system health monitoring
 */

export type HealthStatus = 'healthy' | 'unhealthy' | 'degraded';

export interface HealthCheckResult {
  status: HealthStatus;
  responseTime?: number;
  error?: string;
  details?: Record<string, any>;
  timestamp?: Date;
}

export interface RepositoryHealthResult {
  status: HealthStatus;
  responseTime?: number;
  error?: string;
}

export interface DatabaseHealthResult {
  status: HealthStatus;
  responseTime?: number;
  error?: string;
}

export interface CacheHealthResult {
  status: HealthStatus;
  responseTime?: number;
  error?: string;
}

export interface SystemHealthCheck {
  status: HealthStatus;
  repositories: {
    user: RepositoryHealthResult;
    session: RepositoryHealthResult;
  };
  database: {
    prisma: DatabaseHealthResult;
    drizzle: DatabaseHealthResult;
  };
  cache?: CacheHealthResult;
  timestamp: Date;
  overall: HealthStatus;
}

export interface ServiceHealth {
  database: HealthCheckResult;
  cache: HealthCheckResult;
  overall: HealthStatus;
}

export interface ComponentHealth {
  [componentName: string]: HealthCheckResult;
}

export const createHealthResult = (
  status: HealthStatus,
  responseTime?: number,
  error?: string,
  details?: Record<string, any>
): HealthCheckResult => {
  const result: HealthCheckResult = { status, timestamp: new Date() };
  if (responseTime !== undefined) result.responseTime = responseTime;
  if (error !== undefined) result.error = error;
  if (details !== undefined) result.details = details;
  return result;
};

export const aggregateHealthStatus = (statuses: HealthStatus[]): HealthStatus => {
  if (statuses.includes('unhealthy')) return 'unhealthy';
  if (statuses.includes('degraded')) return 'degraded';
  return 'healthy';
};
