/**
 * Webhook Controller
 * Handles HTTP requests for webhook management and event streaming
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import {
  IWebhookService,
  IEventPublisher,
  CreateWebhookRequest,
  UpdateWebhookRequest,
  WebhookQuery,
} from '../../application/interfaces/webhook.interface';
import { logger } from '../../infrastructure/logging/winston-logger';

export class WebhookController {
  constructor(
    private readonly webhookService: IWebhookService,
    private readonly eventPublisher: IEventPublisher
  ) {}

  /**
   * Register a new webhook
   */
  async registerWebhook(
    request: FastifyRequest<{
      Body: CreateWebhookRequest;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const webhookRequest: CreateWebhookRequest = {
        ...request.body,
        userId,
      };

      const webhook = await this.webhookService.registerWebhook(webhookRequest);

      // Publish webhook registration event
      await this.eventPublisher.publishAuthEvent(
        'webhook.registered',
        {
          webhookId: webhook.id,
          name: webhook.name,
          url: webhook.config.url,
          events: webhook.config.events,
        },
        userId,
        request.user?.sessionId,
        request.correlationId
      );

      reply.code(201).send({
        success: true,
        data: {
          id: webhook.id,
          name: webhook.name,
          description: webhook.description,
          url: webhook.config.url,
          events: webhook.config.events,
          active: webhook.config.active,
          timeout: webhook.config.timeout,
          retryConfig: webhook.config.retryConfig,
          createdAt: webhook.createdAt,
          deliveryStats: webhook.deliveryStats,
        },
      });
    } catch (error) {
      logger.error('Error registering webhook', {
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      reply.code(400).send({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to register webhook',
      });
    }
  }

  /**
   * Update an existing webhook
   */
  async updateWebhook(
    request: FastifyRequest<{
      Params: { webhookId: string };
      Body: UpdateWebhookRequest;
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const { webhookId } = request.params;
      const webhook = await this.webhookService.updateWebhook(
        webhookId,
        userId,
        request.body
      );

      // Publish webhook update event
      await this.eventPublisher.publishAuthEvent(
        'webhook.updated',
        {
          webhookId: webhook.id,
          name: webhook.name,
          changes: Object.keys(request.body),
        },
        userId,
        request.user?.sessionId,
        request.correlationId
      );

      reply.send({
        success: true,
        data: {
          id: webhook.id,
          name: webhook.name,
          description: webhook.description,
          url: webhook.config.url,
          events: webhook.config.events,
          active: webhook.config.active,
          timeout: webhook.config.timeout,
          retryConfig: webhook.config.retryConfig,
          updatedAt: webhook.updatedAt,
          deliveryStats: webhook.deliveryStats,
        },
      });
    } catch (error) {
      logger.error('Error updating webhook', {
        webhookId: request.params.webhookId,
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      const statusCode =
        error instanceof Error && error.message.includes('not found')
          ? 404
          : 400;
      reply.code(statusCode).send({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to update webhook',
      });
    }
  }

  /**
   * Delete a webhook
   */
  async deleteWebhook(
    request: FastifyRequest<{
      Params: { webhookId: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const { webhookId } = request.params;
      await this.webhookService.deleteWebhook(webhookId, userId);

      // Publish webhook deletion event
      await this.eventPublisher.publishAuthEvent(
        'webhook.deleted',
        {
          webhookId,
        },
        userId,
        request.user?.sessionId,
        request.correlationId
      );

      reply.send({
        success: true,
        message: 'Webhook deleted successfully',
      });
    } catch (error) {
      logger.error('Error deleting webhook', {
        webhookId: request.params.webhookId,
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      const statusCode =
        error instanceof Error && error.message.includes('not found')
          ? 404
          : 400;
      reply.code(statusCode).send({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to delete webhook',
      });
    }
  }

  /**
   * Get a webhook by ID
   */
  async getWebhook(
    request: FastifyRequest<{
      Params: { webhookId: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const { webhookId } = request.params;
      const webhook = await this.webhookService.getWebhook(webhookId, userId);

      if (!webhook) {
        reply.code(404).send({
          success: false,
          error: 'Webhook not found',
        });
        return;
      }

      reply.send({
        success: true,
        data: {
          id: webhook.id,
          name: webhook.name,
          description: webhook.description,
          url: webhook.config.url,
          events: webhook.config.events,
          active: webhook.config.active,
          timeout: webhook.config.timeout,
          retryConfig: webhook.config.retryConfig,
          createdAt: webhook.createdAt,
          updatedAt: webhook.updatedAt,
          lastDeliveryAt: webhook.lastDeliveryAt,
          deliveryStats: webhook.deliveryStats,
        },
      });
    } catch (error) {
      logger.error('Error getting webhook', {
        webhookId: request.params.webhookId,
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to get webhook',
      });
    }
  }

  /**
   * List webhooks for the authenticated user
   */
  async listWebhooks(
    request: FastifyRequest<{
      Querystring: {
        active?: string;
        eventType?: string;
        limit?: string;
        offset?: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const query: WebhookQuery = {
        userId,
        active: request.query.active
          ? request.query.active === 'true'
          : undefined,
        eventType: request.query.eventType,
        limit: request.query.limit
          ? parseInt(request.query.limit, 10)
          : undefined,
        offset: request.query.offset
          ? parseInt(request.query.offset, 10)
          : undefined,
      };

      const result = await this.webhookService.listWebhooks(query);

      reply.send({
        success: true,
        data: {
          webhooks: result.webhooks.map((webhook) => ({
            id: webhook.id,
            name: webhook.name,
            description: webhook.description,
            url: webhook.config.url,
            events: webhook.config.events,
            active: webhook.config.active,
            createdAt: webhook.createdAt,
            lastDeliveryAt: webhook.lastDeliveryAt,
            deliveryStats: webhook.deliveryStats,
          })),
          total: result.total,
          limit: query.limit || 50,
          offset: query.offset || 0,
        },
      });
    } catch (error) {
      logger.error('Error listing webhooks', {
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      reply.code(400).send({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to list webhooks',
      });
    }
  }

  /**
   * Test a webhook
   */
  async testWebhook(
    request: FastifyRequest<{
      Params: { webhookId: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const { webhookId } = request.params;
      const result = await this.webhookService.testWebhook(webhookId, userId);

      // Publish webhook test event
      await this.eventPublisher.publishAuthEvent(
        'webhook.tested',
        {
          webhookId,
          success: result.success,
          httpStatus: result.httpStatus,
          responseTime: result.responseTime,
        },
        userId,
        request.user?.sessionId,
        request.correlationId
      );

      reply.send({
        success: true,
        data: {
          webhookId,
          testResult: {
            success: result.success,
            httpStatus: result.httpStatus,
            responseTime: result.responseTime,
            errorMessage: result.errorMessage,
          },
        },
      });
    } catch (error) {
      logger.error('Error testing webhook', {
        webhookId: request.params.webhookId,
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      const statusCode =
        error instanceof Error && error.message.includes('not found')
          ? 404
          : 400;
      reply.code(statusCode).send({
        success: false,
        error:
          error instanceof Error ? error.message : 'Failed to test webhook',
      });
    }
  }

  /**
   * Get webhook statistics
   */
  async getWebhookStats(
    request: FastifyRequest<{
      Params: { webhookId: string };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const { webhookId } = request.params;
      const stats = await this.webhookService.getWebhookStats(
        webhookId,
        userId
      );

      reply.send({
        success: true,
        data: {
          webhookId,
          stats,
        },
      });
    } catch (error) {
      logger.error('Error getting webhook stats', {
        webhookId: request.params.webhookId,
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      const statusCode =
        error instanceof Error && error.message.includes('not found')
          ? 404
          : 400;
      reply.code(statusCode).send({
        success: false,
        error:
          error instanceof Error
            ? error.message
            : 'Failed to get webhook stats',
      });
    }
  }

  /**
   * Get supported event types
   */
  async getSupportedEventTypes(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const eventTypes = this.webhookService.getSupportedEventTypes();

      reply.send({
        success: true,
        data: {
          eventTypes: eventTypes.map((type) => ({
            type,
            description: this.getEventTypeDescription(type),
          })),
        },
      });
    } catch (error) {
      logger.error('Error getting supported event types', {
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      reply.code(500).send({
        success: false,
        error: 'Failed to get supported event types',
      });
    }
  }

  /**
   * List recent events
   */
  async listEvents(
    request: FastifyRequest<{
      Querystring: {
        eventType?: string;
        startDate?: string;
        endDate?: string;
        limit?: string;
        offset?: string;
      };
    }>,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;
      if (!userId) {
        reply.code(401).send({ error: 'Unauthorized' });
        return;
      }

      const query = {
        userId,
        eventType: request.query.eventType,
        startDate: request.query.startDate
          ? new Date(request.query.startDate)
          : undefined,
        endDate: request.query.endDate
          ? new Date(request.query.endDate)
          : undefined,
        limit: request.query.limit
          ? parseInt(request.query.limit, 10)
          : undefined,
        offset: request.query.offset
          ? parseInt(request.query.offset, 10)
          : undefined,
      };

      const result = await this.eventPublisher.listEvents(query);

      reply.send({
        success: true,
        data: {
          events: result.events.map((event) => ({
            id: event.id,
            type: event.type,
            data: event.data,
            timestamp: event.timestamp,
            metadata: event.metadata,
          })),
          total: result.total,
          limit: query.limit || 50,
          offset: query.offset || 0,
        },
      });
    } catch (error) {
      logger.error('Error listing events', {
        userId: request.user?.id,
        error: error instanceof Error ? error.message : 'Unknown error',
        correlationId: request.correlationId,
      });

      reply.code(400).send({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to list events',
      });
    }
  }

  /**
   * Get event type description
   */
  private getEventTypeDescription(eventType: string): string {
    const descriptions: Record<string, string> = {
      'authentication.login.success': 'User successfully logged in',
      'authentication.login.failure': 'User login attempt failed',
      'authentication.logout': 'User logged out',
      'authentication.token.refresh': 'Authentication token was refreshed',
      'authentication.token.revoke': 'Authentication token was revoked',
      'authentication.mfa.challenge': 'MFA challenge was initiated',
      'authentication.mfa.success': 'MFA challenge completed successfully',
      'authentication.mfa.failure': 'MFA challenge failed',
      'authentication.password.change': 'User password was changed',
      'authentication.password.reset': 'User password was reset',
      'authorization.access.granted': 'Access was granted to a resource',
      'authorization.access.denied': 'Access was denied to a resource',
      'security.high_risk.detected': 'High-risk activity was detected',
      'security.rate_limit.exceeded': 'Rate limit was exceeded',
      'security.validation.failed': 'Security validation failed',
      'security.suspicious.activity': 'Suspicious activity was detected',
      'session.created': 'New session was created',
      'session.expired': 'Session expired',
      'session.revoked': 'Session was revoked',
      'user.created': 'New user account was created',
      'user.updated': 'User account was updated',
      'user.deleted': 'User account was deleted',
      'admin.action': 'Administrative action was performed',
      'system.error': 'System error occurred',
    };

    return descriptions[eventType] || 'Unknown event type';
  }
}
