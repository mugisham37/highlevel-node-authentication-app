/** @type {import('jest').Config} */
module.exports = {
  // Display name for this project
  displayName: {
    name: 'PACKAGE_NAME',
    color: 'blue',
  },

  // Test environment
  testEnvironment: 'node',

  // Root directory for this package
  rootDir: '.',

  // Test match patterns
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{ts,tsx,js,jsx}',
    '<rootDir>/src/**/*.{test,spec}.{ts,tsx,js,jsx}',
  ],

  // Ignore patterns
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/dist/', '<rootDir>/build/'],

  // Coverage configuration
  collectCoverageFrom: [
    'src/**/*.{ts,tsx,js,jsx}',
    '!src/**/*.d.ts',
    '!src/**/*.stories.{ts,tsx}',
    '!src/**/*.test.{ts,tsx,js,jsx}',
    '!src/**/*.spec.{ts,tsx,js,jsx}',
    '!src/**/index.{ts,tsx,js,jsx}',
  ],

  // Coverage directory
  coverageDirectory: '<rootDir>/coverage',

  // Transform configuration
  transform: {
    '^.+\\.(ts|tsx)$': [
      'ts-jest',
      {
        tsconfig: '<rootDir>/tsconfig.json',
      },
    ],
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],

  // Module name mapping for path aliases
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^@company/shared$': '<rootDir>/../shared/src',
    '^@company/shared/(.*)$': '<rootDir>/../shared/src/$1',
    '^@company/database$': '<rootDir>/../database/src',
    '^@company/database/(.*)$': '<rootDir>/../database/src/$1',
    '^@company/auth$': '<rootDir>/../auth/src',
    '^@company/auth/(.*)$': '<rootDir>/../auth/src/$1',
    '^@company/config$': '<rootDir>/../config/src',
    '^@company/config/(.*)$': '<rootDir>/../config/src/$1',
    '^@company/cache$': '<rootDir>/../cache/src',
    '^@company/cache/(.*)$': '<rootDir>/../cache/src/$1',
    '^@company/logger$': '<rootDir>/../logger/src',
    '^@company/logger/(.*)$': '<rootDir>/../logger/src/$1',
    '^@company/notifications$': '<rootDir>/../notifications/src',
    '^@company/notifications/(.*)$': '<rootDir>/../notifications/src/$1',
    '^@company/ui$': '<rootDir>/../ui/src',
    '^@company/ui/(.*)$': '<rootDir>/../ui/src/$1',
    '^@company/api-contracts$': '<rootDir>/../api-contracts/src',
    '^@company/api-contracts/(.*)$': '<rootDir>/../api-contracts/src/$1',
  },

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/../../jest.setup.js'],

  // Test timeout
  testTimeout: 10000,

  // Clear mocks between tests
  clearMocks: true,

  // Restore mocks after each test
  restoreMocks: true,
};
