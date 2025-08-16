export interface BackupConfig {
  storage: {
    localPath: string;
    remoteStorage?: {
      type: 'aws-s3' | 'azure-blob' | 'gcp-storage';
      bucket: string;
      region?: string | undefined;
      credentials: {
        accessKey?: string | undefined;
        secretKey?: string | undefined;
        connectionString?: string | undefined;
      };
    } | undefined;
  };

  postgres: {
    connectionString: string;
    backupPath: string;
    pgDumpPath?: string | undefined;
    pgRestorePath?: string | undefined;
    walArchivePath?: string | undefined;
    compression: {
      enabled: boolean;
      level: number;
    };
  };

  redis: {
    host: string;
    port: number;
    password?: string | undefined;
    backupPath: string;
    rdbPath?: string | undefined;
    compression: {
      enabled: boolean;
      level: number;
    };
  };

  encryption?: {
    enabled: boolean;
    algorithm: string;
    keyPath: string;
  } | undefined;

  schedule: {
    enabled: boolean;
    interval: string; // e.g., '6h', '1d', '30m'
    type: 'full' | 'incremental';
  };

  retention: {
    days: number;
    maxBackups: number;
  };

  crossRegion?: {
    enabled: boolean;
    regions: string[];
    replicationDelay: number;
  } | undefined;
}

export interface BackupResult {
  type: BackupType;
  filePath: string;
  size: number;
  duration: number;
  checksum?: string;
  compressed: boolean;
  encrypted: boolean;
  createdAt: Date;
}

export type BackupType = 'postgres' | 'redis' | 'full' | 'incremental';

export interface BackupOptions {
  backupId: string;
  type: 'full' | 'incremental';
  compression: boolean;
  encryption: boolean;
}

export interface RestoreOptions {
  stopServices?: boolean;
  dropExisting?: boolean;
  flushExisting?: boolean;
  targetDatabase?: string;
  restorePostgres?: boolean;
  restoreRedis?: boolean;
}

export interface DisasterRecoveryPlan {
  id: string;
  name: string;
  description: string;
  priority: 'critical' | 'high' | 'medium' | 'low';

  triggers: {
    type: 'manual' | 'automatic';
    conditions?: string[];
  };

  steps: DisasterRecoveryStep[];

  validation: {
    healthChecks: string[];
    dataIntegrityChecks: string[];
  };

  rollback: {
    enabled: boolean;
    steps: DisasterRecoveryStep[];
  };

  notifications: {
    channels: ('email' | 'slack' | 'webhook')[];
    recipients: string[];
  };
}

// Base interface for step configuration
export interface BaseStepConfig {
  [key: string]: any;
}

// Specific step configuration interfaces
export interface BackupStepConfig extends BaseStepConfig {
  type?: 'full' | 'incremental';
}

export interface RestoreStepConfig extends BaseStepConfig {
  backupId?: string;
  restoreOptions?: RestoreOptions;
}

export interface FailoverStepConfig extends BaseStepConfig {
  targetRegion?: string;
  failoverType?: 'automatic' | 'manual';
}

export interface ValidationStepConfig extends BaseStepConfig {
  validations?: ValidationCheck[];
}

export interface NotificationStepConfig extends BaseStepConfig {
  message?: string;
  channels?: ('email' | 'slack' | 'webhook')[];
}

export interface ValidationCheck {
  name: string;
  type: 'health' | 'functional' | 'data-integrity';
  timeout?: number;
  retries?: number;
}

// Union type for step configuration
export type StepConfig = 
  | BackupStepConfig 
  | RestoreStepConfig 
  | FailoverStepConfig 
  | ValidationStepConfig 
  | NotificationStepConfig;

export interface DisasterRecoveryStep {
  id: string;
  name: string;
  description: string;
  type: 'backup' | 'restore' | 'failover' | 'validation' | 'notification';
  order: number;

  config: StepConfig;

  timeout: number;
  retries: number;

  dependencies?: string[];

  validation?: {
    command?: string;
    expectedResult?: any;
  };
}

export interface CrossRegionReplication {
  sourceRegion: string;
  targetRegions: string[];
  replicationMode: 'sync' | 'async';
  conflictResolution: 'source-wins' | 'timestamp' | 'manual';
}

export interface BackupMetrics {
  totalBackups: number;
  successfulBackups: number;
  failedBackups: number;
  averageBackupTime: number;
  averageBackupSize: number;
  lastBackupTime: Date;
  nextScheduledBackup: Date;
  storageUsed: number;
  storageAvailable: number;
}

export interface RestoreMetrics {
  totalRestores: number;
  successfulRestores: number;
  failedRestores: number;
  averageRestoreTime: number;
  lastRestoreTime: Date;
  dataIntegrityScore: number;
}
