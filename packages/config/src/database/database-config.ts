import { env } from '../env';

export interface DatabaseConfig {
  url: string;
  host?: string;
  port?: number;
  database?: string;
  username?: string;
  password?: string;
  ssl: boolean;
  pool: {
    min: number;
    max: number;
    acquireTimeoutMillis?: number;
    createTimeoutMillis?: number;
    destroyTimeoutMillis?: number;
    idleTimeoutMillis?: number;
    reapIntervalMillis?: number;
    createRetryIntervalMillis?: number;
  };
  migrations?: {
    directory: string;
    tableName: string;
    schemaName?: string;
  };
  seeds?: {
    directory: string;
  };
}

export interface DrizzleConfig {
  schema: string;
  out: string;
  driver: 'pg' | 'mysql2' | 'better-sqlite' | 'libsql' | 'turso';
  dbCredentials: {
    connectionString?: string;
    host?: string;
    port?: number;
    user?: string;
    password?: string;
    database?: string;
    ssl?: boolean;
  };
  verbose?: boolean;
  strict?: boolean;
}

export interface PrismaConfig {
  generator: {
    provider: string;
    output?: string;
    previewFeatures?: string[];
  };
  datasource: {
    provider: string;
    url: string;
    shadowDatabaseUrl?: string;
  };
}

export class DatabaseConfigManager {
  private static instance: DatabaseConfigManager;

  private constructor() {}

  static getInstance(): DatabaseConfigManager {
    if (!DatabaseConfigManager.instance) {
      DatabaseConfigManager.instance = new DatabaseConfigManager();
    }
    return DatabaseConfigManager.instance;
  }

  getDatabaseConfig(): DatabaseConfig {
    return {
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
        acquireTimeoutMillis: 60000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
        reapIntervalMillis: 1000,
        createRetryIntervalMillis: 200,
      },
      migrations: {
        directory: './migrations',
        tableName: 'knex_migrations',
        schemaName: 'public',
      },
      seeds: {
        directory: './seeds',
      },
    };
  }

  getDrizzleConfig(): DrizzleConfig {
    return {
      schema: './src/database/schema/*',
      out: './drizzle',
      driver: 'pg',
      dbCredentials: {
        connectionString: env.DATABASE_URL,
        host: env.DATABASE_HOST,
        port: env.DATABASE_PORT,
        user: env.DATABASE_USER,
        password: env.DATABASE_PASSWORD,
        database: env.DATABASE_NAME,
        ssl: env.DATABASE_SSL,
      },
      verbose: env.NODE_ENV === 'development',
      strict: true,
    };
  }

  getPrismaConfig(): PrismaConfig {
    return {
      generator: {
        provider: 'prisma-client-js',
        output: '../node_modules/.prisma/client',
        previewFeatures: ['jsonProtocol', 'metrics'],
      },
      datasource: {
        provider: 'postgresql',
        url: env.DATABASE_URL,
        shadowDatabaseUrl: process.env.SHADOW_DATABASE_URL,
      },
    };
  }

  getConnectionString(): string {
    return env.DATABASE_URL;
  }

  isSSLEnabled(): boolean {
    return env.DATABASE_SSL;
  }

  getPoolConfig() {
    return {
      min: env.DATABASE_POOL_MIN,
      max: env.DATABASE_POOL_MAX,
    };
  }

  // Environment-specific configurations
  getDevelopmentConfig(): Partial<DatabaseConfig> {
    return {
      pool: {
        min: 2,
        max: 5,
      },
    };
  }

  getProductionConfig(): Partial<DatabaseConfig> {
    return {
      ssl: true,
      pool: {
        min: 5,
        max: 20,
        acquireTimeoutMillis: 30000,
        createTimeoutMillis: 30000,
        destroyTimeoutMillis: 5000,
        idleTimeoutMillis: 30000,
      },
    };
  }

  getTestConfig(): Partial<DatabaseConfig> {
    return {
      pool: {
        min: 1,
        max: 3,
      },
    };
  }

  getConfigForEnvironment(): DatabaseConfig {
    const baseConfig = this.getDatabaseConfig();
    
    switch (env.NODE_ENV) {
      case 'development':
        return { ...baseConfig, ...this.getDevelopmentConfig() };
      case 'production':
        return { ...baseConfig, ...this.getProductionConfig() };
      case 'test':
        return { ...baseConfig, ...this.getTestConfig() };
      default:
        return baseConfig;
    }
  }
}

// Export singleton instance
export const databaseConfig = DatabaseConfigManager.getInstance();