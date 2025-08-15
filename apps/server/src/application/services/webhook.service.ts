/**
 * Webhook Service
 * Main service for webhook management, registration, and testing
 */

import {
  IWebhookService,
  IWebhookRepository,
  IWebhookSignatureService,
  IWebhookDeliveryService,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookQuery,
  WebhookDeliveryResult,
} from '../interfaces/webhook.interface';
import {
  Webhook,
  WebhookConfig,
  WebhookEvent,
} from '../../domain/entities/webhook';
import { WebhookSignatureService } from '../../infrastructure/security/webhook-signature.service';
import { logger } from '../../infrastructure/logging/winston-logger';

export class WebhookService implements IWebhookService {
  constructor(
    private readonly webhookRepository: IWebhookRepository,
    private readonly deliveryService: IWebhookDeliveryService,
    private readonly signatureService: IWebhookSignatureService = new WebhookSignatureService()
  ) {}

  /**
   * Register a new webhook
   */
  async registerWebhook(request: CreateWebhookRequest): Promise<Webhook> {
    try {
      // Validate webhook configuration
      const config = this.buildWebhookConfig(request);
      const validationErrors = Webhook.validateConfig(config);

      if (validationErrors.length > 0) {
        throw new Error(
          `Webhook validation failed: ${validationErrors.join(', ')}`
        );
      }

      // Validate secret strength
      const secretValidation = this.signatureService.validateSecret(
        request.secret
      );
      if (!secretValidation.valid) {
        throw new Error(
          `Webhook secret validation failed: ${secretValidation.errors.join(', ')}`
        );
      }

      // Create webhook entity
      const webhook = new Webhook(
        this.generateWebhookId(),
        request.userId,
        request.name,
        request.description,
        config,
        new Date(),
        new Date()
      );

      // Save to repository
      const savedWebhook = await this.webhookRepository.save(webhook);

      logger.info('Webhook registered successfully', {
        webhookId: savedWebhook.id,
        userId: request.userId,
        name: request.name,
        url: request.url,
        events: request.events,
      });

      return savedWebhook;
    } catch (error) {
      logger.error('Error registering webhook', {
        userId: request.userId,
        name: request.name,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update an existing webhook
   */
  async updateWebhook(
    webhookId: string,
    userId: string,
    request: UpdateWebhookRequest
  ): Promise<Webhook> {
    try {
      // Get existing webhook
      const existingWebhook = await this.webhookRepository.findById(webhookId);
      if (!existingWebhook) {
        throw new Error('Webhook not found');
      }

      // Verify ownership
      if (existingWebhook.userId !== userId) {
        throw new Error('Unauthorized to update this webhook');
      }

      // Build updated configuration
      const updatedConfig = this.mergeWebhookConfig(
        existingWebhook.config,
        request
      );

      // Validate updated configuration
      const validationErrors = Webhook.validateConfig(updatedConfig);
      if (validationErrors.length > 0) {
        throw new Error(
          `Webhook validation failed: ${validationErrors.join(', ')}`
        );
      }

      // Validate secret if provided
      if (request.secret) {
        const secretValidation = this.signatureService.validateSecret(
          request.secret
        );
        if (!secretValidation.valid) {
          throw new Error(
            `Webhook secret validation failed: ${secretValidation.errors.join(', ')}`
          );
        }
      }

      // Create updated webhook
      const updatedWebhook = new Webhook(
        existingWebhook.id,
        existingWebhook.userId,
        request.name ?? existingWebhook.name,
        request.description ?? existingWebhook.description,
        updatedConfig,
        existingWebhook.createdAt,
        new Date(),
        existingWebhook.lastDeliveryAt,
        existingWebhook.deliveryStats
      );

      // Save updated webhook
      const savedWebhook = await this.webhookRepository.update(
        webhookId,
        updatedWebhook
      );

      logger.info('Webhook updated successfully', {
        webhookId,
        userId,
        changes: Object.keys(request),
      });

      return savedWebhook;
    } catch (error) {
      logger.error('Error updating webhook', {
        webhookId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(webhookId: string, userId: string): Promise<void> {
    try {
      // Get existing webhook
      const existingWebhook = await this.webhookRepository.findById(webhookId);
      if (!existingWebhook) {
        throw new Error('Webhook not found');
      }

      // Verify ownership
      if (existingWebhook.userId !== userId) {
        throw new Error('Unauthorized to delete this webhook');
      }

      // Cancel any pending deliveries
      await this.deliveryService.cancelPendingDeliveries(webhookId);

      // Delete webhook
      await this.webhookRepository.delete(webhookId);

      logger.info('Webhook deleted successfully', {
        webhookId,
        userId,
        name: existingWebhook.name,
      });
    } catch (error) {
      logger.error('Error deleting webhook', {
        webhookId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get webhook by ID
   */
  async getWebhook(webhookId: string, userId: string): Promise<Webhook | null> {
    try {
      const webhook = await this.webhookRepository.findById(webhookId);

      if (!webhook) {
        return null;
      }

      // Verify ownership
      if (webhook.userId !== userId) {
        throw new Error('Unauthorized to access this webhook');
      }

      return webhook;
    } catch (error) {
      logger.error('Error getting webhook', {
        webhookId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * List webhooks for a user
   */
  async listWebhooks(query: WebhookQuery): Promise<{
    webhooks: Webhook[];
    total: number;
  }> {
    try {
      return await this.webhookRepository.findWithQuery(query);
    } catch (error) {
      logger.error('Error listing webhooks', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Test webhook delivery
   */
  async testWebhook(
    webhookId: string,
    userId: string
  ): Promise<WebhookDeliveryResult> {
    try {
      // Get webhook
      const webhook = await this.getWebhook(webhookId, userId);
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      // Create test event
      const testPayload = this.signatureService.generateTestPayload('webhook.test');
      const testEvent = new WebhookEvent(
        this.generateEventId(),
        'webhook.test',
        testPayload,
        userId,
        undefined,
        new Date(),
        {
          test: true,
          source: 'webhook_test',
        }
      );

      // Deliver test event
      const result = await this.deliveryService.deliverEvent(
        webhook,
        testEvent
      );

      logger.info('Webhook test completed', {
        webhookId,
        userId,
        success: result.success,
        httpStatus: result.httpStatus,
        responseTime: result.responseTime,
      });

      return result;
    } catch (error) {
      logger.error('Error testing webhook', {
        webhookId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get webhook delivery statistics
   */
  async getWebhookStats(
    webhookId: string,
    userId: string
  ): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageResponseTime: number;
    recentDeliveries: any[];
  }> {
    try {
      // Get webhook
      const webhook = await this.getWebhook(webhookId, userId);
      if (!webhook) {
        throw new Error('Webhook not found');
      }

      // Get recent delivery attempts
      const { attempts } = await this.deliveryService.getDeliveryAttempts({
        webhookId,
        limit: 10,
      });

      return {
        totalDeliveries: webhook.deliveryStats.totalDeliveries,
        successfulDeliveries: webhook.deliveryStats.successfulDeliveries,
        failedDeliveries: webhook.deliveryStats.failedDeliveries,
        averageResponseTime: webhook.deliveryStats.averageResponseTime,
        recentDeliveries: attempts,
      };
    } catch (error) {
      logger.error('Error getting webhook stats', {
        webhookId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Build webhook configuration from request
   */
  private buildWebhookConfig(request: CreateWebhookRequest): WebhookConfig {
    return {
      url: request.url,
      secret: request.secret,
      events: request.events,
      active: true,
      retryConfig: {
        maxRetries: request.retryConfig?.maxRetries ?? 3,
        backoffMultiplier: request.retryConfig?.backoffMultiplier ?? 2,
        initialDelay: request.retryConfig?.initialDelay ?? 1000,
        maxDelay: request.retryConfig?.maxDelay ?? 300000, // 5 minutes
      },
      ...(request.headers && { headers: request.headers }),
      timeout: request.timeout ?? 10000, // 10 seconds
    };
  }

  /**
   * Merge webhook configuration with updates
   */
  private mergeWebhookConfig(
    existing: WebhookConfig,
    updates: UpdateWebhookRequest
  ): WebhookConfig {
    return {
      url: updates.url ?? existing.url,
      secret: updates.secret ?? existing.secret,
      events: updates.events ?? existing.events,
      active: updates.active ?? existing.active,
      retryConfig: {
        maxRetries:
          updates.retryConfig?.maxRetries ?? existing.retryConfig.maxRetries,
        backoffMultiplier:
          updates.retryConfig?.backoffMultiplier ??
          existing.retryConfig.backoffMultiplier,
        initialDelay:
          updates.retryConfig?.initialDelay ??
          existing.retryConfig.initialDelay,
        maxDelay:
          updates.retryConfig?.maxDelay ?? existing.retryConfig.maxDelay,
      },
      ...(updates.headers ? { headers: updates.headers } : existing.headers ? { headers: existing.headers } : {}),
      timeout: updates.timeout ?? existing.timeout,
    };
  }

  /**
   * Generate unique webhook ID
   */
  private generateWebhookId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `webhook_${timestamp}_${random}`;
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
   * Validate webhook URL accessibility
   */
  async validateWebhookUrl(url: string): Promise<{
    valid: boolean;
    error?: string;
    responseTime?: number;
  }> {
    try {
      const startTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch(url, {
        method: 'HEAD',
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;

      return {
        valid: response.status < 500, // Accept any non-server-error status
        responseTime,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get supported event types
   */
  getSupportedEventTypes(): string[] {
    return [
      'authentication.login.success',
      'authentication.login.failure',
      'authentication.logout',
      'authentication.token.refresh',
      'authentication.token.revoke',
      'authentication.mfa.challenge',
      'authentication.mfa.success',
      'authentication.mfa.failure',
      'authentication.password.change',
      'authentication.password.reset',
      'authorization.access.granted',
      'authorization.access.denied',
      'security.high_risk.detected',
      'security.rate_limit.exceeded',
      'security.validation.failed',
      'security.suspicious.activity',
      'session.created',
      'session.expired',
      'session.revoked',
      'user.created',
      'user.updated',
      'user.deleted',
      'admin.action',
      'system.error',
    ];
  }
}
