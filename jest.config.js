/** @type {import('jest').Config} */
module.exports = {
  // Root directory
  rootDir: '.',

  // Global test configuration
  testEnvironment: 'node',

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/index.{ts,tsx,js,jsx}',
  ],

  // Coverage thresholds (basic setup, no specific targets as per requirements)
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70,
    },
  },

  // Coverage reporters
  coverageReporters: ['text', 'text-summary', 'html', 'lcov', 'json'],

  // Coverage directory
  coverageDirectory: '<rootDir>/coverage',

  // Test match patterns
  testMatch: [
    '<rootDir>/**/__tests__/**/*.{ts,tsx,js,jsx}',
    '<rootDir>/**/*.{test,spec}.{ts,tsx,js,jsx}',
  ],

  // Ignore patterns
  testPathIgnorePatterns: [
    '<rootDir>/node_modules/',
    '<rootDir>/dist/',
    '<rootDir>/build/',
    '<rootDir>/.next/',
    '<rootDir>/coverage/',
  ],

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.base.json',
      },
    ],
  },

  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@company/shared$': '<rootDir>/packages/shared/src',
    '^@company/shared/(.*)$': '<rootDir>/packages/shared/src/$1',
    '^@company/database$': '<rootDir>/packages/database/src',
    '^@company/database/(.*)$': '<rootDir>/packages/database/src/$1',
    '^@company/auth$': '<rootDir>/packages/auth/src',
    '^@company/auth/(.*)$': '<rootDir>/packages/auth/src/$1',
    '^@company/config$': '<rootDir>/packages/config/src',
    '^@company/config/(.*)$': '<rootDir>/packages/config/src/$1',
    '^@company/cache$': '<rootDir>/packages/cache/src',
    '^@company/cache/(.*)$': '<rootDir>/packages/cache/src/$1',
    '^@company/logger$': '<rootDir>/packages/logger/src',
    '^@company/logger/(.*)$': '<rootDir>/packages/logger/src/$1',
    '^@company/notifications$': '<rootDir>/packages/notifications/src',
    '^@company/notifications/(.*)$': '<rootDir>/packages/notifications/src/$1',
    '^@company/ui$': '<rootDir>/packages/ui/src',
    '^@company/ui/(.*)$': '<rootDir>/packages/ui/src/$1',
    '^@company/api-contracts$': '<rootDir>/packages/api-contracts/src',
    '^@company/api-contracts/(.*)$': '<rootDir>/packages/api-contracts/src/$1',
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Verbose output
  verbose: false,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,
};
