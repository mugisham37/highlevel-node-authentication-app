import winston from 'winston';

export interface JsonFormatterOptions {
  space?: number;
  replacer?: (key: string, value: any) => any;
  includeStack?: boolean;
  includeMetadata?: boolean;
}

/**
 * JSON formatter for structured logging
 */
export const createJsonFormatter = (options: JsonFormatterOptions = {}) => {
  return winston.format.combine(
    winston.format.timestamp({
      format: 'YYYY-MM-DD HH:mm:ss.SSS'
    }),
    winston.format.errors({ stack: options.includeStack !== false }),
    winston.format.json({
      space: options.space,
      replacer: options.replacer
    }),
    winston.format.printf((info) => {
      const logEntry: any = {
        timestamp: info.timestamp,
        level: info.level,
        message: info.message,
        service: info.service,
        correlationId: info.correlationId
      };

      // Include stack trace if available
      if (info.stack && options.includeStack !== false) {
        logEntry.stack = info.stack;
      }

      // Include metadata if enabled
      if (options.includeMetadata !== false) {
        const { timestamp, level, message, service, correlationId, stack, ...meta } = info;
        if (Object.keys(meta).length > 0) {
          logEntry.meta = meta;
        }
      }

      return JSON.stringify(logEntry, options.replacer, options.space);
    })
  );
};