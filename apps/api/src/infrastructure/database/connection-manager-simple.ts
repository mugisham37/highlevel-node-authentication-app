import { Pool, PoolConfig } from 'pg';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from 'winston';
import * as authSessionsSchema from './drizzle/schema/auth-sessions';
import * as oauthCacheSchema from './drizzle/schema/oauth-cache';

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

export class SimpleDatabaseConnectionManager {
  private primaryPool!: Pool;
  private drizzleDb!: NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  >;

  constructor(
    private config: DatabaseConfig,
    private logger: Logger
  ) {
    this.initializeConnections();
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

    // Initialize Drizzle instance
    this.drizzleDb = drizzle(this.primaryPool, {
      schema: { ...authSessionsSchema, ...oauthCacheSchema },
    });
  }

  // Get Drizzle instance for high-performance operations
  public getDrizzleDb(): NodePgDatabase<
    typeof authSessionsSchema & typeof oauthCacheSchema
  > {
    return this.drizzleDb;
  }

  // Execute query with retry logic
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

  // Graceful shutdown
  public async shutdown(): Promise<void> {
    this.logger.info('Shutting down database connections...');

    try {
      await this.primaryPool.end();
      this.logger.info('Database connections closed successfully');
    } catch (error) {
      this.logger.error('Error during database shutdown', { error });
      throw error;
    }
  }
}
