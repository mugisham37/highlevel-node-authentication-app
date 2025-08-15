export { BackupManager } from './backup-manager';
export { PostgresBackupService } from './postgres-backup-service';
export { RedisBackupService } from './redis-backup-service';
export { DisasterRecoveryManager } from './disaster-recovery';
export { CrossRegionReplicationManager } from './cross-region-replication';
export {
  createBackupConfig,
  validateBackupConfig,
  getEnvironmentBackupConfig,
} from './config';

export type {
  BackupConfig,
  BackupResult,
  BackupType,
  BackupOptions,
  RestoreOptions,
  DisasterRecoveryPlan,
  DisasterRecoveryStep,
  CrossRegionReplication,
  BackupMetrics,
  RestoreMetrics,
} from './types';

// Re-export PostgreSQL and Redis specific types
export type {
  PostgresBackupConfig,
  PostgresRestoreOptions,
} from './postgres-backup-service';

export type {
  RedisBackupConfig,
  RedisRestoreOptions,
} from './redis-backup-service';
