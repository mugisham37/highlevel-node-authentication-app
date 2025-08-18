import winston from 'winston';

export interface SensitiveDataFilterOptions {
  patterns?: RegExp[];
  fields?: string[];
  replacement?: string;
  caseSensitive?: boolean;
}

/**
 * Filter to remove or mask sensitive data from logs
 */
export const createSensitiveDataFilter = (options: SensitiveDataFilterOptions = {}) => {
  const {
    patterns = [
      /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit card numbers
      /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, // Email addresses
      /\b\d{3}-\d{2}-\d{4}\b/g, // SSN
      /password["\s]*[:=]["\s]*[^"\s,}]+/gi, // Password fields
      /token["\s]*[:=]["\s]*[^"\s,}]+/gi, // Token fields
      /key["\s]*[:=]["\s]*[^"\s,}]+/gi, // Key fields
      /secret["\s]*[:=]["\s]*[^"\s,}]+/gi, // Secret fields
    ],
    fields = ['password', 'token', 'secret', 'key', 'authorization', 'cookie'],
    replacement = '[REDACTED]',
    caseSensitive = false
  } = options;

  return winston.format((info) => {
    // Filter message
    if (typeof info.message === 'string') {
      info.message = filterString(info.message, patterns, replacement);
    }

    // Filter metadata
    info = filterObject(info, fields, patterns, replacement, caseSensitive);

    return info;
  })();
};

/**
 * Filter sensitive data from a string
 */
function filterString(str: string, patterns: RegExp[], replacement: string): string {
  let filtered = str;
  patterns.forEach(pattern => {
    filtered = filtered.replace(pattern, replacement);
  });
  return filtered;
}

/**
 * Filter sensitive data from an object
 */
function filterObject(
  obj: any, 
  sensitiveFields: string[], 
  patterns: RegExp[], 
  replacement: string,
  caseSensitive: boolean
): any {
  if (typeof obj !== 'object' || obj === null) {
    return obj;
  }

  if (Array.isArray(obj)) {
    return obj.map(item => filterObject(item, sensitiveFields, patterns, replacement, caseSensitive));
  }

  const filtered: any = {};
  
  for (const [key, value] of Object.entries(obj)) {
    const keyLower = caseSensitive ? key : key.toLowerCase();
    const isSensitiveField = sensitiveFields.some(field => 
      caseSensitive ? field === key : field.toLowerCase() === keyLower
    );

    if (isSensitiveField) {
      filtered[key] = replacement;
    } else if (typeof value === 'string') {
      filtered[key] = filterString(value, patterns, replacement);
    } else if (typeof value === 'object') {
      filtered[key] = filterObject(value, sensitiveFields, patterns, replacement, caseSensitive);
    } else {
      filtered[key] = value;
    }
  }

  return filtered;
}

/**
 * Create a filter for specific log levels
 */
export const createLevelFilter = (allowedLevels: string[]) => {
  const levels = allowedLevels.map(level => level.toLowerCase());
  
  return winston.format((info) => {
    return levels.includes(info.level.toLowerCase()) ? info : false;
  })();
};

/**
 * Create a filter for specific services
 */
export const createServiceFilter = (allowedServices: string[]) => {
  return winston.format((info) => {
    if (!info.service) return info;
    return allowedServices.includes(info.service) ? info : false;
  })();
};

/**
 * Create a sampling filter (only log every nth message)
 */
export const createSamplingFilter = (sampleRate: number) => {
  let counter = 0;
  
  return winston.format((info) => {
    counter++;
    return counter % sampleRate === 0 ? info : false;
  })();
};