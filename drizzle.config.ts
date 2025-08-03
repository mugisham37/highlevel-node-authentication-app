import type { Config } from 'drizzle-kit';

export default {
  schema: './src/infrastructure/database/drizzle/schema/*',
  out: './src/infrastructure/database/drizzle/migrations',
  driver: 'pg',
  dbCredentials: {
    connectionString: process.env.DATABASE_URL!,
  },
  verbose: true,
  strict: true,
} satisfies Config;
