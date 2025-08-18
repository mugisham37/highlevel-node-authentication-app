// Global Jest setup file
// This file is executed before each test file

// Set test environment variables
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://postgres:postgres@localhost:5433/fullstack_test';
process.env.REDIS_URL = 'redis://localhost:6380';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-testing-only';

// Mock console methods in test environment to reduce noise
if (process.env.NODE_ENV === 'test') {
  // Only mock console.log, keep console.error and console.warn for debugging
  global.console = {
    ...console,
    log: jest.fn(),
  };
}

// Global test utilities
global.testUtils = {
  // Helper to create test user data
  createTestUser: () => ({
    id: 'test-user-id',
    email: 'test@example.com',
    firstName: 'Test',
    lastName: 'User',
    createdAt: new Date(),
    updatedAt: new Date(),
  }),

  // Helper to create test JWT payload
  createTestJwtPayload: () => ({
    sub: 'test-user-id',
    email: 'test@example.com',
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 3600,
  }),

  // Helper to wait for async operations
  wait: (ms = 100) => new Promise(resolve => setTimeout(resolve, ms)),
};

// Global test timeout
jest.setTimeout(10000);

// Clean up after tests
afterEach(() => {
  // Clear all mocks after each test
  jest.clearAllMocks();
});

// Global error handler for unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

// Suppress specific warnings in test environment
const originalWarn = console.warn;
console.warn = (...args) => {
  // Suppress specific warnings that are common in test environment
  const message = args[0];
  if (
    typeof message === 'string' &&
    (message.includes('deprecated') ||
      message.includes('experimental') ||
      message.includes('punycode'))
  ) {
    return;
  }
  originalWarn.apply(console, args);
};
