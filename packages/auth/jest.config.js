/** @type {import('jest').Config} */
module.exports = {
  displayName: '@company/auth',
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.test.ts',
    '<rootDir>/src/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/index.ts'
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      branches: 90,
      functions: 90,
      lines: 90,
      statements: 90
    }
  },
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  moduleNameMapping: {
    '^@company/shared(.*)$': '<rootDir>/../shared/src$1',
    '^@company/config(.*)$': '<rootDir>/../config/src$1',
    '^@company/database(.*)$': '<rootDir>/../database/src$1',
    '^@company/cache(.*)$': '<rootDir>/../cache/src$1',
    '^@company/logger(.*)$': '<rootDir>/../logger/src$1'
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: 'tsconfig.json'
    }]
  }
};