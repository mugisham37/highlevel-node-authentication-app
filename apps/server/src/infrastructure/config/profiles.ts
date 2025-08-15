import { AppConfig, ConfigProfile, EnvironmentProfile } from './types';

// Development profile - optimized for local development
export const developmentProfile: ConfigProfile = {
  name: 'development',
  description: 'Local development environment with debug features enabled',
  requiredSecrets: ['JWT_SECRET'],
  overrides: {
    env: 'development',
    server: {
      host: 'localhost',
      port: 3000,
      cors: {
        origin: true,
        credentials: true,
      },
      helmet: {
        contentSecurityPolicy: false, // Disabled for easier development
        crossOriginEmbedderPolicy: false,
      },
    },
    database: {
      url: process.env.DATABASE_URL || 'postgresql://localhost:5432/auth_dev',
      replicaUrls: [],
      pool: {
        min: 1,
        max: 5, // Lower pool size for development
        idleTimeout: 30000,
        connectionTimeout: 5000,
      },
      retry: {
        maxRetries: 1,
        retryDelay: 500,
        backoffMultiplier: 1,
      },
    },
    redis: {
      url: 'redis://localhost:6379',
      host: 'localhost',
      port: 6379,
      db: 0,
      cluster: {
        enabled: false,
        nodes: [],
      },
      retry: {
        maxRetries: 1,
        retryDelay: 100,
      },
      timeouts: {
        connect: 10000,
        command: 5000,
        keepAlive: 30000,
      },
    },
    jwt: {
      secret: process.env.JWT_SECRET || 'dev-jwt-secret-change-in-production',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
      issuer: 'enterprise-auth-dev',
      audience: 'enterprise-auth-users',
      algorithm: 'HS256',
    },
    oauth: {
      google: {
        enabled: false,
        scope: [],
      },
      github: {
        enabled: false,
        scope: [],
      },
      microsoft: {
        enabled: false,
        scope: [],
      },
      custom: {},
    },
    email: {
      smtp: {
        port: 587,
        secure: false,
      },
      templates: {
        verification: 'email-verification',
        passwordReset: 'password-reset',
        mfaCode: 'mfa-code',
      },
    },
    sms: {
      provider: 'twilio',
      twilio: {},
      awsSns: {
        region: 'us-east-1',
      },
    },
    security: {
      encryption: {
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          algorithm: 'pbkdf2',
          iterations: 100000,
          keyLength: 32,
          digest: 'sha512',
        },
      },
      hashing: {
        algorithm: 'argon2',
        argon2: {
          type: 'argon2id',
          memoryCost: 4096, // Lower memory cost for development
          timeCost: 1,
          parallelism: 1,
        },
        bcrypt: {
          rounds: 12,
        },
      },
      rateLimit: {
        global: {
          max: 10000, // Higher limits for development
          window: 900000,
        },
        auth: {
          max: 100,
          window: 900000,
        },
        api: {
          max: 5000,
          window: 900000,
        },
      },
      session: {
        maxConcurrent: 10,
        inactivityTimeout: 1800000, // 30 minutes
        absoluteTimeout: 86400000, // 24 hours
      },
    },
    logging: {
      level: 'debug',
      format: 'simple',
      console: {
        enabled: true,
        colorize: true,
      },
      file: {
        enabled: false, // Disable file logging in development
        path: 'logs/app.log',
        maxSize: '10m',
        maxFiles: 5,
      },
      audit: {
        enabled: false,
        path: 'logs/audit.log',
        maxSize: '100m',
        maxFiles: 10,
      },
    },
    monitoring: {
      metrics: {
        enabled: false, // Disable metrics in development
        port: 9090,
        path: '/metrics',
      },
      health: {
        enabled: false,
        path: '/health',
        checks: {
          database: false,
          redis: false,
          external: false,
        },
      },
      tracing: {
        enabled: false,
        serviceName: 'enterprise-auth-development',
      },
    },
    webhooks: {
      enabled: false,
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      signatureHeader: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
      maxAge: 300,
    },
  },
};

// Staging profile - production-like with additional debugging
export const stagingProfile: ConfigProfile = {
  name: 'staging',
  description: 'Staging environment for pre-production testing',
  requiredSecrets: [
    'JWT_SECRET',
    'DATABASE_URL',
    'REDIS_URL',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_SECRET',
    'MICROSOFT_CLIENT_SECRET',
    'SMTP_PASS',
    'TWILIO_AUTH_TOKEN',
  ],
  overrides: {
    env: 'staging',
    server: {
      host: '0.0.0.0',
      port: 3000,
      cors: {
        origin: [
          'https://staging.example.com',
          'https://staging-admin.example.com',
        ],
        credentials: true,
      },
      helmet: {
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: true,
      },
    },
    database: {
      url: process.env.DATABASE_URL || '',
      replicaUrls: [],
      pool: {
        min: 2,
        max: 10,
        idleTimeout: 30000,
        connectionTimeout: 5000,
      },
      retry: {
        maxRetries: 3,
        retryDelay: 1000,
        backoffMultiplier: 2,
      },
    },
    redis: {
      url: process.env.REDIS_URL || 'redis://localhost:6379',
      host: 'localhost',
      port: 6379,
      db: 0,
      cluster: {
        enabled: false,
        nodes: [],
      },
      retry: {
        maxRetries: 3,
        retryDelay: 100,
      },
      timeouts: {
        connect: 10000,
        command: 5000,
        keepAlive: 30000,
      },
    },
    jwt: {
      secret: process.env.JWT_SECRET || '',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
      issuer: 'enterprise-auth-staging',
      audience: 'enterprise-auth-users',
      algorithm: 'HS256',
    },
    oauth: {
      google: {
        enabled: true,
        scope: ['profile', 'email'],
      },
      github: {
        enabled: true,
        scope: ['user:email'],
      },
      microsoft: {
        enabled: true,
        scope: ['profile', 'email'],
      },
      custom: {},
    },
    email: {
      smtp: {
        port: 587,
        secure: false,
      },
      templates: {
        verification: 'email-verification',
        passwordReset: 'password-reset',
        mfaCode: 'mfa-code',
      },
    },
    sms: {
      provider: 'twilio',
      twilio: {},
      awsSns: {
        region: 'us-east-1',
      },
    },
    security: {
      encryption: {
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          algorithm: 'pbkdf2',
          iterations: 100000,
          keyLength: 32,
          digest: 'sha512',
        },
      },
      hashing: {
        algorithm: 'argon2',
        argon2: {
          type: 'argon2id',
          memoryCost: 65536,
          timeCost: 3,
          parallelism: 4,
        },
        bcrypt: {
          rounds: 12,
        },
      },
      rateLimit: {
        global: {
          max: 5000,
          window: 900000,
        },
        auth: {
          max: 10,
          window: 900000,
        },
        api: {
          max: 500,
          window: 900000,
        },
      },
      session: {
        maxConcurrent: 5,
        inactivityTimeout: 1800000, // 30 minutes
        absoluteTimeout: 43200000, // 12 hours
      },
    },
    logging: {
      level: 'info',
      format: 'json',
      console: {
        enabled: true,
        colorize: false,
      },
      file: {
        enabled: true,
        path: 'logs/app.log',
        maxSize: '50m',
        maxFiles: 10,
      },
      audit: {
        enabled: true,
        path: 'logs/audit.log',
        maxSize: '200m',
        maxFiles: 20,
      },
    },
    monitoring: {
      metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics',
      },
      health: {
        enabled: true,
        path: '/health',
        checks: {
          database: true,
          redis: true,
          external: true,
        },
      },
      tracing: {
        enabled: true,
        serviceName: 'enterprise-auth-staging',
      },
    },
    webhooks: {
      enabled: true,
      maxRetries: 3,
      retryDelay: 5000,
      timeout: 30000,
      signatureHeader: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
      maxAge: 300,
    },
  },
};

// Production profile - optimized for performance and security
export const productionProfile: ConfigProfile = {
  name: 'production',
  description: 'Production environment with maximum security and performance',
  requiredSecrets: [
    'JWT_SECRET',
    'DATABASE_URL',
    'DATABASE_REPLICA_URLS',
    'REDIS_URL',
    'REDIS_CLUSTER_NODES',
    'GOOGLE_CLIENT_SECRET',
    'GITHUB_CLIENT_SECRET',
    'MICROSOFT_CLIENT_SECRET',
    'SMTP_PASS',
    'TWILIO_AUTH_TOKEN',
    'SECRETS_MASTER_PASSWORD',
  ],
  overrides: {
    env: 'production',
    server: {
      host: '0.0.0.0',
      port: 3000,
      cors: {
        origin: ['https://app.example.com', 'https://admin.example.com'],
        credentials: true,
      },
      helmet: {
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: true,
      },
    },
    database: {
      url: process.env.DATABASE_URL || '',
      replicaUrls: process.env['DATABASE_REPLICA_URLS']?.split(',') || [],
      pool: {
        min: 5,
        max: 50, // Higher pool size for production
        idleTimeout: 30000,
        connectionTimeout: 5000,
      },
      retry: {
        maxRetries: 5,
        retryDelay: 2000,
        backoffMultiplier: 2,
      },
    },
    redis: {
      url: process.env.REDIS_URL || '',
      host: 'localhost',
      port: 6379,
      db: 0,
      cluster: {
        enabled: true,
        nodes: process.env['REDIS_CLUSTER_NODES']?.split(',').map(node => {
          const [host, port] = node.split(':');
          if (!host || !port) {
            throw new Error(`Invalid Redis cluster node format: ${node}`);
          }
          return { host, port: parseInt(port, 10) };
        }) || [],
      },
      retry: {
        maxRetries: 5,
        retryDelay: 200,
      },
      timeouts: {
        connect: 10000,
        command: 5000,
        keepAlive: 30000,
      },
    },
    jwt: {
      secret: process.env.JWT_SECRET || '',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
      issuer: 'enterprise-auth-production',
      audience: 'enterprise-auth-users',
      algorithm: 'HS256',
    },
    oauth: {
      google: {
        enabled: true,
        scope: ['profile', 'email'],
      },
      github: {
        enabled: true,
        scope: ['user:email'],
      },
      microsoft: {
        enabled: true,
        scope: ['profile', 'email'],
      },
      custom: {},
    },
    email: {
      smtp: {
        port: 587,
        secure: false,
      },
      templates: {
        verification: 'email-verification',
        passwordReset: 'password-reset',
        mfaCode: 'mfa-code',
      },
    },
    sms: {
      provider: 'twilio',
      twilio: {},
      awsSns: {
        region: 'us-east-1',
      },
    },
    security: {
      encryption: {
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          algorithm: 'pbkdf2',
          iterations: 100000,
          keyLength: 32,
          digest: 'sha512',
        },
      },
      hashing: {
        algorithm: 'argon2',
        argon2: {
          type: 'argon2id',
          memoryCost: 131072, // Higher memory cost for production
          timeCost: 4,
          parallelism: 8,
        },
        bcrypt: {
          rounds: 12,
        },
      },
      rateLimit: {
        global: {
          max: 1000,
          window: 900000,
        },
        auth: {
          max: 5,
          window: 900000,
        },
        api: {
          max: 100,
          window: 900000,
        },
      },
      session: {
        maxConcurrent: 3, // Stricter session limits
        inactivityTimeout: 900000, // 15 minutes
        absoluteTimeout: 43200000, // 12 hours
      },
    },
    logging: {
      level: 'warn', // Less verbose logging in production
      format: 'json',
      console: {
        enabled: false, // Disable console logging in production
        colorize: false,
      },
      file: {
        enabled: true,
        path: 'logs/app.log',
        maxSize: '100m',
        maxFiles: 30,
      },
      audit: {
        enabled: true,
        path: 'logs/audit.log',
        maxSize: '500m',
        maxFiles: 50,
      },
    },
    monitoring: {
      metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics',
      },
      health: {
        enabled: true,
        path: '/health',
        checks: {
          database: true,
          redis: true,
          external: true,
        },
      },
      tracing: {
        enabled: true,
        serviceName: 'enterprise-auth-production',
      },
    },
    webhooks: {
      enabled: true,
      maxRetries: 5,
      retryDelay: 10000,
      timeout: 60000,
      signatureHeader: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
      maxAge: 300,
    },
  },
};

// Test profile - optimized for automated testing
export const testProfile: ConfigProfile = {
  name: 'test',
  description: 'Test environment for automated testing',
  requiredSecrets: ['JWT_SECRET'],
  overrides: {
    env: 'test',
    server: {
      host: 'localhost',
      port: 0, // Use random available port for testing
      cors: {
        origin: true,
        credentials: true,
      },
      helmet: {
        contentSecurityPolicy: false,
        crossOriginEmbedderPolicy: false,
      },
    },
    database: {
      url: process.env.TEST_DATABASE_URL || 'postgresql://localhost:5432/auth_test',
      replicaUrls: [],
      pool: {
        min: 1,
        max: 2, // Minimal pool for testing
        idleTimeout: 30000,
        connectionTimeout: 5000,
      },
      retry: {
        maxRetries: 1,
        retryDelay: 100,
        backoffMultiplier: 1,
      },
    },
    redis: {
      url: 'redis://localhost:6379',
      host: 'localhost',
      port: 6379,
      db: 15, // Use separate Redis DB for testing
      cluster: {
        enabled: false,
        nodes: [],
      },
      retry: {
        maxRetries: 1,
        retryDelay: 100,
      },
      timeouts: {
        connect: 10000,
        command: 5000,
        keepAlive: 30000,
      },
    },
    jwt: {
      secret: 'test-jwt-secret-for-testing-only',
      expiresIn: '15m',
      refreshExpiresIn: '7d',
      issuer: 'enterprise-auth-test',
      audience: 'enterprise-auth-users',
      algorithm: 'HS256',
    },
    oauth: {
      google: {
        enabled: false,
        scope: [],
      },
      github: {
        enabled: false,
        scope: [],
      },
      microsoft: {
        enabled: false,
        scope: [],
      },
      custom: {},
    },
    email: {
      smtp: {
        port: 587,
        secure: false,
      },
      templates: {
        verification: 'email-verification',
        passwordReset: 'password-reset',
        mfaCode: 'mfa-code',
      },
    },
    sms: {
      provider: 'twilio',
      twilio: {},
      awsSns: {
        region: 'us-east-1',
      },
    },
    security: {
      encryption: {
        algorithm: 'aes-256-gcm',
        keyDerivation: {
          algorithm: 'pbkdf2',
          iterations: 10000, // Lower for faster tests
          keyLength: 32,
          digest: 'sha512',
        },
      },
      hashing: {
        algorithm: 'argon2',
        argon2: {
          type: 'argon2id',
          memoryCost: 1024, // Minimal resources for testing
          timeCost: 1,
          parallelism: 1,
        },
        bcrypt: {
          rounds: 10, // Lower for faster tests
        },
      },
      rateLimit: {
        global: {
          max: 100000, // No rate limiting in tests
          window: 900000,
        },
        auth: {
          max: 1000,
          window: 900000,
        },
        api: {
          max: 10000,
          window: 900000,
        },
      },
      session: {
        maxConcurrent: 10,
        inactivityTimeout: 3600000, // 1 hour for tests
        absoluteTimeout: 86400000, // 24 hours for tests
      },
    },
    logging: {
      level: 'error', // Minimal logging in tests
      format: 'simple',
      console: {
        enabled: false,
        colorize: false,
      },
      file: {
        enabled: false,
        path: 'logs/test.log',
        maxSize: '10m',
        maxFiles: 1,
      },
      audit: {
        enabled: false,
        path: 'logs/test-audit.log',
        maxSize: '10m',
        maxFiles: 1,
      },
    },
    monitoring: {
      metrics: {
        enabled: false,
        port: 9090,
        path: '/metrics',
      },
      health: {
        enabled: false,
        path: '/health',
        checks: {
          database: false,
          redis: false,
          external: false,
        },
      },
      tracing: {
        enabled: false,
        serviceName: 'enterprise-auth-test',
      },
    },
    webhooks: {
      enabled: false, // Disable webhooks in tests
      maxRetries: 0,
      retryDelay: 1000,
      timeout: 5000,
      signatureHeader: 'X-Webhook-Signature',
      timestampHeader: 'X-Webhook-Timestamp',
      maxAge: 300,
    },
  },
};

// Profile registry
export const configProfiles: Record<EnvironmentProfile, ConfigProfile> = {
  development: developmentProfile,
  staging: stagingProfile,
  production: productionProfile,
  test: testProfile,
};

// Utility functions
export function getProfile(environment: EnvironmentProfile): ConfigProfile {
  const profile = configProfiles[environment];
  if (!profile) {
    throw new Error(`Unknown environment profile: ${environment}`);
  }
  return profile;
}

export function validateProfileRequirements(
  profile: ConfigProfile,
  availableSecrets: string[]
): { valid: boolean; missingSecrets: string[] } {
  const missingSecrets = profile.requiredSecrets.filter(
    (secret) => !availableSecrets.includes(secret)
  );

  return {
    valid: missingSecrets.length === 0,
    missingSecrets,
  };
}

export function mergeProfileOverrides(
  baseConfig: Partial<AppConfig>,
  profile: ConfigProfile
): Partial<AppConfig> {
  return deepMerge(baseConfig, profile.overrides);
}

// Deep merge utility function
function deepMerge(target: any, source: any): any {
  const result = { ...target };

  for (const key in source) {
    if (
      source[key] &&
      typeof source[key] === 'object' &&
      !Array.isArray(source[key])
    ) {
      result[key] = deepMerge(result[key] || {}, source[key]);
    } else {
      result[key] = source[key];
    }
  }

  return result;
}
