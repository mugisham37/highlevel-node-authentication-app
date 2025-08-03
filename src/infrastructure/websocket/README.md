# WebSocket Real-time Features

This module implements comprehensive WebSocket functionality for real-time authentication events, security notifications, and session management with Redis scaling support.

## Features

### 🔌 WebSocket Server

- **Real-time event streaming** for authentication and security events
- **Connection authentication** using JWT tokens
- **Session management** with Redis for horizontal scaling
- **Admin connections** with elevated privileges
- **Health check endpoints** for monitoring

### 🔐 Authentication & Authorization

- **JWT token validation** for WebSocket connections
- **Session verification** with Redis storage
- **Rate limiting** per user and IP address
- **Origin validation** for security
- **Admin privilege checking** for sensitive operations

### 📡 Real-time Notifications

- **Security alerts** for high-risk activities
- **Authentication events** (login, logout, MFA challenges)
- **Session events** (creation, expiration, revocation)
- **Admin notifications** for user management actions
- **Broadcast notifications** for system-wide announcements

### 🚀 Scaling & Performance

- **Redis-based scaling** across multiple server instances
- **Connection load balancing** with server affinity
- **Event broadcasting** via Redis pub/sub
- **Connection cleanup** and health monitoring
- **Performance metrics** and statistics

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    WebSocket Server                         │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ Connection  │ │    Event    │ │      Real-time          │ │
│  │ Management  │ │ Broadcasting│ │    Notifications        │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                 Authentication Layer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ JWT Token   │ │   Session   │ │      Rate Limiting      │ │
│  │ Validation  │ │ Verification│ │    & Origin Check       │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
                              │
┌─────────────────────────────────────────────────────────────┐
│                   Redis Scaling Layer                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────────────────┐ │
│  │ Connection  │ │   Event     │ │      Statistics        │ │
│  │   Storage   │ │ Pub/Sub     │ │     & Monitoring        │ │
│  └─────────────┘ └─────────────┘ └─────────────────────────┘ │
└─────────────────────────────────────────────────────────────┘
```

## Usage

### Server Setup

```typescript
import { WebSocketServer } from './infrastructure/websocket/websocket-server';
import { FastifyInstance } from 'fastify';

// Initialize WebSocket server
const webSocketServer = new WebSocketServer();
await webSocketServer.initialize(fastify);
```

### Client Connection

```javascript
// Connect to WebSocket server
const ws = new WebSocket('ws://localhost:3000/ws/events?token=your-jwt-token');

ws.onopen = function () {
  console.log('Connected to WebSocket server');

  // Subscribe to events
  ws.send(
    JSON.stringify({
      type: 'subscribe',
      payload: {
        eventTypes: ['authentication.*', 'security.*', 'session.*'],
      },
    })
  );
};

ws.onmessage = function (event) {
  const message = JSON.parse(event.data);
  console.log('Received:', message);
};
```

### Publishing Events

```typescript
import { WebSocketIntegrationService } from './application/services/websocket-integration.service';

// Publish authentication event
await integrationService.publishAuthenticationEvent(
  'authentication.login.success',
  'user-123',
  'session-456',
  {
    ip: '192.168.1.100',
    userAgent: 'Mozilla/5.0...',
    timestamp: new Date().toISOString(),
  }
);

// Send security alert
await integrationService.publishSecurityEvent(
  'security.high_risk.detected',
  'user-123',
  'session-456',
  {
    riskScore: 85,
    factors: ['unusual_location', 'new_device'],
    timestamp: new Date().toISOString(),
  }
);
```

### Sending Notifications

```typescript
// Send user notification
await integrationService.sendUserNotification(
  'user-123',
  'warning',
  'Unusual Login Detected',
  'We detected a login from a new device.',
  {
    device: 'Unknown Device',
    location: 'New York, NY',
  }
);

// Send broadcast notification
await integrationService.sendBroadcastNotification(
  'info',
  'System Maintenance',
  'Scheduled maintenance tonight from 2:00 AM to 4:00 AM EST.'
);
```

## WebSocket Endpoints

### `/ws/events`

Main WebSocket endpoint for real-time event streaming.

**Authentication:** JWT token required (query parameter or Authorization header)

**Supported Messages:**

- `subscribe` - Subscribe to event types
- `unsubscribe` - Unsubscribe from event types
- `ping` - Keep connection alive
- `get_subscriptions` - Get current subscriptions

### `/ws/admin`

Admin WebSocket endpoint for system monitoring and management.

**Authentication:** JWT token with admin privileges required

**Additional Capabilities:**

- System monitoring events
- User management notifications
- Performance metrics
- Security alerts

### `/ws/health`

Health check endpoint for monitoring WebSocket server status.

**Authentication:** None required

**Response:** Server health status and statistics

## Event Types

### Authentication Events

- `authentication.login.success`
- `authentication.login.failure`
- `authentication.logout`
- `authentication.mfa.challenge`
- `authentication.mfa.success`
- `authentication.password.change`
- `authentication.token.refresh`

### Security Events

- `security.high_risk.detected`
- `security.rate_limit.exceeded`
- `security.suspicious.activity`
- `security.validation.failed`

### Session Events

- `session.created`
- `session.expired`
- `session.revoked`
- `session.concurrent_limit`

### Admin Events

- `admin.user.created`
- `admin.user.updated`
- `admin.user.deleted`
- `admin.role.assigned`
- `admin.permission.granted`

### System Events

- `system.maintenance.scheduled`
- `system.error.critical`
- `system.performance.degraded`

## Configuration

### Environment Variables

```bash
# Redis Configuration (for scaling)
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_ENABLED=false
REDIS_CLUSTER_NODES=node1:6379,node2:6379,node3:6379

# JWT Configuration
JWT_SECRET=your-jwt-secret-key
JWT_REFRESH_SECRET=your-jwt-refresh-secret-key

# WebSocket Configuration
WEBSOCKET_MAX_CONNECTIONS=10000
WEBSOCKET_HEARTBEAT_INTERVAL=30000
WEBSOCKET_CLEANUP_INTERVAL=300000
```

### Redis Scaling

The WebSocket system uses Redis for horizontal scaling across multiple server instances:

- **Connection Registry:** All connections are registered in Redis
- **Event Broadcasting:** Events are published via Redis pub/sub
- **Session Management:** WebSocket sessions are stored in Redis
- **Statistics:** Global statistics are aggregated from all servers

## Security Features

### Authentication

- JWT token validation for all connections
- Session verification with Redis
- Admin privilege checking
- Rate limiting per user/IP

### Origin Validation

- Configurable allowed origins
- Wildcard support for subdomains
- Development mode localhost allowance

### Connection Security

- Automatic cleanup of inactive connections
- Connection limits per user
- Suspicious activity detection
- Graceful degradation on errors

## Monitoring & Health Checks

### Health Check Endpoints

```typescript
// Server health
const health = await webSocketServer.healthCheck();
console.log(health);
// {
//   healthy: true,
//   serverId: 'srv_...',
//   connections: 150,
//   redisConnected: true
// }

// Integration service health
const integrationHealth = await integrationService.healthCheck();
console.log(integrationHealth);
// {
//   healthy: true,
//   components: {
//     webSocketServer: true,
//     sessionManager: true,
//     notificationService: true
//   }
// }
```

### Statistics

```typescript
// Get WebSocket statistics
const stats = await integrationService.getWebSocketStats();
console.log(stats);
// {
//   server: { serverId: '...', connections: 150 },
//   global: { totalServers: 3, totalConnections: 450 },
//   notifications: { queueLength: 5 }
// }
```

## Error Handling

The WebSocket system includes comprehensive error handling:

- **Connection Errors:** Automatic cleanup and reconnection
- **Authentication Failures:** Proper error responses and logging
- **Redis Failures:** Graceful degradation and fallback mechanisms
- **Message Parsing Errors:** Error responses to clients
- **Rate Limit Exceeded:** Temporary connection blocking

## Performance Considerations

### Connection Management

- Efficient connection storage with Maps
- Automatic cleanup of inactive connections
- Connection pooling for database operations
- Memory usage monitoring

### Event Broadcasting

- Optimized event matching algorithms
- Batch processing for multiple events
- Redis pub/sub for cross-server communication
- Event queuing for reliability

### Scaling

- Stateless server design for horizontal scaling
- Redis-based session storage
- Load balancing with connection affinity
- Auto-scaling based on connection count

## Testing

Run WebSocket tests:

```bash
npm test -- src/test/infrastructure/websocket/
```

Run integration tests:

```bash
npm test -- src/test/integration/websocket-integration.test.ts
```

## Examples

See `src/examples/websocket-example.ts` for comprehensive usage examples including:

- Server setup and initialization
- Client connection simulation
- Event publishing and handling
- Notification sending
- Health monitoring
- Statistics collection

## Troubleshooting

### Common Issues

1. **Connection Authentication Failures**
   - Verify JWT token is valid and not expired
   - Check session exists in Redis
   - Ensure proper Authorization header format

2. **Redis Connection Issues**
   - Verify Redis server is running
   - Check Redis configuration and credentials
   - Monitor Redis memory usage

3. **Event Broadcasting Problems**
   - Check Redis pub/sub configuration
   - Verify event format and structure
   - Monitor Redis pub/sub channels

4. **Performance Issues**
   - Monitor connection count and memory usage
   - Check Redis performance metrics
   - Review event processing queue lengths

### Debug Logging

Enable debug logging for WebSocket operations:

```bash
LOG_LEVEL=debug npm start
```

This will provide detailed logs for:

- Connection establishment and cleanup
- Event broadcasting and delivery
- Authentication and authorization
- Redis operations and scaling
- Performance metrics and health checks
