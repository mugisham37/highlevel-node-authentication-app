# Database Migration and Seeding System

This comprehensive database migration and seeding system provides enterprise-grade database management capabilities for the authentication backend. It supports both Prisma and Drizzle ORMs with advanced features for production deployments.

## Features

- **Dual ORM Support**: Manages both Prisma and Drizzle schemas
- **Migration Management**: Version-controlled database schema changes
- **Data Seeding**: Environment-specific test data management
- **Schema Validation**: Comprehensive database schema consistency checks
- **Production Safety**: Advanced production migration tools with rollback capabilities
- **CLI Interface**: Command-line tools for database operations
- **Backup & Recovery**: Automated backup creation and restoration

## Architecture

```
src/infrastructure/database/
├── migrations/
│   ├── migration-manager.ts      # Core migration management
│   ├── production-migrator.ts    # Production-safe migration tools
│   └── scripts/                  # Migration scripts
├── seeding/
│   ├── seed-manager.ts          # Data seeding management
│   └── data/                    # Seed data files
├── validation/
│   └── schema-validator.ts      # Schema validation tools
└── cli/
    └── db-cli.ts               # Command-line interface
```

## Quick Start

### 1. Install Dependencies

```bash
npm install
```

### 2. Set Environment Variables

```bash
DATABASE_URL="postgresql://user:password@localhost:5432/auth_db"
```

### 3. Run Migrations

```bash
npm run db:migrate:up
```

### 4. Seed Development Data

```bash
npm run db:seed
```

### 5. Validate Schema

```bash
npm run db:validate
```

## CLI Commands

### Migration Commands

```bash
# Apply pending migrations
npm run db:migrate:up

# Rollback last migration
npm run db:migrate:down

# Show migration status
npm run db:migrate:status

# Rollback specific migration
npm run db:cli migrate down --id migration_id
```

### Seeding Commands

```bash
# Apply seeds for development
npm run db:seed

# Apply seeds for specific environment
npm run db:cli seed run --env testing

# Show seeding status
npm run db:seed:status

# Rollback specific seed
npm run db:cli seed rollback --id seed_id

# Clear environment data (non-production)
npm run db:cli seed clear --env development --confirm
```

### Validation Commands

```bash
# Validate database schema
npm run db:validate

# Detailed validation with warnings
npm run db:cli validate --detailed
```

### Utility Commands

```bash
# Reset database (development only)
npm run db:reset

# Full reset with confirmation
npm run db:cli reset --env development --confirm
```

## Creating Migrations

### 1. Create Migration File

Create a new file in `src/infrastructure/database/migrations/scripts/`:

```typescript
// 003_add_user_preferences.ts
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { createDatabaseConfig } from '../../config';
import { Migration } from '../migration-manager';
import crypto from 'crypto';

const migration: Migration = {
  id: '003_add_user_preferences',
  name: 'Add user preferences table',
  version: '1.2.0',
  description: 'Creates user_preferences table for storing user settings',
  checksum: crypto
    .createHash('sha256')
    .update('003_add_user_preferences_v1.2.0')
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
      await db.execute(`
        CREATE TABLE user_preferences (
          id VARCHAR(255) PRIMARY KEY,
          user_id VARCHAR(255) NOT NULL,
          preferences JSONB NOT NULL DEFAULT '{}',
          created_at TIMESTAMP DEFAULT NOW() NOT NULL,
          updated_at TIMESTAMP DEFAULT NOW() NOT NULL
        );
      `);

      await db.execute(`
        CREATE INDEX idx_user_preferences_user_id ON user_preferences(user_id);
      `);
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
      await db.execute(`DROP TABLE IF EXISTS user_preferences CASCADE;`);
    } finally {
      await pool.end();
    }
  },
};

export default migration;
```

### 2. Apply Migration

```bash
npm run db:migrate:up
```

## Creating Seeds

### 1. Create Seed File

Create a new file in `src/infrastructure/database/seeding/data/`:

```typescript
// 004_sample_preferences.ts
import { SeedData, SeedContext } from '../seed-manager';

const seed: SeedData = {
  id: '004_sample_preferences',
  name: 'Create sample user preferences',
  description: 'Creates sample user preference data for testing',
  environment: 'development',
  version: '1.0.0',
  dependencies: ['002_test_users'],

  async execute(context: SeedContext): Promise<void> {
    const { prisma, drizzle } = context;

    // Get existing users
    const users = await prisma.user.findMany();

    // Create preferences for each user
    for (const user of users) {
      await drizzle.execute(
        `
        INSERT INTO user_preferences (id, user_id, preferences)
        VALUES ($1, $2, $3)
      `,
        [
          `pref_${user.id}`,
          user.id,
          JSON.stringify({
            theme: 'dark',
            notifications: true,
            language: 'en',
          }),
        ]
      );
    }

    console.log(`Created preferences for ${users.length} users`);
  },

  async rollback(context: SeedContext): Promise<void> {
    const { drizzle } = context;
    await drizzle.execute(`DELETE FROM user_preferences`);
    console.log('Rolled back user preferences');
  },
};

export default seed;
```

### 2. Apply Seed

```bash
npm run db:seed
```

## Production Deployment

### 1. Create Migration Plan

```typescript
import { ProductionMigrator } from './infrastructure/database/migrations/production-migrator';

const migrator = new ProductionMigrator();
await migrator.initialize();

const plan = await migrator.createMigrationPlan();
console.log('Migration Plan:', plan);
```

### 2. Execute Production Migration

```typescript
await migrator.executeProductionMigration({
  dryRun: false,
  backupBeforeMigration: true,
  maxDowntime: 300000, // 5 minutes
  rollbackOnFailure: true,
  notificationWebhook: 'https://hooks.slack.com/...',
});
```

### 3. Backup and Recovery

```typescript
// Create backup
const backupPath = await migrator.createBackup('pre-migration-backup');

// Restore backup if needed
await migrator.restoreBackup(backupPath);
```

## Schema Validation

### Validation Types

The schema validator checks for:

- **Missing Tables**: Required tables that don't exist
- **Missing Columns**: Required columns in existing tables
- **Type Mismatches**: Incorrect column data types
- **Missing Indexes**: Critical indexes for performance
- **Constraint Violations**: Foreign key and other constraints
- **Data Consistency**: Cross-ORM data synchronization

### Custom Validation

```typescript
import { SchemaValidator } from './infrastructure/database/validation/schema-validator';

const validator = new SchemaValidator();
const result = await validator.validateSchema();

if (!result.valid) {
  console.log('Validation Errors:', result.errors);
  console.log('Validation Warnings:', result.warnings);
}
```

## Environment Configuration

### Development

```bash
NODE_ENV=development
DATABASE_URL="postgresql://user:password@localhost:5432/auth_dev"
```

### Testing

```bash
NODE_ENV=testing
DATABASE_URL="postgresql://user:password@localhost:5432/auth_test"
```

### Production

```bash
NODE_ENV=production
DATABASE_URL="postgresql://user:password@prod-host:5432/auth_prod"
DATABASE_REPLICA_URLS="postgresql://user:password@replica1:5432/auth_prod,postgresql://user:password@replica2:5432/auth_prod"
```

## Best Practices

### Migration Guidelines

1. **Always test migrations** in development and staging first
2. **Create backups** before production migrations
3. **Use descriptive names** and version numbers
4. **Include rollback logic** for all migrations
5. **Keep migrations small** and focused
6. **Document breaking changes** in migration descriptions

### Seeding Guidelines

1. **Environment-specific seeds** for different deployment stages
2. **Idempotent operations** that can be run multiple times
3. **Dependency management** between related seeds
4. **Realistic test data** that reflects production scenarios
5. **Cleanup capabilities** for development environments

### Production Safety

1. **Dry run migrations** before actual deployment
2. **Monitor database performance** during migrations
3. **Set reasonable downtime limits** for migrations
4. **Implement rollback strategies** for failed migrations
5. **Use notification webhooks** for migration status updates

## Troubleshooting

### Common Issues

#### Migration Fails

```bash
# Check migration status
npm run db:migrate:status

# Validate schema
npm run db:validate

# Check logs for specific errors
```

#### Schema Validation Errors

```bash
# Run detailed validation
npm run db:cli validate --detailed

# Check for missing tables or columns
# Review migration scripts for completeness
```

#### Seed Dependencies

```bash
# Check seed status
npm run db:seed:status

# Apply dependencies first
npm run db:cli seed run --env development
```

### Recovery Procedures

#### Rollback Migration

```bash
# Rollback last migration
npm run db:migrate:down

# Rollback specific migration
npm run db:cli migrate down --id migration_id
```

#### Restore from Backup

```bash
# List available backups
ls backups/

# Restore specific backup
psql $DATABASE_URL < backups/backup-2024-01-01.sql
```

#### Reset Development Environment

```bash
# Complete reset (development only)
npm run db:reset
```

## Monitoring and Observability

The system includes comprehensive logging and monitoring:

- **Migration execution times** and performance metrics
- **Schema validation results** and consistency checks
- **Database connection monitoring** during operations
- **Error tracking and correlation IDs** for debugging
- **Webhook notifications** for production deployments

## Security Considerations

- **Environment isolation** prevents cross-environment data leaks
- **Backup encryption** for sensitive production data
- **Access control** through database user permissions
- **Audit logging** for all migration and seeding operations
- **Secure credential management** through environment variables

## Contributing

When adding new migrations or seeds:

1. Follow the established naming conventions
2. Include comprehensive tests
3. Document any breaking changes
4. Test in multiple environments
5. Review with the team before production deployment
