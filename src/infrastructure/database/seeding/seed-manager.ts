import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseConfig } from '../config';
import { logger } from '../../logging/winston-logger';
import { CryptographicService } from '../../security/cryptographic.service';
import fs from 'fs/promises';
import path from 'path';

export interface SeedData {
  id: string;
  name: string;
  description: string;
  environment: 'development' | 'testing' | 'staging' | 'production';
  version: string;
  execute: (context: SeedContext) => Promise<void>;
  rollback?: (context: SeedContext) => Promise<void>;
  dependencies?: string[];
}

export interface SeedContext {
  prisma: PrismaClient;
  drizzle: any;
  crypto: CryptographicService;
  environment: string;
}

export interface SeedRecord {
  id: string;
  name: string;
  version: string;
  environment: string;
  appliedAt: Date;
  executionTime: number;
}

export class SeedManager {
  private pool: Pool;
  private drizzleDb: any;
  private prisma: PrismaClient;
  private crypto: CryptographicService;
  private seeds: Map<string, SeedData> = new Map();
  private environment: string;

  constructor(environment: string = process.env.NODE_ENV || 'development') {
    const config = createDatabaseConfig();
    this.pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    this.drizzleDb = drizzle(this.pool);
    this.prisma = new PrismaClient();
    this.crypto = new CryptographicService(
      CryptographicService.generateSecureConfig()
    );
    this.environment = environment;
  }

  async initialize(): Promise<void> {
    await this.createSeedTable();
    await this.loadSeeds();
  }

  private async createSeedTable(): Promise<void> {
    await this.drizzleDb.execute(`
      CREATE TABLE IF NOT EXISTS _seeds (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255) NOT NULL,
        version VARCHAR(50) NOT NULL,
        environment VARCHAR(50) NOT NULL,
        applied_at TIMESTAMP DEFAULT NOW() NOT NULL,
        execution_time INTEGER NOT NULL,
        created_by VARCHAR(100) DEFAULT 'system' NOT NULL
      );
    `);

    await this.drizzleDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_seeds_environment ON _seeds(environment);
    `);

    await this.drizzleDb.execute(`
      CREATE INDEX IF NOT EXISTS idx_seeds_applied_at ON _seeds(applied_at);
    `);
  }

  private async loadSeeds(): Promise<void> {
    const seedsDir = path.join(__dirname, 'data');

    try {
      const files = await fs.readdir(seedsDir);
      const seedFiles = files.filter(
        (file) => file.endsWith('.ts') || file.endsWith('.js')
      );

      for (const file of seedFiles) {
        try {
          const seedModule = await import(path.join(seedsDir, file));
          const seed: SeedData = seedModule.default || seedModule;

          if (this.isValidSeed(seed)) {
            this.seeds.set(seed.id, seed);
            logger.debug(`Loaded seed: ${seed.id} - ${seed.name}`);
          } else {
            logger.warn(`Invalid seed format in file: ${file}`);
          }
        } catch (error) {
          logger.error(`Failed to load seed from file ${file}:`, error);
        }
      }
    } catch (error) {
      logger.warn('Seeds directory not found, creating it...');
      await fs.mkdir(seedsDir, { recursive: true });
    }
  }

  private isValidSeed(seed: any): seed is SeedData {
    return (
      seed &&
      typeof seed.id === 'string' &&
      typeof seed.name === 'string' &&
      typeof seed.version === 'string' &&
      typeof seed.execute === 'function' &&
      ['development', 'testing', 'staging', 'production'].includes(
        seed.environment
      )
    );
  }

  async getAppliedSeeds(): Promise<SeedRecord[]> {
    const result = await this.drizzleDb.execute(
      `
      SELECT id, name, version, environment, applied_at, execution_time
      FROM _seeds
      WHERE environment = $1
      ORDER BY applied_at ASC
    `,
      [this.environment]
    );

    return result.rows.map((row) => ({
      id: row.id,
      name: row.name,
      version: row.version,
      environment: row.environment,
      appliedAt: new Date(row.applied_at),
      executionTime: row.execution_time,
    }));
  }

  async getPendingSeeds(): Promise<SeedData[]> {
    const appliedSeeds = await this.getAppliedSeeds();
    const appliedIds = new Set(appliedSeeds.map((s) => s.id));

    return Array.from(this.seeds.values())
      .filter(
        (seed) =>
          seed.environment === this.environment && !appliedIds.has(seed.id)
      )
      .sort((a, b) => a.version.localeCompare(b.version));
  }

  async seed(): Promise<void> {
    const pendingSeeds = await this.getPendingSeeds();

    if (pendingSeeds.length === 0) {
      logger.info(
        `No pending seeds to apply for environment: ${this.environment}`
      );
      return;
    }

    logger.info(
      `Applying ${pendingSeeds.length} pending seeds for environment: ${this.environment}...`
    );

    for (const seed of pendingSeeds) {
      await this.applySeed(seed);
    }

    logger.info('All seeds applied successfully');
  }

  private async applySeed(seed: SeedData): Promise<void> {
    const startTime = Date.now();

    try {
      logger.info(`Applying seed: ${seed.id} - ${seed.name}`);

      // Check dependencies
      if (seed.dependencies) {
        await this.checkSeedDependencies(seed.dependencies);
      }

      // Create seed context
      const context: SeedContext = {
        prisma: this.prisma,
        drizzle: this.drizzleDb,
        crypto: this.crypto,
        environment: this.environment,
      };

      // Apply the seed
      await seed.execute(context);

      const executionTime = Date.now() - startTime;

      // Record the seed
      await this.drizzleDb.execute(
        `
        INSERT INTO _seeds (id, name, version, environment, execution_time)
        VALUES ($1, $2, $3, $4, $5)
      `,
        [seed.id, seed.name, seed.version, seed.environment, executionTime]
      );

      logger.info(`Seed ${seed.id} applied successfully in ${executionTime}ms`);
    } catch (error) {
      logger.error(`Failed to apply seed ${seed.id}:`, error);
      throw error;
    }
  }

  private async checkSeedDependencies(dependencies: string[]): Promise<void> {
    const appliedSeeds = await this.getAppliedSeeds();
    const appliedIds = new Set(appliedSeeds.map((s) => s.id));

    for (const dependency of dependencies) {
      if (!appliedIds.has(dependency)) {
        throw new Error(`Seed dependency not met: ${dependency}`);
      }
    }
  }

  async rollbackSeed(seedId: string): Promise<void> {
    const appliedSeeds = await this.getAppliedSeeds();
    const targetSeed = appliedSeeds.find((s) => s.id === seedId);

    if (!targetSeed) {
      throw new Error(`Seed ${seedId} not found or not applied`);
    }

    const seed = this.seeds.get(seedId);
    if (!seed) {
      throw new Error(`Seed ${seedId} not found in loaded seeds`);
    }

    if (!seed.rollback) {
      throw new Error(`Seed ${seedId} does not support rollback`);
    }

    try {
      logger.info(`Rolling back seed: ${seed.id} - ${seed.name}`);

      const context: SeedContext = {
        prisma: this.prisma,
        drizzle: this.drizzleDb,
        crypto: this.crypto,
        environment: this.environment,
      };

      await seed.rollback(context);

      // Remove the seed record
      await this.drizzleDb.execute(
        `
        DELETE FROM _seeds WHERE id = $1 AND environment = $2
      `,
        [seed.id, this.environment]
      );

      logger.info(`Seed ${seed.id} rolled back successfully`);
    } catch (error) {
      logger.error(`Failed to rollback seed ${seed.id}:`, error);
      throw error;
    }
  }

  async clearEnvironment(): Promise<void> {
    if (this.environment === 'production') {
      throw new Error('Cannot clear production environment');
    }

    logger.warn(`Clearing all data for environment: ${this.environment}`);

    try {
      // Clear Prisma tables in dependency order
      await this.prisma.webhookDeliveryAttempt.deleteMany();
      await this.prisma.webhookEvent.deleteMany();
      await this.prisma.webhook.deleteMany();
      await this.prisma.auditLog.deleteMany();
      await this.prisma.webAuthnCredential.deleteMany();
      await this.prisma.rolePermission.deleteMany();
      await this.prisma.userRole.deleteMany();
      await this.prisma.permission.deleteMany();
      await this.prisma.role.deleteMany();
      await this.prisma.session.deleteMany();
      await this.prisma.account.deleteMany();
      await this.prisma.user.deleteMany();

      // Clear Drizzle tables
      await this.drizzleDb.execute(`TRUNCATE TABLE active_sessions CASCADE`);
      await this.drizzleDb.execute(`TRUNCATE TABLE auth_attempts CASCADE`);
      await this.drizzleDb.execute(`TRUNCATE TABLE mfa_challenges CASCADE`);
      await this.drizzleDb.execute(`TRUNCATE TABLE oauth_token_cache CASCADE`);
      await this.drizzleDb.execute(
        `TRUNCATE TABLE oauth_state_tracking CASCADE`
      );
      await this.drizzleDb.execute(`TRUNCATE TABLE oauth_auth_codes CASCADE`);
      await this.drizzleDb.execute(
        `TRUNCATE TABLE rate_limit_tracking CASCADE`
      );
      await this.drizzleDb.execute(`TRUNCATE TABLE user_auth_cache CASCADE`);

      // Clear seed records for this environment
      await this.drizzleDb.execute(
        `
        DELETE FROM _seeds WHERE environment = $1
      `,
        [this.environment]
      );

      logger.info(`Environment ${this.environment} cleared successfully`);
    } catch (error) {
      logger.error(`Failed to clear environment ${this.environment}:`, error);
      throw error;
    }
  }

  async getStatus(): Promise<{
    environment: string;
    appliedSeeds: number;
    pendingSeeds: number;
    lastSeed?: SeedRecord;
  }> {
    const applied = await this.getAppliedSeeds();
    const pending = await this.getPendingSeeds();

    return {
      environment: this.environment,
      appliedSeeds: applied.length,
      pendingSeeds: pending.length,
      lastSeed: applied[applied.length - 1],
    };
  }

  async close(): Promise<void> {
    await this.prisma.$disconnect();
    await this.pool.end();
  }
}
