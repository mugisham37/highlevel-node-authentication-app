/** @type {import('jest').Config} */
module.exports = {
  // Display name
  displayName: {
    name: 'Mobile E2E Tests',
    color: 'magenta',
  },

  // Root directory
  rootDir: '../..',

  // Test environment
  testEnvironment: './tests/mobile/environment.js',

  // Test match patterns
  testMatch: [
    '<rootDir>/tests/mobile/**/*.{test,spec}.{js,ts}',
    '<rootDir>/apps/mobile/**/*.e2e.{js,ts}',
  ],

  // Test timeout
  testTimeout: 120000,

  // Setup files
  setupFilesAfterEnv: ['<rootDir>/tests/mobile/setup.js'],

  // Transform configuration
  transform: {
    '^.+\\.(js|ts)$': 'babel-jest',
  },

  // Module file extensions
  moduleFileExtensions: ['ts', 'js', 'json'],

  // Ignore patterns
  testPathIgnorePatterns: ['<rootDir>/node_modules/', '<rootDir>/apps/mobile/node_modules/'],

  // Reporters
  reporters: [
    'default',
    [
      'jest-junit',
      {
        outputDirectory: 'test-results/mobile',
        outputName: 'results.xml',
      },
    ],
  ],

  // Verbose output
  verbose: true,

  // Max workers (run tests serially for mobile)
  maxWorkers: 1,
};
