import winston from 'winston';

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

// Initialize logger with basic configuration that doesn't require config access
const defaultLevel = process.env.LOG_LEVEL || 'info';
const isDevelopment = process.env.NODE_ENV === 'development';
const isTest = process.env.NODE_ENV === 'test';

// Create initial transports array with safe defaults
const createInitialTransports = (): winston.transport[] => {
  const transports: winston.transport[] = [];

  // Console transport (always enabled in development)
  if (isDevelopment || isTest) {
    transports.push(
      new winston.transports.Console({
        format: consoleFormat,
        level: defaultLevel,
      })
    );
  }

  // Basic file transport for non-test environments
  if (!isTest) {
    transports.push(
      new winston.transports.File({
        filename: 'logs/app.log',
        format: logFormat,
        level: defaultLevel,
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

  return transports;
};

// Create logger instance with initial configuration
export const logger = winston.createLogger({
  level: defaultLevel,
  format: logFormat,
  transports: createInitialTransports(),
  // Don't exit on handled exceptions
  exitOnError: false,
});

// Handle uncaught exceptions and unhandled rejections with safe defaults
if (!isTest) {
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

// Function to reconfigure logger once config is available
export const configureLogger = (config: any) => {
  try {
    // Clear existing transports
    logger.clear();

    // Create new transports with proper config
    const transports: winston.transport[] = [];

    // Console transport (always enabled in development)
    if (config.isDevelopment || config.isTest) {
      transports.push(
        new winston.transports.Console({
          format: consoleFormat,
          level: config.logging?.level || defaultLevel,
        })
      );
    }

    // File transport (production and development)
    if (!config.isTest) {
      transports.push(
        new winston.transports.File({
          filename: config.logging?.file || 'logs/app.log',
          format: logFormat,
          level: config.logging?.level || defaultLevel,
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

    // Add all transports to logger
    transports.forEach(transport => logger.add(transport));

    // Update logger level
    logger.level = config.logging?.level || defaultLevel;

    logger.info('Logger reconfigured with application config');
  } catch (error) {
    console.error('Failed to reconfigure logger:', error);
  }
};

// Create child logger with correlation ID support
export const createChildLogger = (correlationId: string) => {
  return logger.child({ correlationId });
};

// Export logger types for TypeScript
export type Logger = typeof logger;