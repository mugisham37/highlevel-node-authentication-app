import { DatabaseConfig } from './connection-manager';

export function createDatabaseConfig(): DatabaseConfig {
  const databaseUrl = process.env['DATABASE_URL'];
  if (!databaseUrl) {
    throw new Error('DATABASE_URL environment variable is required');
  }

  // Parse replica URLs if provided
  const replicaUrls =
    process.env['DATABASE_REPLICA_URLS']?.split(',').filter(Boolean) || [];

  return {
    primary: {
      connectionString: databaseUrl,
      poolConfig: {
        max: parseInt(process.env['DATABASE_POOL_MAX'] || '20'),
        min: parseInt(process.env['DATABASE_POOL_MIN'] || '2'),
        idleTimeoutMillis: parseInt(
          process.env['DATABASE_IDLE_TIMEOUT'] || '30000'
        ),
        connectionTimeoutMillis: parseInt(
          process.env['DATABASE_CONNECTION_TIMEOUT'] || '5000'
        ),
      },
    },
    replicas: replicaUrls.map((url) => ({
      connectionString: url,
      poolConfig: {
        max: parseInt(process.env['DATABASE_REPLICA_POOL_MAX'] || '15'),
        min: parseInt(process.env['DATABASE_REPLICA_POOL_MIN'] || '1'),
        idleTimeoutMillis: parseInt(
          process.env['DATABASE_IDLE_TIMEOUT'] || '30000'
        ),
        connectionTimeoutMillis: parseInt(
          process.env['DATABASE_CONNECTION_TIMEOUT'] || '5000'
        ),
      },
    })),
    retryConfig: {
      maxRetries: parseInt(process.env['DATABASE_MAX_RETRIES'] || '3'),
      retryDelay: parseInt(process.env['DATABASE_RETRY_DELAY'] || '1000'),
      backoffMultiplier: parseFloat(
        process.env['DATABASE_BACKOFF_MULTIPLIER'] || '2'
      ),
    },
  };
}
