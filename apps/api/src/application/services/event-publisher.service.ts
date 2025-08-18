/**
 * Event Publisher Service
 * Publishes authentication events to registered webhooks and manages event streaming
 */

import {
  IEventPublisher,
  IWebhookRepository,
  IWebhookEventRepository,
  IWebhookDeliveryService,
} from '../interfaces/webhook.interface';
import { WebhookEvent } from "@company/shared"entities/webhook';
import { logger } from '@company/logger';
import { EventEmitter } from 'events';

export interface EventStreamSubscription {
  id: string;
  userId: string;
  eventTypes: string[];
  callback: (event: WebhookEvent) => void;
  createdAt: Date;
}

export class EventPublisherService
  extends EventEmitter
  implements IEventPublisher
{
  private readonly eventStreams = new Map<string, EventStreamSubscription>();
  private readonly publishQueue: WebhookEvent[] = [];
  private isProcessingQueue = false;

  constructor(
    private readonly webhookRepository: IWebhookRepository,
    private readonly eventRepository: IWebhookEventRepository,
    private readonly deliveryService: IWebhookDeliveryService
  ) {
    super();
    this.startBackgroundProcessing();
  }

  /**
   * Publish an event to all matching webhooks
   */
  async publishEvent(event: WebhookEvent): Promise<void> {
    try {
      // Save event to repository
      await this.eventRepository.save(event);

      // Add to processing queue
      this.publishQueue.push(event);

      // Emit to real-time subscribers
      this.emitToStreams(event);

      logger.info('Event published', {
        eventId: event.id,
        eventType: event.type,
        userId: event.userId,
        correlationId: event.correlationId,
      });
    } catch (error) {
      logger.error('Error publishing event', {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Publish multiple events in batch
   */
  async publishEvents(events: WebhookEvent[]): Promise<void> {
    const publishPromises = events.map((event) => this.publishEvent(event));
    await Promise.allSettled(publishPromises);

    const successCount = publishPromises.length;
    logger.info('Batch events published', {
      totalEvents: events.length,
      successCount,
    });
  }

  /**
   * Get event by ID
   */
  async getEvent(eventId: string): Promise<WebhookEvent | null> {
    return this.eventRepository.findById(eventId);
  }

  /**
   * List recent events
   */
  async listEvents(query: {
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
    return this.eventRepository.findWithQuery(query);
  }

  /**
   * Subscribe to real-time event stream
   */
  subscribeToEventStream(
    userId: string,
    eventTypes: string[],
    callback: (event: WebhookEvent) => void
  ): string {
    const subscriptionId = this.generateSubscriptionId();

    const subscription: EventStreamSubscription = {
      id: subscriptionId,
      userId,
      eventTypes,
      callback,
      createdAt: new Date(),
    };

    this.eventStreams.set(subscriptionId, subscription);

    logger.info('Event stream subscription created', {
      subscriptionId,
      userId,
      eventTypes,
    });

    return subscriptionId;
  }

  /**
   * Unsubscribe from event stream
   */
  unsubscribeFromEventStream(subscriptionId: string): boolean {
    const subscription = this.eventStreams.get(subscriptionId);
    if (!subscription) {
      return false;
    }

    this.eventStreams.delete(subscriptionId);

    logger.info('Event stream subscription removed', {
      subscriptionId,
      userId: subscription.userId,
    });

    return true;
  }

  /**
   * Get active event stream subscriptions
   */
  getActiveSubscriptions(userId?: string): EventStreamSubscription[] {
    const subscriptions = Array.from(this.eventStreams.values());

    if (userId) {
      return subscriptions.filter((sub) => sub.userId === userId);
    }

    return subscriptions;
  }

  /**
   * Create event from audit event
   */
  createEventFromAudit(auditEvent: any): WebhookEvent {
    return WebhookEvent.fromAuditEvent(auditEvent);
  }

  /**
   * Publish authentication event
   */
  async publishAuthEvent(
    eventType: string,
    data: Record<string, any>,
    userId?: string,
    sessionId?: string,
    correlationId?: string
  ): Promise<void> {
    const event = new WebhookEvent(
      this.generateEventId(),
      eventType,
      data,
      userId,
      sessionId,
      new Date(),
      {},
      correlationId
    );

    await this.publishEvent(event);
  }

  /**
   * Start background processing
   */
  private startBackgroundProcessing(): void {
    // Process publish queue every 2 seconds
    setInterval(() => {
      if (!this.isProcessingQueue && this.publishQueue.length > 0) {
        this.processPublishQueue();
      }
    }, 2000);

    // Clean up old events every hour
    setInterval(() => {
      this.cleanupOldEvents().catch((error) => {
        logger.error('Error cleaning up old events', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, 3600000); // 1 hour
  }

  /**
   * Process the publish queue
   */
  private async processPublishQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.publishQueue.length > 0) {
        const event = this.publishQueue.shift()!;
        await this.processEventDelivery(event);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Process event delivery to webhooks
   */
  private async processEventDelivery(event: WebhookEvent): Promise<void> {
    try {
      // Find all active webhooks that should receive this event
      const webhooks = await this.webhookRepository.findActiveWebhooksForEvent(
        event.type
      );

      if (webhooks.length === 0) {
        logger.debug('No webhooks found for event', {
          eventId: event.id,
          eventType: event.type,
        });
        return;
      }

      // Deliver to each webhook
      const deliveryPromises = webhooks.map((webhook) => {
        if (webhook.shouldReceiveEvent(event.type)) {
          return this.deliveryService.deliverEvent(webhook, event);
        }
        return Promise.resolve();
      });

      const results = await Promise.allSettled(deliveryPromises);

      const successCount = results.filter(
        (result) => result.status === 'fulfilled'
      ).length;

      logger.info('Event delivered to webhooks', {
        eventId: event.id,
        eventType: event.type,
        totalWebhooks: webhooks.length,
        successCount,
        failureCount: webhooks.length - successCount,
      });
    } catch (error) {
      logger.error('Error processing event delivery', {
        eventId: event.id,
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Emit event to real-time streams
   */
  private emitToStreams(event: WebhookEvent): void {
    for (const subscription of this.eventStreams.values()) {
      // Check if user should receive this event
      if (event.userId && event.userId !== subscription.userId) {
        continue;
      }

      // Check if event type matches subscription
      const shouldReceive = subscription.eventTypes.some((pattern) => {
        if (pattern === '*') return true;
        if (pattern.endsWith('*')) {
          const prefix = pattern.slice(0, -1);
          return event.type.startsWith(prefix);
        }
        return pattern === event.type;
      });

      if (shouldReceive) {
        try {
          subscription.callback(event);
        } catch (error) {
          logger.error('Error in event stream callback', {
            subscriptionId: subscription.id,
            eventId: event.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    }

    // Emit to EventEmitter listeners
    this.emit('event', event);
    this.emit(event.type, event);
  }

  /**
   * Clean up old events
   */
  private async cleanupOldEvents(): Promise<void> {
    const cutoffDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago

    try {
      const deletedCount =
        await this.eventRepository.deleteOldEvents(cutoffDate);

      if (deletedCount > 0) {
        logger.info('Cleaned up old events', {
          deletedCount,
          cutoffDate,
        });
      }
    } catch (error) {
      logger.error('Error cleaning up old events', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
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
   * Generate unique subscription ID
   */
  private generateSubscriptionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `sub_${timestamp}_${random}`;
  }

  /**
   * Get publisher statistics
   */
  getStats(): {
    queueLength: number;
    activeSubscriptions: number;
    totalEventsPublished: number;
    eventsPublishedToday: number;
  } {
    // This would require tracking in a more persistent way
    // For now, return current state
    return {
      queueLength: this.publishQueue.length,
      activeSubscriptions: this.eventStreams.size,
      totalEventsPublished: 0, // Would need to track this
      eventsPublishedToday: 0, // Would need to track this
    };
  }

  /**
   * Health check for publisher service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    queueLength: number;
    activeSubscriptions: number;
    lastEventPublished?: Date;
  }> {
    return {
      healthy: this.publishQueue.length < 10000, // Consider unhealthy if queue is too large
      queueLength: this.publishQueue.length,
      activeSubscriptions: this.eventStreams.size,
      // lastEventPublished would need to be tracked
    };
  }
}

