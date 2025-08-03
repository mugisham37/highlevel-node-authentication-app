/**
 * Webhook Domain Entity
 * Represents a webhook registration with delivery configuration and status tracking
 */

export interface WebhookConfig {
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  retryConfig: {
    maxRetries: number;
    backoffMultiplier: number;
    initialDelay: number;
    maxDelay: number;
  };
  headers?: Record<string, string>;
  timeout: number;
}

export interface WebhookDeliveryAttempt {
  id: string;
  webhookId: string;
  eventId: string;
  attempt: number;
  status: 'pending' | 'success' | 'failed' | 'timeout';
  httpStatus?: number;
  responseBody?: string;
  errorMessage?: string;
  deliveredAt?: Date;
  nextRetryAt?: Date;
  createdAt: Date;
}

export class Webhook {
  constructor(
    public readonly id: string,
    public readonly userId: string,
    public readonly name: string,
    public readonly description: string,
    public readonly config: WebhookConfig,
    public readonly createdAt: Date,
    public readonly updatedAt: Date,
    public readonly lastDeliveryAt?: Date,
    public readonly deliveryStats: {
      totalDeliveries: number;
      successfulDeliveries: number;
      failedDeliveries: number;
      averageResponseTime: number;
    } = {
      totalDeliveries: 0,
      successfulDeliveries: 0,
      failedDeliveries: 0,
      averageResponseTime: 0,
    }
  ) {}

  /**
   * Check if webhook should receive a specific event
   */
  shouldReceiveEvent(eventType: string): boolean {
    if (!this.config.active) {
      return false;
    }

    // Check if event type matches any configured patterns
    return this.config.events.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return eventType.startsWith(prefix);
      }
      return pattern === eventType;
    });
  }

  /**
   * Update delivery statistics
   */
  updateDeliveryStats(success: boolean, responseTime: number): Webhook {
    const newStats = {
      totalDeliveries: this.deliveryStats.totalDeliveries + 1,
      successfulDeliveries: success
        ? this.deliveryStats.successfulDeliveries + 1
        : this.deliveryStats.successfulDeliveries,
      failedDeliveries: success
        ? this.deliveryStats.failedDeliveries
        : this.deliveryStats.failedDeliveries + 1,
      averageResponseTime: Math.round(
        (this.deliveryStats.averageResponseTime *
          this.deliveryStats.totalDeliveries +
          responseTime) /
          (this.deliveryStats.totalDeliveries + 1)
      ),
    };

    return new Webhook(
      this.id,
      this.userId,
      this.name,
      this.description,
      this.config,
      this.createdAt,
      new Date(),
      new Date(),
      newStats
    );
  }

  /**
   * Check if webhook is healthy based on recent delivery success rate
   */
  isHealthy(threshold: number = 0.8): boolean {
    if (this.deliveryStats.totalDeliveries === 0) {
      return true; // No deliveries yet, assume healthy
    }

    const successRate =
      this.deliveryStats.successfulDeliveries /
      this.deliveryStats.totalDeliveries;
    return successRate >= threshold;
  }

  /**
   * Get next retry delay based on attempt number
   */
  getNextRetryDelay(attempt: number): number {
    const { initialDelay, backoffMultiplier, maxDelay } =
      this.config.retryConfig;
    const delay = initialDelay * Math.pow(backoffMultiplier, attempt - 1);
    return Math.min(delay, maxDelay);
  }

  /**
   * Check if webhook should be retried
   */
  shouldRetry(attempt: number): boolean {
    return attempt <= this.config.retryConfig.maxRetries;
  }

  /**
   * Validate webhook configuration
   */
  static validateConfig(config: WebhookConfig): string[] {
    const errors: string[] = [];

    if (!config.url || !this.isValidUrl(config.url)) {
      errors.push('Invalid webhook URL');
    }

    if (!config.secret || config.secret.length < 16) {
      errors.push('Webhook secret must be at least 16 characters');
    }

    if (!config.events || config.events.length === 0) {
      errors.push('At least one event type must be specified');
    }

    if (config.timeout < 1000 || config.timeout > 30000) {
      errors.push('Timeout must be between 1000ms and 30000ms');
    }

    if (
      config.retryConfig.maxRetries < 0 ||
      config.retryConfig.maxRetries > 10
    ) {
      errors.push('Max retries must be between 0 and 10');
    }

    return errors;
  }

  private static isValidUrl(url: string): boolean {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' || parsed.protocol === 'http:';
    } catch {
      return false;
    }
  }
}

export class WebhookEvent {
  constructor(
    public readonly id: string,
    public readonly type: string,
    public readonly data: Record<string, any>,
    public readonly userId?: string,
    public readonly sessionId?: string,
    public readonly timestamp: Date = new Date(),
    public readonly metadata: Record<string, any> = {},
    public readonly correlationId?: string
  ) {}

  /**
   * Create webhook payload for delivery
   */
  createPayload(): {
    id: string;
    type: string;
    data: Record<string, any>;
    timestamp: string;
    userId?: string;
    sessionId?: string;
    metadata: Record<string, any>;
    correlationId?: string;
  } {
    return {
      id: this.id,
      type: this.type,
      data: this.data,
      timestamp: this.timestamp.toISOString(),
      userId: this.userId,
      sessionId: this.sessionId,
      metadata: this.metadata,
      correlationId: this.correlationId,
    };
  }

  /**
   * Create event from audit event
   */
  static fromAuditEvent(auditEvent: any): WebhookEvent {
    return new WebhookEvent(
      auditEvent.id,
      auditEvent.eventType,
      {
        method: auditEvent.method,
        path: auditEvent.path,
        statusCode: auditEvent.statusCode,
        duration: auditEvent.duration,
        ipAddress: auditEvent.ipAddress,
        userAgent: auditEvent.userAgent,
        securityContext: auditEvent.securityContext,
        error: auditEvent.error,
      },
      auditEvent.userId,
      auditEvent.sessionId,
      auditEvent.timestamp,
      auditEvent.metadata,
      auditEvent.correlationId
    );
  }
}
