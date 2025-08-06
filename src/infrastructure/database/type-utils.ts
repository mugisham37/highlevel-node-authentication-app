/**
 * Type utilities for handling Prisma and domain model type conversions
 * Provides safe type handling for strict TypeScript configurations
 */

import { Prisma } from '../../generated/prisma';

/**
 * Utility type to handle Prisma's JSON field type safety
 */
export type SafeJsonValue = Prisma.JsonValue | null | undefined;

/**
 * Type guard to check if a value is a valid JSON object
 */
export function isValidJsonObject(value: unknown): value is Record<string, any> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Safely parse JSON string to object with proper null/undefined handling
 */
export function safeJsonParse(jsonString: SafeJsonValue): Record<string, any> | undefined {
  if (jsonString === null || jsonString === undefined) {
    return undefined;
  }
  
  if (typeof jsonString === 'string') {
    try {
      const parsed = JSON.parse(jsonString);
      return isValidJsonObject(parsed) ? parsed : undefined;
    } catch {
      return undefined;
    }
  }
  
  if (isValidJsonObject(jsonString)) {
    return jsonString as Record<string, any>;
  }
  
  return undefined;
}

/**
 * Safely stringify object to JSON for Prisma storage
 */
export function safeJsonStringify(value: Record<string, any> | undefined): Prisma.InputJsonValue | typeof Prisma.DbNull {
  if (value === undefined || value === null) {
    return Prisma.DbNull;
  }
  
  if (isValidJsonObject(value)) {
    return JSON.stringify(value) as Prisma.InputJsonValue;
  }
  
  return Prisma.DbNull;
}

/**
 * Convert nullable string to string | undefined for domain models
 */
export function nullableToUndefined<T>(value: T | null): T | undefined {
  return value === null ? undefined : value;
}

/**
 * Convert undefined to null for database storage
 */
export function undefinedToNull<T>(value: T | undefined): T | null {
  return value === undefined ? null : value;
}

/**
 * Type-safe mapper for Permission entities
 */
export interface PermissionMapperInput {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions: SafeJsonValue;
  createdAt: Date;
}

export interface PermissionMapperOutput {
  id: string;
  name: string;
  resource: string;
  action: string;
  conditions: Record<string, any> | undefined;
  createdAt: Date;
}

/**
 * Type-safe mapper for Role entities
 */
export interface RoleMapperInput {
  id: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface RoleMapperOutput {
  id: string;
  name: string;
  description: string | undefined;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Helper type for Prisma include options that ensures proper null handling
 */
export type SafeInclude<T> = T extends undefined ? null : T;

/**
 * Create a safe include object for Prisma queries
 */
export function createSafeInclude<T>(condition: boolean, includeConfig: T): SafeInclude<T> {
  return (condition ? includeConfig : null) as SafeInclude<T>;
}
