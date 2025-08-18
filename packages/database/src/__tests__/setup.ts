import { afterAll, beforeAll } from 'vitest';
import { DatabaseClientFactory } from '../client';

// Setup test environment
beforeAll(async () => {
  // Set test environment variables
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL || 'postgresql://test:test@localhost:5432/test_db';
  
  // Initialize database connections for testing
  try {
    const healthCheck = await DatabaseClientFactory.healthCheck();
    console.log('Database health check:', healthCheck);
  } catch (error) {
    console.warn('Database health check failed, tests may not work properly:', error);
  }
});

// Cleanup after all tests
afterAll(async () => {
  await DatabaseClientFactory.closeConnections();
});