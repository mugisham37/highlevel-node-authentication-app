/**
 * Webhook Service Interfaces
 * Defines contracts for webhook management, event publishing, and delivery
 */

import {
  Webhook,
  WebhookEvent,
  WebhookDeliveryAttempt,
} from "@company/shared"entities/webhook';

export interface CreateWebhookRequest {
  userId: string;
  name: string;
  description: string;
  url: string;
  secret: string;
  events: string[];
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: {
    maxRetries?: number;
    backoffMultiplier?: number;
    initialDelay?: number;
    maxDelay?: number;
  };
}

export interface UpdateWebhookRequest {
  name?: string;
  description?: string;
  url?: string;
  secret?: string;
  events?: string[];
  active?: boolean;
  headers?: Record<string, string>;
  timeout?: number;
  retryConfig?: {
    maxRetries?: number;
    backoffMultiplier?: number;
    initialDelay?: number;
    maxDelay?: number;
  };
}

export interface WebhookDeliveryResult {
  success: boolean;
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  responseTime: number;
}

export interface WebhookQuery {
  userId?: string;
  active?: boolean;
  eventType?: string;
  limit?: number;
  offset?: number;
}

export interface DeliveryAttemptQuery {
  webhookId?: string;
  eventId?: string;
  status?: 'pending' | 'success' | 'failed' | 'timeout';
  startDate?: Date;
  endDate?: Date;
  limit?: number;
  offset?: number;
}

export interface IWebhookService {
  /**
   * Register a new webhook
   */
  registerWebhook(request: CreateWebhookRequest): Promise<Webhook>;

  /**
   * Update an existing webhook
   */
  updateWebhook(
    webhookId: string,
    userId: string,
    request: UpdateWebhookRequest
  ): Promise<Webhook>;

  /**
   * Delete a webhook
   */
  deleteWebhook(webhookId: string, userId: string): Promise<void>;

  /**
   * Get webhook by ID
   */
  getWebhook(webhookId: string, userId: string): Promise<Webhook | null>;

  /**
   * List webhooks for a user
   */
  listWebhooks(query: WebhookQuery): Promise<{
    webhooks: Webhook[];
    total: number;
  }>;

  /**
   * Test webhook delivery
   */
  testWebhook(
    webhookId: string,
    userId: string
  ): Promise<WebhookDeliveryResult>;

  /**
   * Get webhook delivery statistics
   */
  getWebhookStats(
    webhookId: string,
    userId: string
  ): Promise<{
    totalDeliveries: number;
    successfulDeliveries: number;
    failedDeliveries: number;
    averageResponseTime: number;
    recentDeliveries: WebhookDeliveryAttempt[];
  }>;

  /**
   * Get supported event types
   */
  getSupportedEventTypes(): string[];
}

export interface IEventPublisher {
  /**
   * Publish an event to all matching webhooks
   */
  publishEvent(event: WebhookEvent): Promise<void>;

  /**
   * Publish authentication event
   */
  publishAuthEvent(
    eventType: string,
    data: Record<string, any>,
    userId?: string,
    sessionId?: string,
    correlationId?: string
  ): Promise<void>;

  /**
   * Publish multiple events in batch
   */
  publishEvents(events: WebhookEvent[]): Promise<void>;

  /**
   * Get event by ID
   */
  getEvent(eventId: string): Promise<WebhookEvent | null>;

  /**
   * List recent events
   */
  listEvents(query: {
    userId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: WebhookEvent[];
    total: number;
  }>;

  /**
   * Subscribe to event stream (for WebSocket)
   */
  subscribeToEventStream(
    userId: string,
    eventTypes: string[],
    callback: (event: WebhookEvent) => void
  ): string;

  /**
   * Unsubscribe from event stream
   */
  unsubscribeFromEventStream(subscriptionId: string): void;

  /**
   * Get active subscriptions
   */
  getActiveSubscriptions(userId?: string): Array<{
    id: string;
    userId: string;
    eventTypes: string[];
    createdAt: Date;
  }>;
}

export interface IWebhookDeliveryService {
  /**
   * Deliver event to a specific webhook
   */
  deliverEvent(
    webhook: Webhook,
    event: WebhookEvent
  ): Promise<WebhookDeliveryResult>;

  /**
   * Retry failed deliveries
   */
  retryFailedDeliveries(): Promise<number>;

  /**
   * Get delivery attempts for a webhook or event
   */
  getDeliveryAttempts(query: DeliveryAttemptQuery): Promise<{
    attempts: WebhookDeliveryAttempt[];
    total: number;
  }>;

  /**
   * Cancel pending deliveries for a webhook
   */
  cancelPendingDeliveries(webhookId: string): Promise<number>;
}

export interface IWebhookRepository {
  /**
   * Save webhook
   */
  save(webhook: Webhook): Promise<Webhook>;

  /**
   * Find webhook by ID
   */
  findById(id: string): Promise<Webhook | null>;

  /**
   * Find webhooks by user ID
   */
  findByUserId(userId: string): Promise<Webhook[]>;

  /**
   * Find active webhooks that should receive an event
   */
  findActiveWebhooksForEvent(eventType: string): Promise<Webhook[]>;

  /**
   * Update webhook
   */
  update(id: string, updates: Partial<Webhook>): Promise<Webhook>;

  /**
   * Delete webhook
   */
  delete(id: string): Promise<void>;

  /**
   * Find webhooks with query
   */
  findWithQuery(query: WebhookQuery): Promise<{
    webhooks: Webhook[];
    total: number;
  }>;
}

export interface IWebhookEventRepository {
  /**
   * Save event
   */
  save(event: WebhookEvent): Promise<WebhookEvent>;

  /**
   * Find event by ID
   */
  findById(id: string): Promise<WebhookEvent | null>;

  /**
   * Find events with query
   */
  findWithQuery(query: {
    userId?: string;
    eventType?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<{
    events: WebhookEvent[];
    total: number;
  }>;

  /**
   * Delete old events (cleanup)
   */
  deleteOldEvents(olderThan: Date): Promise<number>;
}

export interface IWebhookDeliveryRepository {
  /**
   * Save delivery attempt
   */
  save(attempt: WebhookDeliveryAttempt): Promise<WebhookDeliveryAttempt>;

  /**
   * Find delivery attempt by ID
   */
  findById(id: string): Promise<WebhookDeliveryAttempt | null>;

  /**
   * Find delivery attempt by webhook and event
   */
  findByWebhookAndEvent(webhookId: string, eventId: string): Promise<WebhookDeliveryAttempt[]>;

  /**
   * Find failed delivery attempts
   */
  findFailedAttempts(webhookId?: string): Promise<WebhookDeliveryAttempt[]>;

  /**
   * Update delivery attempt status
   */
  updateStatus(id: string, status: 'pending' | 'success' | 'failed' | 'timeout'): Promise<WebhookDeliveryAttempt>;

  /**
   * Mark delivery attempt as delivered
   */
  markAsDelivered(id: string, responseData: { httpStatus?: number; responseBody?: string; deliveredAt?: Date }): Promise<WebhookDeliveryAttempt>;

  /**
   * Mark delivery attempt as failed
   */
  markAsFailed(id: string, errorMessage: string): Promise<WebhookDeliveryAttempt>;

  /**
   * Update delivery attempt
   */
  update(
    id: string,
    updates: Partial<WebhookDeliveryAttempt>
  ): Promise<WebhookDeliveryAttempt>;

  /**
   * Find delivery attempts with query
   */
  findWithQuery(query: DeliveryAttemptQuery): Promise<{
    attempts: WebhookDeliveryAttempt[];
    total: number;
  }>;

  /**
   * Find pending deliveries ready for retry
   */
  findPendingRetries(): Promise<WebhookDeliveryAttempt[]>;

  /**
   * Find failed deliveries for dead letter queue
   */
  findFailedDeliveries(webhookId?: string): Promise<WebhookDeliveryAttempt[]>;

  /**
   * Delete old delivery attempts
   */
  deleteOldAttempts(olderThan: Date): Promise<number>;

  /**
   * Cancel pending deliveries for webhook
   */
  cancelPendingDeliveries(webhookId: string): Promise<number>;
}

export interface IWebhookSignatureService {
  /**
   * Generate signature for webhook payload
   */
  generateSignature(payload: string, secret: string): string;

  /**
   * Verify webhook signature
   */
  verifySignature(payload: string, signature: string, secret: string): boolean;

  /**
   * Generate webhook secret
   */
  generateSecret(): string;

  /**
   * Validate webhook secret format
   */
  validateSecret(secret: string): {
    valid: boolean;
    errors: string[];
  };

  /**
   * Create delivery headers including signature
   */
  createDeliveryHeaders(
    payload: string,
    secret: string,
    customHeaders?: Record<string, string>
  ): Record<string, string>;

  /**
   * Generate test payload for webhook testing
   */
  generateTestPayload(eventType: string): Record<string, any>;
}

export interface IDeadLetterQueue {
  /**
   * Add failed delivery to dead letter queue
   */
  addFailedDelivery(attempt: WebhookDeliveryAttempt): Promise<void>;

  /**
   * Get failed deliveries from dead letter queue
   */
  getFailedDeliveries(limit?: number): Promise<WebhookDeliveryAttempt[]>;

  /**
   * Remove delivery from dead letter queue
   */
  removeFailedDelivery(attemptId: string): Promise<void>;

  /**
   * Retry deliveries from dead letter queue
   */
  retryFailedDeliveries(): Promise<number>;

  /**
   * Get dead letter queue statistics
   */
  getStats(): Promise<{
    totalFailed: number;
    oldestFailure: Date | null;
    failuresByWebhook: Record<string, number>;
  }>;
}

