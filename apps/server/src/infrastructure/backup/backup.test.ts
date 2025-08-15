import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { BackupManager } from './backup-manager';
import { PostgresBackupService } from './postgres-backup-service';
import { RedisBackupService } from './redis-backup-service';
import { DisasterRecoveryManager } from './disaster-recovery';
import { CrossRegionReplicationManager } from './cross-region-replication';
import { createBackupConfig, validateBackupConfig } from './config';
import { DatabaseConnectionManager } from '../database/connection-manager';
import { promises as fs } from 'fs';

// Mock external dependencies
vi.mock('fs', () => ({
  promises: {
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    readdir: vi.fn(),
    stat: vi.fn(),
    rm: vi.fn(),
  },
}));

vi.mock('child_process', () => ({
  spawn: vi.fn(),
}));

vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      ping: vi.fn().mockResolvedValue('PONG'),
      keys: vi.fn().mockResolvedValue(['key1', 'key2']),
      type: vi.fn().mockResolvedValue('string'),
      get: vi.fn().mockResolvedValue('value'),
      ttl: vi.fn().mockResolvedValue(-1),
      bgsave: vi.fn().mockResolvedValue('OK'),
      lastsave: vi.fn().mockResolvedValue(Date.now()),
      info: vi.fn().mockResolvedValue('rdb_bgsave_in_progress:0'),
      config: vi.fn().mockResolvedValue(['/data', 'dump.rdb']),
      dbsize: vi.fn().mockResolvedValue(2),
      flushall: vi.fn().mockResolvedValue('OK'),
      pipeline: vi.fn().mockReturnValue({
        set: vi.fn().mockReturnThis(),
        exec: vi.fn().mockResolvedValue([]),
      }),
      quit: vi.fn().mockResolvedValue('OK'),
    })),
  };
});

describe('Backup System', () => {
  let backupManager: BackupManager;
  let dbManager: DatabaseConnectionManager;
  let logger: any;
  let backupConfig: any;

  beforeEach(async () => {
    // Create test configuration
    backupConfig = {
      storage: {
        localPath: './test-backups',
      },
      postgres: {
        connectionString: 'postgresql://test:test@localhost:5432/test',
        backupPath: './test-backups/postgres',
        compression: {
          enabled: true,
          level: 6,
        },
      },
      redis: {
        host: 'localhost',
        port: 6379,
        backupPath: './test-backups/redis',
        compression: {
          enabled: true,
          level: 6,
        },
      },
      schedule: {
        enabled: false,
        interval: '6h',
        type: 'incremental' as const,
      },
      retention: {
        days: 7,
        maxBackups: 10,
      },
    };

    // Create mock logger
    logger = {
      info: vi.fn(),
      warn: vi.fn(),
      error: vi.fn(),
      debug: vi.fn(),
    };

    // Create mock database manager
    dbManager = {
      getPrismaClient: vi.fn(),
      getDrizzleDb: vi.fn(),
      executeQuery: vi.fn(),
      executeWithRetry: vi.fn(),
      getHealthStatus: vi.fn(),
      shutdown: vi.fn(),
    } as any;

    // Mock fs operations
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
    vi.mocked(fs.writeFile).mockResolvedValue(undefined);
    vi.mocked(fs.readFile).mockResolvedValue('{"test": "data"}');
    vi.mocked(fs.stat).mockResolvedValue({ size: 1024 } as any);
    vi.mocked(fs.readdir).mockResolvedValue([]);

    // Mock PostgreSQL tools verification globally
    vi.spyOn(
      PostgresBackupService.prototype as any,
      'verifyPostgresTools'
    ).mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('BackupManager', () => {
    beforeEach(async () => {
      backupManager = new BackupManager(backupConfig, dbManager, logger);
      await backupManager.initialize();
    });

    afterEach(async () => {
      await backupManager.shutdown();
    });

    it('should initialize successfully', async () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Backup manager initialized successfully'
      );
    });

    it('should create backup directories', async () => {
      expect(fs.mkdir).toHaveBeenCalledWith('./test-backups', {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith('./test-backups/postgres', {
        recursive: true,
      });
      expect(fs.mkdir).toHaveBeenCalledWith('./test-backups/redis', {
        recursive: true,
      });
    });

    it('should perform full backup', async () => {
      // Mock successful backup results
      const mockPostgresResult = {
        type: 'postgres',
        filePath: './test-backups/postgres/backup.sql',
        size: 1024,
        duration: 1000,
        checksum: 'abc123',
        compressed: true,
        encrypted: false,
        createdAt: new Date(),
      };

      const mockRedisResult = {
        type: 'redis',
        filePath: './test-backups/redis/backup.json',
        size: 512,
        duration: 500,
        checksum: 'def456',
        compressed: true,
        encrypted: false,
        createdAt: new Date(),
      };

      // Mock backup service methods
      const postgresService = backupManager['postgresBackup'];
      const redisService = backupManager['redisBackup'];

      vi.spyOn(postgresService, 'createBackup').mockResolvedValue(
        mockPostgresResult as any
      );
      vi.spyOn(redisService, 'createBackup').mockResolvedValue(
        mockRedisResult as any
      );

      const results = await backupManager.performFullBackup();

      expect(results).toHaveLength(2);
      expect(results[0].type).toBe('postgres');
      expect(results[1].type).toBe('redis');
      expect(logger.info).toHaveBeenCalledWith(
        'Full system backup completed successfully',
        expect.any(Object)
      );
    });

    it('should list backups', async () => {
      // Mock backup manifest files
      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'backup-1', isDirectory: () => true },
        { name: 'backup-2', isDirectory: () => true },
      ] as any);

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          backupId: 'backup-1',
          createdAt: new Date().toISOString(),
          type: 'full',
          backups: [
            { type: 'postgres', size: 1024 },
            { type: 'redis', size: 512 },
          ],
        })
      );

      const backups = await backupManager.listBackups();

      expect(backups).toHaveLength(2);
      expect(backups[0].backupId).toBe('backup-1');
    });

    it('should cleanup old backups', async () => {
      // Mock old backup
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 10); // 10 days old

      vi.mocked(fs.readdir).mockResolvedValue([
        { name: 'old-backup', isDirectory: () => true },
      ] as any);

      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          backupId: 'old-backup',
          createdAt: oldDate.toISOString(),
          type: 'full',
          backups: [],
        })
      );

      vi.mocked(fs.rm).mockResolvedValue(undefined);

      await backupManager.cleanupOldBackups();

      expect(fs.rm).toHaveBeenCalledWith(
        expect.stringContaining('old-backup'),
        { recursive: true, force: true }
      );
    });
  });

  describe('Configuration', () => {
    it('should create valid backup configuration', () => {
      const config = createBackupConfig();
      expect(config).toBeDefined();
      expect(config.storage).toBeDefined();
      expect(config.postgres).toBeDefined();
      expect(config.redis).toBeDefined();
    });

    it('should validate backup configuration', () => {
      expect(() => validateBackupConfig(backupConfig)).not.toThrow();
    });

    it('should throw error for invalid configuration', () => {
      const invalidConfig = { ...backupConfig };
      delete invalidConfig.postgres.connectionString;

      expect(() => validateBackupConfig(invalidConfig)).toThrow(
        'PostgreSQL connection string is required'
      );
    });
  });

  describe('PostgresBackupService', () => {
    let postgresService: PostgresBackupService;

    beforeEach(async () => {
      postgresService = new PostgresBackupService(
        backupConfig.postgres,
        logger
      );

      // Mock PostgreSQL tool verification
      vi.spyOn(postgresService as any, 'verifyPostgresTools').mockResolvedValue(
        undefined
      );

      await postgresService.initialize();
    });

    afterEach(async () => {
      await postgresService.shutdown();
    });

    it('should initialize successfully', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'PostgreSQL backup service initialized'
      );
    });

    it('should generate correct backup filename', () => {
      const options = {
        backupId: 'test-backup',
        type: 'full' as const,
        compression: true,
        encryption: false,
      };

      const filename = postgresService['generateBackupFileName'](options);
      expect(filename).toMatch(/postgres-full-.*\.sql\.gz/);
    });
  });

  describe('RedisBackupService', () => {
    let redisService: RedisBackupService;

    beforeEach(async () => {
      redisService = new RedisBackupService(backupConfig.redis, logger);
      await redisService.initialize();
    });

    afterEach(async () => {
      await redisService.shutdown();
    });

    it('should initialize successfully', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Redis backup service initialized'
      );
    });

    it('should generate correct backup filename', () => {
      const options = {
        backupId: 'test-backup',
        type: 'full' as const,
        compression: true,
        encryption: false,
      };

      const filename = redisService['generateBackupFileName'](options);
      expect(filename).toMatch(/redis-full-.*\.json\.gz/);
    });
  });

  describe('DisasterRecoveryManager', () => {
    let drManager: DisasterRecoveryManager;

    beforeEach(async () => {
      backupManager = new BackupManager(backupConfig, dbManager, logger);
      await backupManager.initialize();

      drManager = new DisasterRecoveryManager(
        backupManager,
        backupConfig,
        logger
      );
      await drManager.initialize();
    });

    afterEach(async () => {
      await drManager.shutdown();
      await backupManager.shutdown();
    });

    it('should initialize successfully', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Disaster recovery manager initialized successfully'
      );
    });

    it('should list recovery plans', () => {
      const plans = drManager.listRecoveryPlans();
      expect(plans).toHaveLength(1);
      expect(plans[0].id).toBe('default-recovery');
    });

    it('should get recovery plan by ID', () => {
      const plan = drManager.getRecoveryPlan('default-recovery');
      expect(plan).toBeDefined();
      expect(plan?.name).toBe('Default Disaster Recovery');
    });
  });

  describe('CrossRegionReplicationManager', () => {
    let replicationManager: CrossRegionReplicationManager;

    beforeEach(async () => {
      // Enable cross-region replication in config
      backupConfig.crossRegion = {
        enabled: true,
        regions: ['us-west-2', 'eu-west-1'],
        replicationDelay: 300,
      };

      backupManager = new BackupManager(backupConfig, dbManager, logger);
      await backupManager.initialize();

      replicationManager = new CrossRegionReplicationManager(
        backupManager,
        backupConfig,
        logger
      );
      await replicationManager.initialize();
    });

    afterEach(async () => {
      await replicationManager.shutdown();
      await backupManager.shutdown();
    });

    it('should initialize successfully', () => {
      expect(logger.info).toHaveBeenCalledWith(
        'Cross-region replication initialized successfully',
        expect.any(Object)
      );
    });

    it('should get replication metrics', () => {
      const metrics = replicationManager.getMetrics();
      expect(metrics).toBeDefined();
      expect(metrics.totalReplications).toBe(0);
      expect(metrics.successfulReplications).toBe(0);
      expect(metrics.failedReplications).toBe(0);
    });

    it('should get targets status', () => {
      const targets = replicationManager.getTargetsStatus();
      expect(targets).toHaveLength(2);
      expect(targets[0].region).toBe('us-west-2');
      expect(targets[1].region).toBe('eu-west-1');
    });
  });

  describe('Integration Tests', () => {
    it('should perform end-to-end backup and restore', async () => {
      backupManager = new BackupManager(backupConfig, dbManager, logger);
      await backupManager.initialize();

      // Mock successful backup
      const mockResult = {
        type: 'postgres',
        filePath: './test-backups/test-backup.sql',
        size: 1024,
        duration: 1000,
        checksum: 'abc123',
        compressed: true,
        encrypted: false,
        createdAt: new Date(),
      };

      vi.spyOn(
        backupManager['postgresBackup'],
        'createBackup'
      ).mockResolvedValue(mockResult as any);
      vi.spyOn(backupManager['redisBackup'], 'createBackup').mockResolvedValue(
        mockResult as any
      );

      // Perform backup
      const backupResults = await backupManager.performFullBackup();
      expect(backupResults).toHaveLength(2);

      // Mock restore
      vi.spyOn(
        backupManager['postgresBackup'],
        'restoreBackup'
      ).mockResolvedValue(undefined);
      vi.spyOn(backupManager['redisBackup'], 'restoreBackup').mockResolvedValue(
        undefined
      );

      // Mock backup manifest
      vi.mocked(fs.readFile).mockResolvedValue(
        JSON.stringify({
          backupId: 'test-backup',
          createdAt: new Date().toISOString(),
          backups: backupResults.map((r) => ({
            type: r.type,
            filePath: r.filePath,
            size: r.size,
            checksum: r.checksum,
            compressed: r.compressed,
            encrypted: r.encrypted,
          })),
        })
      );

      // Perform restore
      await backupManager.restoreFromBackup('test-backup');

      expect(logger.info).toHaveBeenCalledWith(
        'System restore completed successfully',
        expect.any(Object)
      );

      await backupManager.shutdown();
    });
  });
});
