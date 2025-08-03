/**
 * WebSocket Session Manager
 * Manages WebSocket sessions across multiple servers using Redis
 */

import { Redis, Cluster } from 'ioredis';
import { logger } from '../logging/winston-logger';
import {
  WebSocketConnection,
  WebSocketEvent,
  WebSocketSubscription,
  WebSocketGlobalStats,
  WebSocketServerStats,
} from './types';

export class WebSocketSessionManager {
  private readonly REDIS_PREFIX = 'websocket';
  private readonly CONNECTION_TTL = 3600; // 1 hour
  private readonly STATS_TTL = 300; // 5 minutes

  constructor(private readonly redisClient: Redis | Cluster) {}

  /**
   * Register a WebSocket connection in Redis
   */
  async registerConnection(connection: WebSocketConnection): Promise<void> {
    try {
      const connectionData = {
        id: connection.id,
        userId: connection.userId,
        subscriptions: connection.subscriptions,
        serverId: connection.serverId,
        lastActivity: connection.lastActivity.toISOString(),
        authenticated: connection.authenticated,
        metadata: connection.metadata || {},
      };

      // Store connection data
      const connectionKey = `${this.REDIS_PREFIX}:connections:${connection.id}`;
      await this.redisClient.setex(
        connectionKey,
        this.CONNECTION_TTL,
        JSON.stringify(connectionData)
      );

      // Add to user connections set
      const userConnectionsKey = `${this.REDIS_PREFIX}:users:${connection.userId}:connections`;
      await this.redisClient.sadd(userConnectionsKey, connection.id);
      await this.redisClient.expire(userConnectionsKey, this.CONNECTION_TTL);

      // Add to server connections set
      const serverConnectionsKey = `${this.REDIS_PREFIX}:servers:${connection.serverId}:connections`;
      await this.redisClient.sadd(serverConnectionsKey, connection.id);
      await this.redisClient.expire(serverConnectionsKey, this.CONNECTION_TTL);

      // Update server stats
      await this.updateServerStats(connection.serverId);

      logger.debug('WebSocket connection registered in Redis', {
        connectionId: connection.id,
        userId: connection.userId,
        serverId: connection.serverId,
      });
    } catch (error) {
      logger.error('Error registering WebSocket connection in Redis', {
        connectionId: connection.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Unregister a WebSocket connection from Redis
   */
  async unregisterConnection(connectionId: string): Promise<void> {
    try {
      // Get connection data first
      const connectionKey = `${this.REDIS_PREFIX}:connections:${connectionId}`;
      const connectionData = await this.redisClient.get(connectionKey);

      if (!connectionData) {
        return; // Connection not found
      }

      const connection = JSON.parse(connectionData);

      // Remove connection data
      await this.redisClient.del(connectionKey);

      // Remove from user connections set
      const userConnectionsKey = `${this.REDIS_PREFIX}:users:${connection.userId}:connections`;
      await this.redisClient.srem(userConnectionsKey, connectionId);

      // Remove from server connections set
      const serverConnectionsKey = `${this.REDIS_PREFIX}:servers:${connection.serverId}:connections`;
      await this.redisClient.srem(serverConnectionsKey, connectionId);

      // Update server stats
      await this.updateServerStats(connection.serverId);

      logger.debug('WebSocket connection unregistered from Redis', {
        connectionId,
        userId: connection.userId,
        serverId: connection.serverId,
      });
    } catch (error) {
      logger.error('Error unregistering WebSocket connection from Redis', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update connection subscriptions in Redis
   */
  async updateConnectionSubscriptions(
    connectionId: string,
    subscriptions: string[]
  ): Promise<void> {
    try {
      const connectionKey = `${this.REDIS_PREFIX}:connections:${connectionId}`;
      const connectionData = await this.redisClient.get(connectionKey);

      if (!connectionData) {
        throw new Error('Connection not found');
      }

      const connection = JSON.parse(connectionData);
      connection.subscriptions = subscriptions;
      connection.lastActivity = new Date().toISOString();

      await this.redisClient.setex(
        connectionKey,
        this.CONNECTION_TTL,
        JSON.stringify(connection)
      );

      logger.debug('WebSocket connection subscriptions updated', {
        connectionId,
        subscriptions: subscriptions.length,
      });
    } catch (error) {
      logger.error('Error updating connection subscriptions', {
        connectionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Broadcast event to all servers via Redis
   */
  async broadcastEvent(event: WebSocketEvent): Promise<void> {
    try {
      const message = JSON.stringify(event);
      await this.redisClient.publish('websocket:broadcast', message);

      logger.debug('Event broadcasted via Redis', {
        eventType: event.type,
        eventId: event.id,
        userId: event.userId,
      });
    } catch (error) {
      logger.error('Error broadcasting event via Redis', {
        eventType: event.type,
        eventId: event.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get connections for a specific user across all servers
   */
  async getUserConnections(userId: string): Promise<WebSocketSubscription[]> {
    try {
      const userConnectionsKey = `${this.REDIS_PREFIX}:users:${userId}:connections`;
      const connectionIds = await this.redisClient.smembers(userConnectionsKey);

      const connections: WebSocketSubscription[] = [];

      for (const connectionId of connectionIds) {
        const connectionKey = `${this.REDIS_PREFIX}:connections:${connectionId}`;
        const connectionData = await this.redisClient.get(connectionKey);

        if (connectionData) {
          const connection = JSON.parse(connectionData);
          connections.push({
            connectionId: connection.id,
            userId: connection.userId,
            eventTypes: connection.subscriptions,
            serverId: connection.serverId,
            createdAt: new Date(connection.createdAt || Date.now()),
            lastActivity: new Date(connection.lastActivity),
          });
        }
      }

      return connections;
    } catch (error) {
      logger.error('Error getting user connections', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Get connections for a specific server
   */
  async getServerConnections(
    serverId: string
  ): Promise<WebSocketSubscription[]> {
    try {
      const serverConnectionsKey = `${this.REDIS_PREFIX}:servers:${serverId}:connections`;
      const connectionIds =
        await this.redisClient.smembers(serverConnectionsKey);

      const connections: WebSocketSubscription[] = [];

      for (const connectionId of connectionIds) {
        const connectionKey = `${this.REDIS_PREFIX}:connections:${connectionId}`;
        const connectionData = await this.redisClient.get(connectionKey);

        if (connectionData) {
          const connection = JSON.parse(connectionData);
          connections.push({
            connectionId: connection.id,
            userId: connection.userId,
            eventTypes: connection.subscriptions,
            serverId: connection.serverId,
            createdAt: new Date(connection.createdAt || Date.now()),
            lastActivity: new Date(connection.lastActivity),
          });
        }
      }

      return connections;
    } catch (error) {
      logger.error('Error getting server connections', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Update server statistics
   */
  private async updateServerStats(serverId: string): Promise<void> {
    try {
      const serverConnectionsKey = `${this.REDIS_PREFIX}:servers:${serverId}:connections`;
      const connectionCount =
        await this.redisClient.scard(serverConnectionsKey);

      const stats = {
        serverId,
        connectionCount,
        lastUpdate: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };

      const statsKey = `${this.REDIS_PREFIX}:servers:${serverId}:stats`;
      await this.redisClient.setex(
        statsKey,
        this.STATS_TTL,
        JSON.stringify(stats)
      );
    } catch (error) {
      logger.error('Error updating server stats', {
        serverId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get global WebSocket statistics
   */
  async getGlobalStats(): Promise<WebSocketGlobalStats> {
    try {
      // Get all server stats
      const serverStatsKeys = await this.redisClient.keys(
        `${this.REDIS_PREFIX}:servers:*:stats`
      );
      const serverStats: WebSocketServerStats[] = [];
      let totalConnections = 0;

      for (const key of serverStatsKeys) {
        const statsData = await this.redisClient.get(key);
        if (statsData) {
          const stats = JSON.parse(statsData);
          serverStats.push({
            serverId: stats.serverId,
            totalConnections: stats.connectionCount,
            connectionsByUser: {}, // Would need to calculate this
            subscriptionCounts: {}, // Would need to calculate this
            uptime: stats.uptime,
            memory: stats.memory,
          });
          totalConnections += stats.connectionCount;
        }
      }

      // Get total subscriptions (approximate)
      const allConnectionKeys = await this.redisClient.keys(
        `${this.REDIS_PREFIX}:connections:*`
      );
      let totalSubscriptions = 0;

      for (const key of allConnectionKeys.slice(0, 100)) {
        // Sample first 100 for performance
        const connectionData = await this.redisClient.get(key);
        if (connectionData) {
          const connection = JSON.parse(connectionData);
          totalSubscriptions += connection.subscriptions?.length || 0;
        }
      }

      return {
        totalServers: serverStats.length,
        totalConnections,
        totalSubscriptions,
        serverStats,
      };
    } catch (error) {
      logger.error('Error getting global stats', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        totalServers: 0,
        totalConnections: 0,
        totalSubscriptions: 0,
        serverStats: [],
      };
    }
  }

  /**
   * Clean up expired connections
   */
  async cleanupExpiredConnections(): Promise<number> {
    try {
      const allConnectionKeys = await this.redisClient.keys(
        `${this.REDIS_PREFIX}:connections:*`
      );
      let cleanedCount = 0;

      for (const key of allConnectionKeys) {
        const ttl = await this.redisClient.ttl(key);

        // If TTL is -1 (no expiration) or -2 (key doesn't exist), clean up
        if (ttl <= 0) {
          const connectionData = await this.redisClient.get(key);
          if (connectionData) {
            const connection = JSON.parse(connectionData);
            await this.unregisterConnection(connection.id);
            cleanedCount++;
          }
        }
      }

      if (cleanedCount > 0) {
        logger.info('Cleaned up expired WebSocket connections', {
          cleanedCount,
        });
      }

      return cleanedCount;
    } catch (error) {
      logger.error('Error cleaning up expired connections', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Disconnect all connections for a user (for security purposes)
   */
  async disconnectUserConnections(
    userId: string,
    reason: string
  ): Promise<number> {
    try {
      const connections = await this.getUserConnections(userId);

      // Send disconnect event to all servers
      const disconnectEvent: WebSocketEvent = {
        id: `disconnect_${Date.now()}`,
        type: 'system.user.disconnect',
        data: {
          userId,
          reason,
          timestamp: new Date().toISOString(),
        },
        timestamp: new Date().toISOString(),
        userId,
        metadata: {
          priority: 'high',
        },
      };

      await this.broadcastEvent(disconnectEvent);

      // Clean up connection data
      for (const connection of connections) {
        await this.unregisterConnection(connection.connectionId);
      }

      logger.info('User connections disconnected', {
        userId,
        reason,
        connectionsDisconnected: connections.length,
      });

      return connections.length;
    } catch (error) {
      logger.error('Error disconnecting user connections', {
        userId,
        reason,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return 0;
    }
  }

  /**
   * Send notification to specific user
   */
  async sendUserNotification(userId: string, notification: any): Promise<void> {
    try {
      const notificationEvent: WebSocketEvent = {
        id: `notification_${Date.now()}`,
        type: 'notification.user',
        data: notification,
        timestamp: new Date().toISOString(),
        userId,
        metadata: {
          priority: notification.priority || 'normal',
        },
      };

      await this.broadcastEvent(notificationEvent);

      logger.debug('User notification sent', {
        userId,
        notificationType: notification.type,
      });
    } catch (error) {
      logger.error('Error sending user notification', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Send broadcast notification to all connected users
   */
  async sendBroadcastNotification(notification: any): Promise<void> {
    try {
      const broadcastEvent: WebSocketEvent = {
        id: `broadcast_${Date.now()}`,
        type: 'notification.broadcast',
        data: notification,
        timestamp: new Date().toISOString(),
        metadata: {
          priority: notification.priority || 'normal',
        },
      };

      await this.broadcastEvent(broadcastEvent);

      logger.info('Broadcast notification sent', {
        notificationType: notification.type,
      });
    } catch (error) {
      logger.error('Error sending broadcast notification', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Get connection health status
   */
  async getConnectionHealth(): Promise<{
    healthy: boolean;
    totalConnections: number;
    activeServers: number;
    oldestConnection: Date | null;
    newestConnection: Date | null;
  }> {
    try {
      const globalStats = await this.getGlobalStats();

      // Get connection age information
      const allConnectionKeys = await this.redisClient.keys(
        `${this.REDIS_PREFIX}:connections:*`
      );
      const connectionDates: Date[] = [];

      for (const key of allConnectionKeys.slice(0, 50)) {
        // Sample for performance
        const connectionData = await this.redisClient.get(key);
        if (connectionData) {
          const connection = JSON.parse(connectionData);
          connectionDates.push(new Date(connection.lastActivity));
        }
      }

      connectionDates.sort((a, b) => a.getTime() - b.getTime());

      return {
        healthy:
          globalStats.totalConnections < 50000 && globalStats.totalServers > 0,
        totalConnections: globalStats.totalConnections,
        activeServers: globalStats.totalServers,
        oldestConnection:
          connectionDates.length > 0 ? connectionDates[0] : null,
        newestConnection:
          connectionDates.length > 0
            ? connectionDates[connectionDates.length - 1]
            : null,
      };
    } catch (error) {
      logger.error('Error getting connection health', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        totalConnections: 0,
        activeServers: 0,
        oldestConnection: null,
        newestConnection: null,
      };
    }
  }

  /**
   * Start background cleanup task
   */
  startCleanupTask(): void {
    // Clean up expired connections every 5 minutes
    setInterval(
      async () => {
        try {
          await this.cleanupExpiredConnections();
        } catch (error) {
          logger.error('Error in WebSocket cleanup task', {
            error: error instanceof Error ? error.message : 'Unknown error',
          });
        }
      },
      5 * 60 * 1000
    );

    logger.info('WebSocket cleanup task started');
  }
}
