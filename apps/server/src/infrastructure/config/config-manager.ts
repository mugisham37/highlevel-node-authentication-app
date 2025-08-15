import { config as dotenvConfig } from 'dotenv';
import {
  AppConfig,
  ConfigSchema,
  EnvironmentProfile,
  ConfigValidationResult,
} from './types';
import { SecretsManager } from './secrets-manager';
import { DynamicConfigManager, DynamicConfigOptions } from './dynamic-config';
import {
  getProfile,
  validateProfileRequirements,
  mergeProfileOverrides,
} from './profiles';

export class ConfigManager {
  private static instance: ConfigManager;
  private config!: AppConfig;
  private secretsManager!: SecretsManager;
  private dynamicConfigManager?: DynamicConfigManager;
  private initialized = false;

  private constructor() {
    // Private constructor for singleton
  }

  static getInstance(): ConfigManager {
    if (!ConfigManager.instance) {
      ConfigManager.instance = new ConfigManager();
    }
    return ConfigManager.instance;
  }

  async initialize(
    options: {
      secretsPath?: string;
      masterPassword?: string;
      enableDynamicConfig?: boolean;
      configPath?: string;
    } = {}
  ): Promise<void> {
    if (this.initialized) {
      return;
    }

    try {
      // Load environment variables
      dotenvConfig();

      // Initialize secrets manager
      this.secretsManager = new SecretsManager(
        options.secretsPath,
        options.masterPassword
      );

      // Build configuration from multiple sources
      const rawConfig = await this.buildConfiguration();

      // Validate configuration
      const validation = this.validateConfiguration(rawConfig);
      if (!validation.valid) {
        console.error('Configuration validation failed:', validation.errors);
        throw new Error(
          `Configuration validation failed: ${validation.errors.join(', ')}`
        );
      }

      if (validation.warnings.length > 0) {
        validation.warnings.forEach((warning) =>
          console.warn(`Configuration warning: ${warning}`)
        );
      }

      this.config = rawConfig;

      // Initialize dynamic configuration manager if enabled
      if (options.enableDynamicConfig !== false) {
        const dynamicConfigOptions: DynamicConfigOptions = {
          watchFiles: true,
          validateOnChange: true,
          backupOnChange: true,
        };
        
        if (options.configPath) {
          dynamicConfigOptions.configPath = options.configPath;
        }

        this.dynamicConfigManager = new DynamicConfigManager(
          this.config,
          this.secretsManager,
          dynamicConfigOptions
        );

        // Listen for configuration changes
        this.dynamicConfigManager.on('configChange', (changeEvent) => {
          console.log('Configuration changed:', {
            section: changeEvent.section,
            source: changeEvent.source,
            userId: changeEvent.userId,
          });
        });

        this.dynamicConfigManager.on('error', (error) => {
          console.error('Dynamic configuration error:', error);
        });
      }

      this.initialized = true;
      console.log('Configuration manager initialized successfully', {
        environment: this.config.env,
        dynamicConfig: !!this.dynamicConfigManager,
      });
    } catch (error) {
      console.error('Failed to initialize configuration manager:', error);
      throw error;
    }
  }

  private async buildConfiguration(): Promise<AppConfig> {
    // Start with environment-based profile
    const environment =
      (process.env.NODE_ENV as EnvironmentProfile) || 'development';
    const profile = getProfile(environment);

    // Check if all required secrets are available
    const availableSecrets = await this.getAvailableSecrets();
    const profileValidation = validateProfileRequirements(
      profile,
      availableSecrets
    );

    if (!profileValidation.valid) {
      console.warn('Missing required secrets for profile:', {
        profile: profile.name,
        missingSecrets: profileValidation.missingSecrets,
      });
    }

    // Build base configuration from environment variables and secrets
    const baseConfig = await this.buildBaseConfiguration();

    // Apply profile overrides
    const configWithProfile = mergeProfileOverrides(baseConfig, profile);

    // Parse and validate with Zod schema
    const parseResult = ConfigSchema.safeParse(configWithProfile);

    if (!parseResult.success) {
      console.error(
        'Configuration schema validation failed:',
        parseResult.error.format()
      );
      throw new Error('Configuration schema validation failed');
    }

    return parseResult.data;
  }

  private async buildBaseConfiguration(): Promise<Partial<AppConfig>> {
    const getValue = async (key: string, defaultValue: string = ''): Promise<string> => {
      const value = await this.secretsManager.getConfigValue(key, defaultValue);
      return value || defaultValue;
    };

    return {
      env: (await getValue('NODE_ENV', 'development')) as EnvironmentProfile,

      server: {
        host: await getValue('SERVER_HOST', 'localhost'),
        port: parseInt(await getValue('SERVER_PORT', '3000')),
        cors: {
          origin: this.parseOrigins(await getValue('CORS_ORIGINS', 'true')),
          credentials: (await getValue('CORS_CREDENTIALS', 'true')) === 'true',
        },
        helmet: {
          contentSecurityPolicy: (await getValue('HELMET_CSP', 'true')) === 'true',
          crossOriginEmbedderPolicy: (await getValue('HELMET_COEP', 'false')) === 'true',
        },
      },

      database: {
        url: await getValue('DATABASE_URL'),
        replicaUrls: this.parseArray(
          await getValue('DATABASE_REPLICA_URLS', '')
        ),
        pool: {
          min: parseInt(await getValue('DATABASE_POOL_MIN', '2')),
          max: parseInt(await getValue('DATABASE_POOL_MAX', '20')),
          idleTimeout: parseInt(
            await getValue('DATABASE_IDLE_TIMEOUT', '30000')
          ),
          connectionTimeout: parseInt(
            await getValue('DATABASE_CONNECTION_TIMEOUT', '5000')
          ),
        },
        retry: {
          maxRetries: parseInt(await getValue('DATABASE_MAX_RETRIES', '3')),
          retryDelay: parseInt(await getValue('DATABASE_RETRY_DELAY', '1000')),
          backoffMultiplier: parseFloat(
            await getValue('DATABASE_BACKOFF_MULTIPLIER', '2')
          ),
        },
      },

      redis: {
        url: await getValue('REDIS_URL', 'redis://localhost:6379'),
        host: await getValue('REDIS_HOST', 'localhost'),
        port: parseInt(await getValue('REDIS_PORT', '6379')),
        password: await getValue('REDIS_PASSWORD'),
        db: parseInt(await getValue('REDIS_DB', '0')),
        cluster: {
          enabled:
            (await getValue('REDIS_CLUSTER_ENABLED', 'false')) === 'true',
          nodes: this.parseRedisNodes(
            await getValue('REDIS_CLUSTER_NODES', '')
          ),
        },
        retry: {
          maxRetries: parseInt(await getValue('REDIS_MAX_RETRIES', '3')),
          retryDelay: parseInt(await getValue('REDIS_RETRY_DELAY', '100')),
        },
        timeouts: {
          connect: parseInt(await getValue('REDIS_CONNECT_TIMEOUT', '10000')),
          command: parseInt(await getValue('REDIS_COMMAND_TIMEOUT', '5000')),
          keepAlive: parseInt(await getValue('REDIS_KEEP_ALIVE', '30000')),
        },
      },

      jwt: {
        secret: await getValue('JWT_SECRET'),
        expiresIn: await getValue('JWT_EXPIRES_IN', '15m'),
        refreshExpiresIn: await getValue('JWT_REFRESH_EXPIRES_IN', '7d'),
        issuer: await getValue('JWT_ISSUER', 'enterprise-auth'),
        audience: await getValue('JWT_AUDIENCE', 'enterprise-auth-users'),
        algorithm: (await getValue('JWT_ALGORITHM', 'HS256')) as any,
      },

      oauth: {
        custom: {},
        google: {
          clientId: await getValue('GOOGLE_CLIENT_ID', ''),
          clientSecret: await getValue('GOOGLE_CLIENT_SECRET', ''),
          redirectUri: await getValue('GOOGLE_REDIRECT_URI', ''),
          scope: this.parseArray(
            await getValue('GOOGLE_SCOPES', 'openid,email,profile')
          ),
          enabled: !!(await getValue('GOOGLE_CLIENT_ID', '')),
        },
        github: {
          clientId: await getValue('GITHUB_CLIENT_ID', ''),
          clientSecret: await getValue('GITHUB_CLIENT_SECRET', ''),
          redirectUri: await getValue('GITHUB_REDIRECT_URI', ''),
          scope: this.parseArray(await getValue('GITHUB_SCOPES', 'user:email')),
          enabled: !!(await getValue('GITHUB_CLIENT_ID', '')),
        },
        microsoft: {
          clientId: await getValue('MICROSOFT_CLIENT_ID', ''),
          clientSecret: await getValue('MICROSOFT_CLIENT_SECRET', ''),
          redirectUri: await getValue('MICROSOFT_REDIRECT_URI', ''),
          scope: this.parseArray(
            await getValue('MICROSOFT_SCOPES', 'openid,email,profile')
          ),
          enabled: !!(await getValue('MICROSOFT_CLIENT_ID', '')),
        },
      },

      email: {
        smtp: {
          host: await getValue('SMTP_HOST', ''),
          port: parseInt(await getValue('SMTP_PORT', '587')),
          secure: (await getValue('SMTP_SECURE', 'false')) === 'true',
          user: await getValue('SMTP_USER', ''),
          pass: await getValue('SMTP_PASS', ''),
          from: await getValue('SMTP_FROM', ''),
        },
        templates: {
          verification: await getValue('EMAIL_TEMPLATE_VERIFICATION', 'email-verification'),
          passwordReset: await getValue('EMAIL_TEMPLATE_PASSWORD_RESET', 'password-reset'),
          mfaCode: await getValue('EMAIL_TEMPLATE_MFA_CODE', 'mfa-code'),
        },
      },

      sms: {
        provider: (await getValue('SMS_PROVIDER', 'twilio')) as any,
        twilio: {
          accountSid: await getValue('TWILIO_ACCOUNT_SID'),
          authToken: await getValue('TWILIO_AUTH_TOKEN'),
          phoneNumber: await getValue('TWILIO_PHONE_NUMBER'),
        },
        awsSns: {
          region: await getValue('AWS_SNS_REGION', 'us-east-1'),
          accessKeyId: await getValue('AWS_ACCESS_KEY_ID'),
          secretAccessKey: await getValue('AWS_SECRET_ACCESS_KEY'),
        },
      },

      security: {
        encryption: {
          algorithm: await getValue('ENCRYPTION_ALGORITHM', 'aes-256-gcm'),
          keyDerivation: {
            algorithm: await getValue('KEY_DERIVATION_ALGORITHM', 'pbkdf2'),
            iterations: parseInt(await getValue('KEY_DERIVATION_ITERATIONS', '100000')),
            keyLength: parseInt(await getValue('KEY_DERIVATION_KEY_LENGTH', '32')),
            digest: await getValue('KEY_DERIVATION_DIGEST', 'sha512'),
          },
        },
        hashing: {
          algorithm: (await getValue('HASHING_ALGORITHM', 'argon2')) as any,
          argon2: {
            type: (await getValue('ARGON2_TYPE', 'argon2id')) as any,
            memoryCost: parseInt(await getValue('ARGON2_MEMORY_COST', '65536')),
            timeCost: parseInt(await getValue('ARGON2_TIME_COST', '3')),
            parallelism: parseInt(await getValue('ARGON2_PARALLELISM', '4')),
          },
          bcrypt: {
            rounds: parseInt(await getValue('BCRYPT_ROUNDS', '12')),
          },
        },
        rateLimit: {
          global: {
            max: parseInt(await getValue('RATE_LIMIT_GLOBAL_MAX', '1000')),
            window: parseInt(
              await getValue('RATE_LIMIT_GLOBAL_WINDOW', '900000')
            ),
          },
          auth: {
            max: parseInt(await getValue('RATE_LIMIT_AUTH_MAX', '5')),
            window: parseInt(
              await getValue('RATE_LIMIT_AUTH_WINDOW', '900000')
            ),
          },
          api: {
            max: parseInt(await getValue('RATE_LIMIT_API_MAX', '100')),
            window: parseInt(await getValue('RATE_LIMIT_API_WINDOW', '900000')),
          },
        },
        session: {
          maxConcurrent: parseInt(await getValue('SESSION_MAX_CONCURRENT', '5')),
          inactivityTimeout: parseInt(await getValue('SESSION_INACTIVITY_TIMEOUT', '1800000')),
          absoluteTimeout: parseInt(await getValue('SESSION_ABSOLUTE_TIMEOUT', '86400000')),
        },
      },

      logging: {
        level: (await getValue('LOG_LEVEL', 'info')) as any,
        format: (await getValue('LOG_FORMAT', 'json')) as any,
        file: {
          enabled: (await getValue('LOG_FILE_ENABLED', 'true')) === 'true',
          path: await getValue('LOG_FILE_PATH', 'logs/app.log'),
          maxSize: await getValue('LOG_FILE_MAX_SIZE', '10m'),
          maxFiles: parseInt(await getValue('LOG_FILE_MAX_FILES', '5')),
        },
        console: {
          enabled: (await getValue('LOG_CONSOLE_ENABLED', 'true')) === 'true',
          colorize: (await getValue('LOG_CONSOLE_COLORIZE', 'true')) === 'true',
        },
        audit: {
          enabled: (await getValue('LOG_AUDIT_ENABLED', 'true')) === 'true',
          path: await getValue('LOG_AUDIT_PATH', 'logs/audit.log'),
          maxSize: await getValue('LOG_AUDIT_MAX_SIZE', '100m'),
          maxFiles: parseInt(await getValue('LOG_AUDIT_MAX_FILES', '10')),
        },
      },

      monitoring: {
        metrics: {
          enabled: (await getValue('METRICS_ENABLED', 'true')) === 'true',
          port: parseInt(await getValue('METRICS_PORT', '9090')),
          path: await getValue('METRICS_PATH', '/metrics'),
        },
        health: {
          enabled: (await getValue('HEALTH_ENABLED', 'true')) === 'true',
          path: await getValue('HEALTH_PATH', '/health'),
          checks: {
            database: (await getValue('HEALTH_CHECK_DATABASE', 'true')) === 'true',
            redis: (await getValue('HEALTH_CHECK_REDIS', 'true')) === 'true',
            external: (await getValue('HEALTH_CHECK_EXTERNAL', 'true')) === 'true',
          },
        },
        tracing: {
          enabled: (await getValue('TRACING_ENABLED', 'false')) === 'true',
          serviceName: await getValue(
            'TRACING_SERVICE_NAME',
            'enterprise-auth'
          ),
          endpoint: await getValue('TRACING_ENDPOINT'),
        },
      },

      webhooks: {
        enabled: (await getValue('WEBHOOKS_ENABLED', 'true')) === 'true',
        maxRetries: parseInt(await getValue('WEBHOOKS_MAX_RETRIES', '3')),
        retryDelay: parseInt(await getValue('WEBHOOKS_RETRY_DELAY', '5000')),
        timeout: parseInt(await getValue('WEBHOOKS_TIMEOUT', '30000')),
        signatureHeader: await getValue('WEBHOOKS_SIGNATURE_HEADER', 'X-Webhook-Signature'),
        timestampHeader: await getValue('WEBHOOKS_TIMESTAMP_HEADER', 'X-Webhook-Timestamp'),
        maxAge: parseInt(await getValue('WEBHOOKS_MAX_AGE', '300')),
      },
    };
  }

  private validateConfiguration(
    config: Partial<AppConfig>
  ): ConfigValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];

    // Environment-specific validations
    if (config.env === 'production') {
      if (!config.jwt?.secret || config.jwt.secret.length < 32) {
        errors.push('JWT secret must be at least 32 characters in production');
      }

      if (!config.database?.url) {
        errors.push('Database URL is required in production');
      }

      if (config.logging?.level === 'debug') {
        warnings.push('Debug logging is enabled in production');
      }
    }

    // Security validations
    if (
      config.security?.rateLimit?.global?.max &&
      config.security.rateLimit.global.max > 10000
    ) {
      warnings.push('Global rate limit is very high');
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private async getAvailableSecrets(): Promise<string[]> {
    const secrets = await this.secretsManager.listSecrets();
    const envVars = Object.keys(process.env);
    return [...secrets.map((s) => s.name), ...envVars];
  }

  private parseArray(value: string): string[] {
    if (!value) return [];
    return value
      .split(',')
      .map((item) => item.trim())
      .filter(Boolean);
  }

  private parseOrigins(value: string): string | string[] | boolean {
    if (value === 'true') return true;
    if (value === 'false') return false;
    if (value.includes(',')) return this.parseArray(value);
    return value;
  }

  private parseRedisNodes(
    value: string
  ): Array<{ host: string; port: number }> {
    if (!value) return [];
    return this.parseArray(value).map((node) => {
      const [host, port] = node.split(':');
      return {
        host: host || 'localhost',
        port: parseInt(port || '6379') || 6379,
      };
    });
  }

  // Public API methods
  getConfig(): AppConfig {
    this.ensureInitialized();
    return { ...this.config };
  }

  getConfigSection<K extends keyof AppConfig>(section: K): AppConfig[K] {
    this.ensureInitialized();
    return this.config[section];
  }

  async updateConfig(
    updates: Partial<AppConfig>,
    userId?: string
  ): Promise<ConfigValidationResult> {
    this.ensureInitialized();

    if (this.dynamicConfigManager) {
      return this.dynamicConfigManager.updateConfig(updates, 'api', userId);
    }

    return {
      valid: false,
      errors: ['Dynamic configuration is not enabled'],
      warnings: [],
    };
  }

  async updateConfigSection<K extends keyof AppConfig>(
    section: K,
    value: AppConfig[K],
    userId?: string
  ): Promise<ConfigValidationResult> {
    this.ensureInitialized();

    if (this.dynamicConfigManager) {
      return this.dynamicConfigManager.setConfigSection(
        section,
        value,
        'api',
        userId
      );
    }

    return {
      valid: false,
      errors: ['Dynamic configuration is not enabled'],
      warnings: [],
    };
  }

  getSecretsManager(): SecretsManager {
    this.ensureInitialized();
    return this.secretsManager;
  }

  getDynamicConfigManager(): DynamicConfigManager | undefined {
    this.ensureInitialized();
    return this.dynamicConfigManager;
  }

  async reload(): Promise<void> {
    this.initialized = false;
    await this.initialize();
  }

  async shutdown(): Promise<void> {
    if (this.dynamicConfigManager) {
      await this.dynamicConfigManager.shutdown();
    }

    this.initialized = false;
    console.log('Configuration manager shutdown complete');
  }

  private ensureInitialized(): void {
    if (!this.initialized) {
      throw new Error(
        'Configuration manager not initialized. Call initialize() first.'
      );
    }
  }

  // Utility methods for common configuration patterns
  isDevelopment(): boolean {
    return this.getConfig().env === 'development';
  }

  isProduction(): boolean {
    return this.getConfig().env === 'production';
  }

  isTest(): boolean {
    return this.getConfig().env === 'test';
  }

  getServerUrl(): string {
    const { server } = this.getConfig();
    const protocol = this.isProduction() ? 'https' : 'http';
    return `${protocol}://${server.host}:${server.port}`;
  }

  getDatabaseUrl(): string {
    const { database } = this.getConfig();
    if (!database.url) {
      throw new Error('Database URL not configured');
    }
    return database.url;
  }

  getRedisUrl(): string {
    const { redis } = this.getConfig();
    return redis.url;
  }
}

// Export singleton instance
export const configManager = ConfigManager.getInstance();
