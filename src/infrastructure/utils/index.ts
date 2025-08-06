/**
 * Infrastructure Utils Index
 * Centralized exports for all utility functions and types
 */

// Core utilities
export * from './env-utils';
export * from './request-utils';
export * from './type-utils';

// Monitoring specific utilities
export * from './monitoring-types';
export * from './monitoring-utils';

// Re-export commonly used types with better names
export type {
  LogContext as BaseLogContext,
  ErrorLogContext as BaseErrorLogContext,
  PerformanceLogContext as BasePerformanceLogContext,
  SecurityLogContext as BaseSecurityLogContext,
  AuditLogContext as BaseAuditLogContext,
  BusinessLogContext as BaseBusinessLogContext,
  AuthLogContext as BaseAuthLogContext,
  SecurityEvent as BaseSecurityEvent,
  Alert as BaseAlert,
  PerformanceAlert as BasePerformanceAlert,
  PerformanceMetric as BasePerformanceMetric,
  PerformanceStats as BasePerformanceStats,
  ServiceStatus as BaseServiceStatus,
  AuditEvent as BaseAuditEvent,
  AuditActor as BaseAuditActor,
  AuditResource as BaseAuditResource,
  AuditOutcome as BaseAuditOutcome,
  AuditChanges as BaseAuditChanges,
  AuditContext as BaseAuditContext,
} from './monitoring-types';

// Helper functions for common operations
export {
  generateId,
  generateSpanId,
  createLogContext,
  createErrorLogContext,
  createPerformanceLogContext,
  createSecurityLogContext,
  createAuditLogContext,
  createBusinessLogContext,
  createAuthLogContext,
  createSecurityEvent,
  createAuditActor,
  createAuditResource,
  createAuditOutcome,
  createAuditChanges,
  createAuditContext,
  createAuditEvent,
  safeGetProperty,
  getResponseSize,
  calculatePercentile,
  getResourceUsage,
  formatDuration,
  isValidSecurityEventType,
  toSecurityEventType,
} from './monitoring-utils';
