import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PrismaClient } from '@prisma/client';
import { createDatabaseConfig } from '../config';
import { logger } from '../../logging/winston-logger';

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  summary: ValidationSummary;
}

export interface ValidationError {
  type:
    | 'missing_table'
    | 'missing_column'
    | 'type_mismatch'
    | 'constraint_violation'
    | 'index_missing';
  table: string;
  column?: string;
  expected?: string;
  actual?: string;
  message: string;
}

export interface ValidationWarning {
  type: 'performance' | 'naming' | 'deprecated';
  table: string;
  column?: string;
  message: string;
  suggestion?: string;
}

export interface ValidationSummary {
  totalTables: number;
  validTables: number;
  totalIndexes: number;
  validIndexes: number;
  totalConstraints: number;
  validConstraints: number;
}

// Database query result interfaces
export interface TableRow {
  table_name: string;
}

export interface ColumnRow {
  column_name: string;
  data_type: string;
  is_nullable: string;
}

export interface IndexRow {
  schemaname: string;
  tablename: string;
  indexname: string;
  indexdef: string;
}

export interface ConstraintRow {
  table_name: string;
  constraint_name: string;
  constraint_type: string;
  column_name: string;
  foreign_table_name: string;
  foreign_column_name: string;
}

export interface CountRow {
  count: number;
}

export interface ColumnDefinition {
  type: string;
  nullable: boolean;
}

export class SchemaValidator {
  private pool: Pool;
  private drizzleDb: any;
  private prisma: PrismaClient;

  constructor() {
    const config = createDatabaseConfig();
    this.pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    this.drizzleDb = drizzle(this.pool);
    this.prisma = new PrismaClient();
  }

  async validateSchema(): Promise<ValidationResult> {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Validate table existence
      await this.validateTableExistence(errors);

      // Validate column definitions
      await this.validateColumnDefinitions(errors, warnings);

      // Validate indexes
      await this.validateIndexes(errors, warnings);

      // Validate constraints
      await this.validateConstraints(errors, warnings);

      // Validate data consistency
      await this.validateDataConsistency(errors, warnings);

      // Generate summary
      const summary = await this.generateSummary();

      return {
        valid: errors.length === 0,
        errors,
        warnings,
        summary,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error('Schema validation failed:', error);
      errors.push({
        type: 'constraint_violation',
        table: 'unknown',
        message: `Schema validation failed: ${errorMessage}`,
      });

      return {
        valid: false,
        errors,
        warnings,
        summary: {
          totalTables: 0,
          validTables: 0,
          totalIndexes: 0,
          validIndexes: 0,
          totalConstraints: 0,
          validConstraints: 0,
        },
      };
    }
  }

  private async validateTableExistence(
    errors: ValidationError[]
  ): Promise<void> {
    // Required Prisma tables
    const requiredPrismaTables = [
      'users',
      'accounts',
      'sessions',
      'roles',
      'permissions',
      'user_roles',
      'role_permissions',
      'audit_logs',
      'webhooks',
      'webhook_events',
      'webhook_delivery_attempts',
      'webauthn_credentials',
    ];

    // Required Drizzle tables
    const requiredDrizzleTables = [
      'active_sessions',
      'auth_attempts',
      'mfa_challenges',
      'oauth_token_cache',
      'oauth_state_tracking',
      'oauth_auth_codes',
      'rate_limit_tracking',
      'user_auth_cache',
    ];

    const allRequiredTables = [
      ...requiredPrismaTables,
      ...requiredDrizzleTables,
    ];

    // Get existing tables
    const result = await this.drizzleDb.execute(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' 
      AND table_type = 'BASE TABLE'
    `);

    const existingTables = new Set(
      result.rows.map((row: TableRow) => row.table_name)
    );

    // Check for missing tables
    for (const table of allRequiredTables) {
      if (!existingTables.has(table)) {
        errors.push({
          type: 'missing_table',
          table,
          message: `Required table '${table}' is missing`,
        });
      }
    }
  }

  private async validateColumnDefinitions(
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Define expected column definitions for critical tables
    const expectedColumns: Record<string, Record<string, ColumnDefinition>> = {
      users: {
        id: { type: 'character varying', nullable: false },
        email: { type: 'character varying', nullable: false },
        password_hash: { type: 'text', nullable: true },
        mfa_enabled: { type: 'boolean', nullable: false },
        created_at: { type: 'timestamp without time zone', nullable: false },
      },
      active_sessions: {
        id: { type: 'character varying', nullable: false },
        user_id: { type: 'character varying', nullable: false },
        token: { type: 'character varying', nullable: false },
        expires_at: { type: 'timestamp without time zone', nullable: false },
        risk_score: { type: 'real', nullable: false },
      },
    };

    for (const [tableName, columns] of Object.entries(expectedColumns)) {
      const result = await this.drizzleDb.execute(
        `
        SELECT column_name, data_type, is_nullable
        FROM information_schema.columns
        WHERE table_schema = 'public' AND table_name = $1
      `,
        [tableName]
      );

      const existingColumns = new Map<string, ColumnDefinition>(
        result.rows.map((row: ColumnRow) => [
          row.column_name,
          {
            type: row.data_type,
            nullable: row.is_nullable === 'YES',
          },
        ])
      );

      for (const [columnName, expectedDef] of Object.entries(columns)) {
        const existing = existingColumns.get(columnName);

        if (!existing) {
          errors.push({
            type: 'missing_column',
            table: tableName,
            column: columnName,
            message: `Required column '${columnName}' is missing from table '${tableName}'`,
          });
        } else {
          // Check type compatibility (simplified)
          if (!this.isTypeCompatible(existing.type, expectedDef.type)) {
            errors.push({
              type: 'type_mismatch',
              table: tableName,
              column: columnName,
              expected: expectedDef.type,
              actual: existing.type,
              message: `Column '${columnName}' in table '${tableName}' has incorrect type`,
            });
          }

          // Check nullability
          if (existing.nullable !== expectedDef.nullable) {
            warnings.push({
              type: 'naming',
              table: tableName,
              column: columnName,
              message: `Column '${columnName}' nullability mismatch`,
              suggestion: `Expected nullable: ${expectedDef.nullable}, actual: ${existing.nullable}`,
            });
          }
        }
      }
    }
  }

  private isTypeCompatible(actual: string, expected: string): boolean {
    // Simplified type compatibility check
    const typeMap: Record<string, string[]> = {
      'character varying': ['varchar', 'text', 'character varying'],
      text: ['text', 'character varying', 'varchar'],
      boolean: ['boolean'],
      'timestamp without time zone': [
        'timestamp',
        'timestamp without time zone',
      ],
      real: ['real', 'numeric', 'double precision'],
      integer: ['integer', 'bigint', 'smallint'],
    };

    const compatibleTypes = typeMap[expected] || [expected];
    return compatibleTypes.includes(actual);
  }

  private async validateIndexes(
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Critical indexes that should exist
    const criticalIndexes = [
      { table: 'users', column: 'email', name: 'users_email_key' },
      {
        table: 'active_sessions',
        column: 'user_id',
        name: 'idx_active_sessions_user_id',
      },
      {
        table: 'active_sessions',
        column: 'token',
        name: 'idx_active_sessions_token',
      },
      {
        table: 'auth_attempts',
        column: 'ip_address',
        name: 'idx_auth_attempts_ip_address',
      },
      {
        table: 'oauth_token_cache',
        column: 'user_id',
        name: 'idx_oauth_token_cache_user_id',
      },
    ];

    // Get existing indexes
    const result = await this.drizzleDb.execute(`
      SELECT 
        schemaname,
        tablename,
        indexname,
        indexdef
      FROM pg_indexes 
      WHERE schemaname = 'public'
    `);

    const existingIndexes = new Set(
      result.rows.map((row: IndexRow) => row.indexname)
    );

    for (const index of criticalIndexes) {
      if (!existingIndexes.has(index.name)) {
        errors.push({
          type: 'index_missing',
          table: index.table,
          column: index.column,
          message: `Critical index '${index.name}' is missing on table '${index.table}'`,
        });
      }
    }

    // Check for performance warnings
    const tablesWithoutIndexes = await this.findTablesWithoutIndexes();
    for (const table of tablesWithoutIndexes) {
      warnings.push({
        type: 'performance',
        table,
        message: `Table '${table}' may benefit from additional indexes`,
        suggestion: 'Consider adding indexes on frequently queried columns',
      });
    }
  }

  private async findTablesWithoutIndexes(): Promise<string[]> {
    const result = await this.drizzleDb.execute(`
      SELECT t.table_name
      FROM information_schema.tables t
      LEFT JOIN pg_indexes i ON t.table_name = i.tablename
      WHERE t.table_schema = 'public' 
      AND t.table_type = 'BASE TABLE'
      AND i.indexname IS NULL
    `);

    return result.rows.map((row: TableRow) => row.table_name);
  }

  private async validateConstraints(
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    // Check foreign key constraints
    const result = await this.drizzleDb.execute(`
      SELECT
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name,
        ccu.table_name AS foreign_table_name,
        ccu.column_name AS foreign_column_name
      FROM information_schema.table_constraints AS tc
      JOIN information_schema.key_column_usage AS kcu
        ON tc.constraint_name = kcu.constraint_name
        AND tc.table_schema = kcu.table_schema
      JOIN information_schema.constraint_column_usage AS ccu
        ON ccu.constraint_name = tc.constraint_name
        AND ccu.table_schema = tc.table_schema
      WHERE tc.constraint_type = 'FOREIGN KEY'
      AND tc.table_schema = 'public'
    `);

    const foreignKeys = result.rows as ConstraintRow[];

    // Critical constraints that must exist (errors if missing)
    const criticalConstraints = [
      { table: 'sessions', column: 'user_id', references: 'users' },
      { table: 'accounts', column: 'user_id', references: 'users' },
    ];

    // Expected foreign key relationships (warnings if missing)
    const expectedForeignKeys = [
      { table: 'user_roles', column: 'user_id', references: 'users' },
      { table: 'user_roles', column: 'role_id', references: 'roles' },
    ];

    // Check critical constraints
    for (const expected of criticalConstraints) {
      const found = foreignKeys.find(
        (fk) =>
          fk.table_name === expected.table &&
          fk.column_name === expected.column &&
          fk.foreign_table_name === expected.references
      );

      if (!found) {
        errors.push({
          type: 'constraint_violation',
          table: expected.table,
          column: expected.column,
          message: `Critical foreign key constraint missing from ${expected.table}.${expected.column} to ${expected.references}`,
        });
      }
    }

    // Check expected constraints
    for (const expected of expectedForeignKeys) {
      const found = foreignKeys.find(
        (fk) =>
          fk.table_name === expected.table &&
          fk.column_name === expected.column &&
          fk.foreign_table_name === expected.references
      );

      if (!found) {
        warnings.push({
          type: 'naming',
          table: expected.table,
          column: expected.column,
          message: `Missing foreign key constraint from ${expected.table}.${expected.column} to ${expected.references}`,
          suggestion:
            'Consider adding foreign key constraint for data integrity',
        });
      }
    }
  }

  private async validateDataConsistency(
    errors: ValidationError[],
    warnings: ValidationWarning[]
  ): Promise<void> {
    try {
      // Check for orphaned records
      const orphanedSessions = await this.drizzleDb.execute(`
        SELECT COUNT(*) as count
        FROM sessions s
        LEFT JOIN users u ON s.user_id = u.id
        WHERE u.id IS NULL
      `);

      const orphanedCount = (orphanedSessions.rows[0] as CountRow)?.count || 0;
      if (orphanedCount > 0) {
        errors.push({
          type: 'constraint_violation',
          table: 'sessions',
          message: `Found ${orphanedCount} orphaned session records`,
        });
      }

      // Check for inconsistencies between Prisma and Drizzle data
      const prismaUserCount = await this.prisma.user.count();
      const drizzleCacheCount = await this.drizzleDb.execute(`
        SELECT COUNT(*) as count FROM user_auth_cache
      `);

      const cacheCount = (drizzleCacheCount.rows[0] as CountRow)?.count || 0;
      if (Math.abs(prismaUserCount - cacheCount) > prismaUserCount * 0.1) {
        warnings.push({
          type: 'performance',
          table: 'user_auth_cache',
          message: `User auth cache may be out of sync (Prisma: ${prismaUserCount}, Cache: ${cacheCount})`,
          suggestion: 'Consider refreshing the user auth cache',
        });
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      warnings.push({
        type: 'performance',
        table: 'unknown',
        message: `Data consistency check failed: ${errorMessage}`,
      });
    }
  }

  private async generateSummary(): Promise<ValidationSummary> {
    try {
      // Count tables
      const tablesResult = await this.drizzleDb.execute(`
        SELECT COUNT(*) as count
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      `);

      // Count indexes
      const indexesResult = await this.drizzleDb.execute(`
        SELECT COUNT(*) as count
        FROM pg_indexes
        WHERE schemaname = 'public'
      `);

      // Count constraints
      const constraintsResult = await this.drizzleDb.execute(`
        SELECT COUNT(*) as count
        FROM information_schema.table_constraints
        WHERE table_schema = 'public'
      `);

      const tableCount = (tablesResult.rows[0] as CountRow)?.count || 0;
      const indexCount = (indexesResult.rows[0] as CountRow)?.count || 0;
      const constraintCount = (constraintsResult.rows[0] as CountRow)?.count || 0;

      return {
        totalTables: tableCount,
        validTables: tableCount, // Simplified
        totalIndexes: indexCount,
        validIndexes: indexCount, // Simplified
        totalConstraints: constraintCount,
        validConstraints: constraintCount, // Simplified
      };
    } catch (error) {
      logger.error('Failed to generate validation summary:', error);
      return {
        totalTables: 0,
        validTables: 0,
        totalIndexes: 0,
        validIndexes: 0,
        totalConstraints: 0,
        validConstraints: 0,
      };
    }
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
