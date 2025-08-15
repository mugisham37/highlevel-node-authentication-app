/**
 * Audit Logging Middleware
 * Comprehensive audit logging for all authentication events and security-sensitive operations
 */

import { FastifyRequest, FastifyReply, FastifyPluginAsync } from 'fastify';
import { logger } from '../../logging/winston-logger';
import { createHash } from 'crypto';

export interface AuditConfig {
  enableRequestLogging?: boolean;
  enableResponseLogging?: boolean;
  enableBodyLogging?: boolean;
  enableHeaderLogging?: boolean;
  sensitiveFields?: string[];
  excludePaths?: string[];
  includeOnlyPaths?: string[];
  maxBodySize?: number; // bytes
  enableIntegrityCheck?: boolean;
  onAuditEvent?: (event: AuditEvent) => void;
}

export interface AuditEvent {
  id: string;
  timestamp: Date;
  correlationId: string;
  eventType: AuditEventType;
  userId?: string | undefined;
  sessionId?: string | undefined;
  ipAddress: string;
  userAgent: string;
  method: string;
  path: string;
  statusCode?: number | undefined;
  duration?: number | undefined;
  request?: {
    headers?: Record<string, any> | undefined;
    query?: Record<string, any> | undefined;
    params?: Record<string, any> | undefined;
    body?: any;
    bodyHash?: string | undefined;
  } | undefined;
  response?: {
    headers?: Record<string, any> | undefined;
    body?: any;
    bodyHash?: string | undefined;
  } | undefined;
  securityContext?: {
    riskScore?: number | undefined;
    riskLevel?: string | undefined;
    deviceFingerprint?: string | undefined;
    requiresMFA?: boolean | undefined;
  } | undefined;
  error?: {
    message: string;
    code?: string | undefined;
    stack?: string | undefined;
  } | undefined;
  metadata?: Record<string, any> | undefined;
}

export type AuditEventType =
  | 'authentication.login.success'
  | 'authentication.login.failure'
  | 'authentication.logout'
  | 'authentication.token.refresh'
  | 'authentication.token.revoke'
  | 'authentication.mfa.challenge'
  | 'authentication.mfa.success'
  | 'authentication.mfa.failure'
  | 'authentication.password.change'
  | 'authentication.password.reset'
  | 'authorization.access.granted'
  | 'authorization.access.denied'
  | 'security.high_risk.detected'
  | 'security.rate_limit.exceeded'
  | 'security.validation.failed'
  | 'security.suspicious.activity'
  | 'session.created'
  | 'session.expired'
  | 'session.revoked'
  | 'user.created'
  | 'user.updated'
  | 'user.deleted'
  | 'admin.action'
  | 'system.error'
  | 'api.request'
  | 'api.response';

declare module 'fastify' {
  interface FastifyRequest {
    auditContext?: {
      eventType?: AuditEventType;
      metadata?: Record<string, any>;
      sensitiveOperation?: boolean;
    };
    auditEvent?: AuditEvent;
    auditStartTime?: number;
  }
}

export class AuditLoggingMiddleware {
  private static readonly DEFAULT_CONFIG: Required<AuditConfig> = {
    enableRequestLogging: true,
    enableResponseLogging: true,
    enableBodyLogging: true,
    enableHeaderLogging: true,
    sensitiveFields: [
      'password',
      'token',
      'secret',
      'key',
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'refresh_token',
      'access_token',
      'mfa_code',
      'totp_code',
      'backup_code',
    ],
    excludePaths: ['/health', '/ready', '/metrics', '/favicon.ico'],
    includeOnlyPaths: [],
    maxBodySize: 10240, // 10KB
    enableIntegrityCheck: true,
    onAuditEvent: () => {},
  };

  private readonly config: Required<AuditConfig>;
  private readonly auditEvents: AuditEvent[] = [];
  private readonly maxStoredEvents = 1000;

  constructor(config: AuditConfig = {}) {
    this.config = { ...AuditLoggingMiddleware.DEFAULT_CONFIG, ...config };
  }

  /**
   * Create Fastify plugin for audit logging
   */
  static createPlugin(config: AuditConfig = {}): FastifyPluginAsync {
    const middleware = new AuditLoggingMiddleware(config);

    return async (fastify) => {
      // Pre-request hook to capture request data
      fastify.addHook('preHandler', async (request, reply) => {
        await middleware.logRequest(request, reply);
      });

      // Post-response hook to capture response data
      fastify.addHook('onResponse', async (request, reply) => {
        await middleware.logResponse(request, reply);
      });

      // Error hook to capture error events
      fastify.addHook('onError', async (request, reply, error) => {
        await middleware.logError(request, reply, error);
      });
    };
  }

  /**
   * Log incoming request
   */
  async logRequest(
    request: FastifyRequest,
    _reply: FastifyReply
  ): Promise<void> {
    try {
      // Check if path should be audited
      if (!this.shouldAuditPath(request.url)) {
        return;
      }

      // Store request start time for duration calculation
      (request as any).auditStartTime = Date.now();

      // Create audit event for request
      const auditEvent = await this.createRequestAuditEvent(request);

      // Store event for later completion
      (request as any).auditEvent = auditEvent;

      // Log request immediately for security-sensitive operations
      if (this.isSensitiveOperation(request)) {
        this.logAuditEvent(auditEvent);
      }
    } catch (error) {
      logger.error('Error in audit logging middleware (request)', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Log outgoing response
   */
  async logResponse(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const auditEvent = (request as any).auditEvent as AuditEvent;
      if (!auditEvent) return;

      // Calculate request duration
      const startTime = (request as any).auditStartTime as number;
      const duration = startTime ? Date.now() - startTime : undefined;

      // Complete audit event with response data
      await this.completeAuditEvent(auditEvent, request, reply, duration);

      // Log the completed event
      this.logAuditEvent(auditEvent);
    } catch (error) {
      logger.error('Error in audit logging middleware (response)', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Log error events
   */
  async logError(
    request: FastifyRequest,
    _reply: FastifyReply,
    error: Error
  ): Promise<void> {
    try {
      const auditEvent = (request as any).auditEvent as AuditEvent;
      if (auditEvent) {
        // Add error information to existing event
        auditEvent.error = {
          message: error.message,
          code: (error as any).code || undefined,
          stack: error.stack || undefined,
        };
        auditEvent.eventType = 'system.error';
      } else {
        // Create new error event
        const errorEvent = await this.createErrorAuditEvent(request, error);
        this.logAuditEvent(errorEvent);
      }
    } catch (auditError) {
      logger.error('Error in audit logging middleware (error)', {
        correlationId: request.correlationId,
        originalError: error.message,
        auditError:
          auditError instanceof Error ? auditError.message : 'Unknown error',
      });
    }
  }

  /**
   * Create audit event for request
   */
  private async createRequestAuditEvent(
    request: FastifyRequest
  ): Promise<AuditEvent> {
    const eventId = this.generateEventId();
    const eventType = this.determineEventType(request);

    const auditEvent: AuditEvent = {
      id: eventId,
      timestamp: new Date(),
      correlationId: request.correlationId,
      eventType,
      userId: request.user?.id || undefined,
      sessionId: request.user?.sessionId || undefined,
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers['user-agent'] || 'unknown',
      method: request.method,
      path: request.url,
      request: {},
      securityContext: {},
      metadata: { ...request.auditContext?.metadata },
    };

    // Add request headers (filtered)
    if (this.config.enableHeaderLogging) {
      auditEvent.request!.headers = this.sanitizeData(request.headers);
    }

    // Add query parameters
    if (request.query && Object.keys(request.query).length > 0) {
      auditEvent.request!.query = this.sanitizeData(request.query);
    }

    // Add path parameters
    if (request.params && Object.keys(request.params).length > 0) {
      auditEvent.request!.params = this.sanitizeData(request.params);
    }

    // Add request body (with size limit and sanitization)
    if (this.config.enableBodyLogging && request.body) {
      const bodyString = JSON.stringify(request.body);
      if (bodyString.length <= this.config.maxBodySize) {
        auditEvent.request!.body = this.sanitizeData(request.body);

        // Add integrity hash if enabled
        if (this.config.enableIntegrityCheck) {
          auditEvent.request!.bodyHash = this.calculateHash(bodyString);
        }
      } else {
        auditEvent.request!.body = '[BODY_TOO_LARGE]';
        if (auditEvent.metadata) {
          auditEvent.metadata['bodySize'] = bodyString.length;
        }
      }
    }

    // Add security context
    if (request.riskAssessment) {
      auditEvent.securityContext = {
        riskScore: request.riskAssessment.overallScore,
        riskLevel: request.riskAssessment.level,
        requiresMFA: request.riskAssessment.requiresMFA,
      };
    }

    if (request.securityContext?.deviceFingerprint) {
      auditEvent.securityContext!.deviceFingerprint =
        request.securityContext.deviceFingerprint.id;
    }

    return auditEvent;
  }

  /**
   * Complete audit event with response data
   */
  private async completeAuditEvent(
    auditEvent: AuditEvent,
    request: FastifyRequest,
    reply: FastifyReply,
    duration?: number
  ): Promise<void> {
    // Add response status and duration
    auditEvent.statusCode = reply.statusCode;
    auditEvent.duration = duration || undefined;

    // Add response headers (filtered)
    if (this.config.enableResponseLogging && this.config.enableHeaderLogging) {
      const responseHeaders = reply.getHeaders();
      auditEvent.response = {
        headers: this.sanitizeData(responseHeaders),
      };
    }

    // Update event type based on response
    auditEvent.eventType = this.refineEventType(
      auditEvent.eventType,
      reply.statusCode,
      request
    );

    // Add additional metadata based on response
    if (reply.statusCode >= 400) {
      auditEvent.metadata = {
        ...auditEvent.metadata,
        errorResponse: true,
        statusCode: reply.statusCode,
      };
    }

    // Mark as sensitive if it's an authentication-related operation
    if (this.isAuthenticationEvent(auditEvent.eventType)) {
      auditEvent.metadata = {
        ...auditEvent.metadata,
        sensitiveOperation: true,
      };
    }
  }

  /**
   * Create error audit event
   */
  private async createErrorAuditEvent(
    request: FastifyRequest,
    error: Error
  ): Promise<AuditEvent> {
    return {
      id: this.generateEventId(),
      timestamp: new Date(),
      correlationId: request.correlationId,
      eventType: 'system.error',
      userId: request.user?.id,
      sessionId: request.user?.sessionId,
      ipAddress: request.ip || 'unknown',
      userAgent: request.headers['user-agent'] || 'unknown',
      method: request.method,
      path: request.url,
      error: {
        message: error.message,
        code: (error as any).code || undefined,
        stack: error.stack || undefined,
      },
      metadata: {
        errorType: error.constructor.name,
        timestamp: new Date().toISOString(),
      },
    };
  }

  /**
   * Determine event type based on request
   */
  private determineEventType(request: FastifyRequest): AuditEventType {
    // Check if event type is explicitly set
    if (request.auditContext?.eventType) {
      return request.auditContext.eventType;
    }

    // Determine based on path and method
    const path = request.url.toLowerCase();
    const method = request.method.toLowerCase();

    // Authentication endpoints
    if (path.includes('/auth/login')) {
      return 'authentication.login.success'; // Will be refined based on response
    }
    if (path.includes('/auth/logout')) {
      return 'authentication.logout';
    }
    if (path.includes('/auth/refresh')) {
      return 'authentication.token.refresh';
    }
    if (path.includes('/auth/mfa')) {
      return 'authentication.mfa.challenge';
    }
    if (path.includes('/auth/password')) {
      return method === 'post'
        ? 'authentication.password.reset'
        : 'authentication.password.change';
    }

    // User management endpoints
    if (path.includes('/users') && method === 'post') {
      return 'user.created';
    }
    if (path.includes('/users') && (method === 'put' || method === 'patch')) {
      return 'user.updated';
    }
    if (path.includes('/users') && method === 'delete') {
      return 'user.deleted';
    }

    // Admin endpoints
    if (path.includes('/admin')) {
      return 'admin.action';
    }

    // Default to API request
    return 'api.request';
  }

  /**
   * Refine event type based on response
   */
  private refineEventType(
    originalType: AuditEventType,
    statusCode: number,
    request: FastifyRequest
  ): AuditEventType {
    // Refine authentication events based on status code
    if (originalType === 'authentication.login.success' && statusCode >= 400) {
      return 'authentication.login.failure';
    }

    if (originalType === 'authentication.mfa.challenge') {
      if (statusCode === 200) {
        return 'authentication.mfa.success';
      } else if (statusCode >= 400) {
        return 'authentication.mfa.failure';
      }
    }

    // Check for authorization failures
    if (statusCode === 403) {
      return 'authorization.access.denied';
    }

    // Check for rate limiting
    if (statusCode === 429) {
      return 'security.rate_limit.exceeded';
    }

    // Check for validation failures
    if (statusCode === 400 && request.validationErrors) {
      return 'security.validation.failed';
    }

    return originalType;
  }

  /**
   * Check if path should be audited
   */
  private shouldAuditPath(path: string): boolean {
    const cleanPath = path.split('?')[0]; // Remove query parameters
    
    if (!cleanPath) {
      return false;
    }

    // Check exclude paths
    if (
      this.config.excludePaths.some(
        (excludePath) =>
          cleanPath === excludePath || cleanPath.startsWith(excludePath)
      )
    ) {
      return false;
    }

    // Check include only paths (if specified)
    if (this.config.includeOnlyPaths.length > 0) {
      return this.config.includeOnlyPaths.some(
        (includePath) =>
          cleanPath === includePath || cleanPath.startsWith(includePath)
      );
    }

    return true;
  }

  /**
   * Check if operation is sensitive
   */
  private isSensitiveOperation(request: FastifyRequest): boolean {
    if (request.auditContext?.sensitiveOperation) {
      return true;
    }

    const path = request.url.toLowerCase();
    const sensitivePatterns = [
      '/auth/',
      '/admin/',
      '/users/',
      '/password',
      '/mfa',
      '/token',
    ];

    return sensitivePatterns.some((pattern) => path.includes(pattern));
  }

  /**
   * Check if event type is authentication-related
   */
  private isAuthenticationEvent(eventType: AuditEventType): boolean {
    return (
      eventType.startsWith('authentication.') ||
      eventType.startsWith('authorization.') ||
      eventType.startsWith('session.')
    );
  }

  /**
   * Sanitize data by removing sensitive fields
   */
  private sanitizeData(data: any): any {
    if (!data || typeof data !== 'object') {
      return data;
    }

    if (Array.isArray(data)) {
      return data.map((item) => this.sanitizeData(item));
    }

    const sanitized: any = {};
    for (const [key, value] of Object.entries(data)) {
      const lowerKey = key.toLowerCase();

      if (
        this.config.sensitiveFields.some((field) =>
          lowerKey.includes(field.toLowerCase())
        )
      ) {
        sanitized[key] = '[REDACTED]';
      } else if (typeof value === 'object' && value !== null) {
        sanitized[key] = this.sanitizeData(value);
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Calculate hash for integrity checking
   */
  private calculateHash(data: string): string {
    return createHash('sha256').update(data).digest('hex');
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `audit_${timestamp}_${random}`;
  }

  /**
   * Log audit event
   */
  private logAuditEvent(event: AuditEvent): void {
    try {
      // Store event in memory (for statistics and recent events)
      this.auditEvents.push(event);
      if (this.auditEvents.length > this.maxStoredEvents) {
        this.auditEvents.shift(); // Remove oldest event
      }

      // Log to Winston logger
      const logLevel = this.getLogLevel(event);
      logger.log(logLevel, 'Audit Event', {
        auditEvent: event,
        eventId: event.id,
        eventType: event.eventType,
        userId: event.userId,
        correlationId: event.correlationId,
        statusCode: event.statusCode,
        duration: event.duration,
        riskScore: event.securityContext?.riskScore,
      });

      // Call custom handler if provided
      this.config.onAuditEvent(event);

      // Log security events at higher priority
      if (this.isSecurityEvent(event)) {
        logger.warn('Security audit event', {
          eventId: event.id,
          eventType: event.eventType,
          userId: event.userId,
          ipAddress: event.ipAddress,
          riskScore: event.securityContext?.riskScore,
          statusCode: event.statusCode,
        });
      }
    } catch (error) {
      logger.error('Error logging audit event', {
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get appropriate log level for event
   */
  private getLogLevel(event: AuditEvent): string {
    if (event.error) return 'error';
    if (this.isSecurityEvent(event)) return 'warn';
    if (event.statusCode && event.statusCode >= 400) return 'warn';
    return 'info';
  }

  /**
   * Check if event is security-related
   */
  private isSecurityEvent(event: AuditEvent): boolean {
    return (
      event.eventType.startsWith('security.') ||
      event.eventType.includes('failure') ||
      event.eventType.includes('denied') ||
      !!(event.securityContext?.riskScore && event.securityContext.riskScore > 70)
    );
  }

  /**
   * Get audit statistics
   */
  getStats(): {
    totalEvents: number;
    securityEvents: number;
    errorEvents: number;
    averageRiskScore: number;
    topEventTypes: Array<{ type: string; count: number }>;
    recentHighRiskEvents: AuditEvent[];
  } {
    const securityEvents = this.auditEvents.filter((e) =>
      this.isSecurityEvent(e)
    );
    const errorEvents = this.auditEvents.filter((e) => e.error);

    const riskScores = this.auditEvents
      .map((e) => e.securityContext?.riskScore)
      .filter((score) => score !== undefined) as number[];

    const averageRiskScore =
      riskScores.length > 0
        ? riskScores.reduce((sum, score) => sum + score, 0) / riskScores.length
        : 0;

    // Count event types
    const eventTypeCounts = new Map<string, number>();
    this.auditEvents.forEach((event) => {
      const count = eventTypeCounts.get(event.eventType) || 0;
      eventTypeCounts.set(event.eventType, count + 1);
    });

    const topEventTypes = Array.from(eventTypeCounts.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Recent high-risk events (last 24 hours)
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentHighRiskEvents = this.auditEvents
      .filter(
        (e) =>
          e.timestamp > oneDayAgo &&
          e.securityContext?.riskScore &&
          e.securityContext.riskScore > 70
      )
      .slice(-10);

    return {
      totalEvents: this.auditEvents.length,
      securityEvents: securityEvents.length,
      errorEvents: errorEvents.length,
      averageRiskScore: Math.round(averageRiskScore * 100) / 100,
      topEventTypes,
      recentHighRiskEvents,
    };
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit: number = 50): AuditEvent[] {
    return this.auditEvents
      .slice(-limit)
      .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }

  /**
   * Search events by criteria
   */
  searchEvents(criteria: {
    userId?: string;
    eventType?: AuditEventType;
    ipAddress?: string;
    minRiskScore?: number;
    startTime?: Date;
    endTime?: Date;
  }): AuditEvent[] {
    return this.auditEvents.filter((event) => {
      if (criteria.userId && event.userId !== criteria.userId) return false;
      if (criteria.eventType && event.eventType !== criteria.eventType)
        return false;
      if (criteria.ipAddress && event.ipAddress !== criteria.ipAddress)
        return false;
      if (
        criteria.minRiskScore &&
        (!event.securityContext?.riskScore ||
          event.securityContext.riskScore < criteria.minRiskScore)
      ) {
        return false;
      }
      if (criteria.startTime && event.timestamp < criteria.startTime)
        return false;
      if (criteria.endTime && event.timestamp > criteria.endTime) return false;
      return true;
    });
  }
}

// Export pre-configured audit loggers
export const standardAuditLogger = AuditLoggingMiddleware.createPlugin({
  enableRequestLogging: true,
  enableResponseLogging: true,
  enableBodyLogging: true,
  maxBodySize: 5120, // 5KB
});

export const securityAuditLogger = AuditLoggingMiddleware.createPlugin({
  enableRequestLogging: true,
  enableResponseLogging: true,
  enableBodyLogging: true,
  enableIntegrityCheck: true,
  includeOnlyPaths: ['/auth', '/admin', '/users'],
  maxBodySize: 10240, // 10KB
});

export const complianceAuditLogger = AuditLoggingMiddleware.createPlugin({
  enableRequestLogging: true,
  enableResponseLogging: true,
  enableBodyLogging: true,
  enableHeaderLogging: true,
  enableIntegrityCheck: true,
  maxBodySize: 20480, // 20KB
  excludePaths: ['/health', '/ready'], // Minimal exclusions for compliance
});
