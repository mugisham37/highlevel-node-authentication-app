// Test setup file
import { config } from 'dotenv';
// import { vi } from 'vitest'; // Will be used when we add mocking

// Load test environment variables
config({ path: '.env.test' });

// Set NODE_ENV to test
process.env['NODE_ENV'] = 'test';

// Set required environment variables for tests
process.env['JWT_SECRET'] = 'test-jwt-secret-key-for-testing-purposes-only';
process.env['SERVER_HOST'] = 'localhost';
process.env['SERVER_PORT'] = '3001';

// Mock console methods in tests to reduce noise (commented out for debugging)
// global.console = {
//   ...console,
//   log: vi.fn(),
//   debug: vi.fn(),
//   info: vi.fn(),
//   warn: vi.fn(),
//   error: vi.fn(),
// };
