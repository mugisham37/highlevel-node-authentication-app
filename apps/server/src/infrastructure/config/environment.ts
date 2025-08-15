// Legacy configuration file - maintained for backward compatibility
// New applications should use the ConfigManager from './config-manager'

import { configManager } from './config-manager';

// Initialize the configuration manager
let configInitialized = false;
let initializationPromise: Promise<void> | null = null;

async function initializeConfig() {
  if (configInitialized) {
    return;
  }

  if (initializationPromise) {
    return initializationPromise;
  }

  initializationPromise = (async () => {
    try {
      await configManager.initialize({
        enableDynamicConfig: true,
      });
      configInitialized = true;
    } catch (error) {
      console.error('Failed to initialize configuration manager:', error);
      if (process.env.NODE_ENV !== 'test') {
        process.exit(1);
      }
      throw error;
    }
  })();

  return initializationPromise;
}

// Initialize configuration on module load (but not in test environment)
if (process.env.NODE_ENV !== 'test') {
  initializeConfig().catch(console.error);
}

// Export legacy config interface for backward compatibility
export const config = new Proxy({} as any, {
  get(_target, prop) {
    if (!configInitialized) {
      // In test environment, try to initialize synchronously
      if (process.env.NODE_ENV === 'test') {
        throw new Error(
          'Configuration not yet initialized. Call await initializeConfig() first in tests.'
        );
      }
      throw new Error('Configuration not yet initialized');
    }

    const appConfig = configManager.getConfig();

    // Map legacy property names to new structure
    switch (prop) {
      case 'env':
        return appConfig.env;
      case 'isDevelopment':
        return appConfig.env === 'development';
      case 'isProduction':
        return appConfig.env === 'production';
      case 'isTest':
        return appConfig.env === 'test';
      case 'server':
        return appConfig.server;
      case 'database':
        return {
          url: appConfig.database.url,
          pool: appConfig.database.pool,
        };
      case 'redis':
        return {
          url: appConfig.redis.url,
          host: appConfig.redis.host,
          port: appConfig.redis.port,
          password: appConfig.redis.password,
          db: appConfig.redis.db,
          cluster: appConfig.redis.cluster,
          maxRetriesPerRequest: appConfig.redis.retry.maxRetries,
          lazyConnect: true,
          keepAlive: appConfig.redis.timeouts.keepAlive,
          connectTimeout: appConfig.redis.timeouts.connect,
          commandTimeout: appConfig.redis.timeouts.command,
        };
      case 'jwt':
        return appConfig.jwt;
      case 'oauth':
        return appConfig.oauth;
      case 'email':
        return appConfig.email;
      case 'sms':
        return appConfig.sms;
      case 'security':
        return {
          bcryptRounds: appConfig.security.hashing.bcrypt.rounds,
          rateLimit: appConfig.security.rateLimit.global,
        };
      case 'logging':
        return {
          level: appConfig.logging.level,
          file: appConfig.logging.file.path,
        };
      default:
        return (appConfig as any)[prop];
    }
  },
});

export type Config = typeof config;

// Export the new configuration manager for modern usage
export { configManager } from './config-manager';

// Export initialization function for tests
export { initializeConfig };
