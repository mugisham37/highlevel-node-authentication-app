/**
 * WebSocket Integration Service
 * Integrates WebSocket real-time features with t          await this.handleLoginEvent({
            type: 'login_success',
            userId: event.userId!,
            sessionId: event.sessionId,
            details: event.data,
            timestamp: event.timestam  async publishSecuri    data?: Reco  ): Promise<void> {
    try {
      const event = new WebhookEvent(
        this.generateEventId(),
        eventType,
        data || {},
        userId,
        sessionId,
        new Date(),
        {},
        undefined
      );
      
      await this.eventPublisher.publishEvent(event);

      logger.debug('Security event published', { any>
  ): Promise<void> {
    try {
      const event = new WebhookEvent(
        this.generateEventId(),
        eventType,
        data || {},
        userId,
        sessionId,
        new Date(),
        {},
        undefined
      );
      
      await this.eventPublisher.publishEvent(event);
    eventType: string,
    userId?: string,
    sessionId?: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const event = new WebhookEvent(
        this.generateEventId(),
        eventType,
        data || {},
        userId,
        sessionId,
        new Date(),
        {},
        undefined
      );
      
      await this.eventPublisher.publishEvent(event);   ip: event.data['ip'],
            userAgent: event.data['userAgent'],
          });ng event system
 */

import { IEventPublisher } from '../interfaces/webhook.interface';
import { WebhookEvent } from '../../domain/entities/webhook';
import { logger } from '../../infrastructure/logging/winston-logger';
import {
  WebSocketServer,
  WebSocketSessionManager,
  RealTimeNotificationService,
  WebSocketEvent,
  SecurityEvent,
  AuthenticationEvent,
  SessionEvent,
  AdminEvent,
} from '../../infrastructure/websocket';

export class WebSocketIntegrationService {
  constructor(
    private readonly eventPublisher: IEventPublisher,
    private readonly webSocketServer: WebSocketServer,
    private readonly sessionManager: WebSocketSessionManager,
    private readonly notificationService: RealTimeNotificationService
  ) {
    this.setupEventListeners();
  }

  /**
   * Setup event listeners to bridge webhook events to WebSocket
   */
  private setupEventListeners(): void {
    // TODO: Implement event listener pattern for webhook events
    // The event publisher interface doesn't currently support event listeners
    // This would need to be implemented with a proper event bus or observer pattern
    
    logger.info('WebSocket integration service initialized');
  }

  /**
   * Handle webhook event and convert to WebSocket event
   * @future This method will be used for webhook-to-websocket integration
   */
  // @ts-ignore - Method reserved for future webhook integration
  private async handleWebhookEvent(webhookEvent: WebhookEvent): Promise<void> {
    try {
      // Convert webhook event to WebSocket event
      const wsEvent: WebSocketEvent = {
        id: webhookEvent.id,
        type: webhookEvent.type,
        data: webhookEvent.data,
        timestamp: webhookEvent.timestamp.toISOString(),
        userId: webhookEvent.userId,
        sessionId: webhookEvent.sessionId,
        metadata: {
          ...webhookEvent.metadata,
          source: 'webhook_system',
        },
        correlationId: webhookEvent.correlationId,
      };

      // Broadcast to WebSocket connections
      await this.webSocketServer.broadcastEvent(wsEvent);

      // Handle specific event types for notifications
      await this.handleSpecificEventType(webhookEvent);

      logger.debug('Webhook event converted to WebSocket event', {
        eventId: webhookEvent.id,
        eventType: webhookEvent.type,
        userId: webhookEvent.userId,
      });
    } catch (error) {
      logger.error('Error handling webhook event for WebSocket', {
        eventId: webhookEvent.id,
        eventType: webhookEvent.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle specific event types for real-time notifications
   */
  private async handleSpecificEventType(event: WebhookEvent): Promise<void> {
    try {
      switch (event.type) {
        // Authentication events
        case 'authentication.login.success':
          await this.handleAuthenticationEvent({
            type: 'login_success',
            userId: event.userId!,
            sessionId: event.sessionId,
            details: event.data,
            timestamp: event.timestamp,
            ip: event.data['ip'],
            userAgent: event.data['userAgent'],
          });
          break;

        case 'authentication.login.failure':
          await this.handleAuthenticationEvent({
            type: 'login_failure',
            userId: event.userId!,
            details: event.data,
            timestamp: event.timestamp,
            ip: event.data['ip'],
            userAgent: event.data['userAgent'],
          });
          break;

        case 'authentication.logout':
          await this.handleAuthenticationEvent({
            type: 'logout',
            userId: event.userId!,
            sessionId: event.sessionId,
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        case 'authentication.mfa.challenge':
          await this.handleAuthenticationEvent({
            type: 'mfa_challenge',
            userId: event.userId!,
            sessionId: event.sessionId,
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        case 'authentication.password.change':
          await this.handleAuthenticationEvent({
            type: 'password_change',
            userId: event.userId!,
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        // Security events
        case 'security.high_risk.detected':
          await this.handleSecurityEvent({
            type: 'high_risk_detected',
            userId: event.userId,
            sessionId: event.sessionId,
            details: event.data,
            severity: 'high',
            timestamp: event.timestamp,
            source: 'risk_detection_system',
          });
          break;

        case 'security.rate_limit.exceeded':
          await this.handleSecurityEvent({
            type: 'rate_limit_exceeded',
            userId: event.userId,
            details: event.data,
            severity: 'medium',
            timestamp: event.timestamp,
            source: 'rate_limiter',
          });
          break;

        case 'security.suspicious.activity':
          await this.handleSecurityEvent({
            type: 'suspicious_activity',
            userId: event.userId,
            sessionId: event.sessionId,
            details: event.data,
            severity: 'high',
            timestamp: event.timestamp,
            source: 'behavior_analysis',
          });
          break;

        // Session events
        case 'session.created':
          await this.handleSessionEvent({
            type: 'session_created',
            userId: event.userId!,
            sessionId: event.sessionId!,
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        case 'session.expired':
          await this.handleSessionEvent({
            type: 'session_expired',
            userId: event.userId!,
            sessionId: event.sessionId!,
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        case 'session.revoked':
          await this.handleSessionEvent({
            type: 'session_revoked',
            userId: event.userId!,
            sessionId: event.sessionId!,
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        // Admin events
        case 'user.created':
        case 'user.updated':
        case 'user.deleted':
          await this.handleAdminEvent({
            type: event.type.replace('user.', 'user_') as AdminEvent['type'],
            adminUserId: event.data['adminUserId'] || 'system',
            targetUserId: event.userId || 'unknown',
            details: event.data,
            timestamp: event.timestamp,
          });
          break;

        default:
          // For other events, just log them
          logger.debug('Unhandled event type for real-time notifications', {
            eventType: event.type,
            eventId: event.id,
          });
      }
    } catch (error) {
      logger.error('Error handling specific event type', {
        eventType: event.type,
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Handle authentication event
   */
  private async handleAuthenticationEvent(
    event: AuthenticationEvent
  ): Promise<void> {
    await this.notificationService.sendAuthenticationNotification(event);
  }

  /**
   * Handle security event
   */
  private async handleSecurityEvent(event: SecurityEvent): Promise<void> {
    await this.notificationService.sendSecurityAlert(event);
  }

  /**
   * Handle session event
   */
  private async handleSessionEvent(event: SessionEvent): Promise<void> {
    await this.notificationService.sendSessionNotification(event);
  }

  /**
   * Handle admin event
   */
  private async handleAdminEvent(event: AdminEvent): Promise<void> {
    await this.notificationService.sendAdminNotification(event);
  }

  /**
   * Publish authentication event
   */
  async publishAuthenticationEvent(
    eventType: string,
    userId: string,
    sessionId?: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const event = new WebhookEvent(
        this.generateEventId(),
        eventType,
        data || {},
        userId,
        sessionId,
        new Date(),
        {},
        undefined
      );
      
      await this.eventPublisher.publishEvent(event);

      logger.debug('Authentication event published', {
        eventType,
        userId,
        sessionId,
      });
    } catch (error) {
      logger.error('Error publishing authentication event', {
        eventType,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Publish security event
   */
  async publishSecurityEvent(
    eventType: string,
    userId?: string,
    sessionId?: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const event = new WebhookEvent(
        this.generateEventId(),
        eventType,
        data || {},
        userId,
        sessionId,
        new Date(),
        {},
        undefined
      );
      
      await this.eventPublisher.publishEvent(event);

      logger.debug('Security event published', {
        eventType,
        userId,
        sessionId,
      });
    } catch (error) {
      logger.error('Error publishing security event', {
        eventType,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send real-time notification to user
   */
  async sendUserNotification(
    userId: string,
    type: 'info' | 'warning' | 'error' | 'success',
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const notification = {
        id: this.generateNotificationId(),
        type,
        title,
        message,
        userId,
        data,
        timestamp: new Date(),
      };

      await this.notificationService.sendUserNotification(userId, notification);

      logger.debug('User notification sent', {
        userId,
        type,
        title,
      });
    } catch (error) {
      logger.error('Error sending user notification', {
        userId,
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send broadcast notification
   */
  async sendBroadcastNotification(
    type: 'info' | 'warning' | 'error' | 'success',
    title: string,
    message: string,
    data?: Record<string, any>
  ): Promise<void> {
    try {
      const notification = {
        id: this.generateNotificationId(),
        type,
        title,
        message,
        data,
        timestamp: new Date(),
      };

      await this.notificationService.sendBroadcastNotification(notification);

      logger.info('Broadcast notification sent', {
        type,
        title,
      });
    } catch (error) {
      logger.error('Error sending broadcast notification', {
        type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Disconnect user sessions (for security purposes)
   */
  async disconnectUserSessions(userId: string, reason: string): Promise<void> {
    try {
      const disconnectedCount =
        await this.sessionManager.disconnectUserConnections(userId, reason);

      logger.info('User WebSocket sessions disconnected', {
        userId,
        reason,
        disconnectedCount,
      });
    } catch (error) {
      logger.error('Error disconnecting user sessions', {
        userId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get WebSocket statistics
   */
  async getWebSocketStats(): Promise<{
    server: any;
    global: any;
    notifications: any;
  }> {
    try {
      const serverHealth = await this.webSocketServer.healthCheck();
      const globalStats = await this.sessionManager.getGlobalStats();
      const notificationStats = this.notificationService.getStats();

      return {
        server: serverHealth,
        global: globalStats,
        notifications: notificationStats,
      };
    } catch (error) {
      logger.error('Error getting WebSocket stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        server: { healthy: false },
        global: { totalConnections: 0 },
        notifications: { queueLength: 0 },
      };
    }
  }

  /**
   * Health check for WebSocket integration
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    components: {
      webSocketServer: boolean;
      sessionManager: boolean;
      notificationService: boolean;
    };
  }> {
    try {
      const serverHealth = await this.webSocketServer.healthCheck();
      const sessionHealth = await this.sessionManager.getConnectionHealth();
      const notificationHealth = await this.notificationService.healthCheck();

      const healthy =
        serverHealth.healthy &&
        sessionHealth.healthy &&
        notificationHealth.healthy;

      return {
        healthy,
        components: {
          webSocketServer: serverHealth.healthy,
          sessionManager: sessionHealth.healthy,
          notificationService: notificationHealth.healthy,
        },
      };
    } catch (error) {
      logger.error('Error in WebSocket integration health check', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        components: {
          webSocketServer: false,
          sessionManager: false,
          notificationService: false,
        },
      };
    }
  }

  /**
   * Generate unique notification ID
   */
  private generateNotificationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `notif_${timestamp}_${random}`;
  }

  /**
   * Generate unique event ID
   */
  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `event_${timestamp}_${random}`;
  }
}
