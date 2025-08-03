// Main configuration exports
export { configManager, ConfigManager } from './config-manager';
export { SecretsManager } from './secrets-manager';
export { DynamicConfigManager } from './dynamic-config';
export { ConfigCLI } from './cli';

// Configuration types
export * from './types';

// Environment profiles
export * from './profiles';

// Legacy compatibility
export { config } from './environment';

// Utility functions
export function createConfigManager(options?: {
  secretsPath?: string;
  masterPassword?: string;
  enableDynamicConfig?: boolean;
  configPath?: string;
}) {
  const { configManager } = require('./config-manager');
  return configManager.initialize(options);
}

export function createSecretsManager(
  secretsPath?: string,
  masterPassword?: string
) {
  return new SecretsManager(secretsPath, masterPassword);
}

// Configuration validation helpers
export function validateEnvironmentProfile(profile: string): boolean {
  return ['development', 'staging', 'production', 'test'].includes(profile);
}

export function getRequiredSecretsForEnvironment(env: string): string[] {
  switch (env) {
    case 'production':
      return [
        'JWT_SECRET',
        'DATABASE_URL',
        'REDIS_URL',
        'GOOGLE_CLIENT_SECRET',
        'GITHUB_CLIENT_SECRET',
        'MICROSOFT_CLIENT_SECRET',
        'SMTP_PASS',
        'TWILIO_AUTH_TOKEN',
        'SECRETS_MASTER_PASSWORD',
      ];
    case 'staging':
      return [
        'JWT_SECRET',
        'DATABASE_URL',
        'REDIS_URL',
        'GOOGLE_CLIENT_SECRET',
        'GITHUB_CLIENT_SECRET',
        'MICROSOFT_CLIENT_SECRET',
        'SMTP_PASS',
        'TWILIO_AUTH_TOKEN',
      ];
    case 'development':
    case 'test':
      return ['JWT_SECRET'];
    default:
      return [];
  }
}
