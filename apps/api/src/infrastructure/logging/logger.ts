import winston from 'winston';
import { logger } from './winston-logger';

/**
 * Creates a logger instance with a specific service name
 * @param serviceName - The name of the service/component using the logger
 * @returns A winston logger instance
 */
export function createLogger(serviceName: string): winston.Logger {
  return logger.child({ service: serviceName });
}

/**
 * Creates a logger with both service name and correlation ID
 * @param serviceName - The name of the service/component using the logger
 * @param correlationId - The correlation ID for request tracking
 * @returns A winston logger instance
 */
export function createLoggerWithCorrelation(serviceName: string, correlationId: string): winston.Logger {
  return logger.child({ service: serviceName, correlationId });
}

// Re-export main logger and child logger creator for convenience
export { logger, createChildLogger } from './winston-logger';
export type { Logger } from './winston-logger';

// Export the logger instance as default
export default logger;
