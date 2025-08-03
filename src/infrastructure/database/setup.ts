import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseConfig } from './config';

export async function setupDatabase() {
  const config = createDatabaseConfig();

  const pool = new Pool({
    connectionString: config.primary.connectionString,
    max: 20,
    min: 2,
  });

  const db = drizzle(pool);

  // Create Drizzle-specific tables
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

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_active_sessions_user_id ON active_sessions(user_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_active_sessions_token ON active_sessions(token);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_active_sessions_expires_at ON active_sessions(expires_at);
  `);

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

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_auth_attempts_user_id ON auth_attempts(user_id);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_auth_attempts_email ON auth_attempts(email);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_auth_attempts_ip_address ON auth_attempts(ip_address);
  `);

  await db.execute(`
    CREATE INDEX IF NOT EXISTS idx_auth_attempts_timestamp ON auth_attempts(timestamp);
  `);

  console.log('Database setup completed successfully');
  await pool.end();
}

if (require.main === module) {
  setupDatabase().catch(console.error);
}
