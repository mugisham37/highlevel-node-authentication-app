import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { ConfigManager } from '../../../infrastructure/config/config-manager';
import { SecretsManager } from '../../../infrastructure/config/secrets-manager';

describe('ConfigManager', () => {
  let configManager: ConfigManager;
  let testSecretsPath: string;

  beforeEach(async () => {
    // Create a temporary directory for test secrets
    testSecretsPath = path.join(__dirname, 'test-secrets');
    await fs.mkdir(testSecretsPath, { recursive: true });

    // Mock environment variables
    vi.stubEnv('NODE_ENV', 'test');
    vi.stubEnv(
      'JWT_SECRET',
      'test-jwt-secret-that-is-long-enough-for-validation'
    );
    vi.stubEnv('SERVER_PORT', '3001');
    vi.stubEnv('DATABASE_URL', 'postgresql://test:test@localhost:5432/test_db');

    configManager = ConfigManager.getInstance();
  });

  afterEach(async () => {
    // Clean up test secrets directory
    try {
      await fs.rm(testSecretsPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }

    // Reset the singleton instance
    (ConfigManager as any).instance = undefined;
    vi.unstubAllEnvs();
  });

  describe('initialization', () => {
    it('should initialize with default options', async () => {
      await configManager.initialize({
        secretsPath: testSecretsPath,
        enableDynamicConfig: false,
      });

      const config = configManager.getConfig();
      expect(config.env).toBe('test');
      expect(config.server.port).toBe(3001);
      expect(config.jwt.secret).toBe(
        'test-jwt-secret-that-is-long-enough-for-validation'
      );
    });

    it('should initialize with custom options', async () => {
      await configManager.initialize({
        secretsPath: testSecretsPath,
        masterPassword: 'custom-master-password',
        enableDynamicConfig: true,
      });

      const config = configManager.getConfig();
      expect(config.env).toBe('test');

      const secretsManager = configManager.getSecretsManager();
      expect(secretsManager).toBeDefined();

      const dynamicConfigManager = configManager.getDynamicConfigManager();
      expect(dynamicConfigManager).toBeDefined();
    });

    it('should throw error if JWT secret is too short in production', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.stubEnv('JWT_SECRET', 'short');

      await expect(
        configManager.initialize({
          secretsPath: testSecretsPath,
          enableDynamicConfig: false,
        })
      ).rejects.toThrow('Configuration validation failed');
    });

    it('should not initialize twice', async () => {
      await configManager.initialize({
        secretsPath: testSecretsPath,
        enableDynamicConfig: false,
      });

      // Second initialization should not throw
      await configManager.initialize({
        secretsPath: testSecretsPath,
        enableDynamicConfig: false,
      });

      const config = configManager.getConfig();
      expect(config.env).toBe('test');
    });
  });

  describe('configuration access', () => {
    beforeEach(async () => {
      await configManager.initialize({
        secretsPath: testSecretsPath,
        enableDynamicConfig: false,
      });
    });

    it('should get full configuration', () => {
      const config = configManager.getConfig();

      expect(config).toHaveProperty('env');
      expect(config).toHaveProperty('server');
      expect(config).toHaveProperty('database');
      expect(config).toHaveProperty('redis');
      expect(config).toHaveProperty('jwt');
      expect(config).toHaveProperty('oauth');
      expect(config).toHaveProperty('security');
      expect(config).toHaveProperty('logging');
    });

    it('should get configuration section', () => {
      const serverConfig = configManager.getConfigSection('server');

      expect(serverConfig).toHaveProperty('host');
      expect(serverConfig).toHaveProperty('port');
      expect(serverConfig.port).toBe(3001);
    });

    it('should provide utility methods', () => {
      expect(configManager.isTest()).toBe(true);
      expect(configManager.isDevelopment()).toBe(false);
      expect(configManager.isProduction()).toBe(false);

      const serverUrl = configManager.getServerUrl();
      expect(serverUrl).toBe('http://localhost:3001');

      const databaseUrl = configManager.getDatabaseUrl();
      expect(databaseUrl).toBe('postgresql://test:test@localhost:5432/test_db');
    });
  });

  describe('dynamic configuration', () => {
    beforeEach(async () => {
      await configManager.initialize({
        secretsPath: testSecretsPath,
        enableDynamicConfig: true,
      });
    });

    it('should update configuration section', async () => {
      const result = await configManager.updateConfigSection('server', {
        host: 'localhost',
        port: 4000,
        cors: { origin: true, credentials: true },
        helmet: {
          contentSecurityPolicy: true,
          crossOriginEmbedderPolicy: false,
        },
      });

      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);

      const serverConfig = configManager.getConfigSection('server');
      expect(serverConfig.port).toBe(4000);
    });

    it('should validate configuration updates', async () => {
      const result = await configManager.updateConfigSection('server', {
        host: 'localhost',
        port: 70000, // Invalid port
        cors: { origin: true, credentials: true },
        helmet: {
          contentSecurityPolicy: true,
          crossOriginEmbedderPolicy: false,
        },
      });

      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });

    it('should update full configuration', async () => {
      const updates = {
        server: {
          host: 'localhost',
          port: 5000,
          cors: { origin: true, credentials: true },
          helmet: {
            contentSecurityPolicy: true,
            crossOriginEmbedderPolicy: false,
          },
        },
        logging: {
          level: 'debug' as const,
          format: 'simple' as const,
          file: {
            enabled: false,
            path: 'logs/test.log',
            maxSize: '10m',
            maxFiles: 5,
          },
          console: {
            enabled: true,
            colorize: true,
          },
          audit: {
            enabled: false,
            path: 'logs/audit.log',
            maxSize: '100m',
            maxFiles: 10,
          },
        },
      };

      const result = await configManager.updateConfig(updates, 'test-user');

      expect(result.valid).toBe(true);

      const config = configManager.getConfig();
      expect(config.server.port).toBe(5000);
      expect(config.logging.level).toBe('debug');
    });
  });

  describe('error handling', () => {
    it('should throw error when accessing config before initialization', () => {
      const uninitializedManager = new (ConfigManager as any)();

      expect(() => uninitializedManager.getConfig()).toThrow(
        'Configuration manager not initialized'
      );
    });

    it('should handle missing required configuration', async () => {
      vi.stubEnv('NODE_ENV', 'production');
      vi.unstubEnv('DATABASE_URL'); // Remove required config

      await expect(
        configManager.initialize({
          secretsPath: testSecretsPath,
          enableDynamicConfig: false,
        })
      ).rejects.toThrow();
    });
  });

  describe('shutdown', () => {
    it('should shutdown gracefully', async () => {
      await configManager.initialize({
        secretsPath: testSecretsPath,
        enableDynamicConfig: true,
      });

      await expect(configManager.shutdown()).resolves.not.toThrow();
    });
  });
});
