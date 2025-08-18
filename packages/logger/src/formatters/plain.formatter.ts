import winston from 'winston';

export interface PlainFormatterOptions {
  includeTimestamp?: boolean;
  includeLevel?: boolean;
  includeService?: boolean;
  includeCorrelationId?: boolean;
  timestampFormat?: string;
  colorize?: boolean;
  separator?: string;
}

/**
 * Plain text formatter for human-readable logs
 */
export const createPlainFormatter = (options: PlainFormatterOptions = {}) => {
  const {
    includeTimestamp = true,
    includeLevel = true,
    includeService = true,
    includeCorrelationId = true,
    timestampFormat = 'YYYY-MM-DD HH:mm:ss.SSS',
    colorize = false,
    separator = ' '
  } = options;

  const formats: winston.Logform.Format[] = [];

  if (includeTimestamp) {
    formats.push(winston.format.timestamp({ format: timestampFormat }));
  }

  if (colorize) {
    formats.push(winston.format.colorize());
  }

  formats.push(
    winston.format.errors({ stack: true }),
    winston.format.printf((info) => {
      const parts: string[] = [];

      if (includeTimestamp && info.timestamp) {
        parts.push(`[${info.timestamp}]`);
      }

      if (includeLevel) {
        parts.push(`${info.level.toUpperCase()}`);
      }

      if (includeService && info.service) {
        parts.push(`[${info.service}]`);
      }

      if (includeCorrelationId && info.correlationId) {
        parts.push(`(${info.correlationId})`);
      }

      parts.push(info.message);

      // Add metadata if present
      const { timestamp, level, message, service, correlationId, stack, ...meta } = info;
      if (Object.keys(meta).length > 0) {
        parts.push(JSON.stringify(meta));
      }

      // Add stack trace if present
      if (info.stack) {
        parts.push(`\n${info.stack}`);
      }

      return parts.join(separator);
    })
  );

  return winston.format.combine(...formats);
};