/**
 * Real-time Notification Service
 * Handles real-time notifications for security events and authentication activities
 */

import { logger } from '../logging/winston-logger';
import { WebSocketServer } from './websocket-server';
import { WebSocketSessionManager } from './websocket-session-manager';
import {
  WebSocketEvent,
  SecurityEvent,
  AuthenticationEvent,
  SessionEvent,
  AdminEvent,
  WebSocketNotification,
  RealTimeEvent,
} from './types';

export class RealTimeNotificationService {
  private notificationQueue: WebSocketNotification[] = [];
  private isProcessingQueue = false;

  constructor(
    private readonly webSocketServer: WebSocketServer,
    private readonly sessionManager: WebSocketSessionManager
  ) {
    this.startQueueProcessor();
  }

  /**
   * Send security alert notification
   */
  async sendSecurityAlert(event: SecurityEvent): Promise<void> {
    try {
      const notification: WebSocketNotification = {
        id: this.generateNotificationId(),
        type: this.mapSecurityEventToNotificationType(event.type),
        title: this.getSecurityEventTitle(event.type),
        message: this.getSecurityEventMessage(event),
        userId: event.userId || undefined,
        data: {
          eventType: event.type,
          severity: event.severity,
          source: event.source,
          details: event.details,
        },
        timestamp: event.timestamp,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      // Send to specific user if userId is provided
      if (event.userId) {
        await this.sendUserNotification(event.userId, notification);
      }

      // Send to admin users for high severity events
      if (event.severity === 'high' || event.severity === 'critical') {
        await this.sendAdminNotificationBroadcast(notification);
      }

      // Create WebSocket event
      const wsEvent: WebSocketEvent = {
        id: this.generateEventId(),
        type: 'security.alert',
        data: {
          notification,
          event,
        },
        timestamp: new Date().toISOString(),
        userId: event.userId || undefined,
        sessionId: event.sessionId || undefined,
        metadata: {
          priority: this.mapSeverityToPriority(event.severity),
          source: 'security_system',
        },
      };

      await this.webSocketServer.broadcastEvent(wsEvent);

      logger.info('Security alert sent', {
        eventType: event.type,
        severity: event.severity,
        userId: event.userId,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending security alert', {
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send authentication event notification
   */
  async sendAuthenticationNotification(
    event: AuthenticationEvent
  ): Promise<void> {
    try {
      const notification: WebSocketNotification = {
        id: this.generateNotificationId(),
        type: this.mapAuthEventToNotificationType(event.type),
        title: this.getAuthEventTitle(event.type),
        message: this.getAuthEventMessage(event),
        userId: event.userId,
        data: {
          eventType: event.type,
          details: event.details,
          ip: event.ip,
          userAgent: event.userAgent,
        },
        timestamp: event.timestamp,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
      };

      await this.sendUserNotification(event.userId, notification);

      // Create WebSocket event
      const wsEvent: WebSocketEvent = {
        id: this.generateEventId(),
        type: `authentication.${event.type}`,
        data: {
          notification,
          event,
        },
        timestamp: new Date().toISOString(),
        userId: event.userId || undefined,
        sessionId: event.sessionId || undefined,
        metadata: {
          priority: event.type.includes('failure') ? 'high' : 'normal',
          source: 'authentication_system',
        },
      };

      await this.webSocketServer.broadcastEvent(wsEvent);

      logger.debug('Authentication notification sent', {
        eventType: event.type,
        userId: event.userId,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending authentication notification', {
        eventType: event.type,
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send session event notification
   */
  async sendSessionNotification(event: SessionEvent): Promise<void> {
    try {
      const notification: WebSocketNotification = {
        id: this.generateNotificationId(),
        type: this.mapSessionEventToNotificationType(event.type),
        title: this.getSessionEventTitle(event.type),
        message: this.getSessionEventMessage(event),
        userId: event.userId,
        data: {
          eventType: event.type,
          sessionId: event.sessionId,
          details: event.details,
        },
        timestamp: event.timestamp,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
      };

      await this.sendUserNotification(event.userId, notification);

      // Create WebSocket event
      const wsEvent: WebSocketEvent = {
        id: this.generateEventId(),
        type: `session.${event.type}`,
        data: {
          notification,
          event,
        },
        timestamp: new Date().toISOString(),
        userId: event.userId || undefined,
        sessionId: event.sessionId || undefined,
        metadata: {
          priority:
            event.type === 'concurrent_session_limit' ? 'high' : 'normal',
          source: 'session_system',
        },
      };

      await this.webSocketServer.broadcastEvent(wsEvent);

      logger.debug('Session notification sent', {
        eventType: event.type,
        userId: event.userId,
        sessionId: event.sessionId,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending session notification', {
        eventType: event.type,
        userId: event.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send admin event notification
   */
  async sendAdminNotification(event: AdminEvent): Promise<void> {
    try {
      const notification: WebSocketNotification = {
        id: this.generateNotificationId(),
        type: 'info',
        title: this.getAdminEventTitle(event.type),
        message: this.getAdminEventMessage(event),
        data: {
          eventType: event.type,
          adminUserId: event.adminUserId,
          targetUserId: event.targetUserId,
          details: event.details,
        },
        timestamp: event.timestamp,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days
      };

      // Send to all admin users
      await this.sendAdminNotificationBroadcast(notification);

      // Create WebSocket event
      const wsEvent: WebSocketEvent = {
        id: this.generateEventId(),
        type: `admin.${event.type}`,
        data: {
          notification,
          event,
        },
        timestamp: new Date().toISOString(),
        metadata: {
          priority: 'normal',
          source: 'admin_system',
        },
      };

      await this.webSocketServer.broadcastEvent(wsEvent);

      logger.info('Admin notification sent', {
        eventType: event.type,
        adminUserId: event.adminUserId,
        targetUserId: event.targetUserId,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending admin notification', {
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send custom notification to user
   */
  async sendUserNotification(
    userId: string,
    notification: WebSocketNotification
  ): Promise<void> {
    try {
      // Add to notification queue for processing
      this.notificationQueue.push(notification);

      // Send via session manager
      await this.sessionManager.sendUserNotification(userId, notification);

      logger.debug('User notification queued', {
        userId,
        notificationId: notification.id,
        type: notification.type,
      });
    } catch (error) {
      logger.error('Error sending user notification', {
        userId,
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send notification to all admin users
   */
  async sendAdminNotificationBroadcast(
    notification: WebSocketNotification
  ): Promise<void> {
    try {
      // Create admin-specific WebSocket event
      const wsEvent: WebSocketEvent = {
        id: this.generateEventId(),
        type: 'admin.notification',
        data: notification,
        timestamp: new Date().toISOString(),
        metadata: {
          priority: notification.type === 'error' ? 'high' : 'normal',
          source: 'notification_system',
          adminOnly: true,
        },
      };

      await this.webSocketServer.broadcastEvent(wsEvent);

      logger.debug('Admin notification sent', {
        notificationId: notification.id,
        type: notification.type,
      });
    } catch (error) {
      logger.error('Error sending admin notification', {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send broadcast notification to all users
   */
  async sendBroadcastNotification(
    notification: WebSocketNotification
  ): Promise<void> {
    try {
      await this.sessionManager.sendBroadcastNotification(notification);

      logger.info('Broadcast notification sent', {
        notificationId: notification.id,
        type: notification.type,
      });
    } catch (error) {
      logger.error('Error sending broadcast notification', {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Send system maintenance notification
   */
  async sendMaintenanceNotification(
    title: string,
    message: string,
    scheduledTime: Date,
    duration: number
  ): Promise<void> {
    try {
      const notification: WebSocketNotification = {
        id: this.generateNotificationId(),
        type: 'warning',
        title,
        message,
        data: {
          scheduledTime: scheduledTime.toISOString(),
          duration,
          type: 'maintenance',
        },
        timestamp: new Date(),
        expiresAt: new Date(scheduledTime.getTime() + duration * 60 * 1000),
      };

      await this.sendBroadcastNotification(notification);

      logger.info('Maintenance notification sent', {
        scheduledTime,
        duration,
        notificationId: notification.id,
      });
    } catch (error) {
      logger.error('Error sending maintenance notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Process real-time event
   */
  async processRealTimeEvent(event: RealTimeEvent): Promise<void> {
    try {
      switch (event.type) {
        case 'high_risk_detected':
        case 'rate_limit_exceeded':
        case 'suspicious_activity':
        case 'authentication_failure':
          await this.sendSecurityAlert(event as SecurityEvent);
          break;

        case 'login_success':
        case 'login_failure':
        case 'logout':
        case 'token_refresh':
        case 'mfa_challenge':
        case 'password_change':
          await this.sendAuthenticationNotification(
            event as AuthenticationEvent
          );
          break;

        case 'session_created':
        case 'session_expired':
        case 'session_revoked':
        case 'concurrent_session_limit':
          await this.sendSessionNotification(event as SessionEvent);
          break;

        case 'user_created':
        case 'user_updated':
        case 'user_deleted':
        case 'role_assigned':
        case 'permission_granted':
          await this.sendAdminNotification(event as AdminEvent);
          break;

        default:
          // This should never happen if all event types are handled
          const exhaustiveCheck: never = event;
          logger.warn('Unknown real-time event type', {
            eventType: (exhaustiveCheck as any).type,
          });
      }
    } catch (error) {
      logger.error('Error processing real-time event', {
        eventType: event.type,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Start notification queue processor
   */
  private startQueueProcessor(): void {
    setInterval(async () => {
      if (!this.isProcessingQueue && this.notificationQueue.length > 0) {
        await this.processNotificationQueue();
      }
    }, 1000); // Process every second
  }

  /**
   * Process notification queue
   */
  private async processNotificationQueue(): Promise<void> {
    if (this.isProcessingQueue) return;

    this.isProcessingQueue = true;

    try {
      while (this.notificationQueue.length > 0) {
        const notification = this.notificationQueue.shift()!;

        // Check if notification has expired
        if (notification.expiresAt && new Date() > notification.expiresAt) {
          continue;
        }

        // Process notification (could include database storage, email sending, etc.)
        await this.processNotification(notification);
      }
    } finally {
      this.isProcessingQueue = false;
    }
  }

  /**
   * Process individual notification
   */
  private async processNotification(
    notification: WebSocketNotification
  ): Promise<void> {
    try {
      // Here you could add additional processing like:
      // - Store in database
      // - Send email for critical notifications
      // - Send SMS for high-priority alerts
      // - Log to audit system

      logger.debug('Notification processed', {
        notificationId: notification.id,
        type: notification.type,
        userId: notification.userId,
      });
    } catch (error) {
      logger.error('Error processing notification', {
        notificationId: notification.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  // Helper methods for mapping events to notification types and messages

  private mapSecurityEventToNotificationType(
    type: SecurityEvent['type']
  ): WebSocketNotification['type'] {
    switch (type) {
      case 'high_risk_detected':
      case 'suspicious_activity':
        return 'error';
      case 'rate_limit_exceeded':
        return 'warning';
      case 'authentication_failure':
        return 'warning';
      default:
        return 'info';
    }
  }

  private mapAuthEventToNotificationType(
    type: AuthenticationEvent['type']
  ): WebSocketNotification['type'] {
    switch (type) {
      case 'login_failure':
        return 'warning';
      case 'login_success':
      case 'logout':
        return 'success';
      case 'mfa_challenge':
        return 'info';
      case 'password_change':
        return 'success';
      default:
        return 'info';
    }
  }

  private mapSessionEventToNotificationType(
    type: SessionEvent['type']
  ): WebSocketNotification['type'] {
    switch (type) {
      case 'session_expired':
      case 'session_revoked':
        return 'warning';
      case 'concurrent_session_limit':
        return 'error';
      case 'session_created':
        return 'success';
      default:
        return 'info';
    }
  }

  private mapSeverityToPriority(
    severity: SecurityEvent['severity']
  ): 'low' | 'normal' | 'high' | 'critical' {
    switch (severity) {
      case 'low':
        return 'low';
      case 'medium':
        return 'normal';
      case 'high':
        return 'high';
      case 'critical':
        return 'critical';
      default:
        return 'normal';
    }
  }

  private getSecurityEventTitle(type: SecurityEvent['type']): string {
    switch (type) {
      case 'high_risk_detected':
        return 'High Risk Activity Detected';
      case 'rate_limit_exceeded':
        return 'Rate Limit Exceeded';
      case 'suspicious_activity':
        return 'Suspicious Activity Detected';
      case 'authentication_failure':
        return 'Authentication Failure';
      default:
        return 'Security Alert';
    }
  }

  private getAuthEventTitle(type: AuthenticationEvent['type']): string {
    switch (type) {
      case 'login_success':
        return 'Successful Login';
      case 'login_failure':
        return 'Login Failed';
      case 'logout':
        return 'Logged Out';
      case 'token_refresh':
        return 'Token Refreshed';
      case 'mfa_challenge':
        return 'MFA Challenge';
      case 'password_change':
        return 'Password Changed';
      default:
        return 'Authentication Event';
    }
  }

  private getSessionEventTitle(type: SessionEvent['type']): string {
    switch (type) {
      case 'session_created':
        return 'New Session Created';
      case 'session_expired':
        return 'Session Expired';
      case 'session_revoked':
        return 'Session Revoked';
      case 'concurrent_session_limit':
        return 'Session Limit Reached';
      default:
        return 'Session Event';
    }
  }

  private getAdminEventTitle(type: AdminEvent['type']): string {
    switch (type) {
      case 'user_created':
        return 'User Created';
      case 'user_updated':
        return 'User Updated';
      case 'user_deleted':
        return 'User Deleted';
      case 'role_assigned':
        return 'Role Assigned';
      case 'permission_granted':
        return 'Permission Granted';
      default:
        return 'Admin Action';
    }
  }

  private getSecurityEventMessage(event: SecurityEvent): string {
    return `Security event detected: ${event.type}. Severity: ${event.severity}. Source: ${event.source}`;
  }

  private getAuthEventMessage(event: AuthenticationEvent): string {
    return `Authentication event: ${event.type} for user ${event.userId}`;
  }

  private getSessionEventMessage(event: SessionEvent): string {
    return `Session event: ${event.type} for session ${event.sessionId}`;
  }

  private getAdminEventMessage(event: AdminEvent): string {
    return `Admin action: ${event.type} performed by ${event.adminUserId}`;
  }

  private generateNotificationId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `notif_${timestamp}_${random}`;
  }

  private generateEventId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `event_${timestamp}_${random}`;
  }

  /**
   * Get notification statistics
   */
  getStats(): {
    queueLength: number;
    totalProcessed: number;
    processingRate: number;
  } {
    return {
      queueLength: this.notificationQueue.length,
      totalProcessed: 0, // Would need to track this
      processingRate: 0, // Would need to calculate this
    };
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    queueLength: number;
    processing: boolean;
  }> {
    return {
      healthy: this.notificationQueue.length < 1000,
      queueLength: this.notificationQueue.length,
      processing: this.isProcessingQueue,
    };
  }
}
