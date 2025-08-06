/**
 * Monitoring Utilities
 * Helper functions for monitoring and logging operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { 
  LogContext, 
  ErrorLogContext, 
  PerformanceLogContext,
  SecurityLogContext,
  AuditLogContext,
  BusinessLogContext,
  AuthLogContext,
  SecurityEventType,
  AlertSeverity,
  SecurityEvent,
  AuditEvent,
  AuditActor,
  AuditResource,
  AuditOutcome,
  AuditChanges,
  AuditContext
} from './monitoring-types';
import { getSafeCorrelationId, getSafeRequestId, getUserAgent, getClientIP } from './request-utils';
import { ENV } from './env-utils';
import { isDefined } from './type-utils';

/**
 * Generate unique identifier
 */
export function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate span ID for tracing
 */
export function generateSpanId(): string {
  return Math.random().toString(36).substr(2, 16);
}

/**
 * Create safe log context
 */
export function createLogContext(
  request?: FastifyRequest,
  additionalContext?: Partial<LogContext>
): LogContext {
  const context: LogContext = {
    component: ENV.SERVICE_NAME,
    service: ENV.SERVICE_NAME,
    version: ENV.APP_VERSION,
    environment: ENV.NODE_ENV,
    ...additionalContext,
  };

  if (request) {
    context.correlationId = getSafeCorrelationId(request.headers);
    context.requestId = getSafeRequestId(request.headers);
  }

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(context).filter(([_, value]) => isDefined(value))
  );
}

/**
 * Create safe error log context
 */
export function createErrorLogContext(
  errorType: string,
  request?: FastifyRequest,
  additionalContext?: Partial<ErrorLogContext>
): ErrorLogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  return {
    ...baseContext,
    errorType,
    ...additionalContext,
  } as ErrorLogContext;
}

/**
 * Create safe performance log context
 */
export function createPerformanceLogContext(
  operation: string,
  request?: FastifyRequest,
  additionalContext?: Partial<PerformanceLogContext>
): PerformanceLogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  return {
    ...baseContext,
    operation,
    ...additionalContext,
  } as PerformanceLogContext;
}

/**
 * Create safe security log context
 */
export function createSecurityLogContext(
  securityEvent: string,
  severity: 'low' | 'medium' | 'high' | 'critical',
  request?: FastifyRequest,
  additionalContext?: Partial<SecurityLogContext>
): SecurityLogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  const context: SecurityLogContext = {
    ...baseContext,
    securityEvent,
    severity,
    ...additionalContext,
  };

  if (request) {
    context.ipAddress = getClientIP(request);
    context.userAgent = getUserAgent(request.headers);
  }

  return context;
}

/**
 * Create safe audit log context
 */
export function createAuditLogContext(
  action: string,
  request?: FastifyRequest,
  additionalContext?: Partial<AuditLogContext>
): AuditLogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  return {
    ...baseContext,
    action,
    ...additionalContext,
  } as AuditLogContext;
}

/**
 * Create safe business log context
 */
export function createBusinessLogContext(
  eventType: string,
  entityType: string,
  request?: FastifyRequest,
  additionalContext?: Partial<BusinessLogContext>
): BusinessLogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  return {
    ...baseContext,
    eventType,
    entityType,
    ...additionalContext,
  } as BusinessLogContext;
}

/**
 * Create safe auth log context
 */
export function createAuthLogContext(
  authMethod: string,
  outcome: 'success' | 'failure' | 'mfa_required',
  request?: FastifyRequest,
  additionalContext?: Partial<AuthLogContext>
): AuthLogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  const context: AuthLogContext = {
    ...baseContext,
    authMethod,
    outcome,
    ...additionalContext,
  };

  if (request) {
    context.ipAddress = getClientIP(request);
    context.userAgent = getUserAgent(request.headers);
  }

  return context;
}

/**
 * Create safe security event
 */
export function createSecurityEvent(
  type: SecurityEventType,
  severity: AlertSeverity,
  source: string,
  userId: string,
  details: Record<string, any>,
  correlationId: string,
  additionalProps?: Partial<SecurityEvent>
): SecurityEvent {
  return {
    id: generateId(),
    timestamp: new Date(),
    type,
    severity,
    source,
    userId,
    details,
    correlationId,
    ...additionalProps,
  };
}

/**
 * Create safe audit actor
 */
export function createAuditActor(
  type: 'admin' | 'user',
  id: string,
  name?: string,
  additionalProps?: Partial<AuditActor>
): AuditActor {
  const actor: AuditActor = {
    type,
    id,
    name: name || '',
    ...additionalProps,
  };

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(actor).filter(([_, value]) => isDefined(value))
  ) as AuditActor;
}

/**
 * Create safe audit resource
 */
export function createAuditResource(
  type: string,
  id?: string,
  name?: string,
  additionalProps?: Partial<AuditResource>
): AuditResource {
  const resource: AuditResource = {
    type,
    id: id || '',
    name,
    ...additionalProps,
  };

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(resource).filter(([_, value]) => isDefined(value))
  ) as AuditResource;
}

/**
 * Create safe audit outcome
 */
export function createAuditOutcome(
  result: 'success' | 'failure',
  reason?: string,
  additionalProps?: Partial<AuditOutcome>
): AuditOutcome {
  const outcome: AuditOutcome = {
    result,
    reason,
    ...additionalProps,
  };

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(outcome).filter(([_, value]) => isDefined(value))
  ) as AuditOutcome;
}

/**
 * Create safe audit changes
 */
export function createAuditChanges(
  before?: Record<string, any>,
  after?: Record<string, any>
): AuditChanges | undefined {
  if (!before && !after) return undefined;
  
  return {
    before: before || {},
    after: after || {},
  };
}

/**
 * Create safe audit context
 */
export function createAuditContext(
  operation: string,
  component: string = ENV.SERVICE_NAME,
  requestId?: string,
  additionalProps?: Partial<AuditContext>
): AuditContext {
  const context: AuditContext = {
    operation,
    component,
    service: ENV.SERVICE_NAME,
    version: ENV.APP_VERSION,
    environment: ENV.NODE_ENV,
    requestId: requestId || '',
    ...additionalProps,
  };

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(context).filter(([_, value]) => isDefined(value))
  ) as AuditContext;
}

/**
 * Create safe audit event
 */
export function createAuditEvent(
  type: string,
  actor: AuditActor,
  action: string,
  resource: AuditResource,
  outcome: AuditOutcome,
  context: AuditContext,
  correlationId: string,
  additionalProps?: Partial<AuditEvent>
): AuditEvent {
  const event: AuditEvent = {
    id: generateId(),
    timestamp: new Date(),
    type,
    actor,
    action,
    resource,
    outcome,
    context,
    correlationId,
    ...additionalProps,
  };

  // Remove undefined values
  return Object.fromEntries(
    Object.entries(event).filter(([_, value]) => isDefined(value))
  ) as AuditEvent;
}

/**
 * Safe property getter for index signature objects
 */
export function safeGetProperty<T = any>(
  obj: Record<string, any>,
  key: string,
  defaultValue?: T
): T | undefined {
  const value = obj[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Get response size from reply
 */
export function getResponseSize(reply: FastifyReply): number {
  const contentLength = reply.getHeader('content-length');
  if (typeof contentLength === 'string') {
    return parseInt(contentLength, 10) || 0;
  }
  return 0;
}

/**
 * Calculate percentile for performance metrics
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  const safeIndex = Math.max(0, Math.min(index, sorted.length - 1));
  return sorted[safeIndex] || 0;
}

/**
 * Get current resource usage
 */
export function getResourceUsage(): { memory: number; cpu: number } {
  const memUsage = process.memoryUsage();
  const cpuUsage = process.cpuUsage();
  
  return {
    memory: memUsage.heapUsed / 1024 / 1024, // MB
    cpu: (cpuUsage.user + cpuUsage.system) / 1000000, // seconds
  };
}

/**
 * Format duration in milliseconds to human readable format
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  return `${(ms / 60000).toFixed(2)}m`;
}

/**
 * Validate security event type
 */
export function isValidSecurityEventType(value: string): value is SecurityEventType {
  return Object.values(SecurityEventType).includes(value as SecurityEventType);
}

/**
 * Convert string to SecurityEventType safely
 */
export function toSecurityEventType(value: string): SecurityEventType {
  if (isValidSecurityEventType(value)) {
    return value;
  }
  return SecurityEventType.SUSPICIOUS_ACTIVITY; // Default fallback
}
