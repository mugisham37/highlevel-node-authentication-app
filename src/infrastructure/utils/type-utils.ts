/**
 * Type Utilities
 * Helper types and utilities for TypeScript strict mode
 */

/**
 * Make all properties optional and allow undefined
 */
export type OptionalWithUndefined<T> = {
  [K in keyof T]?: T[K] | undefined;
};

/**
 * Safe optional properties that work with exactOptionalPropertyTypes
 */
export type SafeOptional<T> = {
  [K in keyof T as T[K] extends undefined ? never : K]: T[K];
} & {
  [K in keyof T as T[K] extends undefined ? K : never]?: T[K];
};

/**
 * Utility to safely assign optional properties
 */
export function safeAssign<T>(
  target: T,
  source: Partial<T>
): T {
  const result = { ...target };
  
  for (const key in source) {
    if (source[key] !== undefined) {
      result[key] = source[key] as T[typeof key];
    }
  }
  
  return result;
}

/**
 * Create object with only defined properties
 */
export function withDefinedProperties<T>(obj: T): Partial<T> {
  const result: Partial<T> = {};
  
  for (const key in obj) {
    if (obj[key] !== undefined) {
      result[key] = obj[key];
    }
  }
  
  return result;
}

/**
 * Safe property access for objects with index signatures
 */
export function safeGet<T = any>(obj: Record<string, any>, key: string): T | undefined {
  return obj[key] as T | undefined;
}

/**
 * Safe property access with default value
 */
export function safeGetWithDefault<T>(
  obj: Record<string, any>,
  key: string,
  defaultValue: T
): T {
  const value = obj[key];
  return value !== undefined ? value : defaultValue;
}

/**
 * Type guard for checking if value is defined
 */
export function isDefined<T>(value: T | undefined | null): value is T {
  return value !== undefined && value !== null;
}

/**
 * Type guard for checking if value is string
 */
export function isString(value: any): value is string {
  return typeof value === 'string';
}

/**
 * Type guard for checking if value is number
 */
export function isNumber(value: any): value is number {
  return typeof value === 'number' && !isNaN(value);
}

/**
 * Create a properly typed error context
 */
export function createErrorContext(context: {
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
