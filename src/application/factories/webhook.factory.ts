/**
 * Webhook Factory
 * Creates and configures webhook-related services and dependencies
 */

import { PrismaClient } from '../../generated/prisma';
import { RedisCache } from '../../infrastructure/cache/redis-cache';

// Interfaces
import {
  IWebhookService,
  IEventPublisher,
  IWebhookDeliveryService,
  IWebhookRepository,
  IWebhookEventRepository,
  IWebhookDeliveryRepository,
  IWebhookSignatureService,
  IDeadLetterQueue,
} from '../interfaces/webhook.interface';

// Services
import { WebhookService } from '../services/webhook.service';
import { EventPublisherService } from '../services/event-publisher.service';
import { WebhookDeliveryService } from '../services/webhook-delivery.service';
import { DeadLetterQueueService } from '../services/dead-letter-queue.service';

// Infrastructure
import { WebhookSignatureService } from '../../infrastructure/security/webhook-signature.service';
import { WebhookRepository } from '../../infrastructure/database/repositories/webhook.repository';
import { WebhookEventRepository } from '../../infrastructure/database/repositories/webhook-event.repository';
import { WebhookDeliveryRepository } from '../../infrastructure/database/repositories/webhook-delivery.repository';

// Controllers
import { WebhookController } from '../../presentation/controllers/webhook.controller';
import { WebhookWebSocketController } from '../../presentation/controllers/webhook-websocket.controller';

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
    const deadLetterQueue = new DeadLetterQueueService(
      deliveryRepository,
      redisCache,
      {
        maxRetentionDays: 7,
        maxRetryAttempts: 5,
        batchSize: 10,
        processingInterval: 300000, // 5 minutes
      }
    );

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
   */
  static createForTesting(
    overrides: Partial<WebhookFactoryResult> = {}
  ): WebhookFactoryResult {
    const mockPrisma = {} as PrismaClient;
    const mockRedisCache = {} as RedisCache;

    // Create minimal mocked services
    const mockWebhookRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByUserId: jest.fn(),
      findActiveWebhooksForEvent: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      findWithQuery: jest.fn(),
    } as unknown as IWebhookRepository;

    const mockEventRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findWithQuery: jest.fn(),
      deleteOldEvents: jest.fn(),
    } as unknown as IWebhookEventRepository;

    const mockDeliveryRepository = {
      save: jest.fn(),
      update: jest.fn(),
      findWithQuery: jest.fn(),
      findPendingRetries: jest.fn(),
      findFailedDeliveries: jest.fn(),
      deleteOldAttempts: jest.fn(),
      cancelPendingDeliveries: jest.fn(),
    } as unknown as IWebhookDeliveryRepository;

    const mockSignatureService = {
      generateSignature: jest.fn(),
      verifySignature: jest.fn(),
      generateSecret: jest.fn(),
      validateSecret: jest.fn(),
      createSignatureHeaders: jest.fn(),
      verifySignatureWithTimestamp: jest.fn(),
      generateTestPayload: jest.fn(),
      createDeliveryHeaders: jest.fn(),
    } as unknown as IWebhookSignatureService;

    const mockDeadLetterQueue = {
      addFailedDelivery: jest.fn(),
      getFailedDeliveries: jest.fn(),
      removeFailedDelivery: jest.fn(),
      retryFailedDeliveries: jest.fn(),
      getStats: jest.fn(),
    } as unknown as IDeadLetterQueue;

    const mockDeliveryService = {
      deliverEvent: jest.fn(),
      retryFailedDeliveries: jest.fn(),
      getDeliveryAttempts: jest.fn(),
      cancelPendingDeliveries: jest.fn(),
    } as unknown as IWebhookDeliveryService;

    const mockEventPublisher = {
      publishEvent: jest.fn(),
      publishEvents: jest.fn(),
      getEvent: jest.fn(),
      listEvents: jest.fn(),
      subscribeToEventStream: jest.fn(),
      unsubscribeFromEventStream: jest.fn(),
      getActiveSubscriptions: jest.fn(),
      createEventFromAudit: jest.fn(),
      publishAuthEvent: jest.fn(),
      on: jest.fn(),
      emit: jest.fn(),
    } as unknown as IEventPublisher;

    const mockWebhookService = {
      registerWebhook: jest.fn(),
      updateWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
      getWebhook: jest.fn(),
      listWebhooks: jest.fn(),
      testWebhook: jest.fn(),
      getWebhookStats: jest.fn(),
      getSupportedEventTypes: jest.fn(),
    } as unknown as IWebhookService;

    const mockWebhookController = {
      registerWebhook: jest.fn(),
      updateWebhook: jest.fn(),
      deleteWebhook: jest.fn(),
      getWebhook: jest.fn(),
      listWebhooks: jest.fn(),
      testWebhook: jest.fn(),
      getWebhookStats: jest.fn(),
      getSupportedEventTypes: jest.fn(),
      listEvents: jest.fn(),
    } as unknown as WebhookController;

    const mockWebsocketController = {
      registerRoutes: jest.fn(),
      broadcastEvent: jest.fn(),
      getStats: jest.fn(),
      healthCheck: jest.fn(),
    } as unknown as WebhookWebSocketController;

    const defaultMocks: WebhookFactoryResult = {
      webhookService: mockWebhookService,
      eventPublisher: mockEventPublisher,
      deliveryService: mockDeliveryService,
      deadLetterQueue: mockDeadLetterQueue,
      signatureService: mockSignatureService,
      webhookRepository: mockWebhookRepository,
      eventRepository: mockEventRepository,
      deliveryRepository: mockDeliveryRepository,
      webhookController: mockWebhookController,
      websocketController: mockWebsocketController,
    };

    return { ...defaultMocks, ...overrides };
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
