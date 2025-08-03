/**
 * Webhook Delivery Repository Implementation using Prisma
 * Handles webhook delivery attempt persistence and queries
 */

import { PrismaClient } from '../../../generated/prisma';
import {
  IWebhookDeliveryRepository,
  DeliveryAttemptQuery,
} from '../../../application/interfaces/webhook.interface';
import { WebhookDeliveryAttempt } from '../../../domain/entities/webhook';
import { logger } from '../../logging/winston-logger';

export class WebhookDeliveryRepository implements IWebhookDeliveryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Save delivery attempt
   */
  async save(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryAttempt> {
    try {
      const data = {
        id: attempt.id,
        webhookId: attempt.webhookId,
        eventId: attempt.eventId,
        attempt: attempt.attempt,
        status: attempt.status,
        httpStatus: attempt.httpStatus,
        responseBody: attempt.responseBody,
        errorMessage: attempt.errorMessage,
        deliveredAt: attempt.deliveredAt,
        nextRetryAt: attempt.nextRetryAt,
        createdAt: attempt.createdAt,
      };

      const saved = await this.prisma.webhookDeliveryAttempt.create({ data });
      return this.mapToEntity(saved);
    } catch (error) {
      logger.error('Error saving webhook delivery attempt', {
        attemptId: attempt.id,
        webhookId: attempt.webhookId,
        eventId: attempt.eventId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Update delivery attempt
   */
  async update(
    id: string,
    updates: Partial<WebhookDeliveryAttempt>
  ): Promise<WebhookDeliveryAttempt> {
    try {
      const updateData: any = {};

      if (updates.status) updateData.status = updates.status;
      if (updates.httpStatus) updateData.httpStatus = updates.httpStatus;
      if (updates.responseBody) updateData.responseBody = updates.responseBody;
      if (updates.errorMessage) updateData.errorMessage = updates.errorMessage;
      if (updates.deliveredAt) updateData.deliveredAt = updates.deliveredAt;
      if (updates.nextRetryAt) updateData.nextRetryAt = updates.nextRetryAt;

      const updated = await this.prisma.webhookDeliveryAttempt.update({
        where: { id },
        data: updateData,
      });

      return this.mapToEntity(updated);
    } catch (error) {
      logger.error('Error updating webhook delivery attempt', {
        attemptId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find delivery attempts with query
   */
  async findWithQuery(query: DeliveryAttemptQuery): Promise<{
    attempts: WebhookDeliveryAttempt[];
    total: number;
  }> {
    try {
      const where: any = {};

      if (query.webhookId) where.webhookId = query.webhookId;
      if (query.eventId) where.eventId = query.eventId;
      if (query.status) where.status = query.status;
      if (query.startDate || query.endDate) {
        where.createdAt = {};
        if (query.startDate) where.createdAt.gte = query.startDate;
        if (query.endDate) where.createdAt.lte = query.endDate;
      }

      const [attempts, total] = await Promise.all([
        this.prisma.webhookDeliveryAttempt.findMany({
          where,
          orderBy: { createdAt: 'desc' },
          skip: query.offset || 0,
          take: query.limit || 50,
          include: {
            webhook: {
              select: {
                name: true,
                url: true,
              },
            },
            event: {
              select: {
                type: true,
                timestamp: true,
              },
            },
          },
        }),
        this.prisma.webhookDeliveryAttempt.count({ where }),
      ]);

      return {
        attempts: attempts.map((attempt) => this.mapToEntity(attempt)),
        total,
      };
    } catch (error) {
      logger.error('Error finding webhook delivery attempts with query', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find pending deliveries ready for retry
   */
  async findPendingRetries(): Promise<WebhookDeliveryAttempt[]> {
    try {
      const now = new Date();

      const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
        where: {
          status: 'pending',
          nextRetryAt: {
            lte: now,
          },
        },
        orderBy: { nextRetryAt: 'asc' },
        take: 100, // Limit to prevent overwhelming the system
      });

      return attempts.map((attempt) => this.mapToEntity(attempt));
    } catch (error) {
      logger.error('Error finding pending retries', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find failed deliveries for dead letter queue
   */
  async findFailedDeliveries(
    webhookId?: string
  ): Promise<WebhookDeliveryAttempt[]> {
    try {
      const where: any = {
        status: 'failed',
        nextRetryAt: null, // No more retries scheduled
      };

      if (webhookId) {
        where.webhookId = webhookId;
      }

      const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: 1000, // Limit for performance
      });

      return attempts.map((attempt) => this.mapToEntity(attempt));
    } catch (error) {
      logger.error('Error finding failed deliveries', {
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete old delivery attempts
   */
  async deleteOldAttempts(olderThan: Date): Promise<number> {
    try {
      const result = await this.prisma.webhookDeliveryAttempt.deleteMany({
        where: {
          createdAt: {
            lt: olderThan,
          },
          status: {
            in: ['success', 'failed'],
          },
        },
      });

      logger.info('Deleted old webhook delivery attempts', {
        deletedCount: result.count,
        olderThan,
      });

      return result.count;
    } catch (error) {
      logger.error('Error deleting old delivery attempts', {
        olderThan,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Cancel pending deliveries for webhook
   */
  async cancelPendingDeliveries(webhookId: string): Promise<number> {
    try {
      const result = await this.prisma.webhookDeliveryAttempt.updateMany({
        where: {
          webhookId,
          status: 'pending',
        },
        data: {
          status: 'failed',
          errorMessage: 'Cancelled due to webhook deletion',
          nextRetryAt: null,
        },
      });

      logger.info('Cancelled pending deliveries for webhook', {
        webhookId,
        cancelledCount: result.count,
      });

      return result.count;
    } catch (error) {
      logger.error('Error cancelling pending deliveries', {
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get delivery statistics
   */
  async getDeliveryStats(webhookId?: string): Promise<{
    totalAttempts: number;
    successfulAttempts: number;
    failedAttempts: number;
    pendingAttempts: number;
    averageResponseTime: number;
  }> {
    try {
      const where: any = {};
      if (webhookId) where.webhookId = webhookId;

      const [
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        pendingAttempts,
      ] = await Promise.all([
        this.prisma.webhookDeliveryAttempt.count({ where }),
        this.prisma.webhookDeliveryAttempt.count({
          where: { ...where, status: 'success' },
        }),
        this.prisma.webhookDeliveryAttempt.count({
          where: { ...where, status: 'failed' },
        }),
        this.prisma.webhookDeliveryAttempt.count({
          where: { ...where, status: 'pending' },
        }),
      ]);

      // Calculate average response time (would need to add responseTime field)
      const averageResponseTime = 0; // Placeholder

      return {
        totalAttempts,
        successfulAttempts,
        failedAttempts,
        pendingAttempts,
        averageResponseTime,
      };
    } catch (error) {
      logger.error('Error getting delivery stats', {
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get recent delivery attempts for a webhook
   */
  async getRecentAttempts(
    webhookId: string,
    limit: number = 10
  ): Promise<WebhookDeliveryAttempt[]> {
    try {
      const attempts = await this.prisma.webhookDeliveryAttempt.findMany({
        where: { webhookId },
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: {
          event: {
            select: {
              type: true,
              timestamp: true,
            },
          },
        },
      });

      return attempts.map((attempt) => this.mapToEntity(attempt));
    } catch (error) {
      logger.error('Error getting recent delivery attempts', {
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Map database record to domain entity
   */
  private mapToEntity(record: any): WebhookDeliveryAttempt {
    return {
      id: record.id,
      webhookId: record.webhookId,
      eventId: record.eventId,
      attempt: record.attempt,
      status: record.status,
      httpStatus: record.httpStatus,
      responseBody: record.responseBody,
      errorMessage: record.errorMessage,
      deliveredAt: record.deliveredAt,
      nextRetryAt: record.nextRetryAt,
      createdAt: record.createdAt,
    };
  }
}
