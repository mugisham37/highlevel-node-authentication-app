/**
 * Secure Configuration Management Service
 * Manages secure configuration with encryption, validation, and audit trails
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { logger } from '../logging/winston-logger';
import { auditTrailManager, AuditHelpers } from '../monitoring/audit-trail';
import { dataEncryptionService } from './data-encryption.service';
import { z } from 'zod';

export interface SecureConfigSchema {
  [key: string]: {
    type: 'string' | 'number' | 'boolean' | 'object' | 'array';
    required: boolean;
    sensitive: boolean;
    validation?: z.ZodSchema;
    description?: string;
    defaultValue?: any;
    environment?: string; // Environment variable name
  };
}

export interface ConfigurationEntry {
  key: string;
  value: any;
  encrypted: boolean;
  lastModified: Date;
  modifiedBy: string;
  version: number;
  environment: string;
  sensitive: boolean;
  checksum: string;
}

export interface ConfigurationAudit {
  timestamp: Date;
  action: 'create' | 'update' | 'delete' | 'access';
  key: string;
  oldValue?: any;
  newValue?: any;
  actor: string;
  environment: string;
  reason?: string;
}

export class SecureConfigManagerService {
  private readonly configurations = new Map<string, ConfigurationEntry>();
  private readonly schemas = new Map<string, SecureConfigSchema>();
  private readonly auditLog: ConfigurationAudit[] = [];
  private readonly configPath: string;
  private readonly encryptionEnabled: boolean;

  constructor(options?: { configPath?: string; encryptionEnabled?: boolean }) {
    this.configPath =
      options?.configPath || join(process.cwd(), '.secure-config');
    this.encryptionEnabled = options?.encryptionEnabled ?? true;

    this.initializeDefaultSchemas();
    this.loadConfigurations();
  }

  /**
   * Register configuration schema
   */
  registerSchema(name: string, schema: SecureConfigSchema): void {
    this.schemas.set(name, schema);

    logger.info('Configuration schema registered', {
      schemaName: name,
      fieldsCount: Object.keys(schema).length,
    });
  }

  /**
   * Set configuration value
   */
  async setConfig(
    key: string,
    value: any,
    options?: {
      actor?: string;
      reason?: string;
      environment?: string;
      sensitive?: boolean;
    }
  ): Promise<void> {
    const actor = options?.actor || 'system';
    const environment =
      options?.environment || process.env.NODE_ENV || 'development';
    const sensitive = options?.sensitive ?? this.isSensitiveKey(key);

    // Validate configuration
    await this.validateConfiguration(key, value);

    // Get existing configuration
    const existingConfig = this.configurations.get(key);
    const oldValue = existingConfig?.value;

    // Encrypt sensitive values
    let finalValue = value;
    let encrypted = false;

    if (sensitive && this.encryptionEnabled) {
      finalValue = await dataEncryptionService.encryptField(key, value);
      encrypted = true;
    }

    // Create configuration entry
    const configEntry: ConfigurationEntry = {
      key,
      value: finalValue,
      encrypted,
      lastModified: new Date(),
      modifiedBy: actor,
      version: (existingConfig?.version || 0) + 1,
      environment,
      sensitive,
      checksum: this.calculateChecksum(key, finalValue),
    };

    // Store configuration
    this.configurations.set(key, configEntry);

    // Audit trail
    const auditEntry: ConfigurationAudit = {
      timestamp: new Date(),
      action: existingConfig ? 'update' : 'create',
      key,
      oldValue: existingConfig
        ? existingConfig.sensitive
          ? '[REDACTED]'
          : oldValue
        : undefined,
      newValue: sensitive ? '[REDACTED]' : value,
      actor,
      environment,
      reason: options?.reason,
    };

    this.auditLog.push(auditEntry);

    // System audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor(actor),
      action: `config_${auditEntry.action}`,
      resource: AuditHelpers.createResource('configuration', key),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        key,
        environment,
        sensitive,
        encrypted,
        version: configEntry.version,
        reason: options?.reason,
      },
    });

    // Persist configurations
    await this.persistConfigurations();

    logger.info('Configuration updated', {
      key,
      environment,
      sensitive,
      encrypted,
      version: configEntry.version,
      actor,
    });
  }

  /**
   * Get configuration value
   */
  async getConfig<T = any>(
    key: string,
    options?: {
      actor?: string;
      environment?: string;
      defaultValue?: T;
    }
  ): Promise<T | undefined> {
    const actor = options?.actor || 'system';
    const environment =
      options?.environment || process.env.NODE_ENV || 'development';

    const configEntry = this.configurations.get(key);

    if (!configEntry) {
      // Check for environment variable fallback
      const envValue = process.env[key];
      if (envValue !== undefined) {
        return this.parseEnvironmentValue(envValue) as T;
      }

      return options?.defaultValue;
    }

    // Decrypt if necessary
    let value = configEntry.value;
    if (configEntry.encrypted) {
      try {
        value = await dataEncryptionService.decryptField(
          key,
          configEntry.value
        );
      } catch (error) {
        logger.error('Failed to decrypt configuration', {
          key,
          error: (error as Error).message,
        });
        throw new Error(`Configuration decryption failed: ${key}`);
      }
    }

    // Audit access to sensitive configurations
    if (configEntry.sensitive) {
      const auditEntry: ConfigurationAudit = {
        timestamp: new Date(),
        action: 'access',
        key,
        actor,
        environment,
      };

      this.auditLog.push(auditEntry);

      // System audit trail for sensitive access
      await auditTrailManager.recordEvent({
        actor: AuditHelpers.createSystemActor(actor),
        action: 'config_access',
        resource: AuditHelpers.createResource('configuration', key),
        outcome: AuditHelpers.createSuccessOutcome(),
        metadata: {
          key,
          environment,
          sensitive: true,
          encrypted: configEntry.encrypted,
        },
      });
    }

    return value as T;
  }

  /**
   * Delete configuration
   */
  async deleteConfig(
    key: string,
    options?: {
      actor?: string;
      reason?: string;
      environment?: string;
    }
  ): Promise<boolean> {
    const actor = options?.actor || 'system';
    const environment =
      options?.environment || process.env.NODE_ENV || 'development';

    const configEntry = this.configurations.get(key);
    if (!configEntry) {
      return false;
    }

    // Remove configuration
    this.configurations.delete(key);

    // Audit trail
    const auditEntry: ConfigurationAudit = {
      timestamp: new Date(),
      action: 'delete',
      key,
      oldValue: configEntry.sensitive ? '[REDACTED]' : configEntry.value,
      actor,
      environment,
      reason: options?.reason,
    };

    this.auditLog.push(auditEntry);

    // System audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor(actor),
      action: 'config_delete',
      resource: AuditHelpers.createResource('configuration', key),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        key,
        environment,
        sensitive: configEntry.sensitive,
        version: configEntry.version,
        reason: options?.reason,
      },
    });

    // Persist configurations
    await this.persistConfigurations();

    logger.info('Configuration deleted', {
      key,
      environment,
      actor,
      reason: options?.reason,
    });

    return true;
  }

  /**
   * Get all configurations (non-sensitive values only)
   */
  getAllConfigs(environment?: string): Record<string, any> {
    const configs: Record<string, any> = {};
    const targetEnv = environment || process.env.NODE_ENV || 'development';

    for (const [key, config] of this.configurations) {
      if (config.environment === targetEnv && !config.sensitive) {
        configs[key] = config.encrypted ? '[ENCRYPTED]' : config.value;
      }
    }

    return configs;
  }

  /**
   * Validate configuration against schema
   */
  private async validateConfiguration(key: string, value: any): Promise<void> {
    // Find applicable schema
    let applicableSchema: SecureConfigSchema | undefined;

    for (const [schemaName, schema] of this.schemas) {
      if (schema[key]) {
        applicableSchema = schema;
        break;
      }
    }

    if (!applicableSchema || !applicableSchema[key]) {
      // No schema found, allow any value
      return;
    }

    const fieldSchema = applicableSchema[key];

    // Type validation
    const actualType = Array.isArray(value) ? 'array' : typeof value;
    if (actualType !== fieldSchema.type) {
      throw new Error(
        `Configuration ${key} must be of type ${fieldSchema.type}, got ${actualType}`
      );
    }

    // Custom validation
    if (fieldSchema.validation) {
      try {
        fieldSchema.validation.parse(value);
      } catch (error) {
        throw new Error(
          `Configuration ${key} validation failed: ${(error as Error).message}`
        );
      }
    }
  }

  /**
   * Check if key is sensitive
   */
  private isSensitiveKey(key: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
      /auth/i,
      /private/i,
    ];

    return sensitivePatterns.some((pattern) => pattern.test(key));
  }

  /**
   * Calculate configuration checksum
   */
  private calculateChecksum(key: string, value: any): string {
    const crypto = require('crypto');
    const data = `${key}:${JSON.stringify(value)}`;
    return crypto.createHash('sha256').update(data).digest('hex');
  }

  /**
   * Parse environment variable value
   */
  private parseEnvironmentValue(value: string): any {
    // Try to parse as JSON first
    try {
      return JSON.parse(value);
    } catch {
      // Try to parse as boolean
      if (value.toLowerCase() === 'true') return true;
      if (value.toLowerCase() === 'false') return false;

      // Try to parse as number
      const numValue = Number(value);
      if (!isNaN(numValue)) return numValue;

      // Return as string
      return value;
    }
  }

  /**
   * Load configurations from file
   */
  private loadConfigurations(): void {
    try {
      if (existsSync(this.configPath)) {
        const configData = readFileSync(this.configPath, 'utf8');
        const parsedData = JSON.parse(configData);

        if (parsedData.configurations) {
          for (const [key, config] of Object.entries(
            parsedData.configurations
          )) {
            this.configurations.set(key, config as ConfigurationEntry);
          }
        }

        if (parsedData.auditLog) {
          this.auditLog.push(...parsedData.auditLog);
        }

        logger.info('Configurations loaded', {
          configCount: this.configurations.size,
          auditEntries: this.auditLog.length,
        });
      }
    } catch (error) {
      logger.error('Failed to load configurations', {
        error: (error as Error).message,
        configPath: this.configPath,
      });
    }
  }

  /**
   * Persist configurations to file
   */
  private async persistConfigurations(): Promise<void> {
    try {
      const configData = {
        configurations: Object.fromEntries(this.configurations),
        auditLog: this.auditLog.slice(-1000), // Keep last 1000 audit entries
        lastUpdated: new Date().toISOString(),
      };

      writeFileSync(this.configPath, JSON.stringify(configData, null, 2));

      logger.debug('Configurations persisted', {
        configCount: this.configurations.size,
        configPath: this.configPath,
      });
    } catch (error) {
      logger.error('Failed to persist configurations', {
        error: (error as Error).message,
        configPath: this.configPath,
      });
    }
  }
  /**
   * Initialize default schemas
   */
  private initializeDefaultSchemas(): void {
    // Database configuration schema
    this.registerSchema('database', {
      DATABASE_URL: {
        type: 'string',
        required: true,
        sensitive: true,
        validation: z.string().url(),
        description: 'Database connection URL',
        environment: 'DATABASE_URL',
      },
      DATABASE_POOL_MIN: {
        type: 'number',
        required: false,
        sensitive: false,
        validation: z.number().min(1).max(100),
        description: 'Minimum database pool size',
        defaultValue: 2,
        environment: 'DATABASE_POOL_MIN',
      },
      DATABASE_POOL_MAX: {
        type: 'number',
        required: false,
        sensitive: false,
        validation: z.number().min(1).max(100),
        description: 'Maximum database pool size',
        defaultValue: 10,
        environment: 'DATABASE_POOL_MAX',
      },
    });

    // JWT configuration schema
    this.registerSchema('jwt', {
      JWT_SECRET: {
        type: 'string',
        required: true,
        sensitive: true,
        validation: z.string().min(32),
        description: 'JWT signing secret',
        environment: 'JWT_SECRET',
      },
      JWT_EXPIRES_IN: {
        type: 'string',
        required: false,
        sensitive: false,
        validation: z.string().regex(/^\d+[smhd]$/),
        description: 'JWT expiration time',
        defaultValue: '15m',
        environment: 'JWT_EXPIRES_IN',
      },
      JWT_REFRESH_EXPIRES_IN: {
        type: 'string',
        required: false,
        sensitive: false,
        validation: z.string().regex(/^\d+[smhd]$/),
        description: 'JWT refresh token expiration time',
        defaultValue: '7d',
        environment: 'JWT_REFRESH_EXPIRES_IN',
      },
    });

    // OAuth configuration schema
    this.registerSchema('oauth', {
      GOOGLE_CLIENT_ID: {
        type: 'string',
        required: false,
        sensitive: false,
        validation: z.string().min(1),
        description: 'Google OAuth client ID',
        environment: 'GOOGLE_CLIENT_ID',
      },
      GOOGLE_CLIENT_SECRET: {
        type: 'string',
        required: false,
        sensitive: true,
        validation: z.string().min(1),
        description: 'Google OAuth client secret',
        environment: 'GOOGLE_CLIENT_SECRET',
      },
      GITHUB_CLIENT_ID: {
        type: 'string',
        required: false,
        sensitive: false,
        validation: z.string().min(1),
        description: 'GitHub OAuth client ID',
        environment: 'GITHUB_CLIENT_ID',
      },
      GITHUB_CLIENT_SECRET: {
        type: 'string',
        required: false,
        sensitive: true,
        validation: z.string().min(1),
        description: 'GitHub OAuth client secret',
        environment: 'GITHUB_CLIENT_SECRET',
      },
    });

    // Security configuration schema
    this.registerSchema('security', {
      ENCRYPTION_MASTER_KEY: {
        type: 'string',
        required: true,
        sensitive: true,
        validation: z.string().min(32),
        description: 'Master encryption key',
        environment: 'ENCRYPTION_MASTER_KEY',
      },
      RATE_LIMIT_MAX: {
        type: 'number',
        required: false,
        sensitive: false,
        validation: z.number().min(1).max(10000),
        description: 'Rate limit maximum requests',
        defaultValue: 100,
        environment: 'RATE_LIMIT_MAX',
      },
      RATE_LIMIT_WINDOW: {
        type: 'number',
        required: false,
        sensitive: false,
        validation: z.number().min(1000).max(3600000),
        description: 'Rate limit window in milliseconds',
        defaultValue: 900000,
        environment: 'RATE_LIMIT_WINDOW',
      },
    });
  }

  /**
   * Get configuration audit log
   */
  getAuditLog(options?: {
    key?: string;
    actor?: string;
    action?: string;
    limit?: number;
  }): ConfigurationAudit[] {
    let filteredLog = [...this.auditLog];

    if (options?.key) {
      filteredLog = filteredLog.filter((entry) => entry.key === options.key);
    }

    if (options?.actor) {
      filteredLog = filteredLog.filter(
        (entry) => entry.actor === options.actor
      );
    }

    if (options?.action) {
      filteredLog = filteredLog.filter(
        (entry) => entry.action === options.action
      );
    }

    // Sort by timestamp (newest first)
    filteredLog.sort((a, b) => {
      const aTime =
        a.timestamp instanceof Date
          ? a.timestamp.getTime()
          : new Date(a.timestamp).getTime();
      const bTime =
        b.timestamp instanceof Date
          ? b.timestamp.getTime()
          : new Date(b.timestamp).getTime();
      return bTime - aTime;
    });

    if (options?.limit) {
      filteredLog = filteredLog.slice(0, options.limit);
    }

    return filteredLog;
  }

  /**
   * Export configurations (non-sensitive)
   */
  exportConfigurations(environment?: string): {
    configurations: Record<string, any>;
    metadata: {
      exportedAt: Date;
      environment: string;
      totalConfigs: number;
      sensitiveConfigs: number;
    };
  } {
    const targetEnv = environment || process.env.NODE_ENV || 'development';
    const configurations: Record<string, any> = {};
    let sensitiveCount = 0;

    for (const [key, config] of this.configurations) {
      if (config.environment === targetEnv) {
        if (config.sensitive) {
          sensitiveCount++;
          configurations[key] = '[SENSITIVE - REDACTED]';
        } else {
          configurations[key] = config.encrypted ? '[ENCRYPTED]' : config.value;
        }
      }
    }

    return {
      configurations,
      metadata: {
        exportedAt: new Date(),
        environment: targetEnv,
        totalConfigs: Object.keys(configurations).length,
        sensitiveConfigs: sensitiveCount,
      },
    };
  }

  /**
   * Validate all configurations
   */
  async validateAllConfigurations(): Promise<{
    valid: boolean;
    errors: Array<{
      key: string;
      error: string;
    }>;
  }> {
    const errors: Array<{ key: string; error: string }> = [];

    for (const [key, config] of this.configurations) {
      try {
        let value = config.value;
        if (config.encrypted) {
          value = await dataEncryptionService.decryptField(key, config.value);
        }
        await this.validateConfiguration(key, value);
      } catch (error) {
        errors.push({
          key,
          error: (error as Error).message,
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }

  /**
   * Rotate encryption keys for all encrypted configurations
   */
  async rotateEncryptionKeys(): Promise<{
    rotated: string[];
    failed: string[];
  }> {
    const rotated: string[] = [];
    const failed: string[] = [];

    for (const [key, config] of this.configurations) {
      if (config.encrypted) {
        try {
          // Decrypt with old key
          const decryptedValue = await dataEncryptionService.decryptField(
            key,
            config.value
          );

          // Re-encrypt with new key
          const newEncryptedValue = await dataEncryptionService.encryptField(
            key,
            decryptedValue
          );

          // Update configuration
          config.value = newEncryptedValue;
          config.lastModified = new Date();
          config.version++;
          config.checksum = this.calculateChecksum(key, newEncryptedValue);

          rotated.push(key);
        } catch (error) {
          failed.push(key);
          logger.error('Failed to rotate encryption key for configuration', {
            key,
            error: (error as Error).message,
          });
        }
      }
    }

    if (rotated.length > 0) {
      await this.persistConfigurations();
    }

    // Audit trail
    await auditTrailManager.recordEvent({
      actor: AuditHelpers.createSystemActor('config-manager'),
      action: 'encryption_keys_rotated',
      resource: AuditHelpers.createResource(
        'configuration_system',
        'encryption'
      ),
      outcome: AuditHelpers.createSuccessOutcome(),
      metadata: {
        rotatedCount: rotated.length,
        failedCount: failed.length,
        rotatedKeys: rotated,
        failedKeys: failed,
      },
    });

    logger.info('Configuration encryption keys rotated', {
      rotated: rotated.length,
      failed: failed.length,
    });

    return { rotated, failed };
  }

  /**
   * Get configuration statistics
   */
  getStatistics(): {
    totalConfigurations: number;
    encryptedConfigurations: number;
    sensitiveConfigurations: number;
    configurationsByEnvironment: Record<string, number>;
    auditLogEntries: number;
    lastModified?: Date;
  } {
    const stats = {
      totalConfigurations: this.configurations.size,
      encryptedConfigurations: 0,
      sensitiveConfigurations: 0,
      configurationsByEnvironment: {} as Record<string, number>,
      auditLogEntries: this.auditLog.length,
      lastModified: undefined as Date | undefined,
    };

    for (const config of this.configurations.values()) {
      if (config.encrypted) stats.encryptedConfigurations++;
      if (config.sensitive) stats.sensitiveConfigurations++;

      stats.configurationsByEnvironment[config.environment] =
        (stats.configurationsByEnvironment[config.environment] || 0) + 1;

      if (!stats.lastModified || config.lastModified > stats.lastModified) {
        stats.lastModified = config.lastModified;
      }
    }

    return stats;
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    const stats = this.getStatistics();

    // Check if critical configurations are present
    const criticalConfigs = ['JWT_SECRET', 'DATABASE_URL'];
    const missingCritical = criticalConfigs.filter(
      (key) => !this.configurations.has(key)
    );

    let status: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

    if (missingCritical.length > 0) {
      status = 'unhealthy';
    } else if (
      stats.encryptedConfigurations === 0 &&
      stats.sensitiveConfigurations > 0
    ) {
      status = 'degraded';
    }

    return {
      status,
      details: {
        totalConfigurations: stats.totalConfigurations,
        encryptedConfigurations: stats.encryptedConfigurations,
        sensitiveConfigurations: stats.sensitiveConfigurations,
        missingCriticalConfigs: missingCritical,
        encryptionEnabled: this.encryptionEnabled,
        configPath: this.configPath,
        schemasRegistered: this.schemas.size,
      },
    };
  }

  /**
   * Cleanup old audit entries
   */
  cleanupAuditLog(maxEntries: number = 1000): number {
    const initialCount = this.auditLog.length;

    if (initialCount > maxEntries) {
      // Keep the most recent entries
      this.auditLog.splice(0, initialCount - maxEntries);

      logger.info('Configuration audit log cleaned up', {
        removedEntries: initialCount - maxEntries,
        remainingEntries: this.auditLog.length,
      });
    }

    return initialCount - this.auditLog.length;
  }

  /**
   * Shutdown and cleanup
   */
  async shutdown(): Promise<void> {
    try {
      await this.persistConfigurations();
      this.configurations.clear();
      this.schemas.clear();
      this.auditLog.length = 0;

      logger.info('Secure configuration manager shutdown complete');
    } catch (error) {
      logger.error('Error during secure configuration manager shutdown', {
        error: (error as Error).message,
      });
    }
  }
}

// Export singleton instance
export const secureConfigManager = new SecureConfigManagerService();
