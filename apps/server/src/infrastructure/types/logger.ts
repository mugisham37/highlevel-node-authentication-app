/**
 * Logger Interface Definition
 * Provides consistent logging interface across the application
 */

export interface ILogger {
  info(message: string, meta?: any): void;
  error(message: string, error?: Error | any, meta?: any): void;
  warn(message: string, meta?: any): void;
  debug(message: string, meta?: any): void;
  verbose?(message: string, meta?: any): void;
  silly?(message: string, meta?: any): void;
}

export interface LoggerOptions {
  level?: string;
  format?: any;
  transports?: any[];
  defaultMeta?: any;
}

/**
 * Console Logger Implementation
 * Simple logger implementation for development and testing
 */
export class ConsoleLogger implements ILogger {
  constructor(_options?: LoggerOptions) {
    // Options could be used for future configuration
    void _options;
  }

  info(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [INFO] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  error(message: string, error?: Error | any, meta?: any): void {
    const timestamp = new Date().toISOString();
    const errorDetails = error instanceof Error ? error.stack : JSON.stringify(error);
    console.error(`[${timestamp}] [ERROR] ${message}`, errorDetails || '', meta ? JSON.stringify(meta) : '');
  }

  warn(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    console.warn(`[${timestamp}] [WARN] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  debug(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    console.debug(`[${timestamp}] [DEBUG] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  verbose(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [VERBOSE] ${message}`, meta ? JSON.stringify(meta) : '');
  }

  silly(message: string, meta?: any): void {
    const timestamp = new Date().toISOString();
    console.log(`[${timestamp}] [SILLY] ${message}`, meta ? JSON.stringify(meta) : '');
  }
}

/**
 * Logger Factory
 * Creates logger instances with proper configuration
 */
export class LoggerFactory {
  private static instance: ILogger;

  static getLogger(options?: LoggerOptions): ILogger {
    if (!LoggerFactory.instance) {
      LoggerFactory.instance = new ConsoleLogger(options);
    }
    return LoggerFactory.instance;
  }

  static setLogger(logger: ILogger): void {
    LoggerFactory.instance = logger;
  }
}
