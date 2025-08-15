import Redis, { Cluster, RedisOptions, ClusterOptions } from 'ioredis';
import { logger } from '../logging/winston-logger';

export interface RedisConfig {
  host: string;
  port: number;
  password?: string;
  db?: number;
  cluster?: {
    enabled: boolean;
    nodes: Array<{ host: string; port: number }>;
  };
  maxRetriesPerRequest: number;
  lazyConnect: boolean;
  keepAlive: number;
  connectTimeout: number;
  commandTimeout: number;
}

export class RedisClient {
  private client: Redis | Cluster | null = null;
  private isConnected = false;
  private reconnectAttempts = 0;
  private readonly maxReconnectAttempts = 10;
  private readonly reconnectDelay = 1000;

  constructor(private readonly redisConfig: RedisConfig) { }

  async connect(): Promise<void> {
    try {
      if (this.redisConfig.cluster?.enabled) {
        await this.connectCluster();
      } else {
        await this.connectSingle();
      }

      this.setupEventHandlers();
      this.isConnected = true;
      this.reconnectAttempts = 0;

      logger.info('Redis client connected successfully', {
        cluster: this.redisConfig.cluster?.enabled || false,
        host: this.redisConfig.host,
        port: this.redisConfig.port,
      });
    } catch (error) {
      logger.error('Failed to connect to Redis:', error);
      throw error;
    }
  }

  private async connectSingle(): Promise<void> {
    const options: RedisOptions = {
      host: this.redisConfig.host,
      port: this.redisConfig.port,
      db: this.redisConfig.db || 0,
      maxRetriesPerRequest: this.redisConfig.maxRetriesPerRequest,
      lazyConnect: this.redisConfig.lazyConnect,
      keepAlive: this.redisConfig.keepAlive,
      connectTimeout: this.redisConfig.connectTimeout,
      commandTimeout: this.redisConfig.commandTimeout,
    };

    // Only add password if it's defined
    if (this.redisConfig.password !== undefined) {
      options.password = this.redisConfig.password;
    }

    this.client = new Redis(options);
    await this.client.connect();
  }

  private async connectCluster(): Promise<void> {
    if (!this.redisConfig.cluster?.nodes) {
      throw new Error('Cluster nodes not configured');
    }

    const redisOptions: RedisOptions = {
      connectTimeout: this.redisConfig.connectTimeout,
      commandTimeout: this.redisConfig.commandTimeout,
      maxRetriesPerRequest: this.redisConfig.maxRetriesPerRequest,
    };

    // Only add password if it's defined
    if (this.redisConfig.password !== undefined) {
      redisOptions.password = this.redisConfig.password;
    }

    const options: ClusterOptions = {
      redisOptions,
      lazyConnect: this.redisConfig.lazyConnect,
    };

    this.client = new Cluster(this.redisConfig.cluster.nodes, options);
    await this.client.connect();
  }

  private setupEventHandlers(): void {
    if (!this.client) return;

    this.client.on('connect', () => {
      logger.info('Redis client connected');
      this.isConnected = true;
    });

    this.client.on('ready', () => {
      logger.info('Redis client ready');
    });

    this.client.on('error', (error) => {
      logger.error('Redis client error:', error);
      this.isConnected = false;
    });

    this.client.on('close', () => {
      logger.warn('Redis connection closed');
      this.isConnected = false;
      this.handleReconnection();
    });

    this.client.on('reconnecting', () => {
      logger.info('Redis client reconnecting...');
    });
  }

  private async handleReconnection(): Promise<void> {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('Max reconnection attempts reached, giving up');
      return;
    }

    this.reconnectAttempts++;
    const delay = this.reconnectDelay * Math.pow(2, this.reconnectAttempts - 1);

    logger.info(
      `Attempting to reconnect to Redis (attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}) in ${delay}ms`
    );

    setTimeout(async () => {
      try {
        await this.connect();
      } catch (error) {
        logger.error('Reconnection attempt failed:', error);
      }
    }, delay);
  }

  getClient(): Redis | Cluster {
    if (!this.client || !this.isConnected) {
      throw new Error('Redis client not connected');
    }
    return this.client;
  }

  isHealthy(): boolean {
    return this.isConnected && this.client !== null;
  }

  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.disconnect();
      this.client = null;
      this.isConnected = false;
      logger.info('Redis client disconnected');
    }
  }

  async ping(): Promise<string> {
    const client = this.getClient();
    return await client.ping();
  }
}

// Singleton instance
let redisClient: RedisClient | null = null;

export function createRedisClient(redisConfig: RedisConfig): RedisClient {
  if (!redisClient) {
    redisClient = new RedisClient(redisConfig);
  }
  return redisClient;
}

export function getRedisClient(): RedisClient {
  if (!redisClient) {
    throw new Error(
      'Redis client not initialized. Call createRedisClient first.'
    );
  }
  return redisClient;
}
