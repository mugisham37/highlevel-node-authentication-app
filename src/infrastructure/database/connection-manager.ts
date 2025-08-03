import { Pool, PoolClient, PoolConfig } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
// import { PrismaClient } from '../../generated/prisma';
import { Logger } from 'winston';
import * as authSessionsSchema from './drizzle/schema/auth-sessions';
import * as oauthCacheSchema from './drizzle/schema/oauth-cache';
import { PrismaClient } from '@prisma/client';

export interface DatabaseConfig {
  primary: {
    connectionString: string;
    poolConfig?: Partial<PoolConfig>;
  };
  replicas?: {
    connectionString: string;
    poolConfig?: Partial<PoolConfig>;
  }[];
  retryConfig: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
  };
}

export interface ConnectionHealth {
  isHealthy: boolean;
  lastCheck: Date;
  consecutiveFailures: number;
  responseTime?: number;
}

export class DatabaseConnectionManager {
  private primaryPool!: Pool;
  private replicaPools: Pool[] = [];
  private currentReplicaIndex = 0;
  private healthStatus = new Map<string, ConnectionHealth>();
  private circuitBreakers = new Map<string, CircuitBreaker>();

  // ORM instances
  private prismaClient!: PrismaClient;
  private drizzleDb!: NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  >;
  private drizzleReplicas: NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  >[] = [];

  constructor(
    private config: DatabaseConfig,
    private logger: Logger
  ) {
    this.initializeConnections();
    this.startHealthChecks();
  }

  private initializeConnections(): void {
    // Initialize primary connection
    this.primaryPool = new Pool({
      connectionString: this.config.primary.connectionString,
      max: 20,
      min: 2,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
      ...this.config.primary.poolConfig,
    });

    // Initialize replica connections
    if (this.config.replicas) {
      this.replicaPools = this.config.replicas.map(
        (replica) =>
          new Pool({
            connectionString: replica.connectionString,
            max: 15,
            min: 1,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 5000,
            ...replica.poolConfig,
          })
      );
    }

    // Initialize Prisma client
    this.prismaClient = new PrismaClient({
      datasources: {
        db: {
          url: this.config.primary.connectionString,
        },
      },
      log: [
        { level: 'query', emit: 'event' },
        { level: 'error', emit: 'event' },
        { level: 'warn', emit: 'event' },
      ],
    });

    // Initialize Drizzle instances
    this.drizzleDb = drizzle(this.primaryPool, {
      schema: { ...authSessionsSchema, ...oauthCacheSchema },
    });

    this.drizzleReplicas = this.replicaPools.map((pool) =>
      drizzle(pool, {
        schema: { ...authSessionsSchema, ...oauthCacheSchema },
      })
    );

    // Initialize circuit breakers
    this.circuitBreakers.set('primary', new CircuitBreaker(5, 60000));
    this.replicaPools.forEach((_, index) => {
      this.circuitBreakers.set(
        `replica-${index}`,
        new CircuitBreaker(3, 30000)
      );
    });

    // Set up Prisma event listeners
    this.setupPrismaEventListeners();
  }

  private setupPrismaEventListeners(): void {
    // TODO: Enable Prisma event listeners once client is properly generated
    // this.prismaClient.$on('query', (e: any) => {
    //   if (e.duration > 100) {
    //     this.logger.warn('Slow Prisma query detected', {
    //       query: e.query,
    //       duration: e.duration,
    //       params: e.params,
    //     });
    //   }
    // });
    // this.prismaClient.$on('error', (e: any) => {
    //   this.logger.error('Prisma error', { error: e });
    // });
    // this.prismaClient.$on('warn', (e: any) => {
    //   this.logger.warn('Prisma warning', { message: e.message });
    // });
  }

  // Get Prisma client for complex relational operations
  public getPrismaClient(): PrismaClient {
    return this.prismaClient;
  }

  // Get Drizzle instance for high-performance operations
  public getDrizzleDb(): NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  > {
    return this.drizzleDb;
  }

  // Execute query with automatic failover to replicas for read operations
  public async executeQuery<T>(
    operation: (
      db: NodePgDatabase<typeof authSessionsSchema & typeof oauthCacheSchema>
    ) => Promise<T>,
    options: { preferReplica?: boolean } = {}
  ): Promise<T> {
    const { preferReplica = false } = options;

    if (preferReplica && this.drizzleReplicas.length > 0) {
      try {
        return await this.executeWithCircuitBreaker(
          () => this.executeOnReplica(operation),
          'replica'
        );
      } catch (error) {
        this.logger.warn('Replica query failed, falling back to primary', {
          error,
        });
        return await this.executeWithCircuitBreaker(
          () => operation(this.drizzleDb),
          'primary'
        );
      }
    }

    return await this.executeWithCircuitBreaker(
      () => operation(this.drizzleDb),
      'primary'
    );
  }

  private async executeOnReplica<T>(
    operation: (
      db: NodePgDatabase<typeof authSessionsSchema & typeof oauthCacheSchema>
    ) => Promise<T>
  ): Promise<T> {
    const replica = this.getNextHealthyReplica();
    if (!replica) {
      throw new Error('No healthy replicas available');
    }

    return await operation(replica);
  }

  private getNextHealthyReplica(): NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  > | null {
    if (this.drizzleReplicas.length === 0) return null;

    let attempts = 0;

    do {
      const replica = this.drizzleReplicas[this.currentReplicaIndex];
      const health = this.healthStatus.get(
        `replica-${this.currentReplicaIndex}`
      );

      this.currentReplicaIndex =
        (this.currentReplicaIndex + 1) % this.drizzleReplicas.length;
      attempts++;

      if (!health || health.isHealthy) {
        return replica || null;
      }
    } while (attempts < this.drizzleReplicas.length);

    return null;
  }

  private async executeWithCircuitBreaker<T>(
    operation: () => Promise<T>,
    connectionType: string
  ): Promise<T> {
    const circuitBreaker = this.circuitBreakers.get(connectionType);
    if (!circuitBreaker) {
      throw new Error(`Circuit breaker not found for ${connectionType}`);
    }

    return await circuitBreaker.execute(operation);
  }

  // Execute with retry logic
  public async executeWithRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = this.config.retryConfig.maxRetries
  ): Promise<T> {
    let lastError: Error;
    let delay = this.config.retryConfig.retryDelay;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error as Error;

        if (attempt === maxRetries) {
          break;
        }

        if (this.isRetryableError(error)) {
          this.logger.warn(
            `Database operation failed, retrying in ${delay}ms`,
            {
              attempt: attempt + 1,
              maxRetries,
              error: (error as Error).message,
            }
          );

          await this.sleep(delay);
          delay *= this.config.retryConfig.backoffMultiplier;
        } else {
          throw error;
        }
      }
    }

    throw lastError!;
  }

  private isRetryableError(error: any): boolean {
    const retryableCodes = [
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
      'ENOTFOUND',
      'EAI_AGAIN',
    ];

    return retryableCodes.some(
      (code) => error.code === code || error.message?.includes(code)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  // Health check system
  private startHealthChecks(): void {
    setInterval(() => {
      this.performHealthChecks();
    }, 30000); // Check every 30 seconds
  }

  private async performHealthChecks(): Promise<void> {
    // Check primary connection
    await this.checkConnectionHealth('primary', this.primaryPool);

    // Check replica connections
    for (let i = 0; i < this.replicaPools.length; i++) {
      const pool = this.replicaPools[i];
      if (pool) {
        await this.checkConnectionHealth(`replica-${i}`, pool);
      }
    }
  }

  private async checkConnectionHealth(name: string, pool: Pool): Promise<void> {
    const startTime = Date.now();
    let client: PoolClient | null = null;

    try {
      client = await pool.connect();
      await client.query('SELECT 1');

      const responseTime = Date.now() - startTime;

      this.healthStatus.set(name, {
        isHealthy: true,
        lastCheck: new Date(),
        consecutiveFailures: 0,
        responseTime,
      });

      this.logger.debug(`Health check passed for ${name}`, { responseTime });
    } catch (error) {
      const currentHealth = this.healthStatus.get(name) || {
        isHealthy: true,
        lastCheck: new Date(),
        consecutiveFailures: 0,
      };

      const newHealth: ConnectionHealth = {
        isHealthy: currentHealth.consecutiveFailures < 2, // Mark unhealthy after 3 failures
        lastCheck: new Date(),
        consecutiveFailures: currentHealth.consecutiveFailures + 1,
      };

      this.healthStatus.set(name, newHealth);

      this.logger.error(`Health check failed for ${name}`, {
        error: (error as Error).message,
        consecutiveFailures: newHealth.consecutiveFailures,
      });
    } finally {
      if (client) {
        client.release();
      }
    }
  }

  // Get connection health status
  public getHealthStatus(): Map<string, ConnectionHealth> {
    return new Map(this.healthStatus);
  }

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down database connections...');

    try {
      await this.prismaClient.$disconnect();
      await this.primaryPool.end();

      await Promise.all(this.replicaPools.map((pool) => pool.end()));

      this.logger.info('Database connections closed successfully');
    } catch (error) {
      this.logger.error('Error during database shutdown', { error });
      throw error;
    }
  }
}

// Circuit Breaker implementation
class CircuitBreaker {
  private failures = 0;
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private nextAttempt = Date.now();

  constructor(
    private readonly failureThreshold: number,
    private readonly recoveryTimeout: number
  ) { }

  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() < this.nextAttempt) {
        throw new Error('Circuit breaker is OPEN');
      }
      this.state = 'HALF_OPEN';
    }

    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failures = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failures++;
    if (this.failures >= this.failureThreshold) {
      this.state = 'OPEN';
      this.nextAttempt = Date.now() + this.recoveryTimeout;
    }
  }

  public getState(): string {
    return this.state;
  }
}
