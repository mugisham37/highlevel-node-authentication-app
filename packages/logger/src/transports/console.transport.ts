import winston from 'winston';
import { TransportStreamOptions } from 'winston-transport';

export interface ConsoleTransportOptions extends TransportStreamOptions {
  colorize?: boolean;
  timestamp?: boolean;
  prettyPrint?: boolean;
}

/**
 * Console transport for development and debugging
 */
export class ConsoleTransport extends winston.transports.Console {
  constructor(options: ConsoleTransportOptions = {}) {
    const format = winston.format.combine(
      ...[
        options.timestamp !== false && winston.format.timestamp({
          format: 'HH:mm:ss.SSS'
        }),
        options.colorize !== false && winston.format.colorize(),
        winston.format.errors({ stack: true }),
        winston.format.printf(({ timestamp, level, message, service, correlationId, ...meta }) => {
          const prefix = timestamp ? `${timestamp} ` : '';
          const serviceInfo = service ? `[${service}] ` : '';
          const corrId = correlationId ? `(${correlationId}) ` : '';
          const metaString = Object.keys(meta).length ? ` ${JSON.stringify(meta)}` : '';
          
          return `${prefix}${level}: ${serviceInfo}${corrId}${message}${metaString}`;
        })
      ].filter(Boolean)
    );

    super({
      ...options,
      format
    });
  }
}

export const createConsoleTransport = (options: ConsoleTransportOptions = {}): ConsoleTransport => {
  return new ConsoleTransport(options);
};