/**
 * Jest setup file for auth package
 */

// Mock winston logger
jest.mock('winston', () => ({
  createLogger: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  })),
  format: {
    combine: jest.fn(),
    timestamp: jest.fn(),
    errors: jest.fn(),
    json: jest.fn()
  },
  transports: {
    Console: jest.fn(),
    File: jest.fn()
  }
}));

// Mock crypto for secure random generation
Object.defineProperty(global, 'crypto', {
  value: {
    randomBytes: jest.fn((size) => Buffer.alloc(size, 0)),
    randomUUID: jest.fn(() => '12345678-1234-1234-1234-123456789012')
  }
});

// Mock timers for testing time-based functionality
jest.useFakeTimers();

// Global test timeout
jest.setTimeout(10000);