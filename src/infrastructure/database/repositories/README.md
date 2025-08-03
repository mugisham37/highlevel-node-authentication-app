# Repository Pattern Implementation

This directory contains the implementation of the Repository Pattern for the Enterprise Authentication Backend, featuring dual ORM support (Prisma and Drizzle), advanced caching, query optimization, and transaction management.

## Architecture Overview

The repository pattern implementation follows these key principles:

- **Dependency Inversion**: All repositories implement interfaces, allowing for easy testing and swapping of implementations
- **Dual ORM Strategy**: Prisma for complex relational operations, Drizzle for high-performance operations
- **Caching Layer**: Multi-layer caching with L1 (memory), L2 (Redis), and L3 (CDN) support
- **Query Optimization**: Intelligent query caching, replica routing, and performance monitoring
- **Transaction Management**: Cross-ORM transaction support with retry logic and circuit breakers

## Directory Structure

```
repositories/
├── interfaces/                 # Repository interfaces (contracts)
│   ├── base-repository.interface.ts
│   ├── user-repository.interface.ts
│   └── session-repository.interface.ts
├── base/                      # Base implementations and utilities
│   ├── base-repository.ts
│   └── transaction-manager.ts
├── prisma/                    # Prisma-based repository implementations
│   └── prisma-user-repository-enhanced.ts
├── drizzle/                   # Drizzle-based repository implementations
│   └── drizzle-session-repository-enhanced.ts
├── repository-factory.ts      # Factory for creating repository instances
├── index.ts                   # Main exports
└── README.md                  # This file
```

## Key Components

### 1. Repository Interfaces

#### Base Repository Interface

```typescript
interface IBaseRepository<T, TCreate, TUpdate, TFilters> {
  // Basic CRUD operations
  create(data: TCreate): Promise<T>;
  findById(id: string): Promise<T | null>;
  update(id: string, data: TUpdate): Promise<T>;
  delete(id: string): Promise<void>;

  // Batch operations
  findByIds(ids: string[]): Promise<T[]>;
  bulkCreate(data: TCreate[]): Promise<T[]>;
  bulkUpdate(updates: Array<{ id: string; data: TUpdate }>): Promise<T[]>;
  bulkDelete(ids: string[]): Promise<void>;

  // Query operations
  findMany(filters: TFilters): Promise<{ items: T[]; total: number }>;
  exists(id: string): Promise<boolean>;
  count(filters?: Partial<TFilters>): Promise<number>;
}
```

#### Cacheable Repository Interface

```typescript
interface ICacheableRepository<T> {
  getCached(key: string): Promise<T | null>;
  setCached(key: string, value: T, ttl?: number): Promise<void>;
  invalidateCache(pattern: string): Promise<void>;
  findByIdCached(id: string, ttl?: number): Promise<T | null>;
  findManyCached(
    filters: any,
    cacheKey: string,
    ttl?: number
  ): Promise<{ items: T[]; total: number }>;
}
```

### 2. Repository Implementations

#### User Repository (Prisma-based)

- **Purpose**: Complex relational queries, user management, role assignments
- **Features**:
  - Advanced filtering and searching
  - Role and permission management
  - Authentication security features (lockout, MFA)
  - Bulk operations with validation
  - Comprehensive audit logging

#### Session Repository (Drizzle-based)

- **Purpose**: High-performance session management and authentication flows
- **Features**:
  - Fast session validation and refresh
  - Authentication attempt tracking
  - Rate limiting support
  - Device and IP-based filtering
  - Real-time session analytics

### 3. Transaction Management

The `TransactionManager` provides:

- Cross-ORM transaction support
- Automatic retry with exponential backoff
- Circuit breaker pattern for resilience
- Distributed transaction coordination
- Read-only transaction optimization

```typescript
// Example usage
await transactionManager.withTransaction(async (context) => {
  const user = await context.prisma.user.create({ data: userData });
  await context.drizzle
    .insert(sessions)
    .values({ userId: user.id, ...sessionData });
  return user;
});
```

### 4. Repository Factory

The `RepositoryFactory` manages repository lifecycle:

- Singleton pattern for repository instances
- Dependency injection and configuration
- Health checks and monitoring
- Cache management and warmup
- Graceful shutdown handling

## Usage Examples

### Basic Repository Usage

```typescript
import { RepositoryFactory } from './repositories';

// Initialize factory
const repositoryFactory = RepositoryFactory.create(connectionManager, logger);

// Get repository instances
const userRepository = repositoryFactory.getUserRepository();
const sessionRepository = repositoryFactory.getSessionRepository();

// Create a user
const user = await userRepository.create({
  email: 'user@example.com',
  name: 'John Doe',
  passwordHash: 'hashed_password',
});

// Create a session
const session = await sessionRepository.create({
  id: 'session_id',
  userId: user.id,
  token: 'jwt_token',
  refreshToken: 'refresh_token',
  expiresAt: new Date(Date.now() + 3600000),
  refreshExpiresAt: new Date(Date.now() + 7200000),
});
```

### Advanced Querying with Caching

```typescript
// Find users with caching
const users = await userRepository.findManyCached(
  {
    search: 'john',
    mfaEnabled: true,
    limit: 50,
  },
  'users:search:john:mfa:true',
  1800 // 30 minutes TTL
);

// Validate session with caching
const validation = await sessionRepository.validateSessionCached(
  'jwt_token',
  300 // 5 minutes TTL
);
```

### Cross-Repository Transactions

```typescript
// Execute operations across multiple repositories in a transaction
const result = await repositoryFactory.withRepositoryTransaction(
  async (repos) => {
    // Create user
    const user = await repos.userRepository.create(userData);

    // Assign role
    await repos.userRepository.assignRole(user.id, 'admin_role_id');

    // Create initial session
    const session = await repos.sessionRepository.create({
      userId: user.id,
      ...sessionData,
    });

    return { user, session };
  }
);
```

### Performance Monitoring

```typescript
// Get repository performance metrics
const metrics = await repositoryFactory.getRepositoryMetrics();
console.log('Query stats:', metrics.userRepository.queries);
console.log('Cache hit rate:', metrics.cache.hitRate);

// Health check
const health = await repositoryFactory.healthCheck();
console.log('Repository health:', health.status);
```

## Configuration

### Repository Factory Configuration

```typescript
const config = {
  enableCaching: true,
  cacheConfig: {
    defaultTtl: 3600, // 1 hour default TTL
    maxMemoryItems: 1000, // L1 cache size
  },
  enableMetrics: true,
  optimizationLevel: 'aggressive',
};

const factory = RepositoryFactory.create(connectionManager, logger, config);
```

### Transaction Configuration

```typescript
const transactionOptions = {
  timeout: 30000, // 30 seconds
  maxRetries: 3, // Retry up to 3 times
  retryDelay: 1000, // 1 second initial delay
  isolationLevel: 'READ_COMMITTED',
};

await transactionManager.withTransaction(operation, transactionOptions);
```

## Performance Optimizations

### 1. Query Optimization

- Intelligent caching based on query patterns
- Automatic replica routing for read operations
- Query performance monitoring and slow query detection
- Connection pooling and load balancing

### 2. Caching Strategy

- **L1 Cache**: In-memory cache for frequently accessed data
- **L2 Cache**: Redis cache for shared data across instances
- **L3 Cache**: CDN cache for static/semi-static data
- Automatic cache invalidation on data changes

### 3. Database Optimization

- Dual ORM strategy for optimal performance
- Read replica support for scaling read operations
- Connection pooling with health monitoring
- Circuit breaker pattern for resilience

## Testing

The repository implementation includes comprehensive tests:

```bash
# Run repository tests
npm test src/test/infrastructure/database/repository-pattern.test.ts

# Run with coverage
npm run test:coverage
```

Test coverage includes:

- Basic CRUD operations
- Caching behavior
- Transaction management
- Error handling and resilience
- Performance optimization
- Cross-repository operations

## Best Practices

### 1. Repository Usage

- Always use interfaces for dependency injection
- Prefer cached operations for frequently accessed data
- Use transactions for operations that must be atomic
- Implement proper error handling and logging

### 2. Performance

- Use appropriate TTL values for different data types
- Monitor cache hit rates and adjust strategies
- Use read replicas for read-heavy operations
- Implement proper connection pooling

### 3. Security

- Always validate input data
- Use parameterized queries to prevent SQL injection
- Implement proper access control in repository methods
- Log security-relevant operations for auditing

### 4. Maintenance

- Regularly monitor repository metrics
- Perform cache warmup during deployment
- Clean up expired data periodically
- Update repository interfaces when domain models change

## Migration Guide

### From Legacy Repositories

1. **Update Imports**:

   ```typescript
   // Old
   import { PrismaUserRepository } from './repositories/prisma-user-repository';

   // New
   import { RepositoryFactory } from './repositories';
   const userRepository = repositoryFactory.getUserRepository();
   ```

2. **Update Method Calls**:

   ```typescript
   // Old
   const user = await userRepo.findById(id);

   // New (with caching)
   const user = await userRepo.findByIdCached(id, 3600);
   ```

3. **Update Transaction Usage**:

   ```typescript
   // Old
   await prisma.$transaction(async (tx) => { ... });

   // New
   await transactionManager.withTransaction(async (context) => { ... });
   ```

## Troubleshooting

### Common Issues

1. **Cache Misses**: Check TTL values and cache invalidation patterns
2. **Slow Queries**: Monitor query metrics and optimize filters
3. **Transaction Timeouts**: Adjust timeout values and reduce transaction scope
4. **Connection Pool Exhaustion**: Review connection pool configuration

### Debugging

Enable debug logging:

```typescript
const logger = winston.createLogger({
  level: 'debug',
  // ... other config
});
```

Monitor repository metrics:

```typescript
setInterval(async () => {
  const metrics = await repositoryFactory.getRepositoryMetrics();
  console.log('Repository metrics:', metrics);
}, 60000); // Every minute
```

## Contributing

When adding new repositories:

1. Create interface in `interfaces/` directory
2. Implement repository extending `BaseRepository`
3. Add factory method in `RepositoryFactory`
4. Write comprehensive tests
5. Update this documentation

For questions or issues, please refer to the main project documentation or create an issue in the project repository.
