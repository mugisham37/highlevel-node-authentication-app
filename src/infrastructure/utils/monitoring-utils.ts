/**
 * Monitoring Utilities - Fixed Version
 * Helper functions for monitoring and logging operations with strict type safety
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
 * Safely get property from object with index signature
 */
export function safeGetProperty<T = any>(obj: Record<string, any>, key: string): T | undefined {
  return obj[key] as T | undefined;
}

/**
 * Safely get property with default value
 */
export function safeGetPropertyWithDefault<T>(
  obj: Record<string, any>, 
  key: string, 
  defaultValue: T
): T {
  const value = obj[key];
  return value !== undefined ? value as T : defaultValue;
}

/**
 * Type-safe property access helper for basicProps objects
 */
export function getBasicProperty<T>(
  basicProps: Record<string, any>,
  key: string,
  defaultValue: T
): T {
  const value = basicProps[key];
  return value !== undefined ? value as T : defaultValue;
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
 * Create safe authentication log context
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
 * Create safe HTTP log context for request/response logging
 */
export function createHttpLogContext(
  method: string,
  url: string,
  statusCode: number,
  responseTime: number,
  request?: FastifyRequest,
  reply?: FastifyReply,
  additionalContext?: Partial<LogContext>
): LogContext & {
  method: string;
  url: string;
  statusCode: number;
  responseTime: number;
  userAgent?: string;
  ipAddress?: string;
  requestSize?: number;
  responseSize?: number;
} {
  const baseContext = createLogContext(request, additionalContext);
  
  const httpContext: LogContext & {
    method: string;
    url: string;
    statusCode: number;
    responseTime: number;
    userAgent?: string;
    ipAddress?: string;
    requestSize?: number;
    responseSize?: number;
  } = {
    ...baseContext,
    method,
    url,
    statusCode,
    responseTime,
  };

  // Add optional properties only if they exist
  if (request?.headers['user-agent']) {
    httpContext.userAgent = request.headers['user-agent'] as string;
  }
  
  if (request?.ip) {
    httpContext.ipAddress = request.ip;
  }
  
  if (request?.headers['content-length']) {
    const contentLength = parseInt(request.headers['content-length'] as string);
    if (!isNaN(contentLength)) {
      httpContext.requestSize = contentLength;
    }
  }
  
  if (reply?.getHeader('content-length')) {
    const responseSize = reply.getHeader('content-length') as number;
    if (typeof responseSize === 'number') {
      httpContext.responseSize = responseSize;
    }
  }

  return httpContext;
}

/**
 * Create safe security event
 */
export function createSecurityEvent(
  type: SecurityEventType,
  severity: AlertSeverity,
  source: string,
  details: Record<string, any>,
  riskScore: number = 0,
  userId?: string,
  correlationId?: string,
  additionalProps?: Partial<SecurityEvent>
): SecurityEvent {
  return {
    id: generateId(),
    timestamp: new Date(),
    type,
    severity,
    source,
    details,
    riskScore,
    ...(userId !== undefined && { userId }),
    ...(correlationId !== undefined && { correlationId }),
    ...additionalProps,
  };
}

/**
 * Create safe audit actor
 */
export function createAuditActor(
  type: 'user' | 'system' | 'service' | 'admin' | 'api_client',
  id: string,
  name?: string,
  additionalProps?: Partial<AuditActor>
): AuditActor {
  const actor: AuditActor = {
    type,
    id,
    ...(name !== undefined && { name }),
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
    ...(id !== undefined && { id }),
    ...(name !== undefined && { name }),
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
  result: 'success' | 'failure' | 'partial',
  reason?: string,
  additionalProps?: Partial<AuditOutcome>
): AuditOutcome {
  const outcome: AuditOutcome = {
    result,
    ...(reason !== undefined && { reason }),
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
    ...(before !== undefined && { before }),
    ...(after !== undefined && { after }),
  };
}

/**
 * Create audit event data with proper typing
 */
export function createAuditEventData(
  actor: AuditActor,
  action: string,
  resource: AuditResource,
  outcome: AuditOutcome,
  options?: {
    context?: Partial<AuditContext>;
    changes?: AuditChanges;
    metadata?: Record<string, any>;
    ipAddress?: string;
    userAgent?: string;
  }
): {
  actor: AuditActor;
  action: string;
  resource: AuditResource;
  outcome: AuditOutcome;
  context?: Partial<AuditContext>;
  changes?: AuditChanges;
  metadata?: Record<string, any>;
  ipAddress?: string;
  userAgent?: string;
} {
  return {
    actor,
    action,
    resource,
    outcome,
    ...(options?.context !== undefined && { context: options.context }),
    ...(options?.changes !== undefined && { changes: options.changes }),
    ...(options?.metadata !== undefined && { metadata: options.metadata }),
    ...(options?.ipAddress !== undefined && { ipAddress: options.ipAddress }),
    ...(options?.userAgent !== undefined && { userAgent: options.userAgent }),
  };
}

/**
 * Safely extract properties from details object with proper typing
 */
export function extractDetailsProperty<T>(
  details: Record<string, any>,
  key: string,
  defaultValue?: T
): T | undefined {
  const value = details[key];
  return value !== undefined ? value as T : defaultValue;
}

/**
 * Get response size from reply object
 */
export function getResponseSize(reply?: FastifyReply): number | undefined {
  if (!reply) return undefined;
  
  const contentLength = reply.getHeader('content-length');
  if (typeof contentLength === 'number') {
    return contentLength;
  }
  if (typeof contentLength === 'string') {
    const parsed = parseInt(contentLength);
    return !isNaN(parsed) ? parsed : undefined;
  }
  return undefined;
}

/**
 * Calculate percentile from array of numbers
 */
export function calculatePercentile(values: number[], percentile: number): number {
  if (values.length === 0) return 0;
  
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.ceil((percentile / 100) * sorted.length) - 1;
  const safeIndex = Math.max(0, index);
  return sorted[safeIndex] ?? 0;
}

/**
 * Get resource usage information
 */
export function getResourceUsage(): { memory: number; cpu: number } {
  const memUsage = process.memoryUsage();
  return {
    memory: memUsage.heapUsed,
    cpu: process.cpuUsage().user / 1000000, // Convert microseconds to seconds
  };
}

/**
 * Format duration in a human-readable way
 */
export function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(2)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(2)}m`;
  return `${(ms / 3600000).toFixed(2)}h`;
}

/**
 * Check if value is a valid security event type
 */
export function isValidSecurityEventType(value: any): value is SecurityEventType {
  return Object.values(SecurityEventType).includes(value);
}

/**
 * Convert string to SecurityEventType safely
 */
export function toSecurityEventType(value: string): SecurityEventType | undefined {
  return isValidSecurityEventType(value) ? value : undefined;
}

/**
 * Create audit context helper
 */
export function createAuditContext(
  operation: string,
  component: string,
  service: string,
  version: string,
  environment: string,
  options?: {
    requestId?: string;
    businessContext?: Record<string, any>;
    complianceContext?: {
      regulation: string;
      requirement: string;
      classification: string;
    };
  }
): AuditContext {
  return {
    operation,
    component,
    service,
    version,
    environment,
    ...(options?.requestId !== undefined && { requestId: options.requestId }),
    ...(options?.businessContext !== undefined && { businessContext: options.businessContext }),
    ...(options?.complianceContext !== undefined && { complianceContext: options.complianceContext }),
  };
}

/**
 * Create safe monitoring context for different scenarios
 */
export function createMonitoringContext(
  type: 'error' | 'security' | 'auth' | 'business' | 'performance' | 'audit',
  basicProps: Record<string, any>,
  request?: FastifyRequest,
  additionalContext?: Partial<LogContext>
): LogContext {
  const baseContext = createLogContext(request, additionalContext);
  
  switch (type) {
    case 'error':
      return createErrorLogContext(
        getBasicProperty(basicProps, 'errorType', 'UnknownError'),
        request,
        { ...additionalContext, ...basicProps }
      );
    case 'security':
      return createSecurityLogContext(
        getBasicProperty(basicProps, 'securityEvent', 'unknown_event'),
        getBasicProperty(basicProps, 'severity', 'medium') as 'low' | 'medium' | 'high' | 'critical',
        request,
        { ...additionalContext, ...basicProps }
      );
    case 'auth':
      return createAuthLogContext(
        getBasicProperty(basicProps, 'authMethod', 'unknown'),
        getBasicProperty(basicProps, 'outcome', 'failure') as 'success' | 'failure' | 'mfa_required',
        request,
        { ...additionalContext, ...basicProps }
      );
    case 'business':
      return createBusinessLogContext(
        getBasicProperty(basicProps, 'eventType', 'unknown'),
        getBasicProperty(basicProps, 'entityType', 'unknown'),
        request,
        { ...additionalContext, ...basicProps }
      );
    case 'performance': {
      // Handle the operation property explicitly to satisfy exactOptionalPropertyTypes
      const operation = getBasicProperty(basicProps, 'operation', 'unknown');
      const perfContext: Partial<PerformanceLogContext> = {
        ...additionalContext,
        ...basicProps,
        operation
      };
      return createPerformanceLogContext(
        operation,
        request,
        perfContext
      );
    }
    case 'audit':
      return createAuditLogContext(
        getBasicProperty(basicProps, 'action', 'unknown'),
        request,
        { ...additionalContext, ...basicProps }
      );
    default:
      return { ...baseContext, ...basicProps };
  }
}
