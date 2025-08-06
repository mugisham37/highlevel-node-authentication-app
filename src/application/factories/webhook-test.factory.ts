/**
 * Webhook Test Factory
 * Creates webhook-related services with mocked dependencies for testing
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

// Controllers
import { WebhookController } from '../../presentation/controllers/webhook.controller';
import { WebhookWebSocketController } from '../../presentation/controllers/webhook-websocket.controller';

import { logger } from '../../infrastructure/logging/winston-logger';

export interface WebhookTestFactoryResult {
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

  // Mock instances for verification
  mocks: {
    prisma: PrismaClient;
    redisCache: RedisCache;
    webhookRepository: IWebhookRepository;
    eventRepository: IWebhookEventRepository;
    deliveryRepository: IWebhookDeliveryRepository;
    signatureService: IWebhookSignatureService;
    deadLetterQueue: IDeadLetterQueue;
  };
}

export class WebhookTestFactory {
  /**
   * Create webhook system for testing with mocked dependencies
   */
  static createForTesting(
    overrides: Partial<WebhookTestFactoryResult> = {}
  ): WebhookTestFactoryResult {
    // Only import jest when in test environment
    if (typeof jest === 'undefined') {
      throw new Error('WebhookTestFactory.createForTesting() can only be used in test environment');
    }

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
      findById: jest.fn(),
      findByWebhookAndEvent: jest.fn(),
      findFailedAttempts: jest.fn(),
      updateStatus: jest.fn(),
      markAsDelivered: jest.fn(),
      markAsFailed: jest.fn(),
      deleteOldAttempts: jest.fn(),
    } as unknown as IWebhookDeliveryRepository;

    const mockSignatureService = {
      generateSignature: jest.fn(),
      verifySignature: jest.fn(),
      createHeaders: jest.fn(),
    } as unknown as IWebhookSignatureService;

    const mockDeadLetterQueue = {
      add: jest.fn(),
      process: jest.fn(),
      retry: jest.fn(),
      remove: jest.fn(),
      getStats: jest.fn(),
      clear: jest.fn(),
    } as unknown as IDeadLetterQueue;

    // Create core services with mocked dependencies
    const webhookService = new WebhookService(
      mockWebhookRepository,
      mockEventRepository,
      logger
    );

    const eventPublisher = new EventPublisherService(
      mockEventRepository,
      mockRedisCache,
      logger
    );

    const deliveryService = new WebhookDeliveryService(
      mockDeliveryRepository,
      mockSignatureService
    );

    // Create controllers
    const webhookController = new WebhookController(
      webhookService,
      eventPublisher,
      deliveryService,
      logger
    );

    const websocketController = new WebhookWebSocketController(
      webhookService,
      eventPublisher,
      logger
    );

    const result: WebhookTestFactoryResult = {
      // Services
      webhookService: overrides.webhookService || webhookService,
      eventPublisher: overrides.eventPublisher || eventPublisher,
      deliveryService: overrides.deliveryService || deliveryService,
      deadLetterQueue: overrides.deadLetterQueue || mockDeadLetterQueue,
      signatureService: overrides.signatureService || mockSignatureService,

      // Repositories
      webhookRepository: overrides.webhookRepository || mockWebhookRepository,
      eventRepository: overrides.eventRepository || mockEventRepository,
      deliveryRepository: overrides.deliveryRepository || mockDeliveryRepository,

      // Controllers
      webhookController: overrides.webhookController || webhookController,
      websocketController: overrides.websocketController || websocketController,

      // Mock instances for verification
      mocks: {
        prisma: mockPrisma,
        redisCache: mockRedisCache,
        webhookRepository: mockWebhookRepository,
        eventRepository: mockEventRepository,
        deliveryRepository: mockDeliveryRepository,
        signatureService: mockSignatureService,
        deadLetterQueue: mockDeadLetterQueue,
      },
    };

    return result;
  }
}
