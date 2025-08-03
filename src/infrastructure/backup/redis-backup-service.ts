import { EventEmitter } from 'events';
import { Logger } from 'winston';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import zlib from 'zlib';
import Redis from 'ioredis';
import { BackupResult, BackupOptions } from './types';

export interface RedisBackupConfig {
  host: string;
  port: number;
  password?: string;
  backupPath: string;
  rdbPath?: string;
  compression: {
    enabled: boolean;
    level: number;
  };
}

export interface RedisRestoreOptions {
  flushExisting?: boolean;
}

export class RedisBackupService extends EventEmitter {
  private redis: Redis;
  private lastBackupTime: Date | null = null;

  constructor(
    private config: RedisBackupConfig,
    private logger: Logger
  ) {
    super();

    this.redis = new Redis({
      host: config.host,
      port: config.port,
      password: config.password,
      retryDelayOnFailover: 100,
      maxRetriesPerRequest: 3,
    });
  }

  public async initialize(): Promise<void> {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.config.backupPath, { recursive: true });

      // Test Redis connection
      await this.redis.ping();

      this.logger.info('Redis backup service initialized');
    } catch (error) {
      this.logger.error('Failed to initialize Redis backup service', { error });
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
      this.logger.info('Starting Redis backup', {
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
        type: 'redis',
        filePath: actualFilePath,
        size: stats.size,
        duration,
        checksum,
        compressed: options.compression,
        encrypted: options.encryption,
        createdAt: new Date(),
      };

      this.lastBackupTime = new Date();

      this.emit('backup:completed', {
        backupId: options.backupId,
        result,
      });

      this.logger.info('Redis backup completed successfully', {
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

      this.logger.error('Redis backup failed', {
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
    try {
      // Trigger Redis to save current state to RDB file
      await this.redis.bgsave();

      // Wait for background save to complete
      await this.waitForBackgroundSave();

      // Get Redis data directory info
      const configDir = await this.redis.config('GET', 'dir');
      const configDbFilename = await this.redis.config('GET', 'dbfilename');

      const redisDataDir = Array.isArray(configDir) ? configDir[1] : '/data';
      const rdbFilename = Array.isArray(configDbFilename)
        ? configDbFilename[1]
        : 'dump.rdb';
      const rdbPath = path.join(redisDataDir, rdbFilename);

      // Create backup using Redis DUMP command for all keys
      const backup = await this.createRedisDataDump();

      let outputPath = filePath;

      // Write backup data
      if (options.compression) {
        outputPath = `${filePath}.gz`;
        await this.writeCompressedBackup(backup, outputPath);
      } else {
        await fs.writeFile(filePath, JSON.stringify(backup, null, 2));
      }

      return outputPath;
    } catch (error) {
      this.logger.error('Failed to create Redis full backup', { error });
      throw error;
    }
  }

  private async createIncrementalBackup(
    filePath: string,
    options: BackupOptions
  ): Promise<string> {
    try {
      // For incremental backup, we'll capture changes since last backup
      // This is a simplified approach - in production, you might use Redis modules or AOF

      const incrementalData = await this.getIncrementalData();

      if (Object.keys(incrementalData.keys).length === 0) {
        this.logger.info('No changes found for incremental backup');

        const emptyBackup = {
          type: 'incremental',
          timestamp: new Date().toISOString(),
          keys: {},
          deletedKeys: [],
          message: 'No changes since last backup',
        };

        await fs.writeFile(filePath, JSON.stringify(emptyBackup, null, 2));
        return filePath;
      }

      let outputPath = filePath;

      if (options.compression) {
        outputPath = `${filePath}.gz`;
        await this.writeCompressedBackup(incrementalData, outputPath);
      } else {
        await fs.writeFile(filePath, JSON.stringify(incrementalData, null, 2));
      }

      return outputPath;
    } catch (error) {
      this.logger.error('Failed to create Redis incremental backup', { error });
      throw error;
    }
  }

  private async createRedisDataDump(): Promise<any> {
    const backup = {
      type: 'full',
      timestamp: new Date().toISOString(),
      keys: {} as Record<string, any>,
      metadata: {
        version: await this.redis.info('server'),
        keyCount: await this.redis.dbsize(),
      },
    };

    // Get all keys
    const keys = await this.redis.keys('*');

    for (const key of keys) {
      try {
        const type = await this.redis.type(key);
        const ttl = await this.redis.ttl(key);

        let value: any;

        switch (type) {
          case 'string':
            value = await this.redis.get(key);
            break;
          case 'hash':
            value = await this.redis.hgetall(key);
            break;
          case 'list':
            value = await this.redis.lrange(key, 0, -1);
            break;
          case 'set':
            value = await this.redis.smembers(key);
            break;
          case 'zset':
            value = await this.redis.zrange(key, 0, -1, 'WITHSCORES');
            break;
          default:
            this.logger.warn(`Unsupported Redis type: ${type} for key: ${key}`);
            continue;
        }

        backup.keys[key] = {
          type,
          value,
          ttl: ttl > 0 ? ttl : null,
        };
      } catch (error) {
        this.logger.warn(`Failed to backup key: ${key}`, { error });
      }
    }

    return backup;
  }

  private async getIncrementalData(): Promise<any> {
    // This is a simplified incremental backup approach
    // In production, you'd use Redis Streams, AOF, or custom change tracking

    const currentData = await this.createRedisDataDump();

    // For now, return all data as we don't have change tracking
    // In a real implementation, you'd compare with previous backup
    return {
      type: 'incremental',
      timestamp: new Date().toISOString(),
      keys: currentData.keys,
      deletedKeys: [], // Would track deleted keys
      metadata: currentData.metadata,
    };
  }

  private async waitForBackgroundSave(): Promise<void> {
    let attempts = 0;
    const maxAttempts = 60; // Wait up to 60 seconds

    while (attempts < maxAttempts) {
      const lastSave = await this.redis.lastsave();

      // Check if background save is in progress
      const info = await this.redis.info('persistence');
      const isSaving = info.includes('rdb_bgsave_in_progress:1');

      if (!isSaving) {
        return;
      }

      await this.sleep(1000);
      attempts++;
    }

    throw new Error('Background save did not complete within timeout');
  }

  public async restoreBackup(
    backupFilePath: string,
    options: RedisRestoreOptions = {}
  ): Promise<void> {
    try {
      this.logger.info('Starting Redis restore', {
        backupFilePath,
        options,
      });

      // Flush existing data if requested
      if (options.flushExisting) {
        await this.redis.flushall();
      }

      // Determine if backup is compressed
      const isCompressed = backupFilePath.endsWith('.gz');
      let backupData: any;

      if (isCompressed) {
        backupData = await this.readCompressedBackup(backupFilePath);
      } else {
        const content = await fs.readFile(backupFilePath, 'utf-8');
        backupData = JSON.parse(content);
      }

      // Restore keys
      await this.restoreKeys(backupData.keys);

      this.logger.info('Redis restore completed successfully', {
        keysRestored: Object.keys(backupData.keys).length,
      });
    } catch (error) {
      this.logger.error('Redis restore failed', { error });
      throw error;
    }
  }

  private async restoreKeys(keys: Record<string, any>): Promise<void> {
    const pipeline = this.redis.pipeline();

    for (const [key, data] of Object.entries(keys)) {
      try {
        switch (data.type) {
          case 'string':
            pipeline.set(key, data.value);
            break;
          case 'hash':
            pipeline.hmset(key, data.value);
            break;
          case 'list':
            pipeline.del(key); // Clear existing
            if (data.value.length > 0) {
              pipeline.lpush(key, ...data.value.reverse());
            }
            break;
          case 'set':
            pipeline.del(key); // Clear existing
            if (data.value.length > 0) {
              pipeline.sadd(key, ...data.value);
            }
            break;
          case 'zset':
            pipeline.del(key); // Clear existing
            if (data.value.length > 0) {
              const args = [];
              for (let i = 0; i < data.value.length; i += 2) {
                args.push(data.value[i + 1], data.value[i]); // score, member
              }
              if (args.length > 0) {
                pipeline.zadd(key, ...args);
              }
            }
            break;
        }

        // Set TTL if specified
        if (data.ttl && data.ttl > 0) {
          pipeline.expire(key, data.ttl);
        }
      } catch (error) {
        this.logger.warn(`Failed to restore key: ${key}`, { error });
      }
    }

    await pipeline.exec();
  }

  private async writeCompressedBackup(
    data: any,
    outputPath: string
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const jsonData = JSON.stringify(data, null, 2);
      const writeStream = require('fs').createWriteStream(outputPath);
      const gzip = zlib.createGzip({ level: this.config.compression.level });

      gzip.write(jsonData);
      gzip.end();

      gzip.pipe(writeStream).on('finish', resolve).on('error', reject);
    });
  }

  private async readCompressedBackup(filePath: string): Promise<any> {
    return new Promise((resolve, reject) => {
      const readStream = require('fs').createReadStream(filePath);
      const gunzip = zlib.createGunzip();
      let data = '';

      readStream
        .pipe(gunzip)
        .on('data', (chunk) => {
          data += chunk.toString();
        })
        .on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        })
        .on('error', reject);
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

  private generateBackupFileName(options: BackupOptions): string {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = options.compression ? '.json.gz' : '.json';
    return `redis-${options.type}-${timestamp}${extension}`;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  public async shutdown(): Promise<void> {
    await this.redis.quit();
    this.logger.info('Redis backup service shut down');
  }
}
