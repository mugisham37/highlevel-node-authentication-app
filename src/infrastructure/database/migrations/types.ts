/**
 * Type definitions for database migration system
 */

export interface Migration {
  id: string;
  name: string;
  version: string;
  description: string;
  up: () => Promise<void>;
  down: () => Promise<void>;
  checksum: string;
  dependencies?: string[];
}

export interface MigrationRecord {
  id: string;
  name: string;
  version: string;
  description: string;
  checksum: string;
  appliedAt: Date;
  executionTime: number;
  rollbackAvailable: boolean;
}

export interface DatabaseRow {
  [key: string]: any;
}

export interface MigrationTableRow {
  id: string;
  name: string;
  version: string;
  description: string;
  checksum: string;
  applied_at: string | Date;
  execution_time: number;
  rollback_available: boolean;
}

export interface TableInfoRow {
  table_name: string;
}

export interface CountRow {
  count: string | number;
}

export interface SchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface MigrationStatus {
  appliedMigrations: number;
  pendingMigrations: number;
  lastMigration?: MigrationRecord;
  schemaValid: boolean;
}

export interface DatabaseQueryResult<T = DatabaseRow> {
  rows: T[];
  rowCount: number;
  command: string;
  oid: number;
  fields: Array<{
    name: string;
    tableID: number;
    columnID: number;
    dataTypeID: number;
    dataTypeSize: number;
    dataTypeModifier: number;
    format: string;
  }>;
}

/**
 * Error handling utilities
 */
export class MigrationError extends Error {
  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = 'MigrationError';
    if (cause && typeof cause === 'object' && 'stack' in cause) {
      this.stack = `${this.stack}\nCaused by: ${(cause as Error).stack}`;
    }
  }
}

export class SchemaValidationError extends Error {
  constructor(message: string, public readonly validationErrors: string[]) {
    super(message);
    this.name = 'SchemaValidationError';
  }
}

export function isErrorWithMessage(error: unknown): error is { message: string } {
  return (
    typeof error === 'object' &&
    error !== null &&
    'message' in error &&
    typeof (error as { message: unknown }).message === 'string'
  );
}

export function getErrorMessage(error: unknown): string {
  if (isErrorWithMessage(error)) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'An unknown error occurred';
}
