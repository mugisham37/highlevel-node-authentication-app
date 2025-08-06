/**
 * Monitoring Types and Interfaces
 * Updated type definitions for strict TypeScript compliance
 */

/**
 * Extended Fastify Request interface with timing information
 */
declare module 'fastify' {
  interface FastifyRequest {
    startTime?: number;
  }
}

/**
 * Log Context with proper optional property handling
 */
export interface LogContext {
  correlationId?: string | undefined;
  requestId?: string | undefined;
  userId?: string | undefined;
  sessionId?: string | undefined;
  operation?: string | undefined;
  component?: string | undefined;
  service?: string | undefined;
  version?: string | undefined;
  environment?: string | undefined;
  [key: string]: any;
}

/**
 * Enhanced Error Log Context
 */
export interface ErrorLogContext extends LogContext {
  errorType: string;
  errorCode?: string | undefined;
  stackTrace?: string | undefined;
  impact?: 'low' | 'medium' | 'high' | 'critical';
  [key: string]: any;
}

/**
 * Performance Log Context
 */
export interface PerformanceLogContext extends LogContext {
  operation: string;
  duration?: number | undefined;
  startTime?: number | undefined;
  endTime?: number | undefined;
  resourceUsage?: Record<string, number> | undefined;
  [key: string]: any;
}

/**
 * Security Log Context
 */
export interface SecurityLogContext extends LogContext {
  securityEvent: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  [key: string]: any;
}

/**
 * Audit Log Context
 */
export interface AuditLogContext extends LogContext {
  action: string;
  resource?: AuditResource | string | undefined;
  resourceId?: string | undefined;
  changes?: AuditChanges | Record<string, { before: any; after: any }> | undefined;
  [key: string]: any;
}

/**
 * Business Event Log Context
 */
export interface BusinessLogContext extends LogContext {
  eventType: string;
  entityType: string;
  entityId?: string | undefined;
  businessImpact?: 'low' | 'medium' | 'high' | undefined;
  metrics?: Record<string, number> | undefined;
  [key: string]: any;
}

/**
 * Authentication Log Context
 */
export interface AuthLogContext extends LogContext {
  authMethod: string;
  provider?: string | undefined;
  outcome: 'success' | 'failure' | 'mfa_required';
  failureReason?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  riskScore?: number | undefined;
}

/**
 * Safe Security Event Types
 */
export enum SecurityEventType {
  FAILED_LOGIN = 'failed_login',
  SUCCESSFUL_LOGIN = 'successful_login',
  ACCOUNT_LOCKOUT = 'account_lockout',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
  DATA_ACCESS = 'data_access',
  PRIVILEGE_ESCALATION = 'privilege_escalation',
  UNAUTHORIZED_ACCESS = 'unauthorized_access',
  ANOMALOUS_BEHAVIOR = 'anomalous_behavior',
  SECURITY_VIOLATION = 'security_violation',
}

/**
 * Alert Severity Levels
 */
export enum AlertSeverity {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  CRITICAL = 'critical',
}

/**
 * Alert Types
 */
export enum AlertType {
  SECURITY = 'security',
  PERFORMANCE = 'performance',
  SYSTEM = 'system',
  BUSINESS = 'business',
}

/**
 * Alert Status
 */
export enum AlertStatus {
  ACTIVE = 'active',
  ACKNOWLEDGED = 'acknowledged',
  RESOLVED = 'resolved',
  SUPPRESSED = 'suppressed',
  ESCALATED = 'escalated',
}

/**
 * Security Event interface with proper typing
 */
export interface SecurityEvent {
  id: string;
  timestamp: Date;
  type: SecurityEventType;
  severity: AlertSeverity;
  source: string;
  userId?: string | undefined;
  sessionId?: string | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  details: Record<string, any>;
  riskScore: number;
  correlationId?: string | undefined;
}

/**
 * Alert interface with proper typing
 */
export interface Alert {
  id: string;
  timestamp: Date;
  type: AlertType;
  severity: AlertSeverity;
  title: string;
  description: string;
  source: string;
  correlationId?: string | undefined;
  metadata: Record<string, any>;
  status: AlertStatus;
  escalationLevel: number;
  acknowledgedBy?: string | undefined;
  acknowledgedAt?: Date | undefined;
  resolvedBy?: string | undefined;
  resolvedAt?: Date | undefined;
  suppressUntil?: Date | undefined;
}

/**
 * Performance Alert interface
 */
export interface PerformanceAlert {
  id: string;
  timestamp: Date;
  operation: string;
  component: string;
  threshold: PerformanceThreshold;
  actualDuration: number;
  severity: 'warning' | 'error' | 'critical';
  correlationId?: string | undefined;
  metadata: Record<string, any>;
}

/**
 * Alert Threshold interface
 */
export interface AlertThreshold {
  warning?: number;
  error?: number;
  critical?: number;
  warningThreshold?: number;
  errorThreshold?: number;
  criticalThreshold?: number;
}

/**
 * Performance Threshold interface
 */
export interface PerformanceThreshold {
  warning: number;
  error: number;
  critical: number;
  warningThreshold: number;
  errorThreshold: number;
  criticalThreshold: number;
}

/**
 * Performance Metric interface
 */
export interface PerformanceMetric {
  id: string;
  operation: string;
  component: string;
  startTime: number;
  endTime?: number | undefined;
  duration?: number | undefined;
  status: 'pending' | 'completed' | 'error';
  metadata: Record<string, any>;
  correlationId?: string | undefined;
  spanId: string;
  resourceUsage: {
    memory: number;
    cpu: number;
  };
  error?: Error | undefined;
}

/**
 * Performance Stats interface
 */
export interface PerformanceStats {
  totalOperations: number;
  averageDuration: number;
  minDuration: number;
  maxDuration: number;
  p50Duration: number;
  p95Duration: number;
  p99Duration: number;
  errorRate: number;
}

/**
 * Service Status interface
 */
export interface ServiceStatus {
  name: string;
  status: 'healthy' | 'degraded' | 'unhealthy';
  responseTime: number;
  lastCheck: Date;
  details?: Record<string, any> | undefined;
}

/**
 * Audit Event interfaces
 */
export interface AuditActor {
  type: 'user' | 'system' | 'service' | 'admin' | 'api_client';
  id: string;
  name?: string | undefined;
  email?: string | undefined;
  roles?: string[] | undefined;
  permissions?: string[] | undefined;
  impersonatedBy?: string | undefined;
}

export interface AuditResource {
  type: string;
  id?: string | undefined;
  name?: string | undefined;
  attributes?: Record<string, any> | undefined;
  parent?: {
    type: string;
    id: string;
  } | undefined;
}

export interface AuditOutcome {
  result: 'success' | 'failure' | 'partial';
  reason?: string | undefined;
  errorCode?: string | undefined;
  errorMessage?: string | undefined;
  riskScore?: number | undefined;
}

export interface AuditChanges {
  before?: Record<string, any> | undefined;
  after?: Record<string, any> | undefined;
  delta?: Array<{
    field: string;
    oldValue: any;
    newValue: any;
    operation: 'create' | 'update' | 'delete';
  }> | undefined;
}

export interface AuditContext {
  operation: string;
  component: string;
  service: string;
  version: string;
  environment: string;
  requestId?: string | undefined;
  businessContext?: Record<string, any> | undefined;
  complianceContext?: {
    regulation: string;
    requirement: string;
    classification: string;
  } | undefined;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  type: string;
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  outcome: AuditOutcome;
  context: AuditContext;
  changes?: AuditChanges | undefined;
  metadata?: Record<string, any> | undefined;
  ipAddress?: string | undefined;
  userAgent?: string | undefined;
  correlationId: string;
}
