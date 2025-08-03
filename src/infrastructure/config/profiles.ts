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
      pool: {
        min: 1,
        max: 5, // Lower pool size for development
      },
      retry: {
        maxRetries: 1,
        retryDelay: 500,
      },
    },
    redis: {
      retry: {
        maxRetries: 1,
        retryDelay: 100,
      },
    },
    security: {
      hashing: {
        argon2: {
          memoryCost: 4096, // Lower memory cost for development
          timeCost: 1,
          parallelism: 1,
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
      },
    },
    monitoring: {
      metrics: {
        enabled: false, // Disable metrics in development
      },
      tracing: {
        enabled: false,
      },
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
      pool: {
        min: 2,
        max: 10,
      },
    },
    security: {
      rateLimit: {
        global: {
          max: 5000,
          window: 900000,
        },
        auth: {
          max: 10,
          window: 900000,
        },
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
        maxSize: '50m',
        maxFiles: 10,
      },
      audit: {
        enabled: true,
        maxSize: '200m',
        maxFiles: 20,
      },
    },
    monitoring: {
      metrics: {
        enabled: true,
        port: 9090,
      },
      health: {
        enabled: true,
      },
      tracing: {
        enabled: true,
        serviceName: 'enterprise-auth-staging',
      },
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
      pool: {
        min: 5,
        max: 50, // Higher pool size for production
      },
      retry: {
        maxRetries: 5,
        retryDelay: 2000,
        backoffMultiplier: 2,
      },
    },
    redis: {
      cluster: {
        enabled: true,
      },
      retry: {
        maxRetries: 5,
        retryDelay: 200,
      },
    },
    security: {
      hashing: {
        argon2: {
          memoryCost: 131072, // Higher memory cost for production
          timeCost: 4,
          parallelism: 8,
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
        maxSize: '100m',
        maxFiles: 30,
      },
      audit: {
        enabled: true,
        maxSize: '500m',
        maxFiles: 50,
      },
    },
    monitoring: {
      metrics: {
        enabled: true,
        port: 9090,
      },
      health: {
        enabled: true,
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
      port: 0, // Use random available port for testing
    },
    database: {
      pool: {
        min: 1,
        max: 2, // Minimal pool for testing
      },
    },
    redis: {
      db: 15, // Use separate Redis DB for testing
    },
    security: {
      hashing: {
        argon2: {
          memoryCost: 1024, // Minimal resources for testing
          timeCost: 1,
          parallelism: 1,
        },
      },
      rateLimit: {
        global: {
          max: 100000, // No rate limiting in tests
        },
        auth: {
          max: 1000,
        },
      },
    },
    logging: {
      level: 'error', // Minimal logging in tests
      console: {
        enabled: false,
      },
      file: {
        enabled: false,
      },
      audit: {
        enabled: false,
      },
    },
    monitoring: {
      metrics: {
        enabled: false,
      },
      health: {
        enabled: false,
      },
      tracing: {
        enabled: false,
      },
    },
    webhooks: {
      enabled: false, // Disable webhooks in tests
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
