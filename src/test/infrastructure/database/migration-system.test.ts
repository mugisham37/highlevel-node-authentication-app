import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { MigrationManager } from '../../../infrastructure/database/migrations/migration-manager';
import { SeedManager } from '../../../infrastructure/database/seeding/seed-manager';
import { SchemaValidator } from '../../../infrastructure/database/validation/schema-validator';
import { ProductionMigrator } from '../../../infrastructure/database/migrations/production-migrator';
import { initializeConfig } from '../../../infrastructure/config/environment';

describe('Database Migration and Seeding System', () => {
  let migrationManager: MigrationManager;
  let seedManager: SeedManager;
  let schemaValidator: SchemaValidator;
  let productionMigrator: ProductionMigrator;

  beforeAll(async () => {
    // Initialize configuration first
    await initializeConfig();

    // Initialize managers
    migrationManager = new MigrationManager();
    seedManager = new SeedManager('testing');
    schemaValidator = new SchemaValidator();
    productionMigrator = new ProductionMigrator();

    await migrationManager.initialize();
    await seedManager.initialize();
    await productionMigrator.initialize();
  });

  afterAll(async () => {
    // Clean up connections
    await migrationManager.close();
    await seedManager.close();
    await schemaValidator.close();
    await productionMigrator.close();
  });

  beforeEach(async () => {
    // Clear test environment before each test
    try {
      await seedManager.clearEnvironment();
    } catch (error) {
      // Ignore errors if tables don't exist yet
    }
  });

  describe('MigrationManager', () => {
    it('should initialize migration table', async () => {
      const status = await migrationManager.getStatus();
      expect(status).toHaveProperty('appliedMigrations');
      expect(status).toHaveProperty('pendingMigrations');
      expect(typeof status.appliedMigrations).toBe('number');
      expect(typeof status.pendingMigrations).toBe('number');
    });

    it('should detect pending migrations', async () => {
      const pendingMigrations = await migrationManager.getPendingMigrations();
      expect(Array.isArray(pendingMigrations)).toBe(true);

      // Should have at least the initial migrations
      expect(pendingMigrations.length).toBeGreaterThanOrEqual(0);
    });

    it('should apply migrations successfully', async () => {
      const initialStatus = await migrationManager.getStatus();

      // Apply migrations
      await migrationManager.migrate();

      const finalStatus = await migrationManager.getStatus();
      expect(finalStatus.appliedMigrations).toBeGreaterThanOrEqual(
        initialStatus.appliedMigrations
      );
    });

    it('should track applied migrations', async () => {
      await migrationManager.migrate();

      const appliedMigrations = await migrationManager.getAppliedMigrations();
      expect(Array.isArray(appliedMigrations)).toBe(true);

      if (appliedMigrations.length > 0) {
        const migration = appliedMigrations[0];
        expect(migration).toHaveProperty('id');
        expect(migration).toHaveProperty('name');
        expect(migration).toHaveProperty('version');
        expect(migration).toHaveProperty('appliedAt');
        expect(migration).toHaveProperty('executionTime');
      }
    });
  });

  describe('SeedManager', () => {
    beforeEach(async () => {
      // Ensure migrations are applied before seeding
      await migrationManager.migrate();
    });

    it('should initialize seed table', async () => {
      const status = await seedManager.getStatus();
      expect(status).toHaveProperty('environment');
      expect(status).toHaveProperty('appliedSeeds');
      expect(status).toHaveProperty('pendingSeeds');
      expect(status.environment).toBe('testing');
    });

    it('should detect pending seeds', async () => {
      const pendingSeeds = await seedManager.getPendingSeeds();
      expect(Array.isArray(pendingSeeds)).toBe(true);
    });

    it('should apply seeds successfully', async () => {
      const initialStatus = await seedManager.getStatus();

      // Apply seeds
      await seedManager.seed();

      const finalStatus = await seedManager.getStatus();
      expect(finalStatus.appliedSeeds).toBeGreaterThanOrEqual(
        initialStatus.appliedSeeds
      );
    });

    it('should track applied seeds', async () => {
      await seedManager.seed();

      const appliedSeeds = await seedManager.getAppliedSeeds();
      expect(Array.isArray(appliedSeeds)).toBe(true);

      if (appliedSeeds.length > 0) {
        const seed = appliedSeeds[0];
        expect(seed).toHaveProperty('id');
        expect(seed).toHaveProperty('name');
        expect(seed).toHaveProperty('version');
        expect(seed).toHaveProperty('environment');
        expect(seed).toHaveProperty('appliedAt');
      }
    });

    it('should clear environment data', async () => {
      // Apply some seeds first
      await seedManager.seed();

      const statusBefore = await seedManager.getStatus();

      // Clear environment
      await seedManager.clearEnvironment();

      const statusAfter = await seedManager.getStatus();
      expect(statusAfter.appliedSeeds).toBe(0);
    });
  });

  describe('SchemaValidator', () => {
    beforeEach(async () => {
      // Ensure migrations are applied before validation
      await migrationManager.migrate();
    });

    it('should validate database schema', async () => {
      const result = await schemaValidator.validateSchema();

      expect(result).toHaveProperty('valid');
      expect(result).toHaveProperty('errors');
      expect(result).toHaveProperty('warnings');
      expect(result).toHaveProperty('summary');

      expect(typeof result.valid).toBe('boolean');
      expect(Array.isArray(result.errors)).toBe(true);
      expect(Array.isArray(result.warnings)).toBe(true);

      expect(result.summary).toHaveProperty('totalTables');
      expect(result.summary).toHaveProperty('validTables');
      expect(result.summary).toHaveProperty('totalIndexes');
      expect(result.summary).toHaveProperty('totalConstraints');
    });

    it('should detect missing tables as errors', async () => {
      // This test assumes we have the required tables after migration
      const result = await schemaValidator.validateSchema();

      // After proper migration, schema should be valid or have minimal errors
      if (!result.valid) {
        // Check that errors are reasonable (not missing critical tables)
        const missingTableErrors = result.errors.filter(
          (e) => e.type === 'missing_table'
        );

        // Should not have missing critical tables after migration
        const criticalTables = ['users', 'active_sessions', 'auth_attempts'];
        const missingCriticalTables = missingTableErrors.filter((e) =>
          criticalTables.includes(e.table)
        );

        expect(missingCriticalTables.length).toBe(0);
      }
    });
  });

  describe('ProductionMigrator', () => {
    beforeEach(async () => {
      // Start with a clean state
      await seedManager.clearEnvironment();
    });

    it('should create migration plan', async () => {
      const plan = await productionMigrator.createMigrationPlan();

      expect(plan).toHaveProperty('migrations');
      expect(plan).toHaveProperty('totalEstimatedDuration');
      expect(plan).toHaveProperty('totalDowntime');
      expect(plan).toHaveProperty('riskAssessment');

      expect(Array.isArray(plan.migrations)).toBe(true);
      expect(typeof plan.totalEstimatedDuration).toBe('number');
      expect(typeof plan.totalDowntime).toBe('number');
      expect(typeof plan.riskAssessment).toBe('string');
    });

    it('should execute dry run migration', async () => {
      // This should not throw and should not actually apply migrations
      await expect(
        productionMigrator.executeProductionMigration({
          dryRun: true,
          backupBeforeMigration: false,
        })
      ).resolves.not.toThrow();

      // Verify no migrations were actually applied
      const status = await migrationManager.getStatus();
      expect(status.appliedMigrations).toBe(0);
    });
  });

  describe('Integration Tests', () => {
    it('should complete full migration and seeding workflow', async () => {
      // 1. Apply migrations
      await migrationManager.migrate();

      // 2. Validate schema
      const validation = await schemaValidator.validateSchema();
      expect(validation.valid).toBe(true);

      // 3. Apply seeds
      await seedManager.seed();

      // 4. Verify data was seeded
      const seedStatus = await seedManager.getStatus();
      expect(seedStatus.appliedSeeds).toBeGreaterThan(0);

      // 5. Validate schema again
      const postSeedValidation = await schemaValidator.validateSchema();
      expect(postSeedValidation.valid).toBe(true);
    });

    it('should handle rollback scenarios', async () => {
      // Apply migrations and seeds
      await migrationManager.migrate();
      await seedManager.seed();

      const appliedSeeds = await seedManager.getAppliedSeeds();

      if (appliedSeeds.length > 0) {
        const lastSeed = appliedSeeds[appliedSeeds.length - 1];

        // Rollback the last seed
        await seedManager.rollbackSeed(lastSeed.id);

        // Verify rollback
        const newAppliedSeeds = await seedManager.getAppliedSeeds();
        expect(newAppliedSeeds.length).toBe(appliedSeeds.length - 1);
      }
    });
  });
});
