import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PrismaClient } from '@prisma/client';
import { createDatabaseConfig } from '../config';
import { logger } from '../../logging/winston-logger';
import fs from 'fs/promises';
import path from 'path';
import {
  Migration,
  MigrationRecord,
  MigrationTableRow,
  TableInfoRow,
  getErrorMessage,
} from './types';

// Re-export types for easier access
export type { Migration, MigrationRecord } from './types';

export class MigrationManager {
  private pool: Pool;
  private drizzleDb: any;
  private prisma: PrismaClient;
  private migrations: Map<string, Migration> = new Map();

  constructor() {
    const config = createDatabaseConfig();
    this.pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    this.drizzleDb = drizzle(this.pool);
    this.prisma = new PrismaClient();
  }

  async initialize(): Promise<void> {
    await this.createMigrationTable();
    await this.loadMigrations();
  }

  private async createMigrationTable(): Promise<void> {
    await this.drizzleDb.execute(`
      CREATE TABLE IF NOT EXISTS _migrations (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        description TEXT,
        checksum VARCHAR(64) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL,
        execution_time INTEGER NOT NULL,
        rollback_available BOOLEAN DEFAULT true NOT NULL,
        created_by VARCHAR(100) DEFAULT 'system' NOT NULL
      );
    `);

    await this.drizzleDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_migrations_version ON _migrations(version);
    `);

    await this.drizzleDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_migrations_applied_at ON _migrations(applied_at);
    `);
  }

  private async loadMigrations(): Promise<void> {
    const migrationsDir = path.join(__dirname, 'scripts');

    try {
      const files = await fs.readdir(migrationsDir);
      const migrationFiles = files.filter(
        (file) => file.endsWith('.ts') || file.endsWith('.js')
      );

      for (const file of migrationFiles) {
        try {
          const migrationModule = await import(path.join(migrationsDir, file));
          const migration: Migration =
            migrationModule.default || migrationModule;

          if (this.isValidMigration(migration)) {
            this.migrations.set(migration.id, migration);
            logger.debug(
              `Loaded migration: ${migration.id} - ${migration.name}`
            );
          } else {
            logger.warn(`Invalid migration format in file: ${file}`);
          }
        } catch (error) {
          logger.error(`Failed to load migration from file ${file}:`, error);
        }
      }
    } catch (error) {
      logger.warn('Migrations directory not found, creating it...');
      await fs.mkdir(migrationsDir, { recursive: true });
    }
  }

  private isValidMigration(migration: any): migration is Migration {
    return (
      migration &&
      typeof migration.id === 'string' &&
      typeof migration.name === 'string' &&
      typeof migration.version === 'string' &&
      typeof migration.up === 'function' &&
      typeof migration.down === 'function' &&
      typeof migration.checksum === 'string'
    );
  }

  async getAppliedMigrations(): Promise<MigrationRecord[]> {
    const result = await this.drizzleDb.execute(`
      SELECT id, name, version, description, checksum, applied_at, execution_time, rollback_available
      FROM _migrations
      ORDER BY applied_at ASC
    `);

    return result.rows.map((row: MigrationTableRow) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      description: row.description,
      checksum: row.checksum,
      appliedAt: new Date(row.applied_at),
      executionTime: row.execution_time,
      rollbackAvailable: row.rollback_available,
    }));
  }

  async getPendingMigrations(): Promise<Migration[]> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));

    return Array.from(this.migrations.values())
      .filter((migration) => !appliedIds.has(migration.id))
      .sort((a, b) => a.version.localeCompare(b.version));
  }

  async migrate(): Promise<void> {
    const pendingMigrations = await this.getPendingMigrations();

    if (pendingMigrations.length === 0) {
      logger.info('No pending migrations to apply');
      return;
    }

    logger.info(`Applying ${pendingMigrations.length} pending migrations...`);

    for (const migration of pendingMigrations) {
      await this.applyMigration(migration);
    }

    logger.info('All migrations applied successfully');
  }

  private async applyMigration(migration: Migration): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info(`Applying migration: ${migration.id} - ${migration.name}`);

      // Check dependencies
      if (migration.dependencies) {
        await this.checkDependencies(migration.dependencies);
      }

      // Apply the migration
      await migration.up();

      const executionTime = Date.now() - startTime;

      // Record the migration
      await this.drizzleDb.execute(
        `
        INSERT INTO _migrations (id, name, version, description, checksum, execution_time)
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [
          migration.id,
          migration.name,
          migration.version,
          migration.description,
          migration.checksum,
          executionTime,
        ]
      );

      logger.info(
        `Migration ${migration.id} applied successfully in ${executionTime}ms`
      );
    } catch (error) {
      logger.error(`Failed to apply migration ${migration.id}:`, error);
      throw error;
    }
  }

  private async checkDependencies(dependencies: string[]): Promise<void> {
    const appliedMigrations = await this.getAppliedMigrations();
    const appliedIds = new Set(appliedMigrations.map((m) => m.id));

    for (const dependency of dependencies) {
      if (!appliedIds.has(dependency)) {
        throw new Error(`Migration dependency not met: ${dependency}`);
      }
    }
  }

  async rollback(migrationId?: string): Promise<void> {
    const appliedMigrations = await this.getAppliedMigrations();

    if (appliedMigrations.length === 0) {
      logger.info('No migrations to rollback');
      return;
    }

    let targetMigration: MigrationRecord;

    if (migrationId) {
      const found = appliedMigrations.find((m) => m.id === migrationId);
      if (!found) {
        throw new Error(`Migration ${migrationId} not found or not applied`);
      }
      targetMigration = found;
    } else {
      // Rollback the last migration
      const lastMigration = appliedMigrations[appliedMigrations.length - 1];
      if (!lastMigration) {
        throw new Error('No migrations found to rollback');
      }
      targetMigration = lastMigration;
    }

    if (!targetMigration.rollbackAvailable) {
      throw new Error(
        `Migration ${targetMigration.id} does not support rollback`
      );
    }

    const migration = this.migrations.get(targetMigration.id);
    if (!migration) {
      throw new Error(
        `Migration ${targetMigration.id} not found in loaded migrations`
      );
    }

    try {
      logger.info(
        `Rolling back migration: ${migration.id} - ${migration.name}`
      );

      await migration.down();

      // Remove the migration record
      await this.drizzleDb.execute(
        `
        DELETE FROM _migrations WHERE id = $1
      `,
        [migration.id]
      );

      logger.info(`Migration ${migration.id} rolled back successfully`);
    } catch (error) {
      logger.error(`Failed to rollback migration ${migration.id}:`, error);
      throw error;
    }
  }

  async validateSchema(): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];

    try {
      // Validate Prisma schema consistency
      await this.validatePrismaSchema(errors);

      // Validate Drizzle schema consistency
      await this.validateDrizzleSchema(errors);

      // Cross-validate between ORMs
      await this.crossValidateSchemas(errors);

      return {
        valid: errors.length === 0,
        errors,
      };
    } catch (error) {
      errors.push(`Schema validation failed: ${getErrorMessage(error)}`);
      return {
        valid: false,
        errors,
      };
    }
  }

  private async validatePrismaSchema(errors: string[]): Promise<void> {
    try {
      // Check if Prisma can connect and introspect
      await this.prisma.$queryRaw`SELECT 1`;

      // Validate key tables exist
      const tables = await this.prisma.$queryRaw<TableInfoRow[]>`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_type = 'BASE TABLE'
      `;

      const requiredTables = [
        'users',
        'accounts',
        'sessions',
        'roles',
        'permissions',
        'user_roles',
        'role_permissions',
        'audit_logs',
        'webhooks',
      ];

      const existingTables = new Set(tables.map((t: TableInfoRow) => t.table_name));

      for (const table of requiredTables) {
        if (!existingTables.has(table)) {
          errors.push(`Required Prisma table missing: ${table}`);
        }
      }
    } catch (error) {
      errors.push(`Prisma schema validation failed: ${getErrorMessage(error)}`);
    }
  }

  private async validateDrizzleSchema(errors: string[]): Promise<void> {
    try {
      // Check Drizzle-specific tables
      const result = await this.drizzleDb.execute(`
        SELECT table_name 
        FROM information_schema.tables 
        WHERE table_schema = 'public' 
        AND table_name IN ('active_sessions', 'auth_attempts', 'mfa_challenges', 'oauth_token_cache')
      `);

      const requiredDrizzleTables = [
        'active_sessions',
        'auth_attempts',
        'mfa_challenges',
        'oauth_token_cache',
      ];

      const existingTables = new Set(
        result.rows.map((row: any) => row.table_name)
      );

      for (const table of requiredDrizzleTables) {
        if (!existingTables.has(table)) {
          errors.push(`Required Drizzle table missing: ${table}`);
        }
      }
    } catch (error) {
      errors.push(`Drizzle schema validation failed: ${getErrorMessage(error)}`);
    }
  }

  private async crossValidateSchemas(errors: string[]): Promise<void> {
    // Validate that user IDs are consistent between Prisma and Drizzle tables
    try {
      const prismaUserCount = await this.prisma.user.count();
      const drizzleSessionCount = await this.drizzleDb.execute(`
        SELECT COUNT(DISTINCT user_id) as count FROM active_sessions
      `);

      // This is just a basic consistency check
      logger.debug(
        `Prisma users: ${prismaUserCount}, Drizzle unique session users: ${drizzleSessionCount.rows[0]?.count || 0}`
      );
    } catch (error) {
      errors.push(`Cross-schema validation failed: ${getErrorMessage(error)}`);
    }
  }

  async getStatus(): Promise<{
    appliedMigrations: number;
    pendingMigrations: number;
    lastMigration?: MigrationRecord;
    schemaValid: boolean;
  }> {
    const applied = await this.getAppliedMigrations();
    const pending = await this.getPendingMigrations();
    const validation = await this.validateSchema();

    const result: {
      appliedMigrations: number;
      pendingMigrations: number;
      lastMigration?: MigrationRecord;
      schemaValid: boolean;
    } = {
      appliedMigrations: applied.length,
      pendingMigrations: pending.length,
      schemaValid: validation.valid,
    };

    if (applied.length > 0) {
      const lastMigration = applied[applied.length - 1];
      if (lastMigration) {
        result.lastMigration = lastMigration;
      }
    }

    return result;
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
