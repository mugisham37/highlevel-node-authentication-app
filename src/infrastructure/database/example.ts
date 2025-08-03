import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseConfig } from './config';
import { activeSessions } from './drizzle/schema/auth-sessions';
import { nanoid } from 'nanoid';

export async function testDatabaseConnection() {
  try {
    console.log('Testing database connection...');

    // Set up environment for testing
    process.env['DATABASE_URL'] =
      process.env['DATABASE_URL'] ||
      'postgresql://postgres:password@localhost:5432/enterprise_auth';

    const config = createDatabaseConfig();

    const pool = new Pool({
      connectionString: config.primary.connectionString,
      max: 5,
      min: 1,
    });

    const db = drizzle(pool, {
      schema: { activeSessions },
    });

    // Test basic connection
    await db.execute(`SELECT 1`);
    console.log('✓ Database connection successful');

    // Test table creation
    await db.execute(`
      CREATE TABLE IF NOT EXISTS test_sessions (
        id VARCHAR(255) PRIMARY KEY,
        user_id VARCHAR(255) NOT NULL,
        token VARCHAR(500) NOT NULL UNIQUE,
        created_at TIMESTAMP DEFAULT NOW() NOT NULL
      );
    `);
    console.log('✓ Table creation successful');

    // Test insert
    const testSession = {
      id: nanoid(),
      userId: 'test-user-' + nanoid(),
      token: 'test-token-' + nanoid(),
    };

    await db.execute(
      `
      INSERT INTO test_sessions (id, user_id, token) 
      VALUES ($1, $2, $3)
    `,
      [testSession.id, testSession.userId, testSession.token]
    );
    console.log('✓ Insert operation successful');

    // Test select
    const result = await db.execute(
      `
      SELECT * FROM test_sessions WHERE id = $1
    `,
      [testSession.id]
    );
    console.log('✓ Select operation successful', result.rows[0]);

    // Cleanup
    await db.execute(`DROP TABLE IF EXISTS test_sessions`);
    console.log('✓ Cleanup successful');

    await pool.end();
    console.log('✓ All database tests passed!');

    return true;
  } catch (error) {
    console.error('✗ Database test failed:', error);
    return false;
  }
}

if (require.main === module) {
  testDatabaseConnection();
}
