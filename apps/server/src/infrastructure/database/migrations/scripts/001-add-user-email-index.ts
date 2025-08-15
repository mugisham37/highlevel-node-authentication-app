import { Migration } from '../types';
import { Pool } from 'pg';
import { createHash } from 'crypto';

const migration: Migration = {
  id: 'add-user-email-index-001',
  name: 'Add index on user email column',
  version: '1.0.0',
  description: 'Creates a unique index on the users.email column for improved query performance',
  checksum: createHash('sha256').update('add-user-email-index-v1.0.0').digest('hex'),
  
  async up(): Promise<void> {
    const pool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });

    try {
      await pool.query(`
        CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_users_email_unique 
        ON users (email) 
        WHERE email IS NOT NULL
      `);
      
      console.log('Successfully created unique index on users.email');
    } catch (error) {
      console.error('Failed to create index on users.email:', error);
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
      await pool.query(`
        DROP INDEX CONCURRENTLY IF EXISTS idx_users_email_unique
      `);
      
      console.log('Successfully dropped unique index on users.email');
    } catch (error) {
      console.error('Failed to drop index on users.email:', error);
      throw error;
    } finally {
      await pool.end();
    }
  },
};

export default migration;
