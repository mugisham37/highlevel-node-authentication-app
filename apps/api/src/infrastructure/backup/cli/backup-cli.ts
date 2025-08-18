#!/usr/bin/env node

import {
  createDatabaseConfig,
  DatabaseConnectionManager,
} from '@company/database';
import { Command } from 'commander';
import { createLogger } from '../../logging';
import { BackupManager } from '../backup-manager';
import { createBackupConfig, validateBackupConfig } from '../config';
import { CrossRegionReplicationManager } from '../cross-region-replication';
import { DisasterRecoveryManager } from '../disaster-recovery';

const program = new Command();

// Initialize services
let backupManager: BackupManager;
let disasterRecoveryManager: DisasterRecoveryManager;
let crossRegionManager: CrossRegionReplicationManager;
let logger: any;

async function initializeServices(): Promise<void> {
  try {
    // Create logger
    logger = createLogger('backup-cli');

    // Create and validate backup configuration
    const backupConfig = createBackupConfig();
    validateBackupConfig(backupConfig);

    // Initialize database connection manager
    const dbConfig = createDatabaseConfig();
    const dbManager = new DatabaseConnectionManager(dbConfig, logger);

    // Initialize backup manager
    backupManager = new BackupManager(backupConfig, dbManager, logger);
    await backupManager.initialize();

    // Initialize disaster recovery manager
    disasterRecoveryManager = new DisasterRecoveryManager(
      backupManager,
      backupConfig,
      logger
    );
    await disasterRecoveryManager.initialize();

    // Initialize cross-region replication manager
    crossRegionManager = new CrossRegionReplicationManager(
      backupManager,
      backupConfig,
      logger
    );
    await crossRegionManager.initialize();

    logger.info('Backup CLI services initialized successfully');
  } catch (error) {
    console.error('Failed to initialize backup CLI services:', error);
    process.exit(1);
  }
}

// Backup commands
program
  .command('backup')
  .description('Backup management commands')
  .addCommand(
    new Command('full').description('Create a full backup').action(async () => {
      await initializeServices();
      try {
        console.log('Starting full backup...');
        const results = await backupManager.performFullBackup();

        console.log('Full backup completed successfully:');
        results.forEach((result) => {
          console.log(
            `  - ${result.type}: ${result.filePath} (${formatBytes(result.size)})`
          );
        });
      } catch (error) {
        console.error('Full backup failed:', error);
        process.exit(1);
      }
    })
  )
  .addCommand(
    new Command('incremental')
      .description('Create an incremental backup')
      .action(async () => {
        await initializeServices();
        try {
          console.log('Starting incremental backup...');
          const results = await backupManager.performIncrementalBackup();

          console.log('Incremental backup completed successfully:');
          results.forEach((result) => {
            console.log(
              `  - ${result.type}: ${result.filePath} (${formatBytes(result.size)})`
            );
          });
        } catch (error) {
          console.error('Incremental backup failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('list')
      .description('List available backups')
      .option('-n, --limit <number>', 'Limit number of backups to show', '10')
      .action(async (options) => {
        await initializeServices();
        try {
          const backups = await backupManager.listBackups();
          const limit = parseInt(options.limit);
          const displayBackups = backups.slice(0, limit);

          if (displayBackups.length === 0) {
            console.log('No backups found');
            return;
          }

          console.log(
            `Available backups (showing ${displayBackups.length} of ${backups.length}):`
          );
          console.log('');

          displayBackups.forEach((backup) => {
            console.log(`Backup ID: ${backup.backupId}`);
            console.log(
              `  Created: ${new Date(backup.createdAt).toLocaleString()}`
            );
            console.log(`  Type: ${backup.type}`);
            console.log(`  Components:`);
            backup.backups.forEach((component: any) => {
              console.log(
                `    - ${component.type}: ${formatBytes(component.size)}`
              );
            });
            console.log('');
          });
        } catch (error) {
          console.error('Failed to list backups:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('cleanup')
      .description('Clean up old backups based on retention policy')
      .action(async () => {
        await initializeServices();
        try {
          console.log('Cleaning up old backups...');
          await backupManager.cleanupOldBackups();
          console.log('Backup cleanup completed successfully');
        } catch (error) {
          console.error('Backup cleanup failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('test')
      .description('Test backup and restore procedures')
      .action(async () => {
        await initializeServices();
        try {
          console.log('Testing backup and restore procedures...');
          const success = await backupManager.testBackupRestore();

          if (success) {
            console.log('Backup/restore test completed successfully');
          } else {
            console.log('Backup/restore test failed');
            process.exit(1);
          }
        } catch (error) {
          console.error('Backup/restore test failed:', error);
          process.exit(1);
        }
      })
  );

// Restore commands
program
  .command('restore')
  .description('Restore from backup')
  .argument('<backup-id>', 'Backup ID to restore from')
  .option('--postgres', 'Restore PostgreSQL only')
  .option('--redis', 'Restore Redis only')
  .option('--drop-existing', 'Drop existing data before restore')
  .option('--flush-existing', 'Flush existing Redis data before restore')
  .option(
    '--target-database <name>',
    'Target database name for PostgreSQL restore'
  )
  .option('--stop-services', 'Stop application services during restore')
  .action(async (backupId, options) => {
    await initializeServices();
    try {
      console.log(`Starting restore from backup: ${backupId}`);

      const restoreOptions = {
        restorePostgres: !options.redis,
        restoreRedis: !options.postgres,
        dropExisting: options.dropExisting,
        flushExisting: options.flushExisting,
        targetDatabase: options.targetDatabase,
        stopServices: options.stopServices,
      };

      await backupManager.restoreFromBackup(backupId, restoreOptions);
      console.log('Restore completed successfully');
    } catch (error) {
      console.error('Restore failed:', error);
      process.exit(1);
    }
  });

// Disaster recovery commands
program
  .command('disaster-recovery')
  .alias('dr')
  .description('Disaster recovery management')
  .addCommand(
    new Command('list-plans')
      .description('List available disaster recovery plans')
      .action(async () => {
        await initializeServices();
        try {
          const plans = disasterRecoveryManager.listRecoveryPlans();

          if (plans.length === 0) {
            console.log('No disaster recovery plans found');
            return;
          }

          console.log('Available disaster recovery plans:');
          console.log('');

          plans.forEach((plan) => {
            console.log(`Plan ID: ${plan.id}`);
            console.log(`  Name: ${plan.name}`);
            console.log(`  Description: ${plan.description}`);
            console.log(`  Priority: ${plan.priority}`);
            console.log(`  Steps: ${plan.steps.length}`);
            console.log('');
          });
        } catch (error) {
          console.error('Failed to list disaster recovery plans:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('execute')
      .description('Execute a disaster recovery plan')
      .argument('<plan-id>', 'Disaster recovery plan ID')
      .option('--backup-id <id>', 'Specific backup ID to use for restore')
      .action(async (planId, options) => {
        await initializeServices();
        try {
          console.log(`Executing disaster recovery plan: ${planId}`);

          await disasterRecoveryManager.executeRecoveryPlan(planId, {
            backupId: options.backupId,
          });

          console.log('Disaster recovery plan executed successfully');
        } catch (error) {
          console.error('Disaster recovery plan execution failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('test')
      .description('Test disaster recovery procedures')
      .action(async () => {
        await initializeServices();
        try {
          console.log('Testing disaster recovery procedures...');
          const success =
            await disasterRecoveryManager.testRecoveryProcedures();

          if (success) {
            console.log('Disaster recovery test completed successfully');
          } else {
            console.log('Disaster recovery test failed');
            process.exit(1);
          }
        } catch (error) {
          console.error('Disaster recovery test failed:', error);
          process.exit(1);
        }
      })
  );

// Cross-region replication commands
program
  .command('replication')
  .description('Cross-region replication management')
  .addCommand(
    new Command('status')
      .description('Show replication status')
      .action(async () => {
        await initializeServices();
        try {
          const metrics = crossRegionManager.getMetrics();
          const targets = crossRegionManager.getTargetsStatus();

          console.log('Cross-Region Replication Status:');
          console.log('');
          console.log('Metrics:');
          console.log(`  Total Replications: ${metrics.totalReplications}`);
          console.log(`  Successful: ${metrics.successfulReplications}`);
          console.log(`  Failed: ${metrics.failedReplications}`);
          console.log(`  Average Time: ${metrics.averageReplicationTime}ms`);
          console.log(`  Current Lag: ${metrics.currentLag}ms`);
          console.log(
            `  Last Replication: ${metrics.lastReplicationTime?.toLocaleString() || 'Never'}`
          );
          console.log('');

          console.log('Replication Targets:');
          targets.forEach((target) => {
            console.log(`  Region: ${target.region}`);
            console.log(`    Status: ${target.status}`);
            console.log(`    Endpoint: ${target.endpoint}`);
            console.log(
              `    Last Sync: ${target.lastSync?.toLocaleString() || 'Never'}`
            );
            console.log(`    Lag: ${target.lag}ms`);
            console.log('');
          });
        } catch (error) {
          console.error('Failed to get replication status:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('sync')
      .description('Force sync to all replication targets')
      .action(async () => {
        await initializeServices();
        try {
          console.log('Starting forced sync to all targets...');
          await crossRegionManager.forceSyncToAllTargets();
          console.log('Forced sync completed successfully');
        } catch (error) {
          console.error('Forced sync failed:', error);
          process.exit(1);
        }
      })
  );

// Configuration commands
program
  .command('config')
  .description('Configuration management')
  .addCommand(
    new Command('validate')
      .description('Validate backup configuration')
      .action(async () => {
        try {
          const config = createBackupConfig();
          validateBackupConfig(config);
          console.log('Backup configuration is valid');
        } catch (error) {
          console.error('Backup configuration validation failed:', error);
          process.exit(1);
        }
      })
  )
  .addCommand(
    new Command('show')
      .description('Show current backup configuration')
      .action(async () => {
        try {
          const config = createBackupConfig();
          console.log('Current Backup Configuration:');
          console.log(JSON.stringify(config, null, 2));
        } catch (error) {
          console.error('Failed to show backup configuration:', error);
          process.exit(1);
        }
      })
  );

// Utility functions
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Error handling
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  process.exit(1);
});

// Graceful shutdown
process.on('SIGINT', async () => {
  console.log('\nShutting down backup CLI...');

  if (backupManager) {
    await backupManager.shutdown();
  }

  if (disasterRecoveryManager) {
    await disasterRecoveryManager.shutdown();
  }

  if (crossRegionManager) {
    await crossRegionManager.shutdown();
  }

  process.exit(0);
});

// Parse command line arguments
program
  .name('backup-cli')
  .description(
    'Enterprise Authentication Backend - Backup and Disaster Recovery CLI'
  )
  .version('1.0.0');

program.parse();
