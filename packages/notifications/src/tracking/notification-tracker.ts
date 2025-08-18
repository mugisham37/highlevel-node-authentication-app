/**
 * Notification Tracking System
 */

import { logger } from '@company/logger';

export interface NotificationEvent {
  id: string;
  notificationId: string;
  type: 'sent' | 'delivered' | 'opened' | 'clicked' | 'bounced' | 'failed';
  timestamp: Date;
  recipient: string;
  channel: 'email' | 'sms' | 'push';
  provider: string;
  metadata?: Record<string, any>;
}

export interface NotificationMetrics {
  sent: number;
  delivered: number;
  opened: number;
  clicked: number;
  bounced: number;
  failed: number;
  deliveryRate: number;
  openRate: number;
  clickRate: number;
  bounceRate: number;
}

export interface TrackingConfig {
  enableTracking: boolean;
  trackOpens: boolean;
  trackClicks: boolean;
  retentionDays: number;
}

export class NotificationTracker {
  private events: Map<string, NotificationEvent[]> = new Map();

  constructor(private config: TrackingConfig) {}

  /**
   * Track notification event
   */
  async trackEvent(event: Omit<NotificationEvent, 'timestamp'>): Promise<void> {
    if (!this.config.enableTracking) {
      return;
    }

    const trackingEvent: NotificationEvent = {
      ...event,
      timestamp: new Date(),
    };

    // Store event in memory (in production, this would be stored in a database)
    const notificationEvents = this.events.get(event.notificationId) || [];
    notificationEvents.push(trackingEvent);
    this.events.set(event.notificationId, notificationEvents);

    logger.debug('Notification event tracked', {
      notificationId: event.notificationId,
      type: event.type,
      channel: event.channel,
      recipient: event.recipient,
    });

    // Emit event for real-time monitoring
    this.emitTrackingEvent(trackingEvent);
  }

  /**
   * Get events for a specific notification
   */
  getNotificationEvents(notificationId: string): NotificationEvent[] {
    return this.events.get(notificationId) || [];
  }

  /**
   * Get metrics for a specific notification
   */
  getNotificationMetrics(notificationId: string): NotificationMetrics {
    const events = this.getNotificationEvents(notificationId);
    return this.calculateMetrics(events);
  }

  /**
   * Get metrics for multiple notifications
   */
  getBulkMetrics(notificationIds: string[]): NotificationMetrics {
    const allEvents = notificationIds.flatMap(id => this.getNotificationEvents(id));
    return this.calculateMetrics(allEvents);
  }

  /**
   * Get metrics by channel
   */
  getChannelMetrics(channel: 'email' | 'sms' | 'push', dateRange?: { start: Date; end: Date }): NotificationMetrics {
    const allEvents = Array.from(this.events.values()).flat();
    const filteredEvents = allEvents.filter(event => {
      if (event.channel !== channel) return false;
      if (dateRange) {
        return event.timestamp >= dateRange.start && event.timestamp <= dateRange.end;
      }
      return true;
    });

    return this.calculateMetrics(filteredEvents);
  }

  /**
   * Get metrics by provider
   */
  getProviderMetrics(provider: string, dateRange?: { start: Date; end: Date }): NotificationMetrics {
    const allEvents = Array.from(this.events.values()).flat();
    const filteredEvents = allEvents.filter(event => {
      if (event.provider !== provider) return false;
      if (dateRange) {
        return event.timestamp >= dateRange.start && event.timestamp <= dateRange.end;
      }
      return true;
    });

    return this.calculateMetrics(filteredEvents);
  }

  /**
   * Generate tracking pixel URL for email opens
   */
  generateTrackingPixelUrl(notificationId: string, recipient: string): string {
    if (!this.config.trackOpens) {
      return '';
    }

    const baseUrl = process.env.TRACKING_BASE_URL || 'https://api.example.com';
    const params = new URLSearchParams({
      n: notificationId,
      r: Buffer.from(recipient).toString('base64'),
      t: 'open',
    });

    return `${baseUrl}/track/pixel.gif?${params.toString()}`;
  }

  /**
   * Generate tracking URL for link clicks
   */
  generateTrackingUrl(notificationId: string, recipient: string, originalUrl: string): string {
    if (!this.config.trackClicks) {
      return originalUrl;
    }

    const baseUrl = process.env.TRACKING_BASE_URL || 'https://api.example.com';
    const params = new URLSearchParams({
      n: notificationId,
      r: Buffer.from(recipient).toString('base64'),
      u: Buffer.from(originalUrl).toString('base64'),
      t: 'click',
    });

    return `${baseUrl}/track/click?${params.toString()}`;
  }

  /**
   * Process tracking webhook (for external providers)
   */
  async processWebhook(provider: string, payload: any): Promise<void> {
    try {
      const events = this.parseWebhookPayload(provider, payload);
      
      for (const event of events) {
        await this.trackEvent(event);
      }

      logger.info('Webhook processed successfully', {
        provider,
        eventCount: events.length,
      });
    } catch (error) {
      logger.error('Failed to process tracking webhook', {
        provider,
        error: error instanceof Error ? error.message : 'Unknown error',
        payload,
      });
    }
  }

  /**
   * Clean old tracking data
   */
  async cleanOldData(): Promise<void> {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - this.config.retentionDays);

    let cleanedCount = 0;

    for (const [notificationId, events] of this.events.entries()) {
      const filteredEvents = events.filter(event => event.timestamp > cutoffDate);
      
      if (filteredEvents.length !== events.length) {
        cleanedCount += events.length - filteredEvents.length;
        
        if (filteredEvents.length === 0) {
          this.events.delete(notificationId);
        } else {
          this.events.set(notificationId, filteredEvents);
        }
      }
    }

    logger.info('Cleaned old tracking data', {
      cleanedEvents: cleanedCount,
      retentionDays: this.config.retentionDays,
    });
  }

  /**
   * Calculate metrics from events
   */
  private calculateMetrics(events: NotificationEvent[]): NotificationMetrics {
    const eventCounts = events.reduce((acc, event) => {
      acc[event.type] = (acc[event.type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    const sent = eventCounts.sent || 0;
    const delivered = eventCounts.delivered || 0;
    const opened = eventCounts.opened || 0;
    const clicked = eventCounts.clicked || 0;
    const bounced = eventCounts.bounced || 0;
    const failed = eventCounts.failed || 0;

    return {
      sent,
      delivered,
      opened,
      clicked,
      bounced,
      failed,
      deliveryRate: sent > 0 ? (delivered / sent) * 100 : 0,
      openRate: delivered > 0 ? (opened / delivered) * 100 : 0,
      clickRate: opened > 0 ? (clicked / opened) * 100 : 0,
      bounceRate: sent > 0 ? (bounced / sent) * 100 : 0,
    };
  }

  /**
   * Parse webhook payload from different providers
   */
  private parseWebhookPayload(provider: string, payload: any): Omit<NotificationEvent, 'timestamp'>[] {
    const events: Omit<NotificationEvent, 'timestamp'>[] = [];

    switch (provider.toLowerCase()) {
      case 'sendgrid':
        if (Array.isArray(payload)) {
          for (const event of payload) {
            events.push({
              id: `${event.sg_message_id}_${event.event}`,
              notificationId: event.sg_message_id,
              type: this.mapSendGridEvent(event.event),
              recipient: event.email,
              channel: 'email',
              provider: 'sendgrid',
              metadata: event,
            });
          }
        }
        break;

      case 'twilio':
        events.push({
          id: `${payload.MessageSid}_${payload.MessageStatus}`,
          notificationId: payload.MessageSid,
          type: this.mapTwilioEvent(payload.MessageStatus),
          recipient: payload.To,
          channel: 'sms',
          provider: 'twilio',
          metadata: payload,
        });
        break;

      case 'firebase':
        // Firebase doesn't provide webhooks, events would come from client SDKs
        break;

      default:
        logger.warn('Unknown webhook provider', { provider });
    }

    return events;
  }

  /**
   * Map SendGrid event types to our event types
   */
  private mapSendGridEvent(event: string): NotificationEvent['type'] {
    const mapping: Record<string, NotificationEvent['type']> = {
      'processed': 'sent',
      'delivered': 'delivered',
      'open': 'opened',
      'click': 'clicked',
      'bounce': 'bounced',
      'dropped': 'failed',
      'deferred': 'failed',
      'blocked': 'failed',
    };

    return mapping[event] || 'sent';
  }

  /**
   * Map Twilio event types to our event types
   */
  private mapTwilioEvent(status: string): NotificationEvent['type'] {
    const mapping: Record<string, NotificationEvent['type']> = {
      'queued': 'sent',
      'sent': 'sent',
      'delivered': 'delivered',
      'failed': 'failed',
      'undelivered': 'failed',
    };

    return mapping[status] || 'sent';
  }

  /**
   * Emit tracking event for real-time monitoring
   */
  private emitTrackingEvent(event: NotificationEvent): void {
    // In a real implementation, this would emit to a message queue or WebSocket
    logger.debug('Tracking event emitted', {
      notificationId: event.notificationId,
      type: event.type,
      channel: event.channel,
    });
  }
}