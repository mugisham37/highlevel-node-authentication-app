/**
 * WebSocket Server Infrastructure
 * Handles WebSocket server setup, connection management, and Redis scaling
 */

import { FastifyInstance } from 'fastify';
import { SocketStream } from '@fastify/websocket';
import { Redis, Cluster } from 'ioredis';
import { logger } from '../logging/winston-logger';
import { getRedisClient } from '../cache/redis-client';
import { WebSocketConnection, WebSocketMessage, WebSocketEvent } from './types';
import { WebSocketAuthenticator } from './websocket-authenticator';
import { WebSocketSessionManager } from './websocket-session-manager';

export class WebSocketServer {
  private connections = new Map<string, WebSocketConnection>();
  private redisClient: Redis | Cluster;
  private authenticator: WebSocketAuthenticator;
  private sessionManager: WebSocketSessionManager;
  private serverId: string;
  private isShuttingDown = false;

  constructor() {
    this.redisClient = getRedisClient().getClient();
    this.authenticator = new WebSocketAuthenticator();
    this.sessionManager = new WebSocketSessionManager(this.redisClient);
    this.serverId = this.generateServerId();

    this.setupRedisSubscriptions();
    this.startHeartbeat();
    this.startCleanupInterval();
  }

  /**
   * Initialize WebSocket server with Fastify
   */
  async initialize(fastify: FastifyInstance): Promise<void> {
    try {
      // Register WebSocket plugin
      await fastify.register(require('@fastify/websocket'), {
        options: {
          maxPayload: 1024 * 1024, // 1MB max payload
          verifyClient: (info: any) => this.verifyClient(info),
        },
      });

      // Register WebSocket routes
      await this.registerRoutes(fastify);

      logger.info('WebSocket server initialized', {
        serverId: this.serverId,
      });
    } catch (error) {
      logger.error('Failed to initialize WebSocket server', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Register WebSocket routes
   */
  private async registerRoutes(fastify: FastifyInstance): Promise<void> {
    // Main WebSocket endpoint for real-time events
    fastify.get('/ws/events', { websocket: true }, (connection, request) => {
      this.handleConnection(connection, request);
    });

    // WebSocket endpoint for admin events
    fastify.get('/ws/admin', { websocket: true }, (connection, request) => {
      this.handleAdminConnection(connection, request);
    });

    // WebSocket health check endpoint
    fastify.get('/ws/health', { websocket: true }, (connection, request) => {
      this.handleHealthCheck(connection, request);
    });
  }

  /**
   * Verify client connection
   */
  private verifyClient(info: any): boolean {
    // Basic verification - can be extended with more sophisticated checks
    const origin = info.origin;
    const userAgent = info.req.headers['user-agent'];

    // Log connection attempt
    logger.debug('WebSocket connection attempt', {
      origin,
      userAgent,
      ip: info.req.connection.remoteAddress,
    });

    return true; // Allow all connections for now
  }

  /**
   * Handle new WebSocket connection
   */
  private async handleConnection(
    connection: SocketStream,
    request: any
  ): Promise<void> {
    const connectionId = this.generateConnectionId();

    try {
      // Authenticate the connection
      const authResult = await this.authenticator.authenticate(request);

      if (!authResult.success) {
        connection.socket.close(1008, 'Authentication failed');
        return;
      }

      // Create connection object
      const wsConnection: WebSocketConnection = {
        id: connectionId,
        userId: authResult.userId!,
        socket: connection,
        subscriptions: [],
        lastActivity: new Date(),
        authenticated: true,
        serverId: this.serverId,
        metadata: {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
          origin: request.headers.origin,
        },
      };

      // Store connection
      this.connections.set(connectionId, wsConnection);

      // Register connection in Redis for scaling
      await this.sessionManager.registerConnection(wsConnection);

      logger.info('WebSocket connection established', {
        connectionId,
        userId: wsConnection.userId,
        serverId: this.serverId,
      });

      // Setup connection handlers
      this.setupConnectionHandlers(wsConnection);

      // Send welcome message
      await this.sendMessage(connectionId, {
        type: 'connection.established',
        data: {
          connectionId,
          serverId: this.serverId,
          timestamp: new Date().toISOString(),
          capabilities: [
            'event_streaming',
            'real_time_notifications',
            'security_alerts',
            'session_management',
          ],
        },
      });
    } catch (error) {
      logger.error('Error handling WebSocket connection', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      connection.socket.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle admin WebSocket connection
   */
  private async handleAdminConnection(
    connection: SocketStream,
    request: any
  ): Promise<void> {
    const connectionId = this.generateConnectionId();

    try {
      // Authenticate with admin privileges
      const authResult = await this.authenticator.authenticateAdmin(request);

      if (!authResult.success) {
        connection.socket.close(1008, 'Admin authentication required');
        return;
      }

      const wsConnection: WebSocketConnection = {
        id: connectionId,
        userId: authResult.userId!,
        socket: connection,
        subscriptions: ['admin.*', 'security.*', 'system.*'],
        lastActivity: new Date(),
        authenticated: true,
        serverId: this.serverId,
        metadata: {
          userAgent: request.headers['user-agent'],
          ip: request.ip,
          origin: request.headers.origin,
          admin: true,
        },
      };

      this.connections.set(connectionId, wsConnection);
      await this.sessionManager.registerConnection(wsConnection);

      this.setupConnectionHandlers(wsConnection);

      await this.sendMessage(connectionId, {
        type: 'admin.connection.established',
        data: {
          connectionId,
          serverId: this.serverId,
          timestamp: new Date().toISOString(),
          adminCapabilities: [
            'system_monitoring',
            'user_management',
            'security_events',
            'performance_metrics',
          ],
        },
      });

      logger.info('Admin WebSocket connection established', {
        connectionId,
        userId: wsConnection.userId,
        serverId: this.serverId,
      });
    } catch (error) {
      logger.error('Error handling admin WebSocket connection', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      connection.socket.close(1011, 'Internal server error');
    }
  }

  /**
   * Handle health check connection
   */
  private handleHealthCheck(connection: SocketStream, request: any): void {
    const stats = this.getServerStats();

    connection.socket.send(
      JSON.stringify({
        type: 'health.check',
        data: {
          healthy: true,
          serverId: this.serverId,
          stats,
          timestamp: new Date().toISOString(),
        },
      })
    );

    connection.socket.close(1000, 'Health check complete');
  }

  /**
   * Setup connection event handlers
   */
  private setupConnectionHandlers(connection: WebSocketConnection): void {
    const { socket } = connection;

    // Handle incoming messages
    socket.on('message', async (message: Buffer) => {
      await this.handleMessage(connection.id, message);
    });

    // Handle connection close
    socket.on('close', async (code: number, reason: Buffer) => {
      await this.handleConnectionClose(connection.id, code, reason);
    });

    // Handle connection error
    socket.on('error', async (error: Error) => {
      await this.handleConnectionError(connection.id, error);
    });

    // Handle pong (heartbeat response)
    socket.on('pong', () => {
      connection.lastActivity = new Date();
    });
  }

  /**
   * Handle incoming WebSocket message
   */
  private async handleMessage(
    connectionId: string,
    message: Buffer
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const data: WebSocketMessage = JSON.parse(message.toString());
      connection.lastActivity = new Date();

      logger.debug('WebSocket message received', {
        connectionId,
        messageType: data.type,
        userId: connection.userId,
      });

      switch (data.type) {
        case 'subscribe':
          await this.handleSubscribe(connectionId, data.payload);
          break;

        case 'unsubscribe':
          await this.handleUnsubscribe(connectionId, data.payload);
          break;

        case 'ping':
          await this.handlePing(connectionId);
          break;

        case 'get_subscriptions':
          await this.handleGetSubscriptions(connectionId);
          break;

        case 'get_stats':
          await this.handleGetStats(connectionId);
          break;

        default:
          await this.sendError(connectionId, 'Unknown message type', data.type);
      }
    } catch (error) {
      logger.error('Error processing WebSocket message', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.sendError(connectionId, 'Invalid message format');
    }
  }

  /**
   * Handle subscription request
   */
  private async handleSubscribe(
    connectionId: string,
    payload: any
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const { eventTypes } = payload;

      if (!Array.isArray(eventTypes)) {
        throw new Error('eventTypes must be an array');
      }

      // Validate event types
      const validEventTypes = this.validateEventTypes(eventTypes, connection);

      // Add to connection subscriptions
      for (const eventType of validEventTypes) {
        if (!connection.subscriptions.includes(eventType)) {
          connection.subscriptions.push(eventType);
        }
      }

      // Update in Redis for scaling
      await this.sessionManager.updateConnectionSubscriptions(
        connectionId,
        connection.subscriptions
      );

      await this.sendMessage(connectionId, {
        type: 'subscription.success',
        data: {
          eventTypes: validEventTypes,
          totalSubscriptions: connection.subscriptions.length,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('WebSocket subscription updated', {
        connectionId,
        userId: connection.userId,
        eventTypes: validEventTypes,
        totalSubscriptions: connection.subscriptions.length,
      });
    } catch (error) {
      logger.error('Error handling subscription', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.sendError(
        connectionId,
        'Invalid subscription request',
        payload
      );
    }
  }

  /**
   * Handle unsubscribe request
   */
  private async handleUnsubscribe(
    connectionId: string,
    payload: any
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      const { eventTypes } = payload;

      if (!Array.isArray(eventTypes)) {
        throw new Error('eventTypes must be an array');
      }

      // Remove from connection subscriptions
      connection.subscriptions = connection.subscriptions.filter(
        (type) => !eventTypes.includes(type)
      );

      // Update in Redis
      await this.sessionManager.updateConnectionSubscriptions(
        connectionId,
        connection.subscriptions
      );

      await this.sendMessage(connectionId, {
        type: 'unsubscription.success',
        data: {
          eventTypes,
          remainingSubscriptions: connection.subscriptions,
          timestamp: new Date().toISOString(),
        },
      });

      logger.info('WebSocket unsubscription processed', {
        connectionId,
        userId: connection.userId,
        removedEventTypes: eventTypes,
        remainingSubscriptions: connection.subscriptions.length,
      });
    } catch (error) {
      logger.error('Error handling unsubscription', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      await this.sendError(
        connectionId,
        'Invalid unsubscription request',
        payload
      );
    }
  }

  /**
   * Handle ping request
   */
  private async handlePing(connectionId: string): Promise<void> {
    await this.sendMessage(connectionId, {
      type: 'pong',
      data: {
        timestamp: new Date().toISOString(),
        serverId: this.serverId,
      },
    });
  }

  /**
   * Handle get subscriptions request
   */
  private async handleGetSubscriptions(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    await this.sendMessage(connectionId, {
      type: 'subscriptions.list',
      data: {
        subscriptions: connection.subscriptions,
        totalSubscriptions: connection.subscriptions.length,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle get stats request
   */
  private async handleGetStats(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Only allow admin connections to get stats
    if (!connection.metadata?.admin) {
      await this.sendError(connectionId, 'Insufficient permissions');
      return;
    }

    const stats = this.getServerStats();
    const globalStats = await this.sessionManager.getGlobalStats();

    await this.sendMessage(connectionId, {
      type: 'stats.response',
      data: {
        server: stats,
        global: globalStats,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Handle connection close
   */
  private async handleConnectionClose(
    connectionId: string,
    code: number,
    reason: Buffer
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    logger.info('WebSocket connection closed', {
      connectionId,
      userId: connection.userId,
      code,
      reason: reason.toString(),
    });

    // Clean up connection
    await this.cleanupConnection(connectionId);
  }

  /**
   * Handle connection error
   */
  private async handleConnectionError(
    connectionId: string,
    error: Error
  ): Promise<void> {
    const connection = this.connections.get(connectionId);

    logger.error('WebSocket connection error', {
      connectionId,
      userId: connection?.userId,
      error: error.message,
    });

    // Clean up connection
    await this.cleanupConnection(connectionId);
  }

  /**
   * Clean up connection
   */
  private async cleanupConnection(connectionId: string): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    try {
      // Remove from Redis
      await this.sessionManager.unregisterConnection(connectionId);

      // Remove from local connections
      this.connections.delete(connectionId);

      logger.debug('Connection cleaned up', {
        connectionId,
        userId: connection.userId,
      });
    } catch (error) {
      logger.error('Error cleaning up connection', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Broadcast event to connections
   */
  async broadcastEvent(event: WebSocketEvent): Promise<void> {
    const localConnections = this.getMatchingConnections(event);

    // Broadcast to local connections
    const localPromises = localConnections.map((connection) =>
      this.sendEventToConnection(connection.id, event)
    );

    // Broadcast to other servers via Redis
    const redisPromise = this.sessionManager.broadcastEvent(event);

    await Promise.allSettled([...localPromises, redisPromise]);

    logger.debug('Event broadcasted', {
      eventType: event.type,
      localConnections: localConnections.length,
      userId: event.userId,
    });
  }

  /**
   * Send event to specific connection
   */
  private async sendEventToConnection(
    connectionId: string,
    event: WebSocketEvent
  ): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection) return;

    // Check if connection should receive this event
    if (!this.shouldReceiveEvent(connection, event)) {
      return;
    }

    await this.sendMessage(connectionId, {
      type: 'event',
      data: {
        id: event.id,
        type: event.type,
        data: event.data,
        timestamp: event.timestamp,
        userId: event.userId,
        sessionId: event.sessionId,
        metadata: event.metadata,
        correlationId: event.correlationId,
      },
    });
  }

  /**
   * Send message to connection
   */
  private async sendMessage(connectionId: string, message: any): Promise<void> {
    const connection = this.connections.get(connectionId);
    if (!connection || connection.socket.readyState !== 1) return;

    try {
      connection.socket.send(JSON.stringify(message));
    } catch (error) {
      logger.error('Error sending WebSocket message', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Clean up broken connection
      await this.cleanupConnection(connectionId);
    }
  }

  /**
   * Send error message
   */
  private async sendError(
    connectionId: string,
    message: string,
    details?: any
  ): Promise<void> {
    await this.sendMessage(connectionId, {
      type: 'error',
      data: {
        message,
        details,
        timestamp: new Date().toISOString(),
      },
    });
  }

  /**
   * Get connections matching event
   */
  private getMatchingConnections(event: WebSocketEvent): WebSocketConnection[] {
    const matching: WebSocketConnection[] = [];

    for (const connection of this.connections.values()) {
      if (this.shouldReceiveEvent(connection, event)) {
        matching.push(connection);
      }
    }

    return matching;
  }

  /**
   * Check if connection should receive event
   */
  private shouldReceiveEvent(
    connection: WebSocketConnection,
    event: WebSocketEvent
  ): boolean {
    // Check user-specific events
    if (event.userId && event.userId !== connection.userId) {
      return false;
    }

    // Check subscriptions
    return connection.subscriptions.some((pattern) => {
      if (pattern === '*') return true;
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return event.type.startsWith(prefix);
      }
      return pattern === event.type;
    });
  }

  /**
   * Validate event types for subscription
   */
  private validateEventTypes(
    eventTypes: string[],
    connection: WebSocketConnection
  ): string[] {
    const validTypes: string[] = [];
    const isAdmin = connection.metadata?.admin;

    for (const eventType of eventTypes) {
      // Admin can subscribe to any event
      if (isAdmin) {
        validTypes.push(eventType);
        continue;
      }

      // Regular users can only subscribe to certain event types
      if (this.isAllowedEventType(eventType)) {
        validTypes.push(eventType);
      }
    }

    return validTypes;
  }

  /**
   * Check if event type is allowed for regular users
   */
  private isAllowedEventType(eventType: string): boolean {
    const allowedPatterns = [
      'authentication.*',
      'session.*',
      'user.profile.*',
      'security.alert.*',
      'mfa.*',
    ];

    return allowedPatterns.some((pattern) => {
      if (pattern.endsWith('*')) {
        const prefix = pattern.slice(0, -1);
        return eventType.startsWith(prefix);
      }
      return pattern === eventType;
    });
  }

  /**
   * Setup Redis subscriptions for scaling
   */
  private setupRedisSubscriptions(): void {
    // Subscribe to WebSocket events from other servers
    this.redisClient.subscribe('websocket:broadcast', (err) => {
      if (err) {
        logger.error('Error subscribing to Redis WebSocket channel', {
          error: err.message,
        });
      } else {
        logger.info('Subscribed to Redis WebSocket broadcast channel');
      }
    });

    // Handle incoming Redis messages
    this.redisClient.on('message', async (channel, message) => {
      if (channel === 'websocket:broadcast') {
        try {
          const event: WebSocketEvent = JSON.parse(message);

          // Only process events from other servers
          if (event.metadata?.serverId !== this.serverId) {
            await this.handleRedisEvent(event);
          }
        } catch (error) {
          logger.error('Error processing Redis WebSocket message', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      }
    });
  }

  /**
   * Handle event from Redis (other servers)
   */
  private async handleRedisEvent(event: WebSocketEvent): Promise<void> {
    const localConnections = this.getMatchingConnections(event);

    const promises = localConnections.map((connection) =>
      this.sendEventToConnection(connection.id, event)
    );

    await Promise.allSettled(promises);

    logger.debug('Redis event processed', {
      eventType: event.type,
      localConnections: localConnections.length,
      sourceServer: event.metadata?.serverId,
    });
  }

  /**
   * Start heartbeat to keep connections alive
   */
  private startHeartbeat(): void {
    setInterval(() => {
      if (this.isShuttingDown) return;

      for (const [connectionId, connection] of this.connections) {
        if (connection.socket.readyState === 1) {
          try {
            connection.socket.ping();
          } catch (error) {
            logger.debug('Error sending ping', { connectionId });
            this.cleanupConnection(connectionId);
          }
        }
      }
    }, 30000); // 30 seconds
  }

  /**
   * Start cleanup interval for inactive connections
   */
  private startCleanupInterval(): void {
    setInterval(
      async () => {
        if (this.isShuttingDown) return;

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
            await this.cleanupConnection(connectionId);
          }
        }
      },
      5 * 60 * 1000
    ); // Check every 5 minutes
  }

  /**
   * Get server statistics
   */
  private getServerStats(): any {
    const connectionsByUser: Record<string, number> = {};
    const subscriptionCounts: Record<string, number> = {};

    for (const connection of this.connections.values()) {
      connectionsByUser[connection.userId] =
        (connectionsByUser[connection.userId] || 0) + 1;

      for (const subscription of connection.subscriptions) {
        subscriptionCounts[subscription] =
          (subscriptionCounts[subscription] || 0) + 1;
      }
    }

    return {
      serverId: this.serverId,
      totalConnections: this.connections.size,
      connectionsByUser,
      subscriptionCounts,
      uptime: process.uptime(),
      memory: process.memoryUsage(),
    };
  }

  /**
   * Generate unique connection ID
   */
  private generateConnectionId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `ws_${this.serverId}_${timestamp}_${random}`;
  }

  /**
   * Generate unique server ID
   */
  private generateServerId(): string {
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2);
    return `srv_${timestamp}_${random}`;
  }

  /**
   * Graceful shutdown
   */
  async shutdown(): Promise<void> {
    this.isShuttingDown = true;

    logger.info('Shutting down WebSocket server', {
      serverId: this.serverId,
      activeConnections: this.connections.size,
    });

    // Close all connections
    const closePromises = Array.from(this.connections.values()).map(
      (connection) => {
        return new Promise<void>((resolve) => {
          connection.socket.close(1001, 'Server shutting down');
          setTimeout(resolve, 100); // Give time for close
        });
      }
    );

    await Promise.allSettled(closePromises);

    // Clean up Redis subscriptions
    await this.redisClient.unsubscribe('websocket:broadcast');

    logger.info('WebSocket server shutdown complete');
  }

  /**
   * Health check
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    serverId: string;
    connections: number;
    redisConnected: boolean;
  }> {
    let redisConnected = false;

    try {
      await this.redisClient.ping();
      redisConnected = true;
    } catch (error) {
      // Redis not connected
    }

    return {
      healthy: redisConnected && this.connections.size < 10000,
      serverId: this.serverId,
      connections: this.connections.size,
      redisConnected,
    };
  }
}
