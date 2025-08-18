/**
 * Repository Factory
 * Creates and manages repository instances for both Prisma and Drizzle ORM systems
 */

import { PrismaClient } from '@prisma/client';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from 'winston';
import { DatabaseConnectionManager } from '../connection-manager';
import { TransactionManager } from './base/transaction-manager';
import { SimpleCacheAdapter } from '../../cache/simple-cache-adapter';

// Repository interfaces
import { IUserRepository } from './interfaces/user-repository.interface';
import { ISessionRepository } from './interfaces/session-repository.interface';

// Repository implementations
import { PrismaUserRepositoryEnhanced } from './prisma/prisma-user-repository-enhanced';
import { DrizzleSessionRepositoryEnhanced } from './drizzle/drizzle-session-repository-enhanced';

// Types
import { 
  HealthStatus, 
  SystemHealthCheck
} from '../../types/health';


// Schema types
import * as authSessionsSchema from '../drizzle/schema/auth-sessions';
import * as oauthCacheSchema from '../drizzle/schema/oauth-cache';

export interface RepositoryConfig {
  enableCaching?: boolean;
  cacheConfig?: {
    defaultTtl?: number;
    maxMemoryItems?: number;
  };
  enableMetrics?: boolean;
  optimizationLevel?: 'basic' | 'aggressive';
}

export class RepositoryFactory {
  private prismaClient: PrismaClient;
  private drizzleDb: NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  >;
  private transactionManager: TransactionManager;
  private cache?: SimpleCacheAdapter | undefined;

  // Repository instances (singleton pattern)
  private userRepository?: IUserRepository | undefined;
  private sessionRepository?: ISessionRepository | undefined;

  constructor(
    private connectionManager: DatabaseConnectionManager,
    private logger: Logger,
    private config: RepositoryConfig = {}
  ) {
    this.prismaClient = this.connectionManager.getPrismaClient();
    this.drizzleDb = this.connectionManager.getDrizzleDb();
    this.transactionManager = new TransactionManager(
      this.prismaClient,
      this.drizzleDb,
      this.logger
    );

    // Initialize cache if enabled
    if (this.config.enableCaching) {
      this.initializeCache();
    }
  }

  /**
   * Get User Repository (Prisma-based for complex relational operations)
   */
  getUserRepository(): IUserRepository {
    if (!this.userRepository) {
      this.userRepository = new PrismaUserRepositoryEnhanced(
        this.prismaClient,
        this.logger,
        this.transactionManager,
        this.cache
      );

      this.logger.debug('User repository initialized', {
        type: 'PrismaUserRepositoryEnhanced',
        cacheEnabled: !!this.cache,
      });
    }

    return this.userRepository;
  }

  /**
   * Get Session Repository (Drizzle-based for high-performance operations)
   */
  getSessionRepository(): ISessionRepository {
    if (!this.sessionRepository) {
      this.sessionRepository = new DrizzleSessionRepositoryEnhanced(
        this.drizzleDb,
        this.logger,
        this.cache
      );

      this.logger.debug('Session repository initialized', {
        type: 'DrizzleSessionRepositoryEnhanced',
        cacheEnabled: !!this.cache,
      });
    }

    return this.sessionRepository;
  }

  /**
   * Get Transaction Manager for cross-ORM transactions
   */
  getTransactionManager(): TransactionManager {
    return this.transactionManager;
  }

  /**
   * Execute operations across multiple repositories in a single transaction
   */
  async withRepositoryTransaction<T>(
    operation: (repositories: {
      userRepository: IUserRepository;
      sessionRepository: ISessionRepository;
      transactionManager: TransactionManager;
    }) => Promise<T>
  ): Promise<T> {
    return this.transactionManager.withTransaction(async (_context) => {
      // Create transaction-aware repository instances
      const userRepository = this.getUserRepository();
      const sessionRepository = this.getSessionRepository();

      return operation({
        userRepository,
        sessionRepository,
        transactionManager: this.transactionManager,
      });
    });
  }

  /**
   * Get repository performance metrics
   */
  async getRepositoryMetrics(): Promise<{
    userRepository?: any;
    sessionRepository?: any;
    transactionManager?: any;
    cache?: any;
  }> {
    const metrics: any = {};

    if (this.userRepository) {
      metrics.userRepository = await (
        this.userRepository as any
      ).getQueryStats?.();
    }

    if (this.sessionRepository) {
      metrics.sessionRepository = await (
        this.sessionRepository as any
      ).getQueryStats?.();
    }

    if (this.transactionManager) {
      metrics.transactionManager =
        this.transactionManager.getTransactionStats();
    }

    if (this.cache) {
      metrics.cache = await this.cache.getStats();
    }

    return metrics;
  }

  /**
   * Warm up repository caches with frequently accessed data
   */
  async warmupCaches(): Promise<void> {
    if (!this.cache) {
      this.logger.warn('Cache warmup requested but caching is disabled');
      return;
    }

    const startTime = Date.now();
    this.logger.info('Starting repository cache warmup');

    try {
      // Warm up user repository cache
      const userRepo = this.getUserRepository();

      // Cache frequently accessed users (e.g., admin users, system users)
      // This is a simplified example - in practice, you'd identify hot data
      const recentUsers = await userRepo.findMany({
        limit: 100,
        sortBy: 'lastLoginAt',
        sortOrder: 'desc',
      });

      // Pre-cache user lookups
      await Promise.all(
        recentUsers.items.slice(0, 20).map(async (user) => {
          await userRepo.findByIdCached(user.id, 3600);
          if (user.email) {
            // Convert Email value object to string if needed
            const emailValue = typeof user.email === 'string' 
              ? user.email 
              : user.email.value || user.email.toString();
            await userRepo.findByEmailCached(emailValue, 3600);
          }
        })
      );

      // Warm up session repository cache
      const sessionRepo = this.getSessionRepository();

      // Cache active session stats
      await sessionRepo.getSessionStats();

      const duration = Date.now() - startTime;
      this.logger.info('Repository cache warmup completed', { duration });
    } catch (error) {
      this.logger.error('Repository cache warmup failed', { error });
      throw error;
    }
  }

  /**
   * Clear all repository caches
   */
  async clearCaches(): Promise<void> {
    if (!this.cache) {
      return;
    }

    try {
      await this.cache.clear();
      this.logger.info('All repository caches cleared');
    } catch (error) {
      this.logger.error('Failed to clear repository caches', { error });
      throw error;
    }
  }

  /**
   * Health check for all repositories
   */
  async healthCheck(): Promise<SystemHealthCheck> {
    const results: SystemHealthCheck = {
      status: 'healthy' as HealthStatus,
      repositories: {
        user: { status: 'unknown' as HealthStatus },
        session: { status: 'unknown' as HealthStatus },
      },
      database: {
        prisma: { status: 'unknown' as HealthStatus },
        drizzle: { status: 'unknown' as HealthStatus },
      },
      timestamp: new Date(),
      overall: 'healthy' as HealthStatus,
    };

    try {
      // Test user repository (Prisma)
      const userStartTime = Date.now();
      await this.getUserRepository().count();
      const userResponseTime = Date.now() - userStartTime;
      
      results.repositories.user = {
        status: 'healthy' as HealthStatus,
        responseTime: userResponseTime,
      };
      results.database.prisma = {
        status: 'healthy' as HealthStatus,
        responseTime: userResponseTime,
      };
    } catch (error) {
      results.repositories.user = { 
        status: 'unhealthy' as HealthStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.database.prisma = { 
        status: 'unhealthy' as HealthStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.status = 'unhealthy' as HealthStatus;
    }

    try {
      // Test session repository (Drizzle)
      const sessionStartTime = Date.now();
      await this.getSessionRepository().count();
      const sessionResponseTime = Date.now() - sessionStartTime;
      
      results.repositories.session = {
        status: 'healthy' as HealthStatus,
        responseTime: sessionResponseTime,
      };
      results.database.drizzle = {
        status: 'healthy' as HealthStatus,
        responseTime: sessionResponseTime,
      };
    } catch (error) {
      results.repositories.session = { 
        status: 'unhealthy' as HealthStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      results.database.drizzle = { 
        status: 'unhealthy' as HealthStatus,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
      if (results.status === 'healthy') {
        results.status = 'unhealthy' as HealthStatus;
      }
    }

    // Test cache if enabled
    if (this.cache) {
      try {
        const cacheStartTime = Date.now();
        await this.cache.set('health_check', 'ok', { ttl: 1 });
        await this.cache.get('health_check');
        const cacheResponseTime = Date.now() - cacheStartTime;
        
        results.cache = {
          status: 'healthy' as HealthStatus,
          responseTime: cacheResponseTime,
        };
      } catch (error) {
        results.cache = { 
          status: 'unhealthy' as HealthStatus,
          error: error instanceof Error ? error.message : 'Unknown error',
        };
        if (results.status === 'healthy') {
          results.status = 'degraded' as HealthStatus;
        }
      }
    }

    // Determine overall status
    const statuses = [
      results.repositories.user.status,
      results.repositories.session.status,
      results.database.prisma.status,
      results.database.drizzle.status,
    ];

    if (results.cache) {
      statuses.push(results.cache.status);
    }

    // Aggregate results manually since aggregateHealthStatus is not available
    const failedStatuses = statuses.filter(s => s !== 'healthy');
    if (failedStatuses.length === 0) {
      results.overall = 'healthy';
    } else if (failedStatuses.includes('unhealthy')) {
      results.overall = 'unhealthy';
    } else {
      results.overall = 'degraded';
    }

    return results;
  }

  /**
   * Graceful shutdown of all repository resources
   */
  async shutdown(): Promise<void> {
    this.logger.info('Shutting down repository factory');

    try {
      // Clear any pending operations
      if (this.cache) {
        await this.cache.clear();
      }

      // Reset repository instances - explicitly set to undefined
      this.userRepository = undefined;
      this.sessionRepository = undefined;

      this.logger.info('Repository factory shutdown completed');
    } catch (error) {
      this.logger.error('Error during repository factory shutdown', { error });
      throw error;
    }
  }

  /**
   * Initialize cache system
   */
  private initializeCache(): void {
    try {
      this.cache = new SimpleCacheAdapter(
        this.logger,
        {
          maxSize: this.config.cacheConfig?.maxMemoryItems || 1000,
          maxMemory: 100 * 1024 * 1024, // 100MB
          cleanupInterval: 60000, // 1 minute
          defaultTTL: this.config.cacheConfig?.defaultTtl || 3600,
        }
      );

      this.logger.debug('Repository cache initialized', {
        type: 'SimpleCacheAdapter',
        config: this.config.cacheConfig,
      });
    } catch (error) {
      this.logger.warn('Failed to initialize repository cache', { error });
      this.cache = undefined;
    }
  }

  /**
   * Create a repository factory instance with default configuration
   */
  static create(
    connectionManager: DatabaseConnectionManager,
    logger: Logger,
    config?: RepositoryConfig
  ): RepositoryFactory {
    const defaultConfig: RepositoryConfig = {
      enableCaching: true,
      cacheConfig: {
        defaultTtl: 3600,
        maxMemoryItems: 1000,
      },
      enableMetrics: true,
      optimizationLevel: 'basic',
      ...config,
    };

    return new RepositoryFactory(connectionManager, logger, defaultConfig);
  }

  /**
   * Create a repository factory for testing with minimal configuration
   */
  static createForTesting(
    connectionManager: DatabaseConnectionManager,
    logger: Logger
  ): RepositoryFactory {
    return new RepositoryFactory(connectionManager, logger, {
      enableCaching: false,
      enableMetrics: false,
      optimizationLevel: 'basic',
    });
  }
}
