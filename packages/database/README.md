# @company/database

A comprehensive database layer package that provides dual ORM support with both Prisma and Drizzle for PostgreSQL databases.

## Features

- **Dual ORM Support**: Use both Prisma and Drizzle ORMs with the same PostgreSQL database
- **Unified Client Factory**: Single interface to manage both database clients
- **Repository Pattern**: Clean abstraction layer for data access
- **Migration Management**: Support for both Prisma and Drizzle migrations
- **Seeding Utilities**: Database seeding for development and testing
- **Connection Management**: Optimized connection pooling and health checks
- **Type Safety**: Full TypeScript support with generated types

## Installation

```bash
npm install @company/database
```

## Quick Start

```typescript
import { DatabaseClientFactory, PrismaUserRepository } from '@company/database';

// Create database clients
const prismaClient = DatabaseClientFactory.createPrismaClient();
const drizzleClient = DatabaseClientFactory.createDrizzleClient();

// Use repositories
const userRepository = new PrismaUserRepository(prismaClient);
const user = await userRepository.findByEmail(new Email('user@example.com'));
```

## Configuration

Set the following environment variables:

```env
DATABASE_URL=postgresql://username:password@localhost:5432/database_name
NODE_ENV=development|production|test
```

## Database Clients

### Prisma Client

```typescript
import { DatabaseClientFactory } from '@company/database';

const prisma = DatabaseClientFactory.createPrismaClient();
const users = await prisma.user.findMany();
```

### Drizzle Client

```typescript
import { DatabaseClientFactory, schema } from '@company/database';

const drizzle = DatabaseClientFactory.createDrizzleClient();
const sessions = await drizzle.select().from(schema.authSessions);
```

## Repositories

The package includes repository implementations for both ORMs:

### Prisma Repositories

- `PrismaUserRepository`
- `PrismaRoleRepository`
- `PrismaPermissionRepository`

### Drizzle Repositories

- `DrizzleSessionRepository`
- `MFAChallengeRepository`
- `OAuthAccountRepository`

### Usage Example

```typescript
import { 
  PrismaUserRepository, 
  DrizzleSessionRepository,
  DatabaseClientFactory 
} from '@company/database';

const prismaClient = DatabaseClientFactory.createPrismaClient();
const drizzleClient = DatabaseClientFactory.createDrizzleClient();

const userRepo = new PrismaUserRepository(prismaClient);
const sessionRepo = new DrizzleSessionRepository(drizzleClient);

// Create user with Prisma
const user = await userRepo.create({
  email: new Email('user@example.com'),
  password: new Password('secure123'),
  firstName: 'John',
  lastName: 'Doe'
});

// Create session with Drizzle
const session = await sessionRepo.create({
  userId: user.id,
  deviceInfo: { /* ... */ },
  expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000)
});
```

## Migrations

### Prisma Migrations

```bash
# Generate Prisma client
npm run prisma:generate

# Create migration
npm run prisma:migrate

# Deploy migrations
npm run prisma:deploy

# Reset database
npm run prisma:reset
```

### Drizzle Migrations

```bash
# Generate migrations
npm run drizzle:generate

# Run migrations
npm run drizzle:migrate

# Push schema changes
npm run drizzle:push

# Open Drizzle Studio
npm run drizzle:studio
```

## Seeding

```bash
# Run database seeds
npm run db:seed

# Reset and seed database
npm run db:reset
```

## Health Checks

```typescript
import { DatabaseClientFactory } from '@company/database';

const health = await DatabaseClientFactory.healthCheck();
console.log('Prisma healthy:', health.prisma);
console.log('Drizzle healthy:', health.drizzle);
```

## Connection Management

```typescript
import { DatabaseClientFactory } from '@company/database';

// Close all connections (useful for graceful shutdown)
await DatabaseClientFactory.closeConnections();
```

## Testing

The package includes comprehensive test suites:

```bash
# Run tests
npm test

# Run tests with coverage
npm run test:coverage
```

## Architecture

```
packages/database/
├── src/
│   ├── client.ts              # Database client factory
│   ├── connection/            # Connection management
│   ├── repositories/          # Repository implementations
│   │   ├── interfaces/        # Repository interfaces
│   │   ├── prisma/           # Prisma repositories
│   │   └── drizzle/          # Drizzle repositories
│   ├── migrations/           # Migration utilities
│   ├── seeds/               # Database seeding
│   ├── drizzle/             # Drizzle schema and config
│   │   └── schema/          # Drizzle table definitions
│   ├── validation/          # Schema validation
│   └── cli/                 # CLI utilities
├── prisma/                  # Prisma schema and migrations
└── __tests__/              # Test suites
```

## Dependencies

- `@prisma/client` - Prisma ORM client
- `drizzle-orm` - Drizzle ORM
- `pg` - PostgreSQL client
- `@company/shared` - Shared domain entities and types
- `@company/config` - Configuration management

## Contributing

1. Make changes to the source code
2. Add tests for new functionality
3. Ensure all tests pass: `npm test`
4. Build the package: `npm run build`
5. Update documentation as needed

## License

MIT