import { z } from 'zod';

// Configuration validation schemas
export const ServerConfigSchema = z.object({
  host: z.string().default('localhost'),
  port: z.coerce.number().min(1).max(65535).default(3000),
  cors: z
    .object({
      origin: z
        .union([z.string(), z.array(z.string()), z.boolean()])
        .default(true),
      credentials: z.boolean().default(true),
    })
    .default({}),
  helmet: z
    .object({
      contentSecurityPolicy: z.boolean().default(true),
      crossOriginEmbedderPolicy: z.boolean().default(false),
    })
    .default({}),
});

export const DatabaseConfigSchema = z.object({
  url: z.string().url(),
  replicaUrls: z.array(z.string().url()).default([]),
  pool: z
    .object({
      min: z.coerce.number().min(0).default(2),
      max: z.coerce.number().min(1).default(20),
      idleTimeout: z.coerce.number().min(1000).default(30000),
      connectionTimeout: z.coerce.number().min(1000).default(5000),
    })
    .default({}),
  retry: z
    .object({
      maxRetries: z.coerce.number().min(0).default(3),
      retryDelay: z.coerce.number().min(100).default(1000),
      backoffMultiplier: z.coerce.number().min(1).default(2),
    })
    .default({}),
});

export const RedisConfigSchema = z.object({
  url: z.string().default('redis://localhost:6379'),
  host: z.string().default('localhost'),
  port: z.coerce.number().min(1).max(65535).default(6379),
  password: z.string().optional(),
  db: z.coerce.number().min(0).default(0),
  cluster: z
    .object({
      enabled: z.coerce.boolean().default(false),
      nodes: z
        .array(
          z.object({
            host: z.string(),
            port: z.coerce.number().min(1).max(65535),
          })
        )
        .default([]),
    })
    .default({}),
  retry: z
    .object({
      maxRetries: z.coerce.number().min(0).default(3),
      retryDelay: z.coerce.number().min(100).default(100),
    })
    .default({}),
  timeouts: z
    .object({
      connect: z.coerce.number().min(1000).default(10000),
      command: z.coerce.number().min(1000).default(5000),
      keepAlive: z.coerce.number().min(1000).default(30000),
    })
    .default({}),
});

export const JWTConfigSchema = z.object({
  secret: z.string().min(32, 'JWT secret must be at least 32 characters'),
  expiresIn: z.string().default('15m'),
  refreshExpiresIn: z.string().default('7d'),
  issuer: z.string().default('enterprise-auth'),
  audience: z.string().default('enterprise-auth-users'),
  algorithm: z
    .enum(['HS256', 'HS384', 'HS512', 'RS256', 'RS384', 'RS512'])
    .default('HS256'),
});

export const OAuthProviderSchema = z.object({
  clientId: z.string().optional(),
  clientSecret: z.string().optional(),
  redirectUri: z.string().url().optional(),
  scope: z.array(z.string()).default([]),
  enabled: z.boolean().default(false),
});

export const OAuthConfigSchema = z.object({
  google: OAuthProviderSchema.default({}),
  github: OAuthProviderSchema.default({}),
  microsoft: OAuthProviderSchema.default({}),
  custom: z.record(z.string(), OAuthProviderSchema).default({}),
});

export const EmailConfigSchema = z.object({
  smtp: z
    .object({
      host: z.string().optional(),
      port: z.coerce.number().min(1).max(65535).default(587),
      secure: z.boolean().default(false),
      user: z.string().optional(),
      pass: z.string().optional(),
      from: z.string().email().optional(),
    })
    .default({}),
  templates: z
    .object({
      verification: z.string().default('email-verification'),
      passwordReset: z.string().default('password-reset'),
      mfaCode: z.string().default('mfa-code'),
    })
    .default({}),
});

export const SMSConfigSchema = z.object({
  provider: z.enum(['twilio', 'aws-sns']).default('twilio'),
  twilio: z
    .object({
      accountSid: z.string().optional(),
      authToken: z.string().optional(),
      phoneNumber: z.string().optional(),
    })
    .default({}),
  awsSns: z
    .object({
      region: z.string().default('us-east-1'),
      accessKeyId: z.string().optional(),
      secretAccessKey: z.string().optional(),
    })
    .default({}),
});

export const SecurityConfigSchema = z.object({
  encryption: z
    .object({
      algorithm: z.string().default('aes-256-gcm'),
      keyDerivation: z
        .object({
          algorithm: z.string().default('pbkdf2'),
          iterations: z.coerce.number().min(10000).default(100000),
          keyLength: z.coerce.number().min(32).default(32),
          digest: z.string().default('sha512'),
        })
        .default({}),
    })
    .default({}),
  hashing: z
    .object({
      algorithm: z.enum(['argon2', 'bcrypt']).default('argon2'),
      argon2: z
        .object({
          type: z.enum(['argon2d', 'argon2i', 'argon2id']).default('argon2id'),
          memoryCost: z.coerce.number().min(1024).default(65536),
          timeCost: z.coerce.number().min(1).default(3),
          parallelism: z.coerce.number().min(1).default(4),
        })
        .default({}),
      bcrypt: z
        .object({
          rounds: z.coerce.number().min(10).max(15).default(12),
        })
        .default({}),
    })
    .default({}),
  rateLimit: z
    .object({
      global: z
        .object({
          max: z.coerce.number().min(1).default(1000),
          window: z.coerce.number().min(1000).default(900000), // 15 minutes
        })
        .default({}),
      auth: z
        .object({
          max: z.coerce.number().min(1).default(5),
          window: z.coerce.number().min(1000).default(900000), // 15 minutes
        })
        .default({}),
      api: z
        .object({
          max: z.coerce.number().min(1).default(100),
          window: z.coerce.number().min(1000).default(900000), // 15 minutes
        })
        .default({}),
    })
    .default({}),
  session: z
    .object({
      maxConcurrent: z.coerce.number().min(1).default(5),
      inactivityTimeout: z.coerce.number().min(60000).default(1800000), // 30 minutes
      absoluteTimeout: z.coerce.number().min(3600000).default(86400000), // 24 hours
    })
    .default({}),
});

export const LoggingConfigSchema = z.object({
  level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  format: z.enum(['json', 'simple']).default('json'),
  file: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().default('logs/app.log'),
      maxSize: z.string().default('10m'),
      maxFiles: z.coerce.number().min(1).default(5),
    })
    .default({}),
  console: z
    .object({
      enabled: z.boolean().default(true),
      colorize: z.boolean().default(true),
    })
    .default({}),
  audit: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().default('logs/audit.log'),
      maxSize: z.string().default('100m'),
      maxFiles: z.coerce.number().min(1).default(10),
    })
    .default({}),
});

export const MonitoringConfigSchema = z.object({
  metrics: z
    .object({
      enabled: z.boolean().default(true),
      port: z.coerce.number().min(1).max(65535).default(9090),
      path: z.string().default('/metrics'),
    })
    .default({}),
  health: z
    .object({
      enabled: z.boolean().default(true),
      path: z.string().default('/health'),
      checks: z
        .object({
          database: z.boolean().default(true),
          redis: z.boolean().default(true),
          external: z.boolean().default(true),
        })
        .default({}),
    })
    .default({}),
  tracing: z
    .object({
      enabled: z.boolean().default(false),
      serviceName: z.string().default('enterprise-auth'),
      endpoint: z.string().optional(),
    })
    .default({}),
});

export const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  maxRetries: z.coerce.number().min(0).default(3),
  retryDelay: z.coerce.number().min(1000).default(5000),
  timeout: z.coerce.number().min(1000).default(30000),
  signatureHeader: z.string().default('X-Webhook-Signature'),
  timestampHeader: z.string().default('X-Webhook-Timestamp'),
  maxAge: z.coerce.number().min(60).default(300), // 5 minutes
});

// Main configuration schema
export const ConfigSchema = z.object({
  env: z
    .enum(['development', 'production', 'test', 'staging'])
    .default('development'),
  server: ServerConfigSchema,
  database: DatabaseConfigSchema,
  redis: RedisConfigSchema,
  jwt: JWTConfigSchema,
  oauth: OAuthConfigSchema,
  email: EmailConfigSchema,
  sms: SMSConfigSchema,
  security: SecurityConfigSchema,
  logging: LoggingConfigSchema,
  monitoring: MonitoringConfigSchema,
  webhooks: WebhookConfigSchema,
});

// Type definitions
export type ServerConfig = z.infer<typeof ServerConfigSchema>;
export type DatabaseConfig = z.infer<typeof DatabaseConfigSchema>;
export type RedisConfig = z.infer<typeof RedisConfigSchema>;
export type JWTConfig = z.infer<typeof JWTConfigSchema>;
export type OAuthConfig = z.infer<typeof OAuthConfigSchema>;
export type EmailConfig = z.infer<typeof EmailConfigSchema>;
export type SMSConfig = z.infer<typeof SMSConfigSchema>;
export type SecurityConfig = z.infer<typeof SecurityConfigSchema>;
export type LoggingConfig = z.infer<typeof LoggingConfigSchema>;
export type MonitoringConfig = z.infer<typeof MonitoringConfigSchema>;
export type WebhookConfig = z.infer<typeof WebhookConfigSchema>;
export type AppConfig = z.infer<typeof ConfigSchema>;

// Configuration change event types
export interface ConfigChangeEvent {
  timestamp: Date;
  section: keyof AppConfig;
  oldValue: any;
  newValue: any;
  source: 'file' | 'api' | 'env';
  userId?: string;
}

// Configuration validation result
export interface ConfigValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

// Environment-specific configuration profiles
export type EnvironmentProfile =
  | 'development'
  | 'staging'
  | 'production'
  | 'test';

export interface ConfigProfile {
  name: EnvironmentProfile;
  description: string;
  overrides: Partial<AppConfig>;
  requiredSecrets: string[];
  validationRules?: z.ZodSchema;
}
