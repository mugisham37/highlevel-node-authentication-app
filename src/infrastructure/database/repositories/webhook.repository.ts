/**
 * Webhook Repository Implementation using Prisma
 * Handles webhook persistence and complex queries
 */

import { PrismaClient } from '../../../generated/prisma';
import {
  IWebhookRepository,
  WebhookQuery,
} from '../../../application/interfaces/webhook.interface';
import { Webhook, WebhookConfig } from '../../../domain/entities/webhook';
import { logger } from '../../logging/winston-logger';

export class WebhookRepository implements IWebhookRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Save webhook
   */
  async save(webhook: Webhook): Promise<Webhook> {
    try {
      const data = {
        id: webhook.id,
        userId: webhook.userId,
        name: webhook.name,
        description: webhook.description,
        url: webhook.config.url,
        secret: webhook.config.secret,
        events: webhook.config.events,
        active: webhook.config.active,
        headers: webhook.config.headers || {},
        timeout: webhook.config.timeout,
        retryConfig: webhook.config.retryConfig,
        totalDeliveries: webhook.deliveryStats.totalDeliveries,
        successfulDeliveries: webhook.deliveryStats.successfulDeliveries,
        failedDeliveries: webhook.deliveryStats.failedDeliveries,
        averageResponseTime: webhook.deliveryStats.averageResponseTime,
        lastDeliveryAt: webhook.lastDeliveryAt,
        createdAt: webhook.createdAt,
        updatedAt: webhook.updatedAt,
      };

      const saved = await this.prisma.webhook.create({ data });
      return this.mapToEntity(saved);
    } catch (error) {
      logger.error('Error saving webhook', {
        webhookId: webhook.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find webhook by ID
   */
  async findById(id: string): Promise<Webhook | null> {
    try {
      const webhook = await this.prisma.webhook.findUnique({
        where: { id },
      });

      return webhook ? this.mapToEntity(webhook) : null;
    } catch (error) {
      logger.error('Error finding webhook by ID', {
        webhookId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find webhooks by user ID
   */
  async findByUserId(userId: string): Promise<Webhook[]> {
    try {
      const webhooks = await this.prisma.webhook.findMany({
        where: { userId },
        orderBy: { createdAt: 'desc' },
      });

      return webhooks.map((webhook) => this.mapToEntity(webhook));
    } catch (error) {
      logger.error('Error finding webhooks by user ID', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find active webhooks that should receive an event
   */
  async findActiveWebhooksForEvent(eventType: string): Promise<Webhook[]> {
    try {
      const webhooks = await this.prisma.webhook.findMany({
        where: {
          active: true,
          OR: [
            { events: { has: '*' } }, // Wildcard subscription
            { events: { has: eventType } }, // Exact match
            // Pattern matching for events ending with '*'
            ...this.buildEventPatternQueries(eventType),
          ],
        },
      });

      return webhooks
        .map((webhook) => this.mapToEntity(webhook))
        .filter((webhook) => webhook.shouldReceiveEvent(eventType));
    } catch (error) {
      logger.error('Error finding active webhooks for event', {
        eventType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update webhook
   */
  async update(id: string, updates: Partial<Webhook>): Promise<Webhook> {
    try {
      const updateData: any = {};

      if (updates.name) updateData.name = updates.name;
      if (updates.description) updateData.description = updates.description;
      if (updates.config) {
        updateData.url = updates.config.url;
        updateData.secret = updates.config.secret;
        updateData.events = updates.config.events;
        updateData.active = updates.config.active;
        updateData.headers = updates.config.headers;
        updateData.timeout = updates.config.timeout;
        updateData.retryConfig = updates.config.retryConfig;
      }
      if (updates.deliveryStats) {
        updateData.totalDeliveries = updates.deliveryStats.totalDeliveries;
        updateData.successfulDeliveries =
          updates.deliveryStats.successfulDeliveries;
        updateData.failedDeliveries = updates.deliveryStats.failedDeliveries;
        updateData.averageResponseTime =
          updates.deliveryStats.averageResponseTime;
      }
      if (updates.lastDeliveryAt)
        updateData.lastDeliveryAt = updates.lastDeliveryAt;

      updateData.updatedAt = new Date();

      const updated = await this.prisma.webhook.update({
        where: { id },
        data: updateData,
      });

      return this.mapToEntity(updated);
    } catch (error) {
      logger.error('Error updating webhook', {
        webhookId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete webhook
   */
  async delete(id: string): Promise<void> {
    try {
      await this.prisma.webhook.delete({
        where: { id },
      });
    } catch (error) {
      logger.error('Error deleting webhook', {
        webhookId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find webhooks with query
   */
  async findWithQuery(query: WebhookQuery): Promise<{
    webhooks: Webhook[];
    total: number;
  }> {
    try {
      const where: any = {};

      if (query.userId) where.userId = query.userId;
      if (query.active !== undefined) where.active = query.active;
      if (query.eventType) {
        where.OR = [
          { events: { has: '*' } },
          { events: { has: query.eventType } },
          ...this.buildEventPatternQueries(query.eventType),
        ];
      }

      const [webhooks, total] = await Promise.all([
        this.prisma.webhook.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.offset || 0,
          take: query.limit || 50,
        }),
        this.prisma.webhook.count({ where }),
      ]);

      return {
        webhooks: webhooks.map((webhook) => this.mapToEntity(webhook)),
        total,
      };
    } catch (error) {
      logger.error('Error finding webhooks with query', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Map database record to domain entity
   */
  private mapToEntity(record: any): Webhook {
    const config: WebhookConfig = {
      url: record.url,
      secret: record.secret,
      events: record.events,
      active: record.active,
      headers: record.headers,
      timeout: record.timeout,
      retryConfig: record.retryConfig,
    };

    const deliveryStats = {
      totalDeliveries: record.totalDeliveries,
      successfulDeliveries: record.successfulDeliveries,
      failedDeliveries: record.failedDeliveries,
      averageResponseTime: record.averageResponseTime,
    };

    return new Webhook(
      record.id,
      record.userId,
      record.name,
      record.description,
      config,
      record.createdAt,
      record.updatedAt,
      record.lastDeliveryAt,
      deliveryStats
    );
  }

  /**
   * Build event pattern queries for wildcard matching
   */
  private buildEventPatternQueries(eventType: string): any[] {
    const queries: any[] = [];
    const parts = eventType.split('.');

    // Build patterns like "authentication.*", "authentication.login.*", etc.
    for (let i = 1; i <= parts.length; i++) {
      const pattern = parts.slice(0, i).join('.') + '.*';
      queries.push({ events: { has: pattern } });
    }

    return queries;
  }

  /**
   * Get webhook statistics
   */
  async getStats(): Promise<{
    totalWebhooks: number;
    activeWebhooks: number;
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
  }> {
    try {
      const [totalWebhooks, activeWebhooks, deliveryStats] = await Promise.all([
        this.prisma.webhook.count(),
        this.prisma.webhook.count({ where: { active: true } }),
        this.prisma.webhook.aggregate({
          _sum: {
            totalDeliveries: true,
            successfulDeliveries: true,
            failedDeliveries: true,
          },
        }),
      ]);

      return {
        totalWebhooks,
        activeWebhooks,
        totalDeliveries: deliveryStats._sum.totalDeliveries || 0,
        successfulDeliveries: deliveryStats._sum.successfulDeliveries || 0,
        failedDeliveries: deliveryStats._sum.failedDeliveries || 0,
      };
    } catch (error) {
      logger.error('Error getting webhook stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}
