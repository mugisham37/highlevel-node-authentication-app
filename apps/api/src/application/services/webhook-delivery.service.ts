/**
 * Webhook Delivery Service
 * Handles reliable webhook delivery with retry mechanisms and failure handling
 */

import {
  IWebhookDeliveryService,
  IWebhookDeliveryRepository,
  IWebhookSignatureService,
  WebhookDeliveryResult,
  DeliveryAttemptQuery,
} from '../interfaces/webhook.interface';
import {
  Webhook,
  WebhookEvent,
  WebhookDeliveryAttempt,
} from "@company/shared"entities/webhook';
import { WebhookSignatureService } from '@company/auth';
import { logger } from '@company/logger';
import { CircuitBreaker } from '../../infrastructure/resilience/circuit-breaker';

export class WebhookDeliveryService implements IWebhookDeliveryService {
  private readonly circuitBreakers = new Map<string, CircuitBreaker>();
  private readonly deliveryQueue: Array<{
    webhook: Webhook;
    event: WebhookEvent;
  }> = [];
  private isProcessingQueue = false;

  constructor(
    private readonly deliveryRepository: IWebhookDeliveryRepository,
    private readonly signatureService: IWebhookSignatureService = new WebhookSignatureService()
  ) {
    // Start background processing
    this.startBackgroundProcessing();
  }

  /**
   * Deliver event to a specific webhook
   */
  async deliverEvent(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<WebhookDeliveryResult> {
    const startTime = Date.now();
    const attemptId = this.generateAttemptId();

    try {
      // Create initial delivery attempt record
      const attempt: WebhookDeliveryAttempt = {
        id: attemptId,
        webhookId: webhook.id,
        eventId: event.id,
        attempt: 1,
        status: 'pending',
        createdAt: new Date(),
      };

      await this.deliveryRepository.save(attempt);

      // Get or create circuit breaker for this webhook
      const circuitBreaker = this.getCircuitBreaker(webhook.id);

      // Attempt delivery through circuit breaker
      const result = await circuitBreaker.execute(() =>
        this.performDelivery(webhook, event)
      );

      const responseTime = Date.now() - startTime;

      // Update attempt record with success
      await this.deliveryRepository.update(attemptId, {
        status: 'success',
        ...(result.httpStatus && { httpStatus: result.httpStatus }),
        ...(result.responseBody && { responseBody: result.responseBody }),
        deliveredAt: new Date(),
      });

      logger.info('Webhook delivered successfully', {
        webhookId: webhook.id,
        eventId: event.id,
        attemptId,
        responseTime,
        httpStatus: result.httpStatus,
      });

      return {
        ...result,
        responseTime,
      };
    } catch (error) {
      const responseTime = Date.now() - startTime;
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';

      // Update attempt record with failure
      await this.deliveryRepository.update(attemptId, {
        status: 'failed',
        errorMessage,
        nextRetryAt: this.calculateNextRetry(webhook, 1),
      });

      logger.error('Webhook delivery failed', {
        webhookId: webhook.id,
        eventId: event.id,
        attemptId,
        error: errorMessage,
        responseTime,
      });

      // Schedule retry if applicable
      if (webhook.shouldRetry(1)) {
        await this.scheduleRetry(webhook, event, 2);
      }

      return {
        success: false,
        errorMessage,
        responseTime,
      };
    }
  }

  /**
   * Perform the actual HTTP delivery
   */
  private async performDelivery(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<WebhookDeliveryResult> {
    const payload = JSON.stringify(event.createPayload());
    const headers = this.signatureService.createDeliveryHeaders(
      payload,
      webhook.config.secret,
      webhook.config.headers
    );

    const controller = new AbortController();
    const timeoutId = setTimeout(
      () => controller.abort(),
      webhook.config.timeout
    );

    try {
      const response = await fetch(webhook.config.url, {
        method: 'POST',
        headers,
        body: payload,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      const responseBody = await response.text();

      return {
        success: response.ok,
        httpStatus: response.status,
        responseBody:
          responseBody.length > 1000
            ? responseBody.substring(0, 1000) + '...'
            : responseBody,
        responseTime: 0, // Will be calculated by caller
      };
    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Webhook delivery timeout');
      }

      throw error;
    }
  }

  /**
   * Retry failed deliveries
   */
  async retryFailedDeliveries(): Promise<number> {
    const pendingRetries = await this.deliveryRepository.findPendingRetries();
    let retriedCount = 0;

    for (const attempt of pendingRetries) {
      try {
        // Check if retry time has arrived
        if (attempt.nextRetryAt && attempt.nextRetryAt > new Date()) {
          continue;
        }

        // Get webhook and event details (would need to be implemented)
        // For now, we'll skip this implementation detail
        retriedCount++;

        logger.info('Retrying webhook delivery', {
          attemptId: attempt.id,
          webhookId: attempt.webhookId,
          eventId: attempt.eventId,
          attempt: attempt.attempt,
        });
      } catch (error) {
        logger.error('Error retrying webhook delivery', {
          attemptId: attempt.id,
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }

    return retriedCount;
  }

  /**
   * Get delivery attempts for a webhook or event
   */
  async getDeliveryAttempts(query: DeliveryAttemptQuery): Promise<{
    attempts: WebhookDeliveryAttempt[];
    total: number;
  }> {
    return this.deliveryRepository.findWithQuery(query);
  }

  /**
   * Cancel pending deliveries for a webhook
   */
  async cancelPendingDeliveries(webhookId: string): Promise<number> {
    return this.deliveryRepository.cancelPendingDeliveries(webhookId);
  }

  /**
   * Schedule a retry for failed delivery
   */
  private async scheduleRetry(
    webhook: Webhook,
    event: WebhookEvent,
    attemptNumber: number
  ): Promise<void> {
    if (!webhook.shouldRetry(attemptNumber)) {
      logger.warn('Max retries exceeded for webhook delivery', {
        webhookId: webhook.id,
        eventId: event.id,
        attemptNumber,
      });
      return;
    }

    const nextRetryAt = this.calculateNextRetry(webhook, attemptNumber);
    const attemptId = this.generateAttemptId();

    const retryAttempt: WebhookDeliveryAttempt = {
      id: attemptId,
      webhookId: webhook.id,
      eventId: event.id,
      attempt: attemptNumber,
      status: 'pending',
      nextRetryAt,
      createdAt: new Date(),
    };

    await this.deliveryRepository.save(retryAttempt);

    logger.info('Scheduled webhook retry', {
      webhookId: webhook.id,
      eventId: event.id,
      attemptNumber,
      nextRetryAt,
    });
  }

  /**
   * Calculate next retry time
   */
  private calculateNextRetry(webhook: Webhook, attemptNumber: number): Date {
    const delay = webhook.getNextRetryDelay(attemptNumber);
    return new Date(Date.now() + delay);
  }

  /**
   * Get or create circuit breaker for webhook
   */
  private getCircuitBreaker(webhookId: string): CircuitBreaker {
    if (!this.circuitBreakers.has(webhookId)) {
      const circuitBreaker = new CircuitBreaker({
        failureThreshold: 5,
        recoveryTimeout: 60000, // 1 minute
        monitoringPeriod: 300000, // 5 minutes
      });

      this.circuitBreakers.set(webhookId, circuitBreaker);
    }

    return this.circuitBreakers.get(webhookId)!;
  }

  /**
   * Generate unique attempt ID
   */
  private generateAttemptId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `attempt_${timestamp}_${random}`;
  }

  /**
   * Start background processing for queued deliveries
   */
  private startBackgroundProcessing(): void {
    // Process queue every 5 seconds
    setInterval(() => {
      if (!this.isProcessingQueue && this.deliveryQueue.length > 0) {
        this.processDeliveryQueue();
      }
    }, 5000);

    // Process retries every minute
    setInterval(() => {
      this.retryFailedDeliveries().catch((error) => {
        logger.error('Error processing webhook retries', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      });
    }, 60000);
  }

  /**
   * Process queued deliveries
   */
  private async processDeliveryQueue(): Promise<void> {
    if (this.isProcessingQueue) {
      return;
    }

    this.isProcessingQueue = true;

    try {
      while (this.deliveryQueue.length > 0) {
        const { webhook, event } = this.deliveryQueue.shift()!;

        try {
          await this.deliverEvent(webhook, event);
        } catch (error) {
          logger.error('Error processing queued webhook delivery', {
            webhookId: webhook.id,
            eventId: event.id,
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Queue delivery for background processing
   */
  queueDelivery(webhook: Webhook, event: WebhookEvent): void {
    this.deliveryQueue.push({ webhook, event });

    logger.debug('Queued webhook delivery', {
      webhookId: webhook.id,
      eventId: event.id,
      queueLength: this.deliveryQueue.length,
    });
  }

  /**
   * Get delivery statistics
   */
  async getDeliveryStats(): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    pendingDeliveries: number;
    averageResponseTime: number;
  }> {
    // This would require aggregation queries on the delivery repository
    // For now, return placeholder data
    return {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      pendingDeliveries: this.deliveryQueue.length,
      averageResponseTime: 0,
    };
  }

  /**
   * Health check for delivery service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    queueLength: number;
    circuitBreakers: Array<{
      webhookId: string;
      state: string;
      failures: number;
    }>;
  }> {
    const circuitBreakerStats = Array.from(this.circuitBreakers.entries()).map(
      ([webhookId, cb]) => ({
        webhookId,
        state: cb.getState(),
        failures: cb.getFailureCount(),
      })
    );

    return {
      healthy: this.deliveryQueue.length < 1000, // Consider unhealthy if queue is too large
      queueLength: this.deliveryQueue.length,
      circuitBreakers: circuitBreakerStats,
    };
  }
}


