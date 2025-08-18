import winston from 'winston';
import { createLogger as factoryCreateLogger, createLoggerWithCorrelation as factoryCreateLoggerWithCorrelation, getLoggerFactory } from './logger-factory';

/**
 * Creates a logger instance with a specific service name
 * @param serviceName - The name of the service/component using the logger
 * @returns A winston logger instance
 */
export function createLogger(serviceName: string): winston.Logger {
  return factoryCreateLogger(serviceName);
}

/**
 * Creates a logger with both service name and correlation ID
 * @param serviceName - The name of the service/component using the logger
 * @param correlationId - The correlation ID for request tracking
 * @returns A winston logger instance
 */
export function createLoggerWithCorrelation(serviceName: string, correlationId: string): winston.Logger {
  return factoryCreateLoggerWithCorrelation(serviceName, correlationId);
}

/**
 * Create child logger with correlation ID support
 */
export const createChildLogger = (correlationId: string): winston.Logger => {
  return getLoggerFactory().getRootLogger().child({ correlationId });
};

// Get the root logger instance
export const logger = getLoggerFactory().getRootLogger();

// Export logger types for TypeScript
export type Logger = winston.Logger;

// Export the logger instance as default
export default logger;
