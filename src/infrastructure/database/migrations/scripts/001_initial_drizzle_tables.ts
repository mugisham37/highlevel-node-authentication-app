import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseConfig } from '../../config';
import { Migration } from '../migration-manager';
import crypto from 'crypto';

const migration: Migration = {
  id: '001_initial_drizzle_tables',
  name: 'Create initial Drizzle performance tables',
  version: '1.0.0',
  description:
    'Creates high-performance tables for authentication flows using Drizzle ORM',
  checksum: crypto
    .createHash('sha256')
    .update('001_initial_drizzle_tables_v1.0.0')
    .digest('hex'),

  async up(): Promise<void> {
    const config = createDatabaseConfig();
    const pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    const db = drizzle(pool);

    try {
      // Create active_sessions table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS active_sessions (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          token VARCHAR(500) NOT NULL UNIQUE,
          refresh_token VARCHAR(500) NOT NULL UNIQUE,
          expires_at TIMESTAMP NOT NULL,
          refresh_expires_at TIMESTAMP NOT NULL,
          last_activity TIMESTAMP DEFAULT NOW() NOT NULL,
          ip_address INET,
          device_fingerprint VARCHAR(255),
          user_agent TEXT,
          risk_score REAL DEFAULT 0 NOT NULL,
          is_active BOOLEAN DEFAULT true NOT NULL,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Create indexes for active_sessions
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(token);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_active_sessions_expires_at ON active_sessions(expires_at);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_active_sessions_last_activity ON active_sessions(last_activity);`
      );

      // Create auth_attempts table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS auth_attempts (
          id SERIAL PRIMARY KEY,
          user_id VARCHAR(255),
          email VARCHAR(255),
          ip_address INET NOT NULL,
          user_agent TEXT,
          success BOOLEAN NOT NULL,
          failure_reason VARCHAR(255),
          timestamp TIMESTAMP DEFAULT NOW() NOT NULL,
          risk_score REAL DEFAULT 0 NOT NULL,
          device_fingerprint VARCHAR(255)
        );
      `);

      // Create indexes for auth_attempts
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_id ON auth_attempts(user_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_address ON auth_attempts(ip_address);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_auth_attempts_timestamp ON auth_attempts(timestamp);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_auth_attempts_success ON auth_attempts(success);`
      );

      // Create rate_limit_tracking table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS rate_limit_tracking (
          id SERIAL PRIMARY KEY,
          identifier VARCHAR(255) NOT NULL,
          resource VARCHAR(100) NOT NULL,
          request_count REAL DEFAULT 1 NOT NULL,
          window_start TIMESTAMP DEFAULT NOW() NOT NULL,
          window_end TIMESTAMP NOT NULL,
          blocked BOOLEAN DEFAULT false NOT NULL
        );
      `);

      // Create indexes for rate_limit_tracking
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_rate_limit_identifier ON rate_limit_tracking(identifier);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_rate_limit_resource ON rate_limit_tracking(resource);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_rate_limit_window_end ON rate_limit_tracking(window_end);`
      );

      // Create user_auth_cache table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS user_auth_cache (
          user_id VARCHAR(255) PRIMARY KEY,
          email VARCHAR(255) NOT NULL,
          password_hash TEXT,
          mfa_enabled BOOLEAN DEFAULT false NOT NULL,
          totp_secret VARCHAR(255),
          failed_login_attempts REAL DEFAULT 0 NOT NULL,
          locked_until TIMESTAMP,
          last_login_at TIMESTAMP,
          last_login_ip INET,
          risk_score REAL DEFAULT 0 NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Create indexes for user_auth_cache
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_user_auth_cache_email ON user_auth_cache(email);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_user_auth_cache_updated_at ON user_auth_cache(updated_at);`
      );
    } finally {
      await pool.end();
    }
  },

  async down(): Promise<void> {
    const config = createDatabaseConfig();
    const pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    const db = drizzle(pool);

    try {
      await db.execute(`DROP TABLE IF EXISTS user_auth_cache CASCADE;`);
      await db.execute(`DROP TABLE IF EXISTS rate_limit_tracking CASCADE;`);
      await db.execute(`DROP TABLE IF EXISTS auth_attempts CASCADE;`);
      await db.execute(`DROP TABLE IF EXISTS active_sessions CASCADE;`);
    } finally {
      await pool.end();
    }
  },
};

export default migration;
