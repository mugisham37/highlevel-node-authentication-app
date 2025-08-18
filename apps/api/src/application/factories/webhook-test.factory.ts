/**
 * Webhook Test Factory
 * Creates webhook-related services with mocked dependencies for testing
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
import { EventPublisherService } from '../services/event-publisher.service';
import { WebhookDeliveryService } from '../services/webhook-delivery.service';
import { WebhookService } from '../services/webhook.service';

// Controllers
import { WebhookWebSocketController } from '../../presentation/controllers/webhook-websocket.controller';
import { WebhookController } from '../../presentation/controllers/webhook.controller';

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
      throw new Error(
        'WebhookTestFactory.createForTesting() can only be used in test environment'
      );
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

    const mockDeliveryService = {
      deliverEvent: jest.fn(),
      retryFailedDeliveries: jest.fn(),
      getDeliveryAttempts: jest.fn(),
      cancelPendingDeliveries: jest.fn(),
    } as unknown as IWebhookDeliveryService;

    const mockDeliveryRepository = {
      save: jest.fn(),
      findById: jest.fn(),
      findByWebhookAndEvent: jest.fn(),
      findFailedAttempts: jest.fn(),
      updateStatus: jest.fn(),
      markAsDelivered: jest.fn(),
      markAsFailed: jest.fn(),
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
    } as unknown as IWebhookSignatureService;

    const mockDeadLetterQueue = {
      addFailedDelivery: jest.fn(),
      getFailedDeliveries: jest.fn(),
      removeFailedDelivery: jest.fn(),
      retryFailedDeliveries: jest.fn(),
      getStats: jest.fn(),
    } as unknown as IDeadLetterQueue;

    // Create core services with mocked dependencies
    const webhookService = new WebhookService(
      mockWebhookRepository,
      mockDeliveryService,
      mockSignatureService
    );

    const eventPublisher = new EventPublisherService(
      mockWebhookRepository,
      mockEventRepository,
      mockDeliveryService
    );

    const deliveryService = new WebhookDeliveryService(
      mockDeliveryRepository,
      mockSignatureService
    );

    // Create controllers
    const webhookController = new WebhookController(
      webhookService,
      eventPublisher
    );

    const websocketController = new WebhookWebSocketController(eventPublisher);

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
      deliveryRepository:
        overrides.deliveryRepository || mockDeliveryRepository,

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
