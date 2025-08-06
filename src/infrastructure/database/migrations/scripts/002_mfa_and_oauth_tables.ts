import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseConfig } from '../../config';
import { Migration } from '../types';
import crypto from 'crypto';

const migration: Migration = {
  id: '002_mfa_and_oauth_tables',
  name: 'Create MFA and OAuth performance tables',
  version: '1.1.0',
  description:
    'Creates MFA challenges and OAuth cache tables for high-performance authentication flows',
  checksum: crypto
    .createHash('sha256')
    .update('002_mfa_and_oauth_tables_v1.1.0')
    .digest('hex'),
  dependencies: ['001_initial_drizzle_tables'],

  async up(): Promise<void> {
    const config = createDatabaseConfig();
    const pool = new Pool({
      connectionString: config.primary.connectionString,
      ...config.primary.poolConfig,
    });
    const db = drizzle(pool);

    try {
      // Create mfa_challenges table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS mfa_challenges (
          id VARCHAR(255) PRIMARY KEY,
          type VARCHAR(20) NOT NULL,
          user_id VARCHAR(255) NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          attempts INTEGER DEFAULT 0 NOT NULL,
          max_attempts INTEGER DEFAULT 3 NOT NULL,
          metadata JSONB,
          created_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Create indexes for mfa_challenges
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_mfa_challenges_user_id ON mfa_challenges(user_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_mfa_challenges_type ON mfa_challenges(type);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_mfa_challenges_expires_at ON mfa_challenges(expires_at);`
      );

      // Create oauth_token_cache table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS oauth_token_cache (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          provider VARCHAR(50) NOT NULL,
          provider_account_id VARCHAR(255) NOT NULL,
          access_token TEXT,
          refresh_token TEXT,
          id_token TEXT,
          expires_at TIMESTAMP,
          token_type VARCHAR(50),
          scope TEXT,
          session_state TEXT,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      // Create indexes for oauth_token_cache
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_token_cache_user_id ON oauth_token_cache(user_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_token_cache_provider ON oauth_token_cache(provider);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_token_cache_provider_account ON oauth_token_cache(provider, provider_account_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_token_cache_expires_at ON oauth_token_cache(expires_at);`
      );

      // Create oauth_state_tracking table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS oauth_state_tracking (
          state VARCHAR(255) PRIMARY KEY,
          provider VARCHAR(50) NOT NULL,
          redirect_uri TEXT NOT NULL,
          code_verifier VARCHAR(255),
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT false NOT NULL,
          ip_address VARCHAR(45),
          user_agent TEXT
        );
      `);

      // Create indexes for oauth_state_tracking
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_state_provider ON oauth_state_tracking(provider);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_state_expires_at ON oauth_state_tracking(expires_at);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_state_used ON oauth_state_tracking(used);`
      );

      // Create oauth_auth_codes table
      await db.execute(`
        CREATE TABLE IF NOT EXISTS oauth_auth_codes (
          code VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          client_id VARCHAR(255) NOT NULL,
          redirect_uri TEXT NOT NULL,
          scope TEXT,
          code_challenge VARCHAR(255),
          code_challenge_method VARCHAR(10),
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          expires_at TIMESTAMP NOT NULL,
          used BOOLEAN DEFAULT false NOT NULL
        );
      `);

      // Create indexes for oauth_auth_codes
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_user_id ON oauth_auth_codes(user_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_client_id ON oauth_auth_codes(client_id);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_expires_at ON oauth_auth_codes(expires_at);`
      );
      await db.execute(
        `CREATE INDEX IF NOT EXISTS idx_oauth_auth_codes_used ON oauth_auth_codes(used);`
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
      await db.execute(`DROP TABLE IF EXISTS oauth_auth_codes CASCADE;`);
      await db.execute(`DROP TABLE IF EXISTS oauth_state_tracking CASCADE;`);
      await db.execute(`DROP TABLE IF EXISTS oauth_token_cache CASCADE;`);
      await db.execute(`DROP TABLE IF EXISTS mfa_challenges CASCADE;`);
    } finally {
      await pool.end();
    }
  },
};

export default migration;
