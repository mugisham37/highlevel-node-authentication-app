import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { spawn } from 'child_process';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import { BackupResult, BackupOptions } from './types';

export interface PostgresBackupConfig {
  connectionString: string;
  backupPath: string;
  pgDumpPath?: string;
  pgRestorePath?: string;
  walArchivePath?: string;
  compression: {
    enabled: boolean;
    level: number;
  };
}

export interface PostgresRestoreOptions {
  dropExisting?: boolean;
  targetDatabase?: string | undefined;
}

export class PostgresBackupService extends EventEmitter {
  private pgDumpPath: string;
  private pgRestorePath: string;

  constructor(
    private config: PostgresBackupConfig,
    private logger: Logger
  ) {
    super();

    this.pgDumpPath = config.pgDumpPath || 'pg_dump';
    this.pgRestorePath = config.pgRestorePath || 'pg_restore';
  }

  public async initialize(): Promise<void> {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.config.backupPath, { recursive: true });

      // Verify pg_dump and pg_restore are available
      await this.verifyPostgresTools();

      this.logger.info('PostgreSQL backup service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize PostgreSQL backup service', {
        error,
      });
      throw error;
    }
  }

  public async createBackup(options: BackupOptions): Promise<BackupResult> {
    const startTime = Date.now();
    const backupFileName = this.generateBackupFileName(options);
    const backupFilePath = path.join(this.config.backupPath, backupFileName);

    this.emit('backup:started', {
      backupId: options.backupId,
      filePath: backupFilePath,
    });

    try {
      this.logger.info('Starting PostgreSQL backup', {
        backupId: options.backupId,
        type: options.type,
        filePath: backupFilePath,
      });

      let actualFilePath = backupFilePath;

      if (options.type === 'full') {
        actualFilePath = await this.createFullBackup(backupFilePath, options);
      } else {
        actualFilePath = await this.createIncrementalBackup(
          backupFilePath,
          options
        );
      }

      // Get file stats
      const stats = await fs.stat(actualFilePath);
      const duration = Date.now() - startTime;

      // Calculate checksum
      const checksum = await this.calculateChecksum(actualFilePath);

      const result: BackupResult = {
        type: 'postgres',
        filePath: actualFilePath,
        size: stats.size,
        duration,
        checksum,
        compressed: options.compression,
        encrypted: options.encryption,
        createdAt: new Date(),
      };

      this.emit('backup:completed', {
        backupId: options.backupId,
        result,
      });

      this.logger.info('PostgreSQL backup completed successfully', {
        backupId: options.backupId,
        size: stats.size,
        duration,
        checksum,
      });

      return result;
    } catch (error) {
      this.emit('backup:failed', {
        backupId: options.backupId,
        error: (error as Error).message,
      });

      this.logger.error('PostgreSQL backup failed', {
        backupId: options.backupId,
        error,
      });

      throw error;
    }
  }

  private async createFullBackup(
    filePath: string,
    options: BackupOptions
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      const args = [
        '--verbose',
        '--format=custom',
        '--no-owner',
        '--no-privileges',
        '--compress=0', // We'll handle compression separately if needed
        this.config.connectionString,
      ];

      let outputPath = filePath;

      // Set up compression pipeline if enabled
      if (options.compression) {
        outputPath = `${filePath}.gz`;
      }

      const pgDump = spawn(this.pgDumpPath, args);
      let outputStream = pgDump.stdout;

      // Add compression if enabled
      if (options.compression) {
        const gzip = zlib.createGzip({ level: this.config.compression.level });
        outputStream = outputStream.pipe(gzip);
      }

      // Write to file
      const writeStream = require('fs').createWriteStream(outputPath);
      outputStream.pipe(writeStream);

      let stderr = '';

      pgDump.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pgDump.on('close', (code) => {
        if (code === 0) {
          resolve(outputPath);
        } else {
          reject(new Error(`pg_dump failed with code ${code}: ${stderr}`));
        }
      });

      pgDump.on('error', (error) => {
        reject(error);
      });
    });
  }

  private async createIncrementalBackup(
    filePath: string,
    options: BackupOptions
  ): Promise<string> {
    // For incremental backups, we'll use WAL (Write-Ahead Log) archiving
    // This is a simplified implementation - in production, you'd use tools like pg_basebackup with WAL-E or WAL-G

    try {
      // Get the latest WAL files since last backup
      const walFiles = await this.getWALFilesSinceLastBackup();

      if (walFiles.length === 0) {
        this.logger.info('No new WAL files found for incremental backup');
        // Create an empty backup file to indicate no changes
        await fs.writeFile(
          filePath,
          JSON.stringify({
            type: 'incremental',
            walFiles: [],
            timestamp: new Date().toISOString(),
            message: 'No changes since last backup',
          })
        );
        return filePath;
      }

      // Archive WAL files
      const walArchivePath = `${filePath}.wal.tar`;
      await this.archiveWALFiles(walFiles, walArchivePath);

      // Compress if enabled
      if (options.compression) {
        const compressedPath = `${walArchivePath}.gz`;
        await this.compressFile(walArchivePath, compressedPath);
        await fs.unlink(walArchivePath);
        return compressedPath;
      }

      return walArchivePath;
    } catch (error) {
      this.logger.error('Failed to create incremental backup', { error });
      throw error;
    }
  }

  private async getWALFilesSinceLastBackup(): Promise<string[]> {
    // This would typically query the PostgreSQL server for WAL files
    // For now, return empty array as this requires more complex setup
    return [];
  }

  private async archiveWALFiles(
    walFiles: string[],
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const tar = spawn('tar', ['-cf', outputPath, ...walFiles]);

      tar.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`tar failed with code ${code}`));
        }
      });

      tar.on('error', reject);
    });
  }

  public async restoreBackup(
    backupFilePath: string,
    options: PostgresRestoreOptions = {}
  ): Promise<void> {
    try {
      this.logger.info('Starting PostgreSQL restore', {
        backupFilePath,
        options,
      });

      // Determine if backup is compressed
      const isCompressed = backupFilePath.endsWith('.gz');
      let actualBackupPath = backupFilePath;

      // Decompress if necessary
      if (isCompressed) {
        actualBackupPath = await this.decompressFile(backupFilePath);
      }

      // Drop existing database if requested
      if (options.dropExisting) {
        await this.dropDatabase(options.targetDatabase);
      }

      // Create target database if specified
      if (options.targetDatabase) {
        await this.createDatabase(options.targetDatabase);
      }

      // Restore the backup
      await this.performRestore(actualBackupPath, options.targetDatabase);

      // Clean up decompressed file if it was created
      if (isCompressed && actualBackupPath !== backupFilePath) {
        await fs.unlink(actualBackupPath);
      }

      this.logger.info('PostgreSQL restore completed successfully');
    } catch (error) {
      this.logger.error('PostgreSQL restore failed', { error });
      throw error;
    }
  }

  private async performRestore(
    backupFilePath: string,
    targetDatabase?: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const connectionString = targetDatabase
        ? this.config.connectionString.replace(
            /\/[^\/]*$/,
            `/${targetDatabase}`
          )
        : this.config.connectionString;

      const args = [
        '--verbose',
        '--clean',
        '--no-owner',
        '--no-privileges',
        '--dbname',
        connectionString,
        backupFilePath,
      ];

      const pgRestore = spawn(this.pgRestorePath, args);

      let stderr = '';

      pgRestore.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      pgRestore.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`pg_restore failed with code ${code}: ${stderr}`));
        }
      });

      pgRestore.on('error', reject);
    });
  }

  private async dropDatabase(databaseName?: string): Promise<void> {
    if (!databaseName) return;

    return new Promise((resolve, reject) => {
      const args = [
        '--if-exists',
        this.config.connectionString.replace(/\/[^\/]*$/, '/postgres'), // Connect to postgres db
        '--command',
        `DROP DATABASE IF EXISTS "${databaseName}"`,
      ];

      const psql = spawn('psql', args);

      psql.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to drop database ${databaseName}`));
        }
      });

      psql.on('error', reject);
    });
  }

  private async createDatabase(databaseName: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const args = [
        this.config.connectionString.replace(/\/[^\/]*$/, '/postgres'), // Connect to postgres db
        '--command',
        `CREATE DATABASE "${databaseName}"`,
      ];

      const psql = spawn('psql', args);

      psql.on('close', (code) => {
        if (code === 0) {
          resolve();
        } else {
          reject(new Error(`Failed to create database ${databaseName}`));
        }
      });

      psql.on('error', reject);
    });
  }

  private async verifyPostgresTools(): Promise<void> {
    const tools = [
      { name: 'pg_dump', path: this.pgDumpPath },
      { name: 'pg_restore', path: this.pgRestorePath },
    ];

    for (const tool of tools) {
      try {
        await this.runCommand(tool.path, ['--version']);
      } catch (error) {
        throw new Error(
          `${tool.name} not found at ${tool.path}. Please install PostgreSQL client tools.`
        );
      }
    }
  }

  private async runCommand(command: string, args: string[]): Promise<string> {
    return new Promise((resolve, reject) => {
      const process = spawn(command, args);
      let stdout = '';
      let stderr = '';

      process.stdout.on('data', (data) => {
        stdout += data.toString();
      });

      process.stderr.on('data', (data) => {
        stderr += data.toString();
      });

      process.on('close', (code) => {
        if (code === 0) {
          resolve(stdout);
        } else {
          reject(new Error(`Command failed: ${stderr}`));
        }
      });

      process.on('error', reject);
    });
  }

  private async calculateChecksum(filePath: string): Promise<string> {
    return new Promise((resolve, reject) => {
      const hash = crypto.createHash('sha256');
      const stream = require('fs').createReadStream(filePath);

      stream.on('data', (data: Buffer) => {
        hash.update(data);
      });

      stream.on('end', () => {
        resolve(hash.digest('hex'));
      });

      stream.on('error', reject);
    });
  }

  private async compressFile(
    inputPath: string,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const readStream = require('fs').createReadStream(inputPath);
      const writeStream = require('fs').createWriteStream(outputPath);
      const gzip = zlib.createGzip({ level: this.config.compression.level });

      readStream
        .pipe(gzip)
        .pipe(writeStream)
        .on('finish', resolve)
        .on('error', reject);
    });
  }

  private async decompressFile(compressedPath: string): Promise<string> {
    const decompressedPath = compressedPath.replace(/\.gz$/, '');

    return new Promise((resolve, reject) => {
      const readStream = require('fs').createReadStream(compressedPath);
      const writeStream = require('fs').createWriteStream(decompressedPath);
      const gunzip = zlib.createGunzip();

      readStream
        .pipe(gunzip)
        .pipe(writeStream)
        .on('finish', () => resolve(decompressedPath))
        .on('error', reject);
    });
  }

  private generateBackupFileName(options: BackupOptions): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = options.compression ? '.sql.gz' : '.sql';
    return `postgres-${options.type}-${timestamp}${extension}`;
  }

  public async shutdown(): Promise<void> {
    this.logger.info('PostgreSQL backup service shut down');
  }
}
