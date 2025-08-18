// Main logging module exports
export { createChildLogger, createLogger, createLoggerWithCorrelation, logger } from './logger';
export type { Logger } from './logger';
export { LoggerFactory, getLoggerFactory, initializeLogger } from './logger-factory';
export type { LoggerConfig } from './logger-factory';

// Export transports
export * from './transports';

// Export formatters
export * from './formatters';

// Export correlation utilities
export * from './correlation';

// Export metrics
export * from './metrics';

// Export filters
export * from './filters';

// Default export
export { default } from './logger';
