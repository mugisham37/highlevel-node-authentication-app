import winston from 'winston';
import { config } from '../config/environment';

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss.SSS',
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta, null, 2) : '';
    return `${timestamp} [${level.toUpperCase()}]: ${message} ${metaString}`;
  })
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({
    format: 'HH:mm:ss',
  }),
  winston.format.printf(({ timestamp, level, message, ...meta }) => {
    const metaString = Object.keys(meta).length ? JSON.stringify(meta) : '';
    return `${timestamp} ${level}: ${message} ${metaString}`;
  })
);

// Create transports array
const transports: winston.transport[] = [];

// Console transport (always enabled in development)
if (config.isDevelopment || config.isTest) {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
      level: config.logging.level,
    })
  );
}

// File transport (production and development)
if (!config.isTest) {
  transports.push(
    new winston.transports.File({
      filename: config.logging.file,
      format: logFormat,
      level: config.logging.level,
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );

  // Error log file
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      format: logFormat,
      level: 'error',
      maxsize: 10 * 1024 * 1024, // 10MB
      maxFiles: 5,
      tailable: true,
    })
  );
}

// Create logger instance
export const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  transports,
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled rejections
if (!config.isTest) {
  logger.exceptions.handle(
    new winston.transports.File({
      filename: 'logs/exceptions.log',
      format: logFormat,
    })
  );

  logger.rejections.handle(
    new winston.transports.File({
      filename: 'logs/rejections.log',
      format: logFormat,
    })
  );
}

// Create child logger with correlation ID support
export const createChildLogger = (correlationId: string) => {
  return logger.child({ correlationId });
};

// Export logger types for TypeScript
export type Logger = typeof logger;