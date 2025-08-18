import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import { DatabaseClientFactory, RepositoryType } from '../client';

// Mock environment variables
vi.mock('process', () => ({
  env: {
    DATABASE_URL: 'postgresql://test:test@localhost:5432/test_db',
    NODE_ENV: 'test',
  },
}));

describe('DatabaseClientFactory', () => {
  beforeAll(async () => {
    // Setup test database connection
  });

  afterAll(async () => {
    await DatabaseClientFactory.closeConnections();
  });

  describe('createPrismaClient', () => {
    it('should create a Prisma client instance', () => {
      const client = DatabaseClientFactory.createPrismaClient();
      expect(client).toBeDefined();
      expect(typeof client.$connect).toBe('function');
    });

    it('should return the same instance on subsequent calls', () => {
      const client1 = DatabaseClientFactory.createPrismaClient();
      const client2 = DatabaseClientFactory.createPrismaClient();
      expect(client1).toBe(client2);
    });
  });

  describe('createDrizzleClient', () => {
    it('should create a Drizzle client instance', () => {
      const client = DatabaseClientFactory.createDrizzleClient();
      expect(client).toBeDefined();
      expect(typeof client.execute).toBe('function');
    });

    it('should return the same instance on subsequent calls', () => {
      const client1 = DatabaseClientFactory.createDrizzleClient();
      const client2 = DatabaseClientFactory.createDrizzleClient();
      expect(client1).toBe(client2);
    });
  });

  describe('healthCheck', () => {
    it('should perform health checks for both clients', async () => {
      const result = await DatabaseClientFactory.healthCheck();
      expect(result).toHaveProperty('prisma');
      expect(result).toHaveProperty('drizzle');
      expect(typeof result.prisma).toBe('boolean');
      expect(typeof result.drizzle).toBe('boolean');
    });
  });

  describe('closeConnections', () => {
    it('should close all database connections', async () => {
      // Create clients first
      DatabaseClientFactory.createPrismaClient();
      DatabaseClientFactory.createDrizzleClient();

      // Close connections
      await expect(DatabaseClientFactory.closeConnections()).resolves.not.toThrow();
    });
  });

  describe('getRepository', () => {
    it('should throw error for unimplemented repository factory', () => {
      expect(() => {
        DatabaseClientFactory.getRepository(RepositoryType.USER);
      }).toThrow('Repository factory not implemented yet');
    });
  });
});