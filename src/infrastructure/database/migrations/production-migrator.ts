import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { PrismaClient } from '@prisma/client';
import { createDatabaseConfig } from '../config';
import { logger } from '../../logging/winston-logger';
import { MigrationManager } from './migration-manager';
import fs from 'fs/promises';
import path from 'path';

export interface ProductionMigrationOptions {
  dryRun?: boolean;
  backupBeforeMigration?: boolean;
  maxDowntime?: number; // in milliseconds
  rollbackOnFailure?: boolean;
  notificationWebhook?: string;
}

export interface MigrationPlan {
  migrations: Array<{
    id: string;
    name: string;
    estimatedDuration: number;
    riskLevel: 'low' | 'medium' | 'high';
    requiresDowntime: boolean;
  }>;
  totalEstimatedDuration: number;
  totalDowntime: number;
  riskAssessment: string;
}

export class ProductionMigrator {
  private pool: Pool;
  private drizzleDb: any;
  private prisma: PrismaClient;
  private migrationManager: MigrationManager;

  constructor() {
    const config = createDatabaseConfig();
    this.pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    this.drizzleDb = drizzle(this.pool);
    this.prisma = new PrismaClient();
    this.migrationManager = new MigrationManager();
  }

  async initialize(): Promise<void> {
    await this.migrationManager.initialize();
  }

  async createMigrationPlan(): Promise<MigrationPlan> {
    const pendingMigrations =
      await this.migrationManager.getPendingMigrations();

    const migrationDetails = pendingMigrations.map((migration) => ({
      id: migration.id,
      name: migration.name,
      estimatedDuration: this.estimateMigrationDuration(migration),
      riskLevel: this.assessMigrationRisk(migration),
      requiresDowntime: this.requiresDowntime(migration),
    }));

    const totalEstimatedDuration = migrationDetails.reduce(
      (sum, m) => sum + m.estimatedDuration,
      0
    );

    const totalDowntime = migrationDetails
      .filter((m) => m.requiresDowntime)
      .reduce((sum, m) => sum + m.estimatedDuration, 0);

    const riskAssessment = this.assessOverallRisk(migrationDetails);

    return {
      migrations: migrationDetails,
      totalEstimatedDuration,
      totalDowntime,
      riskAssessment,
    };
  }

  private estimateMigrationDuration(migration: any): number {
    // Simple heuristic based on migration type and complexity
    const baseTime = 5000; // 5 seconds base time

    // Estimate based on migration name/description
    if (migration.name.includes('index')) return baseTime * 2;
    if (migration.name.includes('table')) return baseTime * 3;
    if (migration.name.includes('data')) return baseTime * 5;
    if (migration.name.includes('constraint')) return baseTime * 1.5;

    return baseTime;
  }

  private assessMigrationRisk(migration: any): 'low' | 'medium' | 'high' {
    // Risk assessment based on migration characteristics
    if (migration.name.includes('drop') || migration.name.includes('delete')) {
      return 'high';
    }
    if (migration.name.includes('alter') || migration.name.includes('modify')) {
      return 'medium';
    }
    return 'low';
  }

  private requiresDowntime(migration: any): boolean {
    // Determine if migration requires application downtime
    const downtimeKeywords = ['alter table', 'drop', 'rename', 'constraint'];
    return downtimeKeywords.some((keyword) =>
      migration.name.toLowerCase().includes(keyword)
    );
  }

  private assessOverallRisk(migrations: any[]): string {
    const highRiskCount = migrations.filter(
      (m) => m.riskLevel === 'high'
    ).length;
    const mediumRiskCount = migrations.filter(
      (m) => m.riskLevel === 'medium'
    ).length;
    const downtimeMigrations = migrations.filter(
      (m) => m.requiresDowntime
    ).length;

    if (highRiskCount > 0) {
      return `HIGH RISK: ${highRiskCount} high-risk migrations detected. Manual review required.`;
    }
    if (mediumRiskCount > 2 || downtimeMigrations > 1) {
      return `MEDIUM RISK: ${mediumRiskCount} medium-risk migrations and ${downtimeMigrations} downtime migrations.`;
    }
    return 'LOW RISK: All migrations are low-risk and can be applied safely.';
  }

  async createBackup(backupName?: string): Promise<string> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const name = backupName || `backup-${timestamp}`;
    const backupPath = path.join(process.cwd(), 'backups', `${name}.sql`);

    // Ensure backup directory exists
    await fs.mkdir(path.dirname(backupPath), { recursive: true });

    logger.info(`Creating database backup: ${backupPath}`);

    try {
      // Use pg_dump to create backup
      const { spawn } = require('child_process');
      const pgDump = spawn('pg_dump', [
        process.env.DATABASE_URL!,
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        '--file',
        backupPath,
      ]);

      return new Promise((resolve, reject) => {
        pgDump.on('close', (code: number) => {
          if (code === 0) {
            logger.info(`Backup created successfully: ${backupPath}`);
            resolve(backupPath);
          } else {
            reject(new Error(`pg_dump failed with code ${code}`));
          }
        });

        pgDump.on('error', (error: Error) => {
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Failed to create backup:', error);
      throw error;
    }
  }

  async restoreBackup(backupPath: string): Promise<void> {
    logger.info(`Restoring database from backup: ${backupPath}`);

    try {
      const { spawn } = require('child_process');
      const psql = spawn('psql', [
        process.env.DATABASE_URL!,
        '--file',
        backupPath,
      ]);

      return new Promise((resolve, reject) => {
        psql.on('close', (code: number) => {
          if (code === 0) {
            logger.info('Backup restored successfully');
            resolve();
          } else {
            reject(new Error(`psql failed with code ${code}`));
          }
        });

        psql.on('error', (error: Error) => {
          reject(error);
        });
      });
    } catch (error) {
      logger.error('Failed to restore backup:', error);
      throw error;
    }
  }

  async executeProductionMigration(
    options: ProductionMigrationOptions = {}
  ): Promise<void> {
    const {
      dryRun = false,
      backupBeforeMigration = true,
      maxDowntime = 300000, // 5 minutes
      rollbackOnFailure = true,
      notificationWebhook,
    } = options;

    logger.info('Starting production migration process');

    // Create migration plan
    const plan = await this.createMigrationPlan();

    if (plan.totalDowntime > maxDowntime) {
      throw new Error(
        `Estimated downtime (${plan.totalDowntime}ms) exceeds maximum allowed (${maxDowntime}ms)`
      );
    }

    // Send notification
    if (notificationWebhook) {
      await this.sendNotification(notificationWebhook, {
        event: 'migration_started',
        plan,
        dryRun,
      });
    }

    let backupPath: string | null = null;

    try {
      // Create backup if requested
      if (backupBeforeMigration && !dryRun) {
        backupPath = await this.createBackup();
      }

      // Validate current schema
      const validation = await this.migrationManager.validateSchema();
      if (!validation.valid) {
        throw new Error(
          `Schema validation failed: ${validation.errors.map((e) => e.message).join(', ')}`
        );
      }

      if (dryRun) {
        logger.info('DRY RUN: Would execute the following migrations:');
        plan.migrations.forEach((migration) => {
          logger.info(
            `  - ${migration.id}: ${migration.name} (${migration.riskLevel} risk)`
          );
        });
        return;
      }

      // Execute migrations with monitoring
      const startTime = Date.now();
      await this.executeWithMonitoring(plan);
      const actualDuration = Date.now() - startTime;

      // Validate schema after migration
      const postValidation = await this.migrationManager.validateSchema();
      if (!postValidation.valid) {
        throw new Error('Post-migration schema validation failed');
      }

      logger.info(
        `Production migration completed successfully in ${actualDuration}ms`
      );

      // Send success notification
      if (notificationWebhook) {
        await this.sendNotification(notificationWebhook, {
          event: 'migration_completed',
          duration: actualDuration,
          plan,
        });
      }
    } catch (error) {
      logger.error('Production migration failed:', error);

      // Attempt rollback if requested
      if (rollbackOnFailure && backupPath && !dryRun) {
        try {
          logger.info('Attempting automatic rollback...');
          await this.restoreBackup(backupPath);
          logger.info('Rollback completed successfully');
        } catch (rollbackError) {
          logger.error('Rollback failed:', rollbackError);
          throw new Error(
            `Migration failed and rollback failed: ${error.message}`
          );
        }
      }

      // Send failure notification
      if (notificationWebhook) {
        await this.sendNotification(notificationWebhook, {
          event: 'migration_failed',
          error: error.message,
          plan,
        });
      }

      throw error;
    }
  }

  private async executeWithMonitoring(plan: MigrationPlan): Promise<void> {
    const startTime = Date.now();

    for (const migrationInfo of plan.migrations) {
      const migrationStartTime = Date.now();

      logger.info(
        `Executing migration: ${migrationInfo.id} (${migrationInfo.riskLevel} risk)`
      );

      // Monitor database connections during migration
      const connectionMonitor = this.startConnectionMonitoring();

      try {
        // Execute the actual migration
        await this.migrationManager.migrate();

        const migrationDuration = Date.now() - migrationStartTime;
        logger.info(
          `Migration ${migrationInfo.id} completed in ${migrationDuration}ms`
        );

        // Check if migration took longer than expected
        if (migrationDuration > migrationInfo.estimatedDuration * 2) {
          logger.warn(
            `Migration took ${migrationDuration}ms, expected ${migrationInfo.estimatedDuration}ms`
          );
        }
      } finally {
        clearInterval(connectionMonitor);
      }
    }

    const totalDuration = Date.now() - startTime;
    logger.info(`All migrations completed in ${totalDuration}ms`);
  }

  private startConnectionMonitoring(): NodeJS.Timeout {
    return setInterval(async () => {
      try {
        const result = await this.drizzleDb.execute(`
          SELECT 
            count(*) as total_connections,
            count(*) FILTER (WHERE state = 'active') as active_connections,
            count(*) FILTER (WHERE state = 'idle') as idle_connections
          FROM pg_stat_activity 
          WHERE datname = current_database()
        `);

        const stats = result.rows[0];
        logger.debug(
          `DB Connections - Total: ${stats.total_connections}, Active: ${stats.active_connections}, Idle: ${stats.idle_connections}`
        );

        // Alert if too many connections
        if (stats.active_connections > 50) {
          logger.warn(
            `High number of active connections: ${stats.active_connections}`
          );
        }
      } catch (error) {
        logger.error('Connection monitoring failed:', error);
      }
    }, 5000); // Check every 5 seconds
  }

  private async sendNotification(
    webhookUrl: string,
    payload: any
  ): Promise<void> {
    try {
      const response = await fetch(webhookUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          timestamp: new Date().toISOString(),
          service: 'enterprise-auth-backend',
          ...payload,
        }),
      });

      if (!response.ok) {
        logger.warn(`Notification webhook failed: ${response.status}`);
      }
    } catch (error) {
      logger.warn('Failed to send notification:', error);
    }
  }

  async close(): Promise<void> {
    await this.migrationManager.close();
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
