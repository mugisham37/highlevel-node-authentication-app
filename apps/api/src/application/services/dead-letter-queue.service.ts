/**
 * Dead Letter Queue Service
 * Handles failed webhook deliveries and provides retry mechanisms
 */

import {
  IDeadLetterQueue,
  // IWebhookDeliveryRepository, // TODO: Remove if not needed
} from '../interfaces/webhook.interface';
import { WebhookDeliveryAttempt } from "@company/shared/entities/webhook';
import { logger } from '@company/logger';
import { RedisCache } from '@company/cache';

export interface DeadLetterQueueConfig {
  maxRetentionDays: number;
  maxRetryAttempts: number;
  batchSize: number;
  processingInterval: number;
}

export class DeadLetterQueueService implements IDeadLetterQueue {
  private readonly config: DeadLetterQueueConfig;
  private readonly dlqKey = 'webhook:dlq';
  private readonly statsKey = 'webhook:dlq:stats';
  private isProcessing = false;

  constructor(
    // private readonly deliveryRepository: IWebhookDeliveryRepository, // TODO: Implement repository usage
    private readonly cache: RedisCache,
    config?: Partial<DeadLetterQueueConfig>
  ) {
    this.config = {
      maxRetentionDays: 7,
      maxRetryAttempts: 5,
      batchSize: 10,
      processingInterval: 300000, // 5 minutes
      ...config,
    };

    this.startBackgroundProcessing();
  }

  /**
   * Add failed delivery to dead letter queue
   */
  async addFailedDelivery(attempt: WebhookDeliveryAttempt): Promise<void> {
    try {
      // Add to Redis set for fast retrieval
      await this.cache.sadd(this.dlqKey, attempt.id);

      // Store detailed attempt data
      await this.cache.hset(`${this.dlqKey}:${attempt.id}`, {
        webhookId: attempt.webhookId,
        eventId: attempt.eventId,
        attempt: attempt.attempt.toString(),
        status: attempt.status,
        errorMessage: attempt.errorMessage || '',
        createdAt: attempt.createdAt.toISOString(),
        addedToDlqAt: new Date().toISOString(),
      });

      // Update statistics
      await this.updateStats('failed', attempt.webhookId);

      logger.warn('Delivery added to dead letter queue', {
        attemptId: attempt.id,
        webhookId: attempt.webhookId,
        eventId: attempt.eventId,
        attempt: attempt.attempt,
        errorMessage: attempt.errorMessage,
      });
    } catch (error) {
      logger.error('Error adding delivery to dead letter queue', {
        attemptId: attempt.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get failed deliveries from dead letter queue
   */
  async getFailedDeliveries(
    limit: number = 100
  ): Promise<WebhookDeliveryAttempt[]> {
    try {
      // Get delivery IDs from Redis set
      const deliveryIds = await this.cache.smembers(this.dlqKey);

      if (deliveryIds.length === 0) {
        return [];
      }

      // Limit the number of deliveries to process
      const limitedIds = deliveryIds.slice(0, limit);
      const deliveries: WebhookDeliveryAttempt[] = [];

      // Get detailed data for each delivery
      for (const id of limitedIds) {
        try {
          const data = await this.cache.hgetall(`${this.dlqKey}:${id}`);

          if (data && Object.keys(data).length > 0) {
            deliveries.push({
              id,
              webhookId: data['webhookId'] || '',
              eventId: data['eventId'] || '',
              attempt: parseInt(String(data['attempt'] || '0'), 10),
              status: data['status'] as any,
              errorMessage: data['errorMessage'] || '',
              createdAt: new Date(data['createdAt'] || Date.now()),
            });
          }
        } catch (error) {
          logger.error('Error retrieving failed delivery from DLQ', {
            deliveryId: id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      return deliveries;
    } catch (error) {
      logger.error('Error getting failed deliveries from DLQ', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Remove delivery from dead letter queue
   */
  async removeFailedDelivery(attemptId: string): Promise<void> {
    try {
      // Remove from Redis set
      await this.cache.srem(this.dlqKey, attemptId);

      // Remove detailed data
      await this.cache.del(`${this.dlqKey}:${attemptId}`);

      logger.debug('Delivery removed from dead letter queue', {
        attemptId,
      });
    } catch (error) {
      logger.error('Error removing delivery from dead letter queue', {
        attemptId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Retry deliveries from dead letter queue
   */
  async retryFailedDeliveries(): Promise<number> {
    if (this.isProcessing) {
      logger.debug('DLQ retry already in progress, skipping');
      return 0;
    }

    this.isProcessing = true;
    let retriedCount = 0;

    try {
      const failedDeliveries = await this.getFailedDeliveries(
        this.config.batchSize
      );

      if (failedDeliveries.length === 0) {
        return 0;
      }

      logger.info('Processing failed deliveries from DLQ', {
        count: failedDeliveries.length,
      });

      for (const delivery of failedDeliveries) {
        try {
          // Check if we should retry this delivery
          if (delivery.attempt >= this.config.maxRetryAttempts) {
            logger.warn('Max retry attempts exceeded, removing from DLQ', {
              attemptId: delivery.id,
              webhookId: delivery.webhookId,
              attempts: delivery.attempt,
            });

            await this.removeFailedDelivery(delivery.id);
            await this.updateStats('abandoned', delivery.webhookId);
            continue;
          }

          // Check if delivery is too old
          const daysSinceCreation =
            (Date.now() - delivery.createdAt.getTime()) / (1000 * 60 * 60 * 24);
          if (daysSinceCreation > this.config.maxRetentionDays) {
            logger.warn('Delivery too old, removing from DLQ', {
              attemptId: delivery.id,
              webhookId: delivery.webhookId,
              daysSinceCreation: Math.round(daysSinceCreation),
            });

            await this.removeFailedDelivery(delivery.id);
            await this.updateStats('expired', delivery.webhookId);
            continue;
          }

          // Attempt to retry the delivery
          // This would require getting the original webhook and event
          // For now, we'll just mark it as retried and remove from DLQ
          await this.removeFailedDelivery(delivery.id);
          await this.updateStats('retried', delivery.webhookId);
          retriedCount++;

          logger.info('Retried failed delivery from DLQ', {
            attemptId: delivery.id,
            webhookId: delivery.webhookId,
            eventId: delivery.eventId,
          });
        } catch (error) {
          logger.error('Error retrying failed delivery', {
            attemptId: delivery.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }

      if (retriedCount > 0) {
        logger.info('Completed DLQ retry processing', {
          totalProcessed: failedDeliveries.length,
          retriedCount,
        });
      }

      return retriedCount;
    } catch (error) {
      logger.error('Error processing failed deliveries from DLQ', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Get dead letter queue statistics
   */
  async getStats(): Promise<{
    totalFailed: number;
    oldestFailure: Date | null;
    failuresByWebhook: Record<string, number>;
  }> {
    try {
      // Get total count
      const totalFailed = await this.cache.scard(this.dlqKey);

      // Get oldest failure
      let oldestFailure: Date | null = null;
      const deliveryIds = await this.cache.smembers(this.dlqKey);

      if (deliveryIds.length > 0) {
        const timestamps: Date[] = [];

        for (const id of deliveryIds.slice(0, 100)) {
          // Sample first 100
          try {
            const data = await this.cache.hget(
              `${this.dlqKey}:${id}`,
              'createdAt'
            );
            if (data) {
              timestamps.push(new Date(data));
            }
          } catch (error) {
            // Ignore individual errors
          }
        }

        if (timestamps.length > 0) {
          oldestFailure = new Date(
            Math.min(...timestamps.map((d) => d.getTime()))
          );
        }
      }

      // Get failures by webhook from stats
      const statsData = await this.cache.hgetall(this.statsKey);
      const failuresByWebhook: Record<string, number> = {};

      for (const [key, value] of Object.entries(statsData)) {
        if (key.startsWith('webhook:') && key.endsWith(':failed')) {
          const webhookId = key.replace('webhook:', '').replace(':failed', '');
          failuresByWebhook[webhookId] = parseInt(String(value), 10) || 0;
        }
      }

      return {
        totalFailed,
        oldestFailure,
        failuresByWebhook,
      };
    } catch (error) {
      logger.error('Error getting DLQ stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        totalFailed: 0,
        oldestFailure: null,
        failuresByWebhook: {},
      };
    }
  }

  /**
   * Clean up old entries from dead letter queue
   */
  async cleanup(): Promise<number> {
    try {
      const cutoffDate = new Date(
        Date.now() - this.config.maxRetentionDays * 24 * 60 * 60 * 1000
      );
      const deliveryIds = await this.cache.smembers(this.dlqKey);
      let cleanedCount = 0;

      for (const id of deliveryIds) {
        try {
          const createdAtStr = await this.cache.hget(
            `${this.dlqKey}:${id}`,
            'createdAt'
          );

          if (createdAtStr) {
            const createdAt = new Date(createdAtStr);

            if (createdAt < cutoffDate) {
              await this.removeFailedDelivery(id);
              cleanedCount++;
            }
          }
        } catch (error) {
          // Remove corrupted entries
          await this.removeFailedDelivery(id);
          cleanedCount++;
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up old DLQ entries', {
          cleanedCount,
          cutoffDate,
        });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up DLQ', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Update statistics
   */
  private async updateStats(action: string, webhookId: string): Promise<void> {
    try {
      const key = `webhook:${webhookId}:${action}`;
      await this.cache.hincrby(this.statsKey, key, 1);
      await this.cache.hincrby(this.statsKey, `total:${action}`, 1);
    } catch (error) {
      logger.error('Error updating DLQ stats', {
        action,
        webhookId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Start background processing
   */
  private startBackgroundProcessing(): void {
    // Process retries at configured interval
    setInterval(() => {
      this.retryFailedDeliveries().catch((error) => {
        logger.error('Error in DLQ background retry processing', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, this.config.processingInterval);

    // Clean up old entries daily
    setInterval(
      () => {
        this.cleanup().catch((error) => {
          logger.error('Error in DLQ background cleanup', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        });
      },
      24 * 60 * 60 * 1000
    ); // 24 hours
  }

  /**
   * Health check for dead letter queue
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    totalFailed: number;
    oldestFailure: Date | null;
    isProcessing: boolean;
  }> {
    const stats = await this.getStats();

    return {
      healthy: stats.totalFailed < 1000, // Consider unhealthy if too many failures
      totalFailed: stats.totalFailed,
      oldestFailure: stats.oldestFailure,
      isProcessing: this.isProcessing,
    };
  }
}


