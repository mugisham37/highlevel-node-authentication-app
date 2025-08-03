/**
 * Webhook Event Repository Implementation using Prisma
 * Handles webhook event persistence and queries
 */

import { PrismaClient } from '../../../generated/prisma';
import { IWebhookEventRepository } from '../../../application/interfaces/webhook.interface';
import { WebhookEvent } from '../../../domain/entities/webhook';
import { logger } from '../../logging/winston-logger';

export class WebhookEventRepository implements IWebhookEventRepository {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Save event
   */
  async save(event: WebhookEvent): Promise<WebhookEvent> {
    try {
      const data = {
        id: event.id,
        type: event.type,
        data: event.data,
        userId: event.userId,
        sessionId: event.sessionId,
        timestamp: event.timestamp,
        metadata: event.metadata,
        correlationId: event.correlationId,
      };

      const saved = await this.prisma.webhookEvent.create({ data });
      return this.mapToEntity(saved);
    } catch (error) {
      logger.error('Error saving webhook event', {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find event by ID
   */
  async findById(id: string): Promise<WebhookEvent | null> {
    try {
      const event = await this.prisma.webhookEvent.findUnique({
        where: { id },
      });

      return event ? this.mapToEntity(event) : null;
    } catch (error) {
      logger.error('Error finding webhook event by ID', {
        eventId: id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find events with query
   */
  async findWithQuery(query: {
    userId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: WebhookEvent[];
    total: number;
  }> {
    try {
      const where: any = {};

      if (query.userId) where.userId = query.userId;
      if (query.eventType) where.type = query.eventType;
      if (query.startDate || query.endDate) {
        where.timestamp = {};
        if (query.startDate) where.timestamp.gte = query.startDate;
        if (query.endDate) where.timestamp.lte = query.endDate;
      }

      const [events, total] = await Promise.all([
        this.prisma.webhookEvent.findMany({
          where,
          orderBy: { timestamp: 'desc' },
          skip: query.offset || 0,
          take: query.limit || 50,
        }),
        this.prisma.webhookEvent.count({ where }),
      ]);

      return {
        events: events.map((event) => this.mapToEntity(event)),
        total,
      };
    } catch (error) {
      logger.error('Error finding webhook events with query', {
        query,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Delete old events (cleanup)
   */
  async deleteOldEvents(olderThan: Date): Promise<number> {
    try {
      const result = await this.prisma.webhookEvent.deleteMany({
        where: {
          timestamp: {
            lt: olderThan,
          },
        },
      });

      logger.info('Deleted old webhook events', {
        deletedCount: result.count,
        olderThan,
      });

      return result.count;
    } catch (error) {
      logger.error('Error deleting old webhook events', {
        olderThan,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get event statistics
   */
  async getStats(): Promise<{
    totalEvents: number;
    eventsToday: number;
    eventsByType: Record<string, number>;
    recentEvents: WebhookEvent[];
  }> {
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      const [totalEvents, eventsToday, eventTypeStats, recentEvents] =
        await Promise.all([
          this.prisma.webhookEvent.count(),
          this.prisma.webhookEvent.count({
            where: {
              timestamp: { gte: today },
            },
          }),
          this.prisma.webhookEvent.groupBy({
            by: ['type'],
            _count: { type: true },
            orderBy: { _count: { type: 'desc' } },
            take: 10,
          }),
          this.prisma.webhookEvent.findMany({
            orderBy: { timestamp: 'desc' },
            take: 10,
          }),
        ]);

      const eventsByType: Record<string, number> = {};
      eventTypeStats.forEach((stat) => {
        eventsByType[stat.type] = stat._count.type;
      });

      return {
        totalEvents,
        eventsToday,
        eventsByType,
        recentEvents: recentEvents.map((event) => this.mapToEntity(event)),
      };
    } catch (error) {
      logger.error('Error getting webhook event stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Find events by correlation ID
   */
  async findByCorrelationId(correlationId: string): Promise<WebhookEvent[]> {
    try {
      const events = await this.prisma.webhookEvent.findMany({
        where: { correlationId },
        orderBy: { timestamp: 'asc' },
      });

      return events.map((event) => this.mapToEntity(event));
    } catch (error) {
      logger.error('Error finding events by correlation ID', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Map database record to domain entity
   */
  private mapToEntity(record: any): WebhookEvent {
    return new WebhookEvent(
      record.id,
      record.type,
      record.data,
      record.userId,
      record.sessionId,
      record.timestamp,
      record.metadata || {},
      record.correlationId
    );
  }
}
