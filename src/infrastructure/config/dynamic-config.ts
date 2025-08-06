import { EventEmitter } from 'events';
import * as fs from 'fs/promises';
import * as path from 'path';
import { watch } from 'chokidar';
import { AppConfig, ConfigChangeEvent, ConfigValidationResult } from './types';
import { SecretsManager } from './secrets-manager';

export interface DynamicConfigOptions {
  configPath?: string;
  watchFiles?: boolean;
  validateOnChange?: boolean;
  backupOnChange?: boolean;
  maxBackups?: number;
}

export class DynamicConfigManager extends EventEmitter {
  private currentConfig: Partial<AppConfig> = {};
  private configPath: string;
  private secretsManager: SecretsManager;
  private fileWatcher?: any;
  private options: Required<DynamicConfigOptions>;
  private configHistory: Array<{
    timestamp: Date;
    config: Partial<AppConfig>;
  }> = [];
  private readonly maxHistorySize = 50;

  constructor(
    initialConfig: Partial<AppConfig>,
    secretsManager: SecretsManager,
    options: DynamicConfigOptions = {}
  ) {
    super();

    this.currentConfig = { ...initialConfig };
    this.secretsManager = secretsManager;
    this.configPath =
      options.configPath || path.join(process.cwd(), 'config', 'runtime.json');

    this.options = {
      configPath: this.configPath,
      watchFiles: options.watchFiles ?? true,
      validateOnChange: options.validateOnChange ?? true,
      backupOnChange: options.backupOnChange ?? true,
      maxBackups: options.maxBackups ?? 10,
    };

    this.addToHistory(this.currentConfig);

    if (this.options.watchFiles) {
      this.setupFileWatcher();
    }
  }

  private addToHistory(config: Partial<AppConfig>): void {
    this.configHistory.unshift({
      timestamp: new Date(),
      config: JSON.parse(JSON.stringify(config)), // Deep clone
    });

    // Keep only the most recent entries
    if (this.configHistory.length > this.maxHistorySize) {
      this.configHistory = this.configHistory.slice(0, this.maxHistorySize);
    }
  }

  private async setupFileWatcher(): Promise<void> {
    try {
      // Ensure config directory exists
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });

      this.fileWatcher = watch(this.configPath, {
        persistent: true,
        ignoreInitial: true,
      });

      this.fileWatcher.on('change', async () => {
        try {
          console.log('Configuration file changed, reloading...');
          await this.reloadFromFile();
        } catch (error) {
          console.error('Failed to reload configuration from file:', error);
          this.emit('error', error);
        }
      });

      console.log(`Watching configuration file: ${this.configPath}`);
    } catch (error) {
      console.warn('Failed to setup file watcher:', error);
    }
  }

  async updateConfig(
    updates: Partial<AppConfig>,
    source: 'file' | 'api' | 'env' = 'api',
    userId?: string
  ): Promise<ConfigValidationResult> {
    try {
      const oldConfig = { ...this.currentConfig };
      const newConfig = this.mergeConfig(this.currentConfig, updates);

      // Validate the new configuration if enabled
      if (this.options.validateOnChange) {
        const validation = await this.validateConfig(newConfig);
        if (!validation.valid) {
          console.error('Configuration validation failed:', validation.errors);
          return validation;
        }
      }

      // Backup current configuration if enabled
      if (this.options.backupOnChange) {
        await this.backupCurrentConfig();
      }

      // Apply the new configuration
      this.currentConfig = newConfig;
      this.addToHistory(this.currentConfig);

      // Persist to file
      await this.saveToFile();

      // Emit change events for each updated section
      this.emitChangeEvents(oldConfig, newConfig, source, userId);

      console.log('Configuration updated successfully', {
        source,
        userId,
        updatedSections: Object.keys(updates),
      });

      return { valid: true, errors: [], warnings: [] };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to update configuration:', error);
      return {
        valid: false,
        errors: [errorMessage],
        warnings: [],
      };
    }
  }

  private mergeConfig(
    current: Partial<AppConfig>,
    updates: Partial<AppConfig>
  ): Partial<AppConfig> {
    const merged = { ...current } as any;

    for (const [key, value] of Object.entries(updates)) {
      if (value && typeof value === 'object' && !Array.isArray(value)) {
        merged[key] = { ...merged[key], ...value };
      } else {
        merged[key] = value;
      }
    }

    return merged;
  }

  private emitChangeEvents(
    oldConfig: Partial<AppConfig>,
    newConfig: Partial<AppConfig>,
    source: 'file' | 'api' | 'env',
    userId?: string
  ): void {
    for (const section of Object.keys(newConfig) as Array<keyof AppConfig>) {
      const oldValue = oldConfig[section];
      const newValue = newConfig[section];

      if (JSON.stringify(oldValue) !== JSON.stringify(newValue)) {
        const changeEvent: ConfigChangeEvent = {
          timestamp: new Date(),
          section,
          oldValue,
          newValue,
          source,
          userId,
        };

        this.emit('configChange', changeEvent);
        this.emit(`configChange:${section}`, changeEvent);
      }
    }
  }

  async getConfig(): Promise<Partial<AppConfig>> {
    return { ...this.currentConfig };
  }

  async getConfigSection<K extends keyof AppConfig>(
    section: K
  ): Promise<AppConfig[K] | undefined> {
    return this.currentConfig[section];
  }

  async setConfigSection<K extends keyof AppConfig>(
    section: K,
    value: AppConfig[K],
    source: 'file' | 'api' | 'env' = 'api',
    userId?: string
  ): Promise<ConfigValidationResult> {
    return this.updateConfig(
      { [section]: value } as Partial<AppConfig>,
      source,
      userId
    );
  }

  private async validateConfig(
    config: Partial<AppConfig>
  ): Promise<ConfigValidationResult> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Basic validation - check required fields based on environment
      if (config.env === 'production') {
        const requiredSecrets = ['JWT_SECRET', 'DATABASE_URL', 'REDIS_URL'];

        for (const secret of requiredSecrets) {
          const value = await this.secretsManager.getConfigValue(secret);
          if (!value) {
            errors.push(`Required secret missing in production: ${secret}`);
          }
        }
      }

      // Validate server configuration
      if (config.server) {
        if (
          config.server.port &&
          (config.server.port < 1 || config.server.port > 65535)
        ) {
          errors.push('Server port must be between 1 and 65535');
        }
      }

      // Validate database configuration
      if (config.database?.pool) {
        if (config.database.pool.min > config.database.pool.max) {
          errors.push('Database pool min cannot be greater than max');
        }
      }

      // Validate JWT configuration
      if (config.jwt?.secret && config.jwt.secret.length < 32) {
        errors.push('JWT secret must be at least 32 characters long');
      }

      // Add warnings for potentially problematic configurations
      if (
        config.security?.rateLimit?.global?.max &&
        config.security.rateLimit.global.max > 10000
      ) {
        warnings.push(
          'Global rate limit is very high, consider reducing for better security'
        );
      }

      if (config.logging?.level === 'debug' && config.env === 'production') {
        warnings.push('Debug logging enabled in production environment');
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      errors.push(`Validation error: ${errorMessage}`);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async saveToFile(): Promise<void> {
    try {
      await fs.mkdir(path.dirname(this.configPath), { recursive: true });

      const configData = {
        lastUpdated: new Date().toISOString(),
        version: '1.0',
        config: this.currentConfig,
      };

      await fs.writeFile(this.configPath, JSON.stringify(configData, null, 2), {
        encoding: 'utf8',
      });
    } catch (error) {
      console.error('Failed to save configuration to file:', error);
      throw error;
    }
  }

  private async reloadFromFile(): Promise<void> {
    try {
      const fileContent = await fs.readFile(this.configPath, 'utf8');
      const configData = JSON.parse(fileContent);

      if (configData.config) {
        await this.updateConfig(configData.config, 'file');
      }
    } catch (error) {
      if (error && typeof error === 'object' && 'code' in error && (error as any).code !== 'ENOENT') {
        throw error;
      }
      // File doesn't exist, which is fine
    }
  }

  private async backupCurrentConfig(): Promise<void> {
    try {
      const backupDir = path.join(path.dirname(this.configPath), 'backups');
      await fs.mkdir(backupDir, { recursive: true });

      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupPath = path.join(
        backupDir,
        `config-backup-${timestamp}.json`
      );

      const backupData = {
        timestamp: new Date().toISOString(),
        config: this.currentConfig,
      };

      await fs.writeFile(backupPath, JSON.stringify(backupData, null, 2));

      // Clean up old backups
      await this.cleanupOldBackups(backupDir);
    } catch (error) {
      console.warn('Failed to backup configuration:', error);
    }
  }

  private async cleanupOldBackups(backupDir: string): Promise<void> {
    try {
      const files = await fs.readdir(backupDir);
      const backupFiles = files
        .filter(
          (file) => file.startsWith('config-backup-') && file.endsWith('.json')
        )
        .map((file) => ({
          name: file,
          path: path.join(backupDir, file),
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name (timestamp) descending

      // Keep only the most recent backups
      const filesToDelete = backupFiles.slice(this.options.maxBackups);

      for (const file of filesToDelete) {
        await fs.unlink(file.path);
      }

      if (filesToDelete.length > 0) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(
            `Cleaned up ${filesToDelete.length} old configuration backups`
          );
        }
      }
    } catch (error) {
      console.warn('Failed to cleanup old backups:', error);
    }
  }

  async getConfigHistory(
    limit = 10
  ): Promise<Array<{ timestamp: Date; config: Partial<AppConfig> }>> {
    return this.configHistory.slice(0, limit);
  }

  async rollbackToVersion(timestamp: Date): Promise<ConfigValidationResult> {
    const historyEntry = this.configHistory.find(
      (entry) => entry.timestamp.getTime() === timestamp.getTime()
    );

    if (!historyEntry) {
      return {
        valid: false,
        errors: ['Configuration version not found in history'],
        warnings: [],
      };
    }

    console.log(
      `Rolling back configuration to version: ${timestamp.toISOString()}`
    );
    return this.updateConfig(historyEntry.config, 'api', 'system-rollback');
  }

  async exportConfig(outputPath: string): Promise<void> {
    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        config: this.currentConfig,
        history: this.configHistory.slice(0, 5), // Include recent history
      };

      await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
      console.log(`Configuration exported to: ${outputPath}`);
    } catch (error) {
      console.error('Failed to export configuration:', error);
      throw error;
    }
  }

  async importConfig(
    inputPath: string,
    userId?: string
  ): Promise<ConfigValidationResult> {
    try {
      const importData = JSON.parse(await fs.readFile(inputPath, 'utf8'));

      if (!importData.config) {
        return {
          valid: false,
          errors: ['Invalid configuration file format'],
          warnings: [],
        };
      }

      console.log(`Importing configuration from: ${inputPath}`);
      return this.updateConfig(importData.config, 'file', userId);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error('Failed to import configuration:', error);
      return {
        valid: false,
        errors: [`Import failed: ${errorMessage}`],
        warnings: [],
      };
    }
  }

  async shutdown(): Promise<void> {
    if (this.fileWatcher) {
      await this.fileWatcher.close();
      this.fileWatcher = null;
    }

    // Save final state
    await this.saveToFile();

    this.removeAllListeners();
    console.log('Dynamic configuration manager shutdown complete');
  }
}
