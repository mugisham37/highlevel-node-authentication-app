import { BackupConfig } from './types';
import path from 'path';

export function createBackupConfig(): BackupConfig {
  const backupBasePath = process.env.BACKUP_PATH || './backups';

  return {
    storage: {
      localPath: backupBasePath,
      remoteStorage:
        process.env.REMOTE_STORAGE_ENABLED === 'true'
          ? {
              type: (process.env.REMOTE_STORAGE_TYPE as any) || 'aws-s3',
              bucket:
                process.env.REMOTE_STORAGE_BUCKET || 'enterprise-auth-backups',
              region: process.env.REMOTE_STORAGE_REGION || 'us-east-1',
              credentials: {
                accessKey: process.env.REMOTE_STORAGE_ACCESS_KEY,
                secretKey: process.env.REMOTE_STORAGE_SECRET_KEY,
                connectionString: process.env.REMOTE_STORAGE_CONNECTION_STRING,
              },
            }
          : undefined,
    },

    postgres: {
      connectionString:
        process.env.DATABASE_URL ||
        'postgresql://auth_user:auth_password@localhost:5432/enterprise_auth',
      backupPath: path.join(backupBasePath, 'postgres'),
      pgDumpPath: process.env.PG_DUMP_PATH || 'pg_dump',
      pgRestorePath: process.env.PG_RESTORE_PATH || 'pg_restore',
      walArchivePath:
        process.env.WAL_ARCHIVE_PATH || path.join(backupBasePath, 'wal'),
      compression: {
        enabled: process.env.BACKUP_COMPRESSION_ENABLED !== 'false',
        level: parseInt(process.env.BACKUP_COMPRESSION_LEVEL || '6'),
      },
    },

    redis: {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      backupPath: path.join(backupBasePath, 'redis'),
      rdbPath: process.env.REDIS_RDB_PATH || '/data/dump.rdb',
      compression: {
        enabled: process.env.BACKUP_COMPRESSION_ENABLED !== 'false',
        level: parseInt(process.env.BACKUP_COMPRESSION_LEVEL || '6'),
      },
    },

    encryption:
      process.env.BACKUP_ENCRYPTION_ENABLED === 'true'
        ? {
            enabled: true,
            algorithm: process.env.BACKUP_ENCRYPTION_ALGORITHM || 'aes-256-gcm',
            keyPath:
              process.env.BACKUP_ENCRYPTION_KEY_PATH ||
              './config/backup-encryption.key',
          }
        : undefined,

    schedule: {
      enabled: process.env.BACKUP_SCHEDULE_ENABLED !== 'false',
      interval: process.env.BACKUP_SCHEDULE_INTERVAL || '6h',
      type:
        (process.env.BACKUP_SCHEDULE_TYPE as 'full' | 'incremental') ||
        'incremental',
    },

    retention: {
      days: parseInt(process.env.BACKUP_RETENTION_DAYS || '30'),
      maxBackups: parseInt(process.env.BACKUP_MAX_COUNT || '100'),
    },

    crossRegion:
      process.env.CROSS_REGION_REPLICATION_ENABLED === 'true'
        ? {
            enabled: true,
            regions: (process.env.CROSS_REGION_TARGETS || '')
              .split(',')
              .filter(Boolean),
            replicationDelay: parseInt(process.env.CROSS_REGION_DELAY || '300'),
          }
        : undefined,
  };
}

export const defaultBackupConfig: Partial<BackupConfig> = {
  storage: {
    localPath: './backups',
  },

  postgres: {
    compression: {
      enabled: true,
      level: 6,
    },
  },

  redis: {
    compression: {
      enabled: true,
      level: 6,
    },
  },

  schedule: {
    enabled: true,
    interval: '6h',
    type: 'incremental',
  },

  retention: {
    days: 30,
    maxBackups: 100,
  },
};

/**
 * Validate backup configuration
 */
export function validateBackupConfig(config: BackupConfig): void {
  // Validate storage configuration
  if (!config.storage.localPath) {
    throw new Error('Local backup path is required');
  }

  // Validate PostgreSQL configuration
  if (!config.postgres.connectionString) {
    throw new Error('PostgreSQL connection string is required');
  }

  if (!config.postgres.backupPath) {
    throw new Error('PostgreSQL backup path is required');
  }

  // Validate Redis configuration
  if (!config.redis.host) {
    throw new Error('Redis host is required');
  }

  if (!config.redis.port || config.redis.port <= 0) {
    throw new Error('Valid Redis port is required');
  }

  if (!config.redis.backupPath) {
    throw new Error('Redis backup path is required');
  }

  // Validate schedule configuration
  if (config.schedule.enabled) {
    const intervalPattern = /^(\d+)([hdm])$/;
    if (!intervalPattern.test(config.schedule.interval)) {
      throw new Error(
        'Invalid schedule interval format. Use format like "6h", "30m", "1d"'
      );
    }

    if (!['full', 'incremental'].includes(config.schedule.type)) {
      throw new Error('Schedule type must be "full" or "incremental"');
    }
  }

  // Validate retention configuration
  if (config.retention.days <= 0) {
    throw new Error('Retention days must be greater than 0');
  }

  if (config.retention.maxBackups <= 0) {
    throw new Error('Max backups must be greater than 0');
  }

  // Validate encryption configuration
  if (config.encryption?.enabled) {
    if (!config.encryption.keyPath) {
      throw new Error(
        'Encryption key path is required when encryption is enabled'
      );
    }

    const supportedAlgorithms = ['aes-256-gcm', 'aes-256-cbc', 'aes-192-gcm'];
    if (!supportedAlgorithms.includes(config.encryption.algorithm)) {
      throw new Error(
        `Unsupported encryption algorithm: ${config.encryption.algorithm}`
      );
    }
  }

  // Validate remote storage configuration
  if (config.storage.remoteStorage) {
    const { type, bucket, credentials } = config.storage.remoteStorage;

    if (!['aws-s3', 'azure-blob', 'gcp-storage'].includes(type)) {
      throw new Error(`Unsupported remote storage type: ${type}`);
    }

    if (!bucket) {
      throw new Error('Remote storage bucket is required');
    }

    if (
      type === 'aws-s3' &&
      (!credentials.accessKey || !credentials.secretKey)
    ) {
      throw new Error('AWS S3 requires access key and secret key');
    }

    if (type === 'azure-blob' && !credentials.connectionString) {
      throw new Error('Azure Blob Storage requires connection string');
    }
  }

  // Validate cross-region configuration
  if (config.crossRegion?.enabled) {
    if (
      !config.crossRegion.regions ||
      config.crossRegion.regions.length === 0
    ) {
      throw new Error('Cross-region replication requires target regions');
    }

    if (config.crossRegion.replicationDelay < 0) {
      throw new Error('Cross-region replication delay must be non-negative');
    }
  }
}

/**
 * Get environment-specific backup configuration
 */
export function getEnvironmentBackupConfig(): BackupConfig {
  const config = createBackupConfig();

  // Override settings based on environment
  const nodeEnv = process.env.NODE_ENV || 'development';

  switch (nodeEnv) {
    case 'production':
      // Production settings
      config.schedule.interval = '4h'; // More frequent backups
      config.retention.days = 90; // Longer retention
      config.retention.maxBackups = 500;
      break;

    case 'staging':
      // Staging settings
      config.schedule.interval = '12h';
      config.retention.days = 14;
      config.retention.maxBackups = 50;
      break;

    case 'development':
      // Development settings
      config.schedule.enabled = false; // Disable scheduled backups
      config.retention.days = 7;
      config.retention.maxBackups = 10;
      break;

    case 'test':
      // Test settings
      config.schedule.enabled = false;
      config.retention.days = 1;
      config.retention.maxBackups = 5;
      break;
  }

  return config;
}
