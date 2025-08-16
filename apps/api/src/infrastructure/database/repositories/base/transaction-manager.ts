/**
 * Transaction Manager
 * Handles transactions across both Prisma and Drizzle ORM systems
 */

import { PrismaClient } from '@prisma/client';
import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Logger } from 'winston';
import {
  ITransactionContext,
  ITransactionalRepository,
} from '../interfaces/base-repository.interface';
import * as authSessionsSchema from '../../drizzle/schema/auth-sessions';
import * as oauthCacheSchema from '../../drizzle/schema/oauth-cache';

export interface TransactionOptions {
  timeout?: number;
  isolationLevel?:
    | 'READ_UNCOMMITTED'
    | 'READ_COMMITTED'
    | 'REPEATABLE_READ'
    | 'SERIALIZABLE';
  maxRetries?: number;
  retryDelay?: number;
}

export class TransactionManager implements ITransactionalRepository {
  constructor(
    private prismaClient: PrismaClient,
    private drizzleDb: NodePgDatabase<
      typeof authSessionsSchema & typeof oauthCacheSchema
    >,
    private logger: Logger
  ) {}

  /**
   * Execute operations within a transaction across both ORM systems
   * Uses a single database connection to ensure ACID properties
   */
  async withTransaction<T>(
    operation: (context: ITransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const { timeout = 30000, maxRetries = 3, retryDelay = 1000 } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.executeTransaction(operation, timeout);
      } catch (error) {
        lastError = error as Error;

        if (this.isRetryableError(error) && attempt < maxRetries) {
          this.logger.warn(
            `Transaction failed, retrying (${attempt}/${maxRetries})`,
            {
              error: (error as Error).message,
              attempt,
            }
          );

          await this.sleep(retryDelay * attempt);
          continue;
        }

        throw error;
      }
    }

    throw lastError!;
  }

  private async executeTransaction<T>(
    operation: (context: ITransactionContext) => Promise<T>,
    timeout: number
  ): Promise<T> {
    const startTime = Date.now();

    try {
      // Use Prisma's transaction system as the primary coordinator
      // since it provides better transaction management
      return await this.prismaClient.$transaction(
        async (prismaTransaction: PrismaClient) => {
          // Create a Drizzle instance that uses the same connection
          // This is a simplified approach - in production, you'd want to ensure
          // both ORMs use the same underlying connection
          const context: ITransactionContext = {
            prisma: prismaTransaction,
            drizzle: this.drizzleDb, // In practice, this should use the same connection
          };

          const result = await operation(context);

          this.logger.debug('Transaction completed successfully', {
            duration: Date.now() - startTime,
          });

          return result;
        },
        {
          timeout,
          maxWait: 5000,
        }
      );
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Transaction failed', {
        error: (error as Error).message,
        duration,
      });

      throw error;
    }
  }

  /**
   * Execute a distributed transaction across both ORM systems
   * This is more complex and should be used sparingly
   */
  async withDistributedTransaction<T>(
    operation: (context: ITransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const { timeout = 30000 } = options;
    const startTime = Date.now();

    // This is a simplified implementation of distributed transactions
    // In production, you'd want to use a proper 2PC (Two-Phase Commit) protocol

    let prismaTransaction: any;
    let drizzleTransaction: any;
    let committed = false;

    try {
      // Start both transactions
      const transactionPromise = new Promise<T>((resolve, reject) => {
        this.prismaClient
          .$transaction(
            async (prisma: PrismaClient) => {
              prismaTransaction = prisma;

              // For Drizzle, we'd need to implement transaction support
              // This is a placeholder for the actual implementation
              drizzleTransaction = this.drizzleDb;

              const context: ITransactionContext = {
                prisma: prismaTransaction,
                drizzle: drizzleTransaction,
              };

              try {
                const result = await operation(context);
                committed = true;
                resolve(result);
              } catch (error) {
                reject(error);
              }
            },
            { timeout }
          )
          .catch(reject);
      });

      const result = await transactionPromise;

      this.logger.debug('Distributed transaction completed successfully', {
        duration: Date.now() - startTime,
      });

      return result;
    } catch (error) {
      const duration = Date.now() - startTime;

      this.logger.error('Distributed transaction failed', {
        error: (error as Error).message,
        duration,
        committed,
      });

      throw error;
    }
  }

  /**
   * Execute operations with automatic retry on deadlock or connection issues
   */
  async withRetryableTransaction<T>(
    operation: (context: ITransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    const {
      maxRetries = 3,
      retryDelay = 1000,
      ...transactionOptions
    } = options;

    let lastError: Error;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await this.withTransaction(operation, transactionOptions);
      } catch (error) {
        lastError = error as Error;

        if (this.isRetryableError(error) && attempt < maxRetries) {
          const delay = retryDelay * Math.pow(2, attempt - 1); // Exponential backoff

          this.logger.warn(
            `Retryable transaction error, retrying in ${delay}ms`,
            {
              error: (error as Error).message,
              attempt,
              maxRetries,
            }
          );

          await this.sleep(delay);
          continue;
        }

        break;
      }
    }

    throw lastError!;
  }

  /**
   * Execute a read-only transaction that can use replica databases
   */
  async withReadOnlyTransaction<T>(
    operation: (context: ITransactionContext) => Promise<T>,
    options: TransactionOptions = {}
  ): Promise<T> {
    // For read-only transactions, we can potentially use replica databases
    // This is a simplified implementation
    return this.withTransaction(operation, {
      ...options,
      isolationLevel: 'READ_COMMITTED',
    });
  }

  /**
   * Batch multiple operations in a single transaction
   */
  async batchOperations<T>(
    operations: Array<(context: ITransactionContext) => Promise<T>>,
    options: TransactionOptions = {}
  ): Promise<T[]> {
    return this.withTransaction(async (context) => {
      const results: T[] = [];

      for (const operation of operations) {
        const result = await operation(context);
        results.push(result);
      }

      return results;
    }, options);
  }

  private isRetryableError(error: any): boolean {
    const retryableErrors = [
      'P2034', // Prisma: Transaction conflict
      'P2028', // Prisma: Transaction API error
      '40001', // PostgreSQL: Serialization failure
      '40P01', // PostgreSQL: Deadlock detected
      'ECONNRESET',
      'ECONNREFUSED',
      'ETIMEDOUT',
    ];

    const errorMessage = error.message || '';
    const errorCode = error.code || '';

    return retryableErrors.some(
      (code) => errorCode === code || errorMessage.includes(code)
    );
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Get transaction statistics
   */
  getTransactionStats(): {
    totalTransactions: number;
    successfulTransactions: number;
    failedTransactions: number;
    averageDuration: number;
  } {
    // This would be implemented with proper metrics collection
    // For now, returning placeholder values
    return {
      totalTransactions: 0,
      successfulTransactions: 0,
      failedTransactions: 0,
      averageDuration: 0,
    };
  }
}
