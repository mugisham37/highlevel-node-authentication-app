import winston from 'winston';

export interface CustomFormatterOptions {
  template?: string;
  fields?: Record<string, (info: any) => string>;
  dateFormat?: string;
  includeStack?: boolean;
}

/**
 * Custom formatter with template support
 */
export const createCustomFormatter = (options: CustomFormatterOptions = {}) => {
  const {
    template = '{{timestamp}} [{{level}}] {{service}}: {{message}}',
    fields = {},
    dateFormat = 'YYYY-MM-DD HH:mm:ss.SSS',
    includeStack = true
  } = options;

  return winston.format.combine(
    winston.format.timestamp({ format: dateFormat }),
    winston.format.errors({ stack: includeStack }),
    winston.format.printf((info) => {
      let formatted = template;

      // Replace built-in placeholders
      const replacements: Record<string, string> = {
        timestamp: info.timestamp || '',
        level: info.level?.toUpperCase() || '',
        message: info.message || '',
        service: info.service || '',
        correlationId: info.correlationId || '',
        hostname: require('os').hostname(),
        pid: process.pid.toString()
      };

      // Add custom field replacements
      Object.entries(fields).forEach(([key, formatter]) => {
        replacements[key] = formatter(info);
      });

      // Replace all placeholders
      Object.entries(replacements).forEach(([key, value]) => {
        formatted = formatted.replace(new RegExp(`{{${key}}}`, 'g'), value);
      });

      // Add metadata if present
      const { timestamp, level, message, service, correlationId, stack, ...meta } = info;
      if (Object.keys(meta).length > 0) {
        formatted += ` ${JSON.stringify(meta)}`;
      }

      // Add stack trace if present
      if (info.stack && includeStack) {
        formatted += `\n${info.stack}`;
      }

      return formatted;
    })
  );
};

/**
 * ELK Stack compatible formatter
 */
export const createELKFormatter = () => {
  return winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json(),
    winston.format.printf((info) => {
      return JSON.stringify({
        '@timestamp': info.timestamp,
        '@version': '1',
        level: info.level,
        message: info.message,
        service: info.service,
        correlationId: info.correlationId,
        host: require('os').hostname(),
        pid: process.pid,
        ...info.meta
      });
    })
  );
};