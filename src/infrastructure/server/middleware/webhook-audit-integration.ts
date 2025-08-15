/**
 * Webhook Audit Integration
 * Integrates webhook event publishing with the existing audit logging system
 */

import { FastifyPluginAsync } from 'fastify';
import { AuditEvent } from './audit-logging';
import { WebhookFactory } from '../../../application/factories/webhook.factory';
import { WebhookEvent } from '../../../domain/entities/webhook';
import { logger } from '../../logging/winston-logger';

export interface WebhookAuditConfig {
  enableWebhookPublishing?: boolean;
  publishOnlySecurityEvents?: boolean;
  excludeEventTypes?: string[];
  includeOnlyEventTypes?: string[];
  batchSize?: number;
  batchTimeout?: number;
}

export class WebhookAuditIntegration {
  private readonly config: Required<WebhookAuditConfig>;
  private eventBatch: WebhookEvent[] = [];
  private batchTimer: NodeJS.Timeout | null = null;

  constructor(config: WebhookAuditConfig = {}) {
    this.config = {
      enableWebhookPublishing: true,
      publishOnlySecurityEvents: false,
      excludeEventTypes: ['api.request', 'api.response'],
      includeOnlyEventTypes: [],
      batchSize: 10,
      batchTimeout: 5000, // 5 seconds
      ...config,
    };
  }

  /**
   * Create Fastify plugin for webhook audit integration
   */
  static createPlugin(config: WebhookAuditConfig = {}): FastifyPluginAsync {
    const integration = new WebhookAuditIntegration(config);

    return async (fastify) => {
      // Hook into audit events
      fastify.addHook('onResponse', async (request, _reply) => {
        if (request.auditEvent) {
          await integration.handleAuditEvent(request.auditEvent);
        }
      });

      // Hook into error events
      fastify.addHook('onError', async (request, _reply, _error) => {
        if (request.auditEvent) {
          await integration.handleAuditEvent(request.auditEvent);
        }
      });

      // Graceful shutdown - flush remaining events
      fastify.addHook('onClose', async () => {
        await integration.flushBatch();
      });
    };
  }

  /**
   * Handle audit event and potentially publish as webhook event
   */
  async handleAuditEvent(auditEvent: AuditEvent): Promise<void> {
    try {
      if (!this.config.enableWebhookPublishing) {
        return;
      }

      if (!this.shouldPublishEvent(auditEvent)) {
        return;
      }

      // Convert audit event to webhook event
      const webhookEvent = this.convertAuditToWebhookEvent(auditEvent);

      // Add to batch
      this.addToBatch(webhookEvent);
    } catch (error) {
      logger.error('Error handling audit event for webhook publishing', {
        auditEventId: auditEvent.id,
        eventType: auditEvent.eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Determine if audit event should be published as webhook event
   */
  private shouldPublishEvent(auditEvent: AuditEvent): boolean {
    // Check if only security events should be published
    if (
      this.config.publishOnlySecurityEvents &&
      !this.isSecurityEvent(auditEvent)
    ) {
      return false;
    }

    // Check exclude list
    if (this.config.excludeEventTypes.includes(auditEvent.eventType)) {
      return false;
    }

    // Check include list (if specified)
    if (this.config.includeOnlyEventTypes.length > 0) {
      return this.config.includeOnlyEventTypes.includes(auditEvent.eventType);
    }

    return true;
  }

  /**
   * Check if audit event is security-related
   */
  private isSecurityEvent(auditEvent: AuditEvent): boolean {
    const riskScore = auditEvent.securityContext?.riskScore;
    return (
      auditEvent.eventType.startsWith('authentication.') ||
      auditEvent.eventType.startsWith('authorization.') ||
      auditEvent.eventType.startsWith('security.') ||
      auditEvent.eventType.startsWith('session.') ||
      auditEvent.eventType.includes('failure') ||
      auditEvent.eventType.includes('denied') ||
      (typeof riskScore === 'number' && riskScore > 50)
    );
  }

  /**
   * Convert audit event to webhook event
   */
  private convertAuditToWebhookEvent(auditEvent: AuditEvent): WebhookEvent {
    return new WebhookEvent(
      auditEvent.id,
      auditEvent.eventType,
      {
        method: auditEvent.method,
        path: auditEvent.path,
        statusCode: auditEvent.statusCode,
        duration: auditEvent.duration,
        ipAddress: auditEvent.ipAddress,
        userAgent: auditEvent.userAgent,
        securityContext: auditEvent.securityContext,
        error: auditEvent.error,
        request: this.sanitizeRequestData(auditEvent.request),
        response: this.sanitizeResponseData(auditEvent.response),
      },
      auditEvent.userId,
      auditEvent.sessionId,
      auditEvent.timestamp,
      {
        ...auditEvent.metadata,
        source: 'audit_integration',
        originalEventId: auditEvent.id,
      },
      auditEvent.correlationId
    );
  }

  /**
   * Sanitize request data for webhook publishing
   */
  private sanitizeRequestData(requestData?: any): any {
    if (!requestData) return undefined;

    return {
      headers: this.sanitizeHeaders(requestData.headers),
      query: requestData.query,
      params: requestData.params,
      // Exclude body for security reasons
      bodyHash: requestData.bodyHash,
    };
  }

  /**
   * Sanitize response data for webhook publishing
   */
  private sanitizeResponseData(responseData?: any): any {
    if (!responseData) return undefined;

    return {
      headers: this.sanitizeHeaders(responseData.headers),
      // Exclude body for security reasons
      bodyHash: responseData.bodyHash,
    };
  }

  /**
   * Sanitize headers by removing sensitive information
   */
  private sanitizeHeaders(
    headers?: Record<string, any>
  ): Record<string, any> | undefined {
    if (!headers) return undefined;

    const sanitized: Record<string, any> = {};
    const sensitiveHeaders = [
      'authorization',
      'cookie',
      'x-api-key',
      'x-auth-token',
      'x-access-token',
    ];

    for (const [key, value] of Object.entries(headers)) {
      const lowerKey = key.toLowerCase();

      if (sensitiveHeaders.some((sensitive) => lowerKey.includes(sensitive))) {
        sanitized[key] = '[REDACTED]';
      } else {
        sanitized[key] = value;
      }
    }

    return sanitized;
  }

  /**
   * Add webhook event to batch
   */
  private addToBatch(webhookEvent: WebhookEvent): void {
    this.eventBatch.push(webhookEvent);

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => {
        this.flushBatch();
      }, this.config.batchTimeout);
    }

    // Flush immediately if batch is full
    if (this.eventBatch.length >= this.config.batchSize) {
      this.flushBatch();
    }
  }

  /**
   * Flush current batch of events
   */
  private async flushBatch(): Promise<void> {
    if (this.eventBatch.length === 0) {
      return;
    }

    // Clear timer
    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    const eventsToPublish = [...this.eventBatch];
    this.eventBatch = [];

    try {
      // Get webhook factory instance
      const webhookFactory = WebhookFactory.getInstance();
      const eventPublisher = webhookFactory.eventPublisher;

      // Publish events in batch
      await eventPublisher.publishEvents(eventsToPublish);

      logger.debug('Published webhook events batch', {
        eventCount: eventsToPublish.length,
        eventTypes: [...new Set(eventsToPublish.map((e) => e.type))],
      });
    } catch (error) {
      logger.error('Error publishing webhook events batch', {
        eventCount: eventsToPublish.length,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Re-add events to batch for retry (with limit to prevent infinite growth)
      if (this.eventBatch.length < 100) {
        this.eventBatch.unshift(...eventsToPublish);
      }
    }
  }

  /**
   * Manually publish a webhook event
   */
  async publishEvent(
    eventType: string,
    data: Record<string, any>,
    userId?: string,
    sessionId?: string,
    correlationId?: string
  ): Promise<void> {
    try {
      const webhookEvent = new WebhookEvent(
        this.generateEventId(),
        eventType,
        data,
        userId,
        sessionId,
        new Date(),
        {
          source: 'manual_publish',
        },
        correlationId
      );

      this.addToBatch(webhookEvent);
    } catch (error) {
      logger.error('Error manually publishing webhook event', {
        eventType,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `event_${timestamp}_${random}`;
  }

  /**
   * Get integration statistics
   */
  getStats(): {
    batchSize: number;
    pendingEvents: number;
    batchTimerActive: boolean;
    config: Required<WebhookAuditConfig>;
  } {
    return {
      batchSize: this.config.batchSize,
      pendingEvents: this.eventBatch.length,
      batchTimerActive: this.batchTimer !== null,
      config: this.config,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(newConfig: Partial<WebhookAuditConfig>): void {
    Object.assign(this.config, newConfig);

    logger.info('Webhook audit integration config updated', {
      newConfig,
    });
  }
}

// Export pre-configured integration plugins
export const standardWebhookAuditIntegration =
  WebhookAuditIntegration.createPlugin({
    enableWebhookPublishing: true,
    publishOnlySecurityEvents: false,
    excludeEventTypes: ['api.request', 'api.response'],
    batchSize: 10,
    batchTimeout: 5000,
  });

export const securityWebhookAuditIntegration =
  WebhookAuditIntegration.createPlugin({
    enableWebhookPublishing: true,
    publishOnlySecurityEvents: true,
    excludeEventTypes: [],
    batchSize: 5,
    batchTimeout: 2000, // Faster publishing for security events
  });

export const complianceWebhookAuditIntegration =
  WebhookAuditIntegration.createPlugin({
    enableWebhookPublishing: true,
    publishOnlySecurityEvents: false,
    excludeEventTypes: [],
    includeOnlyEventTypes: [
      'authentication.login.success',
      'authentication.login.failure',
      'authentication.logout',
      'user.created',
      'user.updated',
      'user.deleted',
      'admin.action',
      'authorization.access.denied',
      'security.high_risk.detected',
    ],
    batchSize: 1, // Immediate publishing for compliance
    batchTimeout: 1000,
  });
