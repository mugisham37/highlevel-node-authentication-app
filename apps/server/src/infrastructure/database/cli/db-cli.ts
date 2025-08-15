#!/usr/bin/env node

import { Command } from 'commander';
import { MigrationManager } from '../migrations/migration-manager';
import { SeedManager } from '../seeding/seed-manager';
import { SchemaValidator } from '../validation/schema-validator';
import { getErrorMessage } from '../../errors/error-utils';

const program = new Command();

program
  .name('db-cli')
  .description('Database migration and seeding CLI tool')
  .version('1.0.0');

// Migration commands
const migrateCommand = program
  .command('migrate')
  .description('Database migration commands');

migrateCommand
  .command('up')
  .description('Apply pending migrations')
  .action(async () => {
    const manager = new MigrationManager();
    try {
      await manager.initialize();
      await manager.migrate();
      console.log('✅ Migrations completed successfully');
    } catch (error) {
      console.error('❌ Migration failed:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

migrateCommand
  .command('down')
  .description('Rollback the last migration')
  .option('-i, --id <migrationId>', 'Specific migration ID to rollback')
  .action(async (options) => {
    const manager = new MigrationManager();
    try {
      await manager.initialize();
      await manager.rollback(options.id);
      console.log('✅ Rollback completed successfully');
    } catch (error) {
      console.error('❌ Rollback failed:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

migrateCommand
  .command('status')
  .description('Show migration status')
  .action(async () => {
    const manager = new MigrationManager();
    try {
      await manager.initialize();
      const status = await manager.getStatus();

      console.log('\n📊 Migration Status:');
      console.log(`Applied migrations: ${status.appliedMigrations}`);
      console.log(`Pending migrations: ${status.pendingMigrations}`);
      console.log(`Schema valid: ${status.schemaValid ? '✅' : '❌'}`);

      if (status.lastMigration) {
        console.log(
          `Last migration: ${status.lastMigration.name} (${status.lastMigration.version})`
        );
        console.log(
          `Applied at: ${status.lastMigration.appliedAt.toISOString()}`
        );
      }

      if (status.pendingMigrations > 0) {
        const pending = await manager.getPendingMigrations();
        console.log('\n📋 Pending migrations:');
        pending.forEach((migration) => {
          console.log(
            `  - ${migration.id}: ${migration.name} (${migration.version})`
          );
        });
      }
    } catch (error) {
      console.error('❌ Failed to get migration status:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

// Seeding commands
const seedCommand = program
  .command('seed')
  .description('Database seeding commands');

seedCommand
  .command('run')
  .description('Apply pending seeds')
  .option(
    '-e, --env <environment>',
    'Environment (development, testing, staging)',
    'development'
  )
  .action(async (options) => {
    const manager = new SeedManager(options.env);
    try {
      await manager.initialize();
      await manager.seed();
      console.log('✅ Seeding completed successfully');
    } catch (error) {
      console.error('❌ Seeding failed:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

seedCommand
  .command('rollback')
  .description('Rollback a specific seed')
  .requiredOption('-i, --id <seedId>', 'Seed ID to rollback')
  .option(
    '-e, --env <environment>',
    'Environment (development, testing, staging)',
    'development'
  )
  .action(async (options) => {
    const manager = new SeedManager(options.env);
    try {
      await manager.initialize();
      await manager.rollbackSeed(options.id);
      console.log('✅ Seed rollback completed successfully');
    } catch (error) {
      console.error('❌ Seed rollback failed:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

seedCommand
  .command('clear')
  .description('Clear all data for environment (non-production only)')
  .option(
    '-e, --env <environment>',
    'Environment (development, testing, staging)',
    'development'
  )
  .option('--confirm', 'Confirm the destructive operation')
  .action(async (options) => {
    if (options.env === 'production') {
      console.error('❌ Cannot clear production environment');
      process.exit(1);
    }

    if (!options.confirm) {
      console.error(
        '❌ This is a destructive operation. Use --confirm flag to proceed'
      );
      process.exit(1);
    }

    const manager = new SeedManager(options.env);
    try {
      await manager.initialize();
      await manager.clearEnvironment();
      console.log(`✅ Environment ${options.env} cleared successfully`);
    } catch (error) {
      console.error('❌ Clear operation failed:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

seedCommand
  .command('status')
  .description('Show seeding status')
  .option(
    '-e, --env <environment>',
    'Environment (development, testing, staging)',
    'development'
  )
  .action(async (options) => {
    const manager = new SeedManager(options.env);
    try {
      await manager.initialize();
      const status = await manager.getStatus();

      console.log(`\n📊 Seeding Status (${status.environment}):`);
      console.log(`Applied seeds: ${status.appliedSeeds}`);
      console.log(`Pending seeds: ${status.pendingSeeds}`);

      if (status.lastSeed) {
        console.log(
          `Last seed: ${status.lastSeed.name} (${status.lastSeed.version})`
        );
        console.log(`Applied at: ${status.lastSeed.appliedAt.toISOString()}`);
      }

      if (status.pendingSeeds > 0) {
        const pending = await manager.getPendingSeeds();
        console.log('\n📋 Pending seeds:');
        pending.forEach((seed) => {
          console.log(`  - ${seed.id}: ${seed.name} (${seed.version})`);
        });
      }
    } catch (error) {
      console.error('❌ Failed to get seeding status:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await manager.close();
    }
  });

// Validation commands
program
  .command('validate')
  .description('Validate database schema')
  .option('--detailed', 'Show detailed validation results')
  .action(async (options) => {
    const validator = new SchemaValidator();
    try {
      console.log('🔍 Validating database schema...');
      const result = await validator.validateSchema();

      console.log(`\n📊 Validation Summary:`);
      console.log(`Schema valid: ${result.valid ? '✅' : '❌'}`);
      console.log(`Total tables: ${result.summary.totalTables}`);
      console.log(`Valid tables: ${result.summary.validTables}`);
      console.log(`Total indexes: ${result.summary.totalIndexes}`);
      console.log(`Total constraints: ${result.summary.totalConstraints}`);

      if (result.errors.length > 0) {
        console.log(`\n❌ Errors (${result.errors.length}):`);
        result.errors.forEach((error) => {
          console.log(
            `  - ${error.table}${error.column ? `.${error.column}` : ''}: ${error.message}`
          );
        });
      }

      if (result.warnings.length > 0 && options.detailed) {
        console.log(`\n⚠️  Warnings (${result.warnings.length}):`);
        result.warnings.forEach((warning) => {
          console.log(
            `  - ${warning.table}${warning.column ? `.${warning.column}` : ''}: ${warning.message}`
          );
          if (warning.suggestion) {
            console.log(`    💡 ${warning.suggestion}`);
          }
        });
      }

      if (!result.valid) {
        process.exit(1);
      }
    } catch (error) {
      console.error('❌ Validation failed:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await validator.close();
    }
  });

// Reset command (development only)
program
  .command('reset')
  .description('Reset database (migrations + seeding)')
  .option(
    '-e, --env <environment>',
    'Environment (development, testing only)',
    'development'
  )
  .option('--confirm', 'Confirm the destructive operation')
  .action(async (options) => {
    if (!['development', 'testing'].includes(options.env)) {
      console.error(
        '❌ Reset is only allowed for development and testing environments'
      );
      process.exit(1);
    }

    if (!options.confirm) {
      console.error(
        '❌ This is a destructive operation. Use --confirm flag to proceed'
      );
      process.exit(1);
    }

    console.log(`🔄 Resetting database for environment: ${options.env}`);

    // Clear data
    const seedManager = new SeedManager(options.env);
    try {
      await seedManager.initialize();
      await seedManager.clearEnvironment();
      console.log('✅ Data cleared');
    } catch (error) {
      console.error('❌ Failed to clear data:', getErrorMessage(error));
    } finally {
      await seedManager.close();
    }

    // Run migrations
    const migrationManager = new MigrationManager();
    try {
      await migrationManager.initialize();
      await migrationManager.migrate();
      console.log('✅ Migrations applied');
    } catch (error) {
      console.error('❌ Failed to apply migrations:', getErrorMessage(error));
      process.exit(1);
    } finally {
      await migrationManager.close();
    }

    // Run seeds
    const newSeedManager = new SeedManager(options.env);
    try {
      await newSeedManager.initialize();
      await newSeedManager.seed();
      console.log('✅ Seeds applied');
    } catch (error) {
      console.error('❌ Failed to apply seeds:', getErrorMessage(error));
    } finally {
      await newSeedManager.close();
    }

    console.log('🎉 Database reset completed successfully');
  });

// Error handling
program.configureOutput({
  writeErr: (str) => process.stderr.write(`❌ ${str}`),
});

program.exitOverride((err) => {
  if (err.code === 'commander.help') {
    process.exit(0);
  }
  process.exit(1);
});

// Parse command line arguments
if (require.main === module) {
  program.parse();
}

export { program };
