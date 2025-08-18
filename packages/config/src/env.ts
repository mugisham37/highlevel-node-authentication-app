import { z } from 'zod';

// Environment validation schema
export const envSchema = z.object({
  // Node environment
  NODE_ENV: z.enum(['development', 'staging', 'production']).default('development'),
  
  // Server configuration
  PORT: z.coerce.number().min(1).max(65535).default(3000),
  HOST: z.string().default('localhost'),
  
  // Database configuration
  DATABASE_URL: z.string().url(),
  DATABASE_HOST: z.string().optional(),
  DATABASE_PORT: z.coerce.number().min(1).max(65535).optional(),
  DATABASE_NAME: z.string().optional(),
  DATABASE_USER: z.string().optional(),
  DATABASE_PASSWORD: z.string().optional(),
  DATABASE_SSL: z.coerce.boolean().default(false),
  DATABASE_POOL_MIN: z.coerce.number().min(0).default(2),
  DATABASE_POOL_MAX: z.coerce.number().min(1).default(10),
  
  // Redis configuration
  REDIS_URL: z.string().url(),
  REDIS_HOST: z.string().optional(),
  REDIS_PORT: z.coerce.number().min(1).max(65535).optional(),
  REDIS_PASSWORD: z.string().optional(),
  REDIS_DB: z.coerce.number().min(0).default(0),
  
  // JWT configuration
  JWT_SECRET: z.string().min(32),
  JWT_EXPIRES_IN: z.string().default('1h'),
  JWT_REFRESH_SECRET: z.string().min(32),
  JWT_REFRESH_EXPIRES_IN: z.string().default('7d'),
  
  // Security configuration
  BCRYPT_ROUNDS: z.coerce.number().min(10).max(15).default(12),
  RATE_LIMIT_WINDOW_MS: z.coerce.number().default(900000), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.coerce.number().default(100),
  
  // CORS configuration
  CORS_ORIGIN: z.string().default('*'),
  CORS_CREDENTIALS: z.coerce.boolean().default(true),
  
  // Logging configuration
  LOG_LEVEL: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  LOG_FORMAT: z.enum(['json', 'simple']).default('json'),
  LOG_FILE_PATH: z.string().optional(),
  
  // Monitoring configuration
  METRICS_ENABLED: z.coerce.boolean().default(true),
  METRICS_PORT: z.coerce.number().min(1).max(65535).default(9090),
  HEALTH_CHECK_ENABLED: z.coerce.boolean().default(true),
  
  // Email configuration
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().min(1).max(65535).optional(),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  SMTP_FROM: z.string().email().optional(),
  
  // OAuth configuration
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GITHUB_CLIENT_ID: z.string().optional(),
  GITHUB_CLIENT_SECRET: z.string().optional(),
  
  // MFA configuration
  MFA_ISSUER: z.string().default('YourApp'),
  MFA_WINDOW: z.coerce.number().min(1).max(10).default(2),
  
  // File upload configuration
  MAX_FILE_SIZE: z.coerce.number().default(5242880), // 5MB
  UPLOAD_PATH: z.string().default('./uploads'),
  
  // Feature flags
  FEATURE_REGISTRATION_ENABLED: z.coerce.boolean().default(true),
  FEATURE_PASSWORD_RESET_ENABLED: z.coerce.boolean().default(true),
  FEATURE_MFA_ENABLED: z.coerce.boolean().default(true),
  FEATURE_OAUTH_ENABLED: z.coerce.boolean().default(true),
  
  // External services
  WEBHOOK_SECRET: z.string().optional(),
  API_KEY: z.string().optional(),
  
  // Development/Testing
  SEED_DATABASE: z.coerce.boolean().default(false),
  MOCK_EXTERNAL_SERVICES: z.coerce.boolean().default(false),
});

export type Environment = z.infer<typeof envSchema>;

// Parse and validate environment variables
export const env = envSchema.parse(process.env);

// Environment helpers
export const isDevelopment = env.NODE_ENV === 'development';
export const isProduction = env.NODE_ENV === 'production';
export const isStaging = env.NODE_ENV === 'staging';
export const isTest = process.env.NODE_ENV === 'test';

// Database configuration helper
export const getDatabaseConfig = () => ({
  url: env.DATABASE_URL,
  host: env.DATABASE_HOST,
  port: env.DATABASE_PORT,
  database: env.DATABASE_NAME,
  username: env.DATABASE_USER,
  password: env.DATABASE_PASSWORD,
  ssl: env.DATABASE_SSL,
  pool: {
    min: env.DATABASE_POOL_MIN,
    max: env.DATABASE_POOL_MAX,
  },
});

// Redis configuration helper
export const getRedisConfig = () => ({
  url: env.REDIS_URL,
  host: env.REDIS_HOST,
  port: env.REDIS_PORT,
  password: env.REDIS_PASSWORD,
  db: env.REDIS_DB,
});

// JWT configuration helper
export const getJwtConfig = () => ({
  secret: env.JWT_SECRET,
  expiresIn: env.JWT_EXPIRES_IN,
  refreshSecret: env.JWT_REFRESH_SECRET,
  refreshExpiresIn: env.JWT_REFRESH_EXPIRES_IN,
});

// Security configuration helper
export const getSecurityConfig = () => ({
  bcryptRounds: env.BCRYPT_ROUNDS,
  rateLimit: {
    windowMs: env.RATE_LIMIT_WINDOW_MS,
    maxRequests: env.RATE_LIMIT_MAX_REQUESTS,
  },
  cors: {
    origin: env.CORS_ORIGIN,
    credentials: env.CORS_CREDENTIALS,
  },
});

// Logging configuration helper
export const getLoggingConfig = () => ({
  level: env.LOG_LEVEL,
  format: env.LOG_FORMAT,
  filePath: env.LOG_FILE_PATH,
});

// Feature flags helper
export const getFeatureFlags = () => ({
  registrationEnabled: env.FEATURE_REGISTRATION_ENABLED,
  passwordResetEnabled: env.FEATURE_PASSWORD_RESET_ENABLED,
  mfaEnabled: env.FEATURE_MFA_ENABLED,
  oauthEnabled: env.FEATURE_OAUTH_ENABLED,
});