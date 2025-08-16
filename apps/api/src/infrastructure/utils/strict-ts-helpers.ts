/**
 * TypeScript Strict Mode Compatibility Layer
 * Provides helper functions to handle exactOptionalPropertyTypes and strict mode
 */

/**
 * Safely handle optional properties for strict TypeScript
 */
export function createStrictOptional<T>(obj: T): {
  [K in keyof T as T[K] extends undefined ? never : K]: T[K];
} & {
  [K in keyof T as T[K] extends undefined ? K : never]?: Exclude<T[K], undefined>;
} {
  const result = {} as any;
  
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  
  return result;
}

/**
 * Type-safe property access for index signature objects
 */
export function safeAccess<T = any>(obj: Record<string, any>, key: string): T | undefined {
  return obj[key] as T | undefined;
}

/**
 * Type-safe property access with default value
 */
export function safeAccessWithDefault<T>(
  obj: Record<string, any>,
  key: string,
  defaultValue: T
): T {
  const value = obj[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Parse string to integer safely
 */
export function safeParseInt(value: string | undefined, defaultValue: number = 0): number {
  if (!value) return defaultValue;
  const parsed = parseInt(value, 10);
  return isNaN(parsed) ? defaultValue : parsed;
}

/**
 * Parse array of string parts safely
 */
export function safeParseKeyParts(key: string, separator: string = '_'): string[] {
  return key.split(separator).filter(part => part.length > 0);
}

/**
 * Create error context that works with strict TypeScript
 */
export function createStrictErrorContext(context: {
  correlationId?: string | undefined;
  userId?: string | undefined;
  requestId?: string | undefined;
  operation?: string | undefined;
  metadata?: Record<string, any> | undefined;
}): {
  correlationId?: string;
  userId?: string;
  requestId?: string;
  operation?: string;
  metadata?: Record<string, any>;
} {
  const result: {
    correlationId?: string;
    userId?: string;
    requestId?: string;
    operation?: string;
    metadata?: Record<string, any>;
  } = {};
  
  if (context.correlationId !== undefined) {
    result.correlationId = context.correlationId;
  }
  if (context.userId !== undefined) {
    result.userId = context.userId;
  }
  if (context.requestId !== undefined) {
    result.requestId = context.requestId;
  }
  if (context.operation !== undefined) {
    result.operation = context.operation;
  }
  if (context.metadata !== undefined) {
    result.metadata = context.metadata;
  }
  
  return result;
}

/**
 * Create response object that works with strict TypeScript
 */
export function createStrictResponse<T extends Record<string, any>>(
  obj: T
): T {
  const result = {} as T;
  
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  
  return result;
}

/**
 * Merge objects safely for strict TypeScript
 */
export function safeObjectMerge<T>(target: T, ...sources: Partial<T>[]): T {
  const result = { ...target };
  
  for (const source of sources) {
    for (const key in source) {
      if (source[key] !== undefined) {
        result[key] = source[key] as T[typeof key];
      }
    }
  }
  
  return result;
}

/**
 * Filter undefined values from array
 */
export function filterUndefined<T>(array: (T | undefined)[]): T[] {
  return array.filter((item): item is T => item !== undefined);
}

/**
 * Map array with undefined filtering
 */
export function mapAndFilter<T, U>(
  array: T[],
  mapper: (item: T) => U | undefined
): U[] {
  return filterUndefined(array.map(mapper));
}

/**
 * Convert header value to string safely
 */
export function headerToString(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] || '';
  return '';
}

/**
 * Convert header value to string array safely
 */
export function headerToStringArray(value: string | string[] | undefined): string[] {
  if (typeof value === 'string') return [value];
  if (Array.isArray(value)) return value;
  return [];
}

/**
 * Environment variable access with strict typing
 */
export function getStrictEnvVar(key: string): string | undefined {
  return process.env[key];
}

/**
 * Environment variable access with default
 */
export function getStrictEnvVarWithDefault(key: string, defaultValue: string): string {
  return process.env[key] || defaultValue;
}

/**
 * Type guard for checking if object has property
 */
export function hasProperty<T extends Record<string, any>, K extends string>(
  obj: T,
  key: K
): obj is T & Record<K, unknown> {
  return key in obj;
}

/**
 * Safe object property assignment
 */
export function safeAssignProperty<T extends Record<string, any>, K extends string, V>(
  obj: T,
  key: K,
  value: V | undefined
): T & (V extends undefined ? {} : Record<K, V>) {
  if (value !== undefined) {
    (obj as any)[key] = value;
  }
  return obj as any;
}

/**
 * Create metrics stats object with safe defaults
 */
export function createSafeStats(data: {
  code?: string | undefined;
  statusCode?: string | undefined;
  count: number;
}): { code: string; statusCode: number; count: number } {
  return {
    code: data.code || 'UNKNOWN',
    statusCode: data.statusCode ? safeParseInt(data.statusCode, 500) : 500,
    count: data.count,
  };
}
