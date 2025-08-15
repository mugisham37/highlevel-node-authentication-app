# Redis Cache Infrastructure and Session Storage

This module implements a comprehensive multi-layer caching system with Redis cluster support, circuit breaker patterns, and session management for the enterprise authentication backend.

## Features

### 🏗️ Multi-Layer Cache Architecture

- **L1 Cache**: In-memory cache for ultra-fast access
- **L2 Cache**: Redis cache for distributed caching
- **L3 Cache**: CDN cache support (placeholder implementation)

### 🔄 Circuit Breaker Pattern

- Automatic failure detection and recovery
- Configurable failure thresholds and recovery timeouts
- Fallback mechanism support
- Manual circuit control for testing/admin purposes

### 🗄️ Session Storage

- High-performance session management using Redis
- Device fingerprinting and risk scoring
- Concurrent session limits per user
- Automatic session cleanup and expiration
- Activity-based session extension

### 🏷️ Tag-Based Cache Invalidation

- Invalidate cache entries by tags
- Bulk invalidation support
- Hierarchical tag relationships

### 📊 Comprehensive Monitoring

- Cache hit/miss statistics
- Circuit breaker metrics
- Performance monitoring
- Health checks

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    Application Layer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   Session   │ │Multi-Layer  │ │      Cache              │ │
│  │   Storage   │ │   Cache     │ │    Factory              │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                     Cache Layers                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ L1: Memory  │ │ L2: Redis   │ │     L3: CDN             │ │
│  │   Cache     │ │   Cache     │ │    (Optional)           │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                Infrastructure Layer                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │   Redis     │ │  Circuit    │ │    Connection           │ │
│  │   Client    │ │  Breaker    │ │    Management           │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Components

### RedisClient

Manages Redis connections with cluster support, automatic reconnection, and health monitoring.

```typescript
import { createRedisClient } from './redis-client';

const redisClient = createRedisClient({
  host: 'localhost',
  port: 6379,
  cluster: {
    enabled: false,
    nodes: [],
  },
  retryDelayOnFailover: 100,
  maxRetriesPerRequest: 3,
  lazyConnect: true,
  keepAlive: 30000,
  connectTimeout: 10000,
  commandTimeout: 5000,
});

await redisClient.connect();
```

### CircuitBreaker

Implements the circuit breaker pattern to handle Redis failures gracefully.

```typescript
import { CircuitBreaker } from './circuit-breaker';

const circuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  recoveryTimeout: 60000,
  monitoringPeriod: 300000,
});

const result = await circuitBreaker.execute(
  async () => await redisOperation(),
  async () => await fallbackOperation() // Optional fallback
);
```

### MultiLayerCache

Coordinates multiple cache layers with intelligent read-through and write-through strategies.

```typescript
import { createCacheSystem } from './cache-factory';

const cacheFactory = await createCacheSystem();
const cache = cacheFactory.getMultiLayerCache();

// Set data with tags and TTL
await cache.set('user:123', userData, {
  ttl: 3600,
  tags: ['user:123', 'profile'],
});

// Get data (checks L1 -> L2 -> L3)
const data = await cache.get('user:123');

// Invalidate by tag
await cache.invalidateByTag('user:123');
```

### SessionStorage

High-performance session management with device tracking and risk scoring.

```typescript
const sessionStorage = cacheFactory.getSessionStorage();

// Create session
const session = await sessionStorage.createSession(
  'user123',
  {
    fingerprint: 'device-fingerprint',
    platform: 'Windows',
    browser: 'Chrome',
    version: '120.0.0',
    isMobile: false,
  },
  '192.168.1.100',
  'Mozilla/5.0...'
);

// Retrieve by token
const sessionData = await sessionStorage.getSessionByToken(session.token);

// Update activity
await sessionStorage.updateSessionActivity(
  session.id,
  '192.168.1.101',
  'Updated User Agent',
  0.2 // Risk score
);
```

## Configuration

### Environment Variables

```bash
# Redis Configuration
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_DB=0
REDIS_CLUSTER_ENABLED=false
REDIS_CLUSTER_NODES=
REDIS_RETRY_DELAY=100
REDIS_MAX_RETRIES=3
REDIS_CONNECT_TIMEOUT=10000
REDIS_COMMAND_TIMEOUT=5000
REDIS_KEEP_ALIVE=30000
```

### Cache System Configuration

```typescript
const cacheConfig = {
  redis: {
    keyPrefix: 'auth:',
    defaultTTL: 3600,
    compression: {
      enabled: true,
      threshold: 1024,
    },
    circuitBreaker: {
      enabled: true,
      failureThreshold: 5,
      recoveryTimeout: 60000,
    },
  },
  memory: {
    maxSize: 10000,
    maxMemory: 100 * 1024 * 1024, // 100MB
    cleanupInterval: 60000,
    defaultTTL: 300,
  },
  session: {
    sessionTTL: 900, // 15 minutes
    refreshTTL: 604800, // 7 days
    maxSessionsPerUser: 10,
    extendOnActivity: true,
  },
};
```

## Usage Examples

### Basic Cache Operations

```typescript
import { createCacheSystem } from './cache-factory';

const cacheFactory = await createCacheSystem();
const cache = cacheFactory.getMultiLayerCache();

// Store user data
await cache.set(
  'user:profile:123',
  {
    id: '123',
    name: 'John Doe',
    email: 'john@example.com',
  },
  {
    ttl: 3600,
    tags: ['user:123', 'profile'],
  }
);

// Retrieve user data
const profile = await cache.get('user:profile:123');

// Invalidate all user data
await cache.invalidateByTag('user:123');
```

### Session Management

```typescript
const sessionStorage = cacheFactory.getSessionStorage();

// Create session with device info
const session = await sessionStorage.createSession(
  'user123',
  {
    fingerprint: 'unique-device-id',
    platform: 'Windows',
    browser: 'Chrome',
    version: '120.0.0',
    isMobile: false,
    screenResolution: '1920x1080',
    timezone: 'America/New_York',
  },
  '192.168.1.100',
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  { loginMethod: 'oauth', provider: 'google' }
);

// Validate session by token
const isValid = await sessionStorage.getSessionByToken(session.token);

// Update session activity
await sessionStorage.updateSessionActivity(
  session.id,
  '192.168.1.101', // New IP
  undefined, // Keep existing user agent
  0.1 // Low risk score
);

// Get all user sessions
const userSessions = await sessionStorage.getUserSessions('user123');

// Clean up expired sessions
await sessionStorage.cleanupExpiredSessions();
```

### Health Monitoring

```typescript
// Check system health
const health = await cacheFactory.healthCheck();
console.log('Cache System Health:', health);

// Get detailed statistics
const stats = cacheFactory.getStats();
console.log('Cache Statistics:', stats);
```

## Error Handling

The cache system implements comprehensive error handling:

### Circuit Breaker Protection

- Automatically opens circuit on repeated failures
- Provides fallback mechanisms
- Recovers automatically after timeout

### Graceful Degradation

- Falls back to memory cache if Redis is unavailable
- Continues operation with reduced functionality
- Logs errors for monitoring

### Connection Management

- Automatic reconnection with exponential backoff
- Connection pooling for optimal performance
- Health checks and monitoring

## Performance Considerations

### Memory Cache (L1)

- Ultra-fast access (< 1ms)
- Limited by available memory
- LRU eviction policy
- Automatic cleanup of expired entries

### Redis Cache (L2)

- Fast distributed access (1-5ms)
- Persistent across application restarts
- Cluster support for high availability
- Compression for large values

### Optimization Strategies

- Read-through caching populates upper layers
- Write-through caching ensures consistency
- Tag-based invalidation for efficient updates
- Connection pooling reduces overhead

## Testing

Run the cache system tests:

```bash
# Test memory cache
npm test -- src/test/infrastructure/cache/memory-cache.test.ts

# Test circuit breaker
npm test -- src/test/infrastructure/cache/circuit-breaker.test.ts

# Test full system (requires Redis)
npm test -- src/test/infrastructure/cache/cache-system.test.ts
```

## Monitoring and Observability

### Metrics Available

- Cache hit/miss ratios
- Response times
- Error rates
- Circuit breaker state
- Memory usage
- Connection pool status

### Health Checks

- Redis connectivity
- Cache functionality
- Session storage operations
- Overall system health

### Logging

- Structured logging with correlation IDs
- Performance metrics
- Error tracking
- Security events

## Security Considerations

### Data Protection

- Encryption in transit (Redis TLS)
- Secure session token generation
- Device fingerprinting for security
- Risk scoring for anomaly detection

### Access Control

- Redis authentication
- Network security (VPC/firewall)
- Key prefix isolation
- Audit logging

## Deployment

### Redis Setup

```bash
# Single Redis instance
redis-server --port 6379

# Redis Cluster (3 nodes minimum)
redis-server --port 7000 --cluster-enabled yes
redis-server --port 7001 --cluster-enabled yes
redis-server --port 7002 --cluster-enabled yes
redis-cli --cluster create 127.0.0.1:7000 127.0.0.1:7001 127.0.0.1:7002
```

### Production Configuration

- Enable Redis persistence (RDB + AOF)
- Configure memory limits and eviction policies
- Set up monitoring and alerting
- Implement backup strategies
- Use Redis Sentinel for high availability

## Troubleshooting

### Common Issues

1. **Redis Connection Failures**
   - Check Redis server status
   - Verify network connectivity
   - Review authentication settings

2. **High Memory Usage**
   - Monitor cache size limits
   - Check TTL settings
   - Review eviction policies

3. **Poor Performance**
   - Analyze cache hit ratios
   - Check network latency
   - Review query patterns

4. **Circuit Breaker Activation**
   - Check Redis health
   - Review error logs
   - Adjust threshold settings

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
LOG_LEVEL=debug npm start
```

This will provide detailed information about cache operations, Redis connections, and performance metrics.
