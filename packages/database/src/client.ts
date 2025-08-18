import { PrismaClient } from '@prisma/client';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';
import * as schema from './drizzle/schema';

export type DrizzleClient = NodePgDatabase<typeof schema>;

export class DatabaseClientFactory {
  private static prismaClient: PrismaClient | null = null;
  private static drizzleClient: DrizzleClient | null = null;
  private static pgPool: Pool | null = null;

  /**
   * Create or get existing Prisma client instance
   */
  static createPrismaClient(): PrismaClient {
    if (!this.prismaClient) {
      this.prismaClient = new PrismaClient({
        log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
        errorFormat: 'pretty',
      });
    }
    return this.prismaClient;
  }

  /**
   * Create or get existing Drizzle client instance
   */
  static createDrizzleClient(): DrizzleClient {
    if (!this.drizzleClient) {
      if (!this.pgPool) {
        this.pgPool = new Pool({
          connectionString: process.env.DATABASE_URL,
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 2000,
        });
      }
      this.drizzleClient = drizzle(this.pgPool, { schema });
    }
    return this.drizzleClient;
  }

  /**
   * Get repository instance based on type
   */
  static getRepository<T>(type: RepositoryType): T {
    // This will be implemented based on the repository factory pattern
    throw new Error('Repository factory not implemented yet');
  }

  /**
   * Close all database connections
   */
  static async closeConnections(): Promise<void> {
    if (this.prismaClient) {
      await this.prismaClient.$disconnect();
      this.prismaClient = null;
    }
    
    if (this.pgPool) {
      await this.pgPool.end();
      this.pgPool = null;
      this.drizzleClient = null;
    }
  }

  /**
   * Health check for database connections
   */
  static async healthCheck(): Promise<{ prisma: boolean; drizzle: boolean }> {
    const results = { prisma: false, drizzle: false };

    try {
      const prisma = this.createPrismaClient();
      await prisma.$queryRaw`SELECT 1`;
      results.prisma = true;
    } catch (error) {
      console.error('Prisma health check failed:', error);
    }

    try {
      const drizzle = this.createDrizzleClient();
      await drizzle.execute('SELECT 1');
      results.drizzle = true;
    } catch (error) {
      console.error('Drizzle health check failed:', error);
    }

    return results;
  }
}

export enum RepositoryType {
  USER = 'user',
  SESSION = 'session',
  OAUTH_ACCOUNT = 'oauth_account',
  MFA_CHALLENGE = 'mfa_challenge',
  WEBHOOK = 'webhook',
  WEBHOOK_EVENT = 'webhook_event',
  WEBHOOK_DELIVERY = 'webhook_delivery',
  ROLE = 'role',
  PERMISSION = 'permission',
}

// Re-export types for convenience
export type { DrizzleClient, PrismaClient };
