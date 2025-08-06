/**
 * Environment Utilities
 * Helper functions for handling environment variables
 */

export interface EnvironmentConfig {
  APP_VERSION: string;
  NODE_ENV: 'development' | 'production' | 'test' | 'staging';
  AUDIT_SECRET_KEY: string;
  SUPPORT_EMAIL: string;
  LOG_LEVEL: string;
  SERVICE_NAME: string;
  PORT: number;
}

/**
 * Environment configuration with safe defaults
 */
export const ENV: EnvironmentConfig = {
  APP_VERSION: process.env['APP_VERSION'] || 'unknown',
  NODE_ENV: (process.env['NODE_ENV'] as any) || 'development',
  AUDIT_SECRET_KEY: process.env['AUDIT_SECRET_KEY'] || '',
  SUPPORT_EMAIL: process.env['SUPPORT_EMAIL'] || 'support@example.com',
  LOG_LEVEL: process.env['LOG_LEVEL'] || 'info',
  SERVICE_NAME: process.env['SERVICE_NAME'] || 'authentication-service',
  PORT: parseInt(process.env['PORT'] || '3000', 10),
};

/**
 * Get environment variable with type safety
 */
export function getEnvValue(key: string, defaultValue: string = ''): string {
  return process.env[key] || defaultValue;
}

/**
 * Get environment variable as number
 */
export function getEnvNumber(key: string, defaultValue: number = 0): number {
  const value = process.env[key];
  return value ? parseInt(value, 10) || defaultValue : defaultValue;
}

/**
 * Get environment variable as boolean
 */
export function getEnvBoolean(key: string, defaultValue: boolean = false): boolean {
  const value = process.env[key];
  if (!value) return defaultValue;
  return value.toLowerCase() === 'true';
}

/**
 * Check if running in production
 */
export function isProduction(): boolean {
  return ENV.NODE_ENV === 'production';
}

/**
 * Check if running in development
 */
export function isDevelopment(): boolean {
  return ENV.NODE_ENV === 'development';
}

/**
 * Check if running in test environment
 */
export function isTest(): boolean {
  return ENV.NODE_ENV === 'test';
}

/**
 * Get safe environment value with validation
 */
export function getSafeEnvValue(key: keyof typeof process.env): string | undefined {
  return process.env[key];
}
