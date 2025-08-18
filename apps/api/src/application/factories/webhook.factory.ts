/**
 * Webhook Factory
 * Creates and configures webhook-related services and dependencies
 */

import { RedisCache } from '@company/cache';
import { PrismaClient } from '../../generated/prisma';

// Interfaces
import {
  IDeadLetterQueue,
  IEventPublisher,
  IWebhookDeliveryRepository,
  IWebhookDeliveryService,
  IWebhookEventRepository,
  IWebhookRepository,
  IWebhookService,
  IWebhookSignatureService,
} from '../interfaces/webhook.interface';

// Services
import { DeadLetterQueueService } from '../services/dead-letter-queue.service';
import { EventPublisherService } from '../services/event-publisher.service';
import { WebhookDeliveryService } from '../services/webhook-delivery.service';
import { WebhookService } from '../services/webhook.service';

// Infrastructure
import { WebhookDeliveryRepository } from '../../infrastructure/database/repositories/webhook-delivery.repository';
import { WebhookEventRepository } from '../../infrastructure/database/repositories/webhook-event.repository';
import { WebhookRepository } from '../../infrastructure/database/repositories/webhook.repository';
import { WebhookSignatureService } from '../../infrastructure/security/webhook-signature.service';

// Controllers
import { WebhookWebSocketController } from '../../presentation/controllers/webhook-websocket.controller';
import { WebhookController } from '../../presentation/controllers/webhook.controller';

import { logger } from '../../infrastructure/logging/winston-logger';

export interface WebhookFactoryDependencies {
  prisma: PrismaClient;
  redisCache: RedisCache;
}

export interface WebhookFactoryResult {
  // Services
  webhookService: IWebhookService;
  eventPublisher: IEventPublisher;
  deliveryService: IWebhookDeliveryService;
  deadLetterQueue: IDeadLetterQueue;
  signatureService: IWebhookSignatureService;

  // Repositories
  webhookRepository: IWebhookRepository;
  eventRepository: IWebhookEventRepository;
  deliveryRepository: IWebhookDeliveryRepository;

  // Controllers
  webhookController: WebhookController;
  websocketController: WebhookWebSocketController;
}

export class WebhookFactory {
  private static instance: WebhookFactoryResult | null = null;

  /**
   * Create webhook system with all dependencies
   */
  static create(
    dependencies: WebhookFactoryDependencies
  ): WebhookFactoryResult {
    if (WebhookFactory.instance) {
      return WebhookFactory.instance;
    }

    logger.info('Initializing webhook system');

    const { prisma, redisCache } = dependencies;

    // Create repositories
    const webhookRepository = new WebhookRepository(prisma);
    const eventRepository = new WebhookEventRepository(prisma);
    const deliveryRepository = new WebhookDeliveryRepository(prisma);

    // Create infrastructure services
    const signatureService = new WebhookSignatureService();

    // Create dead letter queue
    const deadLetterQueue = new DeadLetterQueueService(redisCache, {
      maxRetentionDays: 7,
      maxRetryAttempts: 5,
      batchSize: 10,
      processingInterval: 300000, // 5 minutes
    });

    // Create delivery service
    const deliveryService = new WebhookDeliveryService(
      deliveryRepository,
      signatureService
    );

    // Create event publisher
    const eventPublisher = new EventPublisherService(
      webhookRepository,
      eventRepository,
      deliveryService
    );

    // Create main webhook service
    const webhookService = new WebhookService(
      webhookRepository,
      deliveryService,
      signatureService
    );

    // Create controllers
    const webhookController = new WebhookController(
      webhookService,
      eventPublisher
    );

    const websocketController = new WebhookWebSocketController(eventPublisher);

    // Set up event publisher to broadcast to WebSocket connections
    eventPublisher.on('event', (event) => {
      websocketController.broadcastEvent(event);
    });

    const result: WebhookFactoryResult = {
      // Services
      webhookService,
      eventPublisher,
      deliveryService,
      deadLetterQueue,
      signatureService,

      // Repositories
      webhookRepository,
      eventRepository,
      deliveryRepository,

      // Controllers
      webhookController,
      websocketController,
    };

    WebhookFactory.instance = result;

    logger.info('Webhook system initialized successfully');

    return result;
  }

  /**
   * Get existing instance or throw error
   */
  static getInstance(): WebhookFactoryResult {
    if (!WebhookFactory.instance) {
      throw new Error('Webhook factory not initialized. Call create() first.');
    }

    return WebhookFactory.instance;
  }

  /**
   * Reset factory instance (useful for testing)
   */
  static reset(): void {
    WebhookFactory.instance = null;
  }

  /**
   * Create webhook system for testing with mocked dependencies
   * Note: Use WebhookTestFactory for Jest-based testing
   */
  static createForTesting(
    _overrides: Partial<WebhookFactoryResult> = {}
  ): WebhookFactoryResult {
    throw new Error(
      'createForTesting has been moved to WebhookTestFactory. ' +
        'Import WebhookTestFactory from "./webhook-test.factory" and use WebhookTestFactory.createForTesting() instead.'
    );
  }

  /**
   * Health check for entire webhook system
   */
  static async healthCheck(): Promise<{
    healthy: boolean;
    services: {
      eventPublisher: any;
      deliveryService: any;
      deadLetterQueue: any;
      websocketController: any;
    };
  }> {
    if (!WebhookFactory.instance) {
      return {
        healthy: false,
        services: {
          eventPublisher: { healthy: false, error: 'Not initialized' },
          deliveryService: { healthy: false, error: 'Not initialized' },
          deadLetterQueue: { healthy: false, error: 'Not initialized' },
          websocketController: { healthy: false, error: 'Not initialized' },
        },
      };
    }

    const {
      eventPublisher,
      deliveryService,
      deadLetterQueue,
      websocketController,
    } = WebhookFactory.instance;

    try {
      const [publisherHealth, deliveryHealth, dlqHealth, wsHealth] =
        await Promise.all([
          (eventPublisher as EventPublisherService).healthCheck(),
          (deliveryService as WebhookDeliveryService).healthCheck(),
          (deadLetterQueue as DeadLetterQueueService).healthCheck(),
          websocketController.healthCheck(),
        ]);

      const allHealthy =
        publisherHealth.healthy &&
        deliveryHealth.healthy &&
        dlqHealth.healthy &&
        wsHealth.healthy;

      return {
        healthy: allHealthy,
        services: {
          eventPublisher: publisherHealth,
          deliveryService: deliveryHealth,
          deadLetterQueue: dlqHealth,
          websocketController: wsHealth,
        },
      };
    } catch (error) {
      logger.error('Error performing webhook system health check', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        services: {
          eventPublisher: { healthy: false, error: 'Health check failed' },
          deliveryService: { healthy: false, error: 'Health check failed' },
          deadLetterQueue: { healthy: false, error: 'Health check failed' },
          websocketController: { healthy: false, error: 'Health check failed' },
        },
      };
    }
  }
}
