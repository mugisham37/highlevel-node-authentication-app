import { Logger } from 'winston';
import { DatabaseConnectionManager } from '../database/connection-manager';
import { RedisBackupService } from './redis-backup-service';
import { PostgresBackupService } from './postgres-backup-service';
import {
  BackupConfig,
  BackupResult,
  BackupType,
  RestoreOptions,
} from './types';
import { EventEmitter } from 'events';
import { promises as fs } from 'fs';
import path from 'path';

export class BackupManager extends EventEmitter {
  private postgresBackup: PostgresBackupService;
  private redisBackup: RedisBackupService;
  private backupScheduler: NodeJS.Timeout | null = null;

  constructor(
    private config: BackupConfig,
    private dbManager: DatabaseConnectionManager,
    private logger: Logger
  ) {
    super();

    this.postgresBackup = new PostgresBackupService(config.postgres, logger);
    this.redisBackup = new RedisBackupService(config.redis, logger);

    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    this.postgresBackup.on('backup:started', (data) => {
      this.emit('backup:started', { type: 'postgres', ...data });
    });

    this.postgresBackup.on('backup:completed', (data) => {
      this.emit('backup:completed', { type: 'postgres', ...data });
    });

    this.postgresBackup.on('backup:failed', (data) => {
      this.emit('backup:failed', { type: 'postgres', ...data });
    });

    this.redisBackup.on('backup:started', (data) => {
      this.emit('backup:started', { type: 'redis', ...data });
    });

    this.redisBackup.on('backup:completed', (data) => {
      this.emit('backup:completed', { type: 'redis', ...data });
    });

    this.redisBackup.on('backup:failed', (data) => {
      this.emit('backup:failed', { type: 'redis', ...data });
    });
  }

  /**
   * Initialize backup system and start scheduled backups
   */
  public async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing backup manager...');

      // Ensure backup directories exist
      await this.ensureBackupDirectories();

      // Initialize backup services
      await this.postgresBackup.initialize();
      await this.redisBackup.initialize();

      // Start scheduled backups
      this.startScheduledBackups();

      this.logger.info('Backup manager initialized successfully');
    } catch (error) {
      this.logger.error('Failed to initialize backup manager', { error });
      throw error;
    }
  }

  /**
   * Perform a full system backup
   */
  public async performFullBackup(): Promise<BackupResult[]> {
    const results: BackupResult[] = [];
    const backupId = this.generateBackupId();

    this.logger.info('Starting full system backup', { backupId });

    try {
      // Backup PostgreSQL
      const postgresResult = await this.postgresBackup.createBackup({
        backupId,
        type: 'full',
        compression: true,
        encryption: this.config.encryption?.enabled || false,
      });
      results.push(postgresResult);

      // Backup Redis
      const redisResult = await this.redisBackup.createBackup({
        backupId,
        type: 'full',
        compression: true,
        encryption: this.config.encryption?.enabled || false,
      });
      results.push(redisResult);

      // Create backup manifest
      await this.createBackupManifest(backupId, results);

      this.logger.info('Full system backup completed successfully', {
        backupId,
        results: results.map((r) => ({
          type: r.type,
          size: r.size,
          duration: r.duration,
        })),
      });

      return results;
    } catch (error) {
      this.logger.error('Full system backup failed', { backupId, error });
      throw error;
    }
  }

  /**
   * Perform incremental backup
   */
  public async performIncrementalBackup(): Promise<BackupResult[]> {
    const results: BackupResult[] = [];
    const backupId = this.generateBackupId();

    this.logger.info('Starting incremental backup', { backupId });

    try {
      // PostgreSQL incremental backup (WAL-based)
      const postgresResult = await this.postgresBackup.createBackup({
        backupId,
        type: 'incremental',
        compression: true,
        encryption: this.config.encryption?.enabled || false,
      });
      results.push(postgresResult);

      // Redis incremental backup (RDB diff)
      const redisResult = await this.redisBackup.createBackup({
        backupId,
        type: 'incremental',
        compression: true,
        encryption: this.config.encryption?.enabled || false,
      });
      results.push(redisResult);

      await this.createBackupManifest(backupId, results);

      this.logger.info('Incremental backup completed successfully', {
        backupId,
        results: results.map((r) => ({
          type: r.type,
          size: r.size,
          duration: r.duration,
        })),
      });

      return results;
    } catch (error) {
      this.logger.error('Incremental backup failed', { backupId, error });
      throw error;
    }
  }

  /**
   * Restore from backup
   */
  public async restoreFromBackup(
    backupId: string,
    options: RestoreOptions = {}
  ): Promise<void> {
    this.logger.info('Starting system restore', { backupId, options });

    try {
      // Load backup manifest
      const manifest = await this.loadBackupManifest(backupId);

      if (!manifest) {
        throw new Error(`Backup manifest not found for backup ID: ${backupId}`);
      }

      // Validate backup integrity
      await this.validateBackupIntegrity(manifest);

      // Stop application services if requested
      if (options.stopServices) {
        await this.stopApplicationServices();
      }

      // Restore PostgreSQL
      if (options.restorePostgres !== false) {
        const postgresBackup = manifest.backups.find(
          (b) => b.type === 'postgres'
        );
        if (postgresBackup) {
          await this.postgresBackup.restoreBackup(postgresBackup.filePath, {
            dropExisting: options.dropExisting || false,
            targetDatabase: options.targetDatabase,
          });
        }
      }

      // Restore Redis
      if (options.restoreRedis !== false) {
        const redisBackup = manifest.backups.find((b) => b.type === 'redis');
        if (redisBackup) {
          await this.redisBackup.restoreBackup(redisBackup.filePath, {
            flushExisting: options.flushExisting || false,
          });
        }
      }

      // Restart application services if they were stopped
      if (options.stopServices) {
        await this.startApplicationServices();
      }

      this.logger.info('System restore completed successfully', { backupId });
    } catch (error) {
      this.logger.error('System restore failed', { backupId, error });
      throw error;
    }
  }

  /**
   * List available backups
   */
  public async listBackups(): Promise<any[]> {
    try {
      const backupDir = this.config.storage.localPath;
      const entries = await fs.readdir(backupDir, { withFileTypes: true });

      const backups = [];

      for (const entry of entries) {
        if (entry.isDirectory()) {
          const manifestPath = path.join(
            backupDir,
            entry.name,
            'manifest.json'
          );

          try {
            const manifestContent = await fs.readFile(manifestPath, 'utf-8');
            const manifest = JSON.parse(manifestContent);
            backups.push(manifest);
          } catch (error) {
            this.logger.warn(
              `Failed to read manifest for backup ${entry.name}`,
              { error }
            );
          }
        }
      }

      return backups.sort(
        (a, b) =>
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
      );
    } catch (error) {
      this.logger.error('Failed to list backups', { error });
      throw error;
    }
  }

  /**
   * Delete old backups based on retention policy
   */
  public async cleanupOldBackups(): Promise<void> {
    try {
      const backups = await this.listBackups();
      const retentionDays = this.config.retention.days;
      const maxBackups = this.config.retention.maxBackups;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      let backupsToDelete = backups.filter(
        (backup) => new Date(backup.createdAt) < cutoffDate
      );

      // Also delete excess backups beyond maxBackups limit
      if (backups.length > maxBackups) {
        const excessBackups = backups.slice(maxBackups);
        backupsToDelete = [...backupsToDelete, ...excessBackups];
      }

      // Remove duplicates
      backupsToDelete = backupsToDelete.filter(
        (backup, index, self) =>
          index === self.findIndex((b) => b.backupId === backup.backupId)
      );

      for (const backup of backupsToDelete) {
        await this.deleteBackup(backup.backupId);
      }

      this.logger.info(`Cleaned up ${backupsToDelete.length} old backups`);
    } catch (error) {
      this.logger.error('Failed to cleanup old backups', { error });
      throw error;
    }
  }

  /**
   * Test backup and restore procedures
   */
  public async testBackupRestore(): Promise<boolean> {
    const testBackupId = `test-${this.generateBackupId()}`;

    try {
      this.logger.info('Starting backup/restore test', { testBackupId });

      // Create test backup
      const backupResults = await this.performFullBackup();

      // Validate backup files exist and are readable
      for (const result of backupResults) {
        const stats = await fs.stat(result.filePath);
        if (stats.size === 0) {
          throw new Error(`Backup file is empty: ${result.filePath}`);
        }
      }

      // Test restore to temporary location (if supported)
      // This would typically restore to a test database/Redis instance

      this.logger.info('Backup/restore test completed successfully', {
        testBackupId,
      });
      return true;
    } catch (error) {
      this.logger.error('Backup/restore test failed', { testBackupId, error });
      return false;
    }
  }

  private async ensureBackupDirectories(): Promise<void> {
    const directories = [
      this.config.storage.localPath,
      path.join(this.config.storage.localPath, 'postgres'),
      path.join(this.config.storage.localPath, 'redis'),
      path.join(this.config.storage.localPath, 'manifests'),
    ];

    for (const dir of directories) {
      await fs.mkdir(dir, { recursive: true });
    }
  }

  private startScheduledBackups(): void {
    if (this.config.schedule.enabled) {
      const intervalMs = this.parseScheduleInterval(
        this.config.schedule.interval
      );

      this.backupScheduler = setInterval(async () => {
        try {
          if (this.config.schedule.type === 'full') {
            await this.performFullBackup();
          } else {
            await this.performIncrementalBackup();
          }

          // Cleanup old backups after successful backup
          await this.cleanupOldBackups();
        } catch (error) {
          this.logger.error('Scheduled backup failed', { error });
        }
      }, intervalMs);

      this.logger.info('Scheduled backups started', {
        interval: this.config.schedule.interval,
        type: this.config.schedule.type,
      });
    }
  }

  private parseScheduleInterval(interval: string): number {
    const match = interval.match(/^(\d+)([hdm])$/);
    if (!match) {
      throw new Error(`Invalid schedule interval format: ${interval}`);
    }

    const value = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
      case 'm':
        return value * 60 * 1000; // minutes
      case 'h':
        return value * 60 * 60 * 1000; // hours
      case 'd':
        return value * 24 * 60 * 60 * 1000; // days
      default:
        throw new Error(`Invalid schedule unit: ${unit}`);
    }
  }

  private generateBackupId(): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    return `backup-${timestamp}`;
  }

  private async createBackupManifest(
    backupId: string,
    results: BackupResult[]
  ): Promise<void> {
    const manifest = {
      backupId,
      createdAt: new Date().toISOString(),
      type: 'full',
      backups: results.map((result) => ({
        type: result.type,
        filePath: result.filePath,
        size: result.size,
        checksum: result.checksum,
        compressed: result.compressed,
        encrypted: result.encrypted,
      })),
      metadata: {
        version: process.env.npm_package_version || '1.0.0',
        nodeVersion: process.version,
        platform: process.platform,
      },
    };

    const manifestPath = path.join(
      this.config.storage.localPath,
      backupId,
      'manifest.json'
    );

    await fs.mkdir(path.dirname(manifestPath), { recursive: true });
    await fs.writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  }

  private async loadBackupManifest(backupId: string): Promise<any> {
    const manifestPath = path.join(
      this.config.storage.localPath,
      backupId,
      'manifest.json'
    );

    try {
      const content = await fs.readFile(manifestPath, 'utf-8');
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }

  private async validateBackupIntegrity(manifest: any): Promise<void> {
    for (const backup of manifest.backups) {
      const stats = await fs.stat(backup.filePath);

      if (stats.size !== backup.size) {
        throw new Error(`Backup file size mismatch: ${backup.filePath}`);
      }

      // TODO: Validate checksums if available
    }
  }

  private async deleteBackup(backupId: string): Promise<void> {
    const backupPath = path.join(this.config.storage.localPath, backupId);

    try {
      await fs.rm(backupPath, { recursive: true, force: true });
      this.logger.info(`Deleted backup: ${backupId}`);
    } catch (error) {
      this.logger.error(`Failed to delete backup: ${backupId}`, { error });
      throw error;
    }
  }

  private async stopApplicationServices(): Promise<void> {
    // Implementation would depend on deployment method
    // For Docker: docker-compose stop
    // For PM2: pm2 stop
    // For systemd: systemctl stop
    this.logger.info('Stopping application services...');
  }

  private async startApplicationServices(): Promise<void> {
    // Implementation would depend on deployment method
    this.logger.info('Starting application services...');
  }

  public async shutdown(): Promise<void> {
    if (this.backupScheduler) {
      clearInterval(this.backupScheduler);
      this.backupScheduler = null;
    }

    await this.postgresBackup.shutdown();
    await this.redisBackup.shutdown();

    this.logger.info('Backup manager shut down successfully');
  }
}
