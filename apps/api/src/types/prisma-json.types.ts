/**
 * Prisma JSON Types
 * Helper types for working with Prisma's JSON fields
 */

import { Prisma } from '../generated/prisma';

// Type aliases for easier use
export type JsonValue = Prisma.JsonValue;
export type InputJsonValue = Prisma.InputJsonValue;
export type JsonObject = Prisma.JsonObject;
export type JsonArray = Prisma.JsonArray;

/**
 * Helper type to convert Prisma JsonValue to a more usable type
 */
export type JsonValueToRecord<T extends JsonValue> = T extends Record<string, any>
  ? T
  : never;

/**
 * Safe conversion from JsonValue to Record<string, any>
 */
export function jsonValueToRecord(value: JsonValue | null | undefined): Record<string, any> | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  
  if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
    return value as Record<string, any>;
  }
  
  return undefined;
}

/**
 * Safe conversion from Record<string, any> to InputJsonValue
 */
export function recordToInputJsonValue(value: Record<string, any> | undefined | null): InputJsonValue | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }
  
  return value as InputJsonValue;
}

/**
 * Type guard for checking if a JsonValue is a record
 */
export function isJsonRecord(value: JsonValue | null | undefined): value is Record<string, any> {
  return value !== null && value !== undefined && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Safe JSON parsing with fallback
 */
export function safeJsonParse<T = any>(value: string | null | undefined, fallback: T | null = null): T | null {
  if (!value) return fallback;
  
  try {
    return JSON.parse(value) as T;
  } catch {
    return fallback;
  }
}

/**
 * Prisma-compatible JSON types
 */
export type PrismaJsonValue = JsonValue;
export type PrismaInputJsonValue = InputJsonValue;

/**
 * Helper type for optional update fields that need to handle undefined correctly
 */
export type OptionalUpdateField<T> = T | undefined;

/**
 * Helper function to create update data with proper undefined handling
 */
export function createUpdateData<T extends Record<string, any>>(data: T): Partial<T> {
  const result: Partial<T> = {};
  
  for (const [key, value] of Object.entries(data)) {
    if (value !== undefined) {
      (result as any)[key] = value;
    }
  }
  
  return result;
}
