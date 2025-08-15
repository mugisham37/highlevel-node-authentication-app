/**
 * Stateless Application Manager
 * Ensures the application can scale horizontally by managing stateless operations
 */

import { logger } from '../logging/winston-logger';
import { configManager } from '../config/config-manager';

export interface StatelessConfig {
  instanceId: string;
  sessionStorage: 'redis' | 'database' | 'local';
  cacheStrategy: 'distributed' | 'local';
  enableStickySessions: boolean;
  enableSessionReplication: boolean;
}

export interface InstanceInfo {
  id: string;
  hostname: string;
  port: number;
  startTime: Date;
  version: string;
  environment: string;
  region: string | undefined;
  zone: string | undefined;
}

export class StatelessManager {
  private static instance: StatelessManager;
  private instanceInfo: InstanceInfo;
  private config: StatelessConfig;
  private initialized = false;

  private constructor() {
    this.instanceInfo = this.generateInstanceInfo();
    this.config = this.loadStatelessConfig();
  }

  static getInstance(): StatelessManager {
    if (!StatelessManager.instance) {
      StatelessManager.instance = new StatelessManager();
    }
    return StatelessManager.instance;
  }

  /**
   * Initialize stateless manager
   */
  async initialize(): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing stateless application manager...', {
      instanceId: this.instanceInfo.id,
      hostname: this.instanceInfo.hostname,
      port: this.instanceInfo.port,
    });

    try {
      // Validate stateless configuration
      await this.validateStatelessConfiguration();

      // Register instance in distributed registry
      await this.registerInstance();

      // Setup cleanup handlers
      this.setupCleanupHandlers();

      this.initialized = true;
      logger.info('Stateless application manager initialized successfully', {
        instanceId: this.instanceInfo.id,
        sessionStorage: this.config.sessionStorage,
        cacheStrategy: this.config.cacheStrategy,
      });
    } catch (error) {
      logger.error('Failed to initialize stateless manager', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instanceId: this.instanceInfo.id,
      });
      throw error;
    }
  }

  /**
   * Generate unique instance information
   */
  private generateInstanceInfo(): InstanceInfo {
    const hostname = process.env['HOSTNAME'] || require('os').hostname();
    const port = parseInt(process.env['SERVER_PORT'] || '3000', 10);
    const instanceId = `${hostname}-${port}-${Date.now()}`;

    return {
      id: instanceId,
      hostname,
      port,
      startTime: new Date(),
      version: process.env['npm_package_version'] || '1.0.0',
      environment: (process.env.NODE_ENV as any) || 'development',
      region: process.env['AWS_REGION'] || process.env['REGION'],
      zone: process.env['AWS_AVAILABILITY_ZONE'] || process.env['ZONE'],
    };
  }

  /**
   * Load stateless configuration
   */
  private loadStatelessConfig(): StatelessConfig {
    return {
      instanceId: this.instanceInfo.id,
      sessionStorage:
        (process.env['SESSION_STORAGE'] as 'redis' | 'database' | 'local') || 'redis',
      cacheStrategy:
        (process.env['CACHE_STRATEGY'] as 'distributed' | 'local') ||
        'distributed',
      enableStickySessions: process.env['ENABLE_STICKY_SESSIONS'] === 'true',
      enableSessionReplication:
        process.env['ENABLE_SESSION_REPLICATION'] === 'true',
    };
  }

  /**
   * Validate stateless configuration
   */
  private async validateStatelessConfiguration(): Promise<void> {
    const issues: string[] = [];

    // Check session storage configuration
    if (this.config.sessionStorage === 'redis') {
      try {
        // Test Redis connectivity
        const Redis = require('ioredis');
        const redis = new Redis(configManager.getConfig().redis);
        await redis.ping();
        await redis.disconnect();
      } catch (error) {
        issues.push(
          'Redis connection failed - required for distributed session storage'
        );
      }
    }

    // Check cache strategy
    if (this.config.cacheStrategy === 'distributed') {
      if (this.config.sessionStorage !== 'redis') {
        issues.push(
          'Distributed cache strategy requires Redis session storage'
        );
      }
    }

    // Check sticky sessions configuration
    if (
      this.config.enableStickySessions &&
      this.config.sessionStorage === 'local'
    ) {
      issues.push('Sticky sessions cannot be used with local session storage');
    }

    if (issues.length > 0) {
      throw new Error(
        `Stateless configuration validation failed: ${issues.join(', ')}`
      );
    }

    logger.info('Stateless configuration validated successfully', {
      sessionStorage: this.config.sessionStorage,
      cacheStrategy: this.config.cacheStrategy,
      stickySessions: this.config.enableStickySessions,
      sessionReplication: this.config.enableSessionReplication,
    });
  }

  /**
   * Register instance in distributed registry
   */
  private async registerInstance(): Promise<void> {
    try {
      if (this.config.sessionStorage === 'redis') {
        const Redis = require('ioredis');
        const redis = new Redis(configManager.getConfig().redis);

        const instanceKey = `instances:${this.instanceInfo.id}`;
        const instanceData = {
          ...this.instanceInfo,
          lastHeartbeat: new Date().toISOString(),
          status: 'healthy',
        };

        // Register instance with TTL
        await redis.setex(instanceKey, 60, JSON.stringify(instanceData));

        // Add to active instances set
        await redis.sadd('active_instances', this.instanceInfo.id);

        await redis.disconnect();

        logger.info('Instance registered in distributed registry', {
          instanceId: this.instanceInfo.id,
          registryKey: instanceKey,
        });
      }
    } catch (error) {
      logger.warn('Failed to register instance in distributed registry', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instanceId: this.instanceInfo.id,
      });
      // Don't throw error - registration is optional
    }
  }

  /**
   * Setup cleanup handlers for graceful shutdown
   */
  private setupCleanupHandlers(): void {
    const cleanup = async () => {
      await this.deregisterInstance();
    };

    process.on('SIGTERM', cleanup);
    process.on('SIGINT', cleanup);
    process.on('beforeExit', cleanup);
  }

  /**
   * Deregister instance from distributed registry
   */
  private async deregisterInstance(): Promise<void> {
    try {
      if (this.config.sessionStorage === 'redis') {
        const Redis = require('ioredis');
        const redis = new Redis(configManager.getConfig().redis);

        const instanceKey = `instances:${this.instanceInfo.id}`;

        // Remove from registry
        await redis.del(instanceKey);
        await redis.srem('active_instances', this.instanceInfo.id);

        await redis.disconnect();

        logger.info('Instance deregistered from distributed registry', {
          instanceId: this.instanceInfo.id,
        });
      }
    } catch (error) {
      logger.warn('Failed to deregister instance', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instanceId: this.instanceInfo.id,
      });
    }
  }

  /**
   * Send heartbeat to maintain instance registration
   */
  async sendHeartbeat(): Promise<void> {
    try {
      if (this.config.sessionStorage === 'redis') {
        const Redis = require('ioredis');
        const redis = new Redis(configManager.getConfig().redis);

        const instanceKey = `instances:${this.instanceInfo.id}`;
        const instanceData = {
          ...this.instanceInfo,
          lastHeartbeat: new Date().toISOString(),
          status: 'healthy',
        };

        await redis.setex(instanceKey, 60, JSON.stringify(instanceData));
        await redis.disconnect();
      }
    } catch (error) {
      logger.warn('Failed to send heartbeat', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instanceId: this.instanceInfo.id,
      });
    }
  }

  /**
   * Get all active instances
   */
  async getActiveInstances(): Promise<InstanceInfo[]> {
    try {
      if (this.config.sessionStorage === 'redis') {
        const Redis = require('ioredis');
        const redis = new Redis(configManager.getConfig().redis);

        const instanceIds = await redis.smembers('active_instances');
        const instances: InstanceInfo[] = [];

        for (const instanceId of instanceIds) {
          const instanceKey = `instances:${instanceId}`;
          const instanceData = await redis.get(instanceKey);

          if (instanceData) {
            const instance = JSON.parse(instanceData);
            instances.push({
              ...instance,
              startTime: new Date(instance.startTime),
            });
          }
        }

        await redis.disconnect();
        return instances;
      }

      return [this.instanceInfo];
    } catch (error) {
      logger.warn('Failed to get active instances', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [this.instanceInfo];
    }
  }

  /**
   * Check if application is stateless
   */
  isStateless(): boolean {
    return (
      this.config.sessionStorage !== 'local' &&
      this.config.cacheStrategy === 'distributed' &&
      !this.hasLocalState()
    );
  }

  /**
   * Check for local state that would prevent horizontal scaling
   */
  private hasLocalState(): boolean {
    // Check for in-memory caches, local file storage, etc.
    const localStateIndicators = [
      process.env['USE_LOCAL_CACHE'] === 'true',
      process.env['USE_FILE_SESSIONS'] === 'true',
      process.env['STORE_UPLOADS_LOCALLY'] === 'true',
    ];

    return localStateIndicators.some((indicator) => indicator);
  }

  /**
   * Get instance information
   */
  getInstanceInfo(): InstanceInfo {
    return { ...this.instanceInfo };
  }

  /**
   * Get stateless configuration
   */
  getConfig(): StatelessConfig {
    return { ...this.config };
  }

  /**
   * Update instance status
   */
  async updateInstanceStatus(
    status: 'healthy' | 'unhealthy' | 'draining'
  ): Promise<void> {
    try {
      if (this.config.sessionStorage === 'redis') {
        const Redis = require('ioredis');
        const redis = new Redis(configManager.getConfig().redis);

        const instanceKey = `instances:${this.instanceInfo.id}`;
        const instanceData = {
          ...this.instanceInfo,
          lastHeartbeat: new Date().toISOString(),
          status,
        };

        await redis.setex(instanceKey, 60, JSON.stringify(instanceData));
        await redis.disconnect();

        logger.info('Instance status updated', {
          instanceId: this.instanceInfo.id,
          status,
        });
      }
    } catch (error) {
      logger.warn('Failed to update instance status', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instanceId: this.instanceInfo.id,
        status,
      });
    }
  }

  /**
   * Start heartbeat interval
   */
  startHeartbeat(intervalMs: number = 30000): NodeJS.Timeout {
    return setInterval(async () => {
      await this.sendHeartbeat();
    }, intervalMs);
  }

  /**
   * Shutdown stateless manager
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down stateless manager...', {
      instanceId: this.instanceInfo.id,
    });

    try {
      // Update status to draining
      await this.updateInstanceStatus('draining');

      // Wait a bit for load balancer to notice
      await new Promise((resolve) => setTimeout(resolve, 5000));

      // Deregister instance
      await this.deregisterInstance();

      this.initialized = false;
      logger.info('Stateless manager shutdown complete');
    } catch (error) {
      logger.error('Error during stateless manager shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
        instanceId: this.instanceInfo.id,
      });
      throw error;
    }
  }
}

// Export singleton instance
export const statelessManager = StatelessManager.getInstance();
