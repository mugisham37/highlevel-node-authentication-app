/**
 * Webhook WebSocket Controller
 * Handles real-time event streaming via WebSocket connections
 */

import { FastifyInstance } from 'fastify';
import { WebSocket } from 'ws';
import { IEventPublisher } from '../../application/interfaces/webhook.interface';
import { WebhookEvent } from "@company/shared"entities/webhook';
import { logger } from '../../infrastructure/logging/winston-logger';
import { EventSubscriptionSchema } from '../schemas/webhook.schemas';

interface WebSocketConnection {
  id: string;
  userId: string;
  socket: WebSocket;
  subscriptions: string[];
  lastActivity: Date;
  authenticated: boolean;
}

export class WebhookWebSocketController {
  private connections = new Map<string, WebSocketConnection>();

  constructor(private readonly eventPublisher: IEventPublisher) {
    this.startCleanupInterval();
  }

  /**
   * Register WebSocket routes
   */
  async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // WebSocket endpoint for real-time event streaming
    const self = this;
    fastify.register(async function (fastify) {
      await fastify.register(require('@fastify/websocket'));

      fastify.get(
        '/events/stream',
        { websocket: true },
        (connection, request) => {
          self.handleWebSocketConnection(connection, request);
        }
      );
    });
  }

  /**
   * Handle new WebSocket connection
   */
  private handleWebSocketConnection(
    connection: WebSocket,
    request: any
  ): void {
    const connectionId = this.generateConnectionId();
    const userId = request.user?.id;

    if (!userId) {
      connection.close(1008, 'Authentication required');
      return;
    }

    const wsConnection: WebSocketConnection = {
      id: connectionId,
      userId,
      socket: connection,
      subscriptions: [],
      lastActivity: new Date(),
      authenticated: true,
    };

    this.connections.set(connectionId, wsConnection);

    logger.info('WebSocket connection established', {
      connectionId,
      userId,
      correlationId: request.correlationId,
    });

    // Handle incoming messages
    connection.on('message', (message: Buffer) => {
      this.handleWebSocketMessage(connectionId, message);
    });

    // Handle connection close
    connection.on('close', (code: number, reason: Buffer) => {
      this.handleWebSocketClose(connectionId, code, reason);
    });

    // Handle connection error
    connection.on('error', (error: Error) => {
      this.handleWebSocketError(connectionId, error);
    });

    // Send welcome message
    this.sendMessage(connectionId, {
      type: 'connection.established',
      data: {
        connectionId,
        timestamp: new Date().toISOString(),
        supportedCommands: [
          'subscribe',
          'unsubscribe',
          'ping',
          'get_subscriptions',
        ],
      },
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private handleWebSocketMessage(connectionId: string, message: Buffer): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const data = JSON.parse(message.toString());
      connection.lastActivity = new Date();

      logger.debug('WebSocket message received', {
        connectionId,
        messageType: data.type,
        userId: connection.userId,
      });

      switch (data.type) {
        case 'subscribe':
          this.handleSubscribe(connectionId, data.payload);
          break;

        case 'unsubscribe':
          this.handleUnsubscribe(connectionId, data.payload);
          break;

        case 'ping':
          this.handlePing(connectionId);
          break;

        case 'get_subscriptions':
          this.handleGetSubscriptions(connectionId);
          break;

        default:
          this.sendError(connectionId, 'Unknown message type', data.type);
      }
    } catch (error) {
      logger.error('Error processing WebSocket message', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.sendError(connectionId, 'Invalid message format');
    }
  }

  /**
   * Handle subscription request
   */
  private handleSubscribe(connectionId: string, payload: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const validatedPayload = EventSubscriptionSchema.parse(payload);

      // Add event types to connection subscriptions
      for (const eventType of validatedPayload.eventTypes) {
        if (!connection.subscriptions.includes(eventType)) {
          connection.subscriptions.push(eventType);
        }
      }

      // Subscribe to event publisher
      const subscriptionId = this.eventPublisher.subscribeToEventStream(
        connection.userId,
        validatedPayload.eventTypes,
        (event: WebhookEvent) => {
          this.broadcastEventToConnection(connectionId, event);
        }
      );

      this.sendMessage(connectionId, {
        type: 'subscription.success',
        data: {
          subscriptionId,
          eventTypes: validatedPayload.eventTypes,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('WebSocket subscription created', {
        connectionId,
        userId: connection.userId,
        eventTypes: validatedPayload.eventTypes,
        subscriptionId,
      });
    } catch (error) {
      logger.error('Error handling subscription', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.sendError(connectionId, 'Invalid subscription request', payload);
    }
  }

  /**
   * Handle unsubscription request
   */
  private handleUnsubscribe(connectionId: string, payload: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const { eventTypes, subscriptionId } = payload;

      if (subscriptionId) {
        // Unsubscribe from event publisher
        this.eventPublisher.unsubscribeFromEventStream(subscriptionId);
      }

      if (eventTypes && Array.isArray(eventTypes)) {
        // Remove event types from connection subscriptions
        connection.subscriptions = connection.subscriptions.filter(
          (type) => !eventTypes.includes(type)
        );
      }

      this.sendMessage(connectionId, {
        type: 'unsubscription.success',
        data: {
          eventTypes: eventTypes || [],
          subscriptionId,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('WebSocket unsubscription processed', {
        connectionId,
        userId: connection.userId,
        eventTypes,
        subscriptionId,
      });
    } catch (error) {
      logger.error('Error handling unsubscription', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      this.sendError(connectionId, 'Invalid unsubscription request', payload);
    }
  }

  /**
   * Handle ping request
   */
  private handlePing(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.sendMessage(connectionId, {
      type: 'pong',
      data: {
        timestamp: new Date().toISOString(),
        connectionId,
      },
    });
  }

  /**
   * Handle get subscriptions request
   */
  private handleGetSubscriptions(connectionId: string): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    this.sendMessage(connectionId, {
      type: 'subscriptions.list',
      data: {
        subscriptions: connection.subscriptions,
        connectionId,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle WebSocket connection close
   */
  private handleWebSocketClose(
    connectionId: string,
    code: number,
    reason: Buffer
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    logger.info('WebSocket connection closed', {
      connectionId,
      userId: connection.userId,
      code,
      reason: reason.toString(),
    });

    // Clean up subscriptions
    const activeSubscriptions = this.eventPublisher.getActiveSubscriptions(
      connection.userId
    );
    for (const subscription of activeSubscriptions) {
      this.eventPublisher.unsubscribeFromEventStream(subscription.id);
    }

    this.connections.delete(connectionId);
  }

  /**
   * Handle WebSocket error
   */
  private handleWebSocketError(connectionId: string, error: Error): void {
    const connection = this.connections.get(connectionId);

    logger.error('WebSocket connection error', {
      connectionId,
      userId: connection?.userId,
      error: error.message,
    });

    if (connection) {
      this.connections.delete(connectionId);
    }
  }

  /**
   * Broadcast event to specific connection
   */
  private broadcastEventToConnection(
    connectionId: string,
    event: WebhookEvent
  ): void {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Check if connection should receive this event
    const shouldReceive = connection.subscriptions.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return event.type.startsWith(prefix);
      }
      return pattern === event.type;
    });

    if (!shouldReceive) return;

    this.sendMessage(connectionId, {
      type: 'event',
      data: {
        id: event.id,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp.toISOString(),
        userId: event.userId,
        sessionId: event.sessionId,
        metadata: event.metadata,
        correlationId: event.correlationId,
      },
    });
  }

  /**
   * Broadcast event to all connections
   */
  broadcastEvent(event: WebhookEvent): void {
    for (const [connectionId, connection] of this.connections) {
      // Only broadcast to connections for the same user or global events
      if (event.userId && event.userId !== connection.userId) {
        continue;
      }

      this.broadcastEventToConnection(connectionId, event);
    }
  }

  /**
   * Send message to specific connection
   */
  private sendMessage(connectionId: string, message: any): void {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== 1) return;

    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Error sending WebSocket message', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Remove broken connection
      this.connections.delete(connectionId);
    }
  }

  /**
   * Send error message to connection
   */
  private sendError(
    connectionId: string,
    message: string,
    details?: any
  ): void {
    this.sendMessage(connectionId, {
      type: 'error',
      data: {
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `ws_${timestamp}_${random}`;
  }

  /**
   * Start cleanup interval for inactive connections
   */
  private startCleanupInterval(): void {
    setInterval(
      () => {
        const now = new Date();
        const inactiveThreshold = 30 * 60 * 1000; // 30 minutes

        for (const [connectionId, connection] of this.connections) {
          const inactiveTime =
            now.getTime() - connection.lastActivity.getTime();

          if (inactiveTime > inactiveThreshold) {
            logger.info('Closing inactive WebSocket connection', {
              connectionId,
              userId: connection.userId,
              inactiveTime,
            });

            connection.socket.close(1000, 'Connection inactive');
            this.connections.delete(connectionId);
          }
        }
      },
      5 * 60 * 1000
    ); // Check every 5 minutes
  }

  /**
   * Get connection statistics
   */
  getStats(): {
    totalConnections: number;
    connectionsByUser: Record<string, number>;
    totalSubscriptions: number;
    activeEventTypes: string[];
  } {
    const connectionsByUser: Record<string, number> = {};
    const allSubscriptions: string[] = [];

    for (const connection of this.connections.values()) {
      connectionsByUser[connection.userId] =
        (connectionsByUser[connection.userId] || 0) + 1;
      allSubscriptions.push(...connection.subscriptions);
    }

    const activeEventTypes = [...new Set(allSubscriptions)];

    return {
      totalConnections: this.connections.size,
      connectionsByUser,
      totalSubscriptions: allSubscriptions.length,
      activeEventTypes,
    };
  }

  /**
   * Health check for WebSocket service
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    totalConnections: number;
    activeSubscriptions: number;
  }> {
    const stats = this.getStats();

    return {
      healthy: stats.totalConnections < 10000, // Consider unhealthy if too many connections
      totalConnections: stats.totalConnections,
      activeSubscriptions: stats.totalSubscriptions,
    };
  }
}

