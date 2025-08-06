import { Migration } from '../types';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const migration: Migration = {
  id: 'add-user-preferences-table-002',
  name: 'Add user preferences table',
  version: '1.1.0',
  description: 'Creates a new user_preferences table to store user-specific settings and preferences',
  checksum: createHash('sha256').update('add-user-preferences-table-v1.1.0').digest('hex'),
  dependencies: ['add-user-email-index-001'], // Depends on the previous migration
  
  async up(): Promise<void> {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      // Create the user_preferences table
      await pool.query(`
        CREATE TABLE IF NOT EXISTS user_preferences (
          id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
          user_id UUID NOT NULL,
          preference_key VARCHAR(100) NOT NULL,
          preference_value JSONB NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
          
          CONSTRAINT fk_user_preferences_user_id 
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
          CONSTRAINT unique_user_preference 
            UNIQUE (user_id, preference_key)
        )
      `);

      // Create indexes for optimal performance
      await pool.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_preferences_user_id 
        ON user_preferences (user_id)
      `);

      await pool.query(`
        CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_user_preferences_key 
        ON user_preferences (preference_key)
      `);

      // Create a trigger for updating the updated_at timestamp
      await pool.query(`
        CREATE OR REPLACE FUNCTION update_user_preferences_updated_at()
        RETURNS TRIGGER AS $$
        BEGIN
          NEW.updated_at = NOW();
          RETURN NEW;
        END;
        $$ LANGUAGE plpgsql;
      `);

      await pool.query(`
        CREATE TRIGGER trigger_user_preferences_updated_at
          BEFORE UPDATE ON user_preferences
          FOR EACH ROW
          EXECUTE FUNCTION update_user_preferences_updated_at();
      `);

      console.log('Successfully created user_preferences table with indexes and triggers');
    } catch (error) {
      console.error('Failed to create user_preferences table:', error);
      throw error;
    } finally {
      await pool.end();
    }
  },

  async down(): Promise<void> {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      // Drop trigger first
      await pool.query(`
        DROP TRIGGER IF EXISTS trigger_user_preferences_updated_at ON user_preferences
      `);

      // Drop function
      await pool.query(`
        DROP FUNCTION IF EXISTS update_user_preferences_updated_at()
      `);

      // Drop indexes
      await pool.query(`
        DROP INDEX CONCURRENTLY IF EXISTS idx_user_preferences_user_id
      `);

      await pool.query(`
        DROP INDEX CONCURRENTLY IF EXISTS idx_user_preferences_key
      `);

      // Drop table
      await pool.query(`
        DROP TABLE IF EXISTS user_preferences CASCADE
      `);

      console.log('Successfully dropped user_preferences table and related objects');
    } catch (error) {
      console.error('Failed to drop user_preferences table:', error);
      throw error;
    } finally {
      await pool.end();
    }
  },
};

export default migration;
