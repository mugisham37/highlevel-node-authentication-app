# @company/logger

Comprehensive logging infrastructure package with Winston, providing structured logging, correlation ID support, multiple transports, formatters, and metrics collection.

## Features

- **Multiple Transports**: Console, file (with rotation), and remote logging
- **Correlation ID Support**: Automatic correlation ID tracking across async contexts
- **Structured Logging**: JSON and plain text formatters
- **Sensitive Data Filtering**: Automatic redaction of passwords, tokens, and other sensitive data
- **Metrics Collection**: Built-in log metrics and monitoring
- **Environment-Specific Configuration**: Different settings for development, staging, and production
- **TypeScript Support**: Full type safety and IntelliSense support

## Installation

```bash
npm install @company/logger
```

## Quick Start

```typescript
import { initializeLogger, createLogger } from '@company/logger';

// Initialize the logger factory with configuration
initializeLogger({
  level: 'info',
  service: 'my-service',
  enableConsole: true,
  enableFile: true,
  enableMetrics: true
});

// Create a logger for your service
const logger = createLogger('user-service');

// Log messages
logger.info('User logged in', { userId: '123', email: 'user@example.com' });
logger.error('Login failed', { error: 'Invalid credentials' });
```

## Configuration

### Basic Configuration

```typescript
import { initializeLogger, LoggerConfig } from '@company/logger';

const config: LoggerConfig = {
  level: 'info',
  service: 'my-service',
  environment: 'production',
  enableConsole: true,
  enableFile: true,
  enableRemote: false,
  enableMetrics: true,
  
  // Console transport options
  console: {
    colorize: true,
    timestamp: true
  },
  
  // File transport options
  file: {
    directory: 'logs',
    maxSize: '20m',
    maxFiles: '14d',
    datePattern: 'YYYY-MM-DD'
  },
  
  // Remote logging options
  remote: {
    host: 'logs.example.com',
    port: 443,
    protocol: 'https',
    path: '/api/logs',
    auth: {
      username: 'logger',
      password: 'secret'
    }
  },
  
  // Sensitive data filtering
  filters: {
    enableSensitiveDataFilter: true,
    sensitiveFields: ['password', 'token', 'secret'],
    sensitivePatterns: [/\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g]
  }
};

initializeLogger(config);
```

## Correlation ID Support

The logger automatically tracks correlation IDs across async contexts:

```typescript
import { correlationMiddleware, createLogger } from '@company/logger';

// Fastify middleware
app.register(correlationMiddleware({
  headerName: 'x-correlation-id',
  includeInResponse: true,
  extractUserId: (request) => request.user?.id,
  extractSessionId: (request) => request.session?.id
}));

// Logger will automatically include correlation ID
const logger = createLogger('api');
logger.info('Processing request'); // Includes correlation ID automatically
```

## Custom Transports

### File Transport with Rotation

```typescript
import { createFileTransport } from '@company/logger';

const fileTransport = createFileTransport({
  filename: 'logs/app.log',
  datePattern: 'YYYY-MM-DD-HH',
  maxSize: '20m',
  maxFiles: '14d',
  zippedArchive: true
});
```

### Remote Transport

```typescript
import { createRemoteTransport } from '@company/logger';

const remoteTransport = createRemoteTransport({
  host: 'logs.example.com',
  port: 443,
  protocol: 'https',
  path: '/api/logs',
  timeout: 5000,
  retries: 3
});
```

## Custom Formatters

### JSON Formatter

```typescript
import { createJsonFormatter } from '@company/logger';

const jsonFormatter = createJsonFormatter({
  space: 2,
  includeStack: true,
  includeMetadata: true
});
```

### Plain Text Formatter

```typescript
import { createPlainFormatter } from '@company/logger';

const plainFormatter = createPlainFormatter({
  includeTimestamp: true,
  includeLevel: true,
  includeService: true,
  colorize: true,
  separator: ' | '
});
```

### Custom Template Formatter

```typescript
import { createCustomFormatter } from '@company/logger';

const customFormatter = createCustomFormatter({
  template: '{{timestamp}} [{{level}}] {{service}}: {{message}}',
  fields: {
    hostname: () => require('os').hostname(),
    version: () => process.env.APP_VERSION || '1.0.0'
  }
});
```

## Sensitive Data Filtering

Automatically redact sensitive information from logs:

```typescript
import { createSensitiveDataFilter } from '@company/logger';

const sensitiveFilter = createSensitiveDataFilter({
  fields: ['password', 'token', 'secret', 'apiKey'],
  patterns: [
    /\b\d{4}[-\s]?\d{4}[-\s]?\d{4}[-\s]?\d{4}\b/g, // Credit cards
    /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g // Emails
  ],
  replacement: '[REDACTED]'
});
```

## Metrics and Monitoring

Get insights into your logging:

```typescript
import { getLoggerFactory } from '@company/logger';

const factory = getLoggerFactory();

// Get current metrics
const metrics = factory.getMetrics();
console.log('Total logs:', metrics?.totalLogs);
console.log('Errors per minute:', metrics?.errorsPerMinute);

// Get formatted summary
const summary = factory.getMetricsSummary();
console.log(summary);
```

## Advanced Usage

### Child Loggers

```typescript
import { createLogger } from '@company/logger';

const parentLogger = createLogger('parent-service');
const childLogger = parentLogger.child({ component: 'auth' });

childLogger.info('Authentication successful'); // Includes parent context
```

### Correlation Context Management

```typescript
import { 
  setCorrelationContext, 
  getCorrelationId, 
  createChildContext 
} from '@company/logger';

// Set correlation context manually
setCorrelationContext({
  correlationId: 'req-123',
  userId: 'user-456',
  sessionId: 'sess-789'
}, () => {
  // All logging within this context will include correlation data
  logger.info('Processing user request');
  
  // Create child context for sub-operations
  const childContext = createChildContext({ operation: 'database-query' });
  // ... use child context
});
```

### Environment-Specific Configuration

```typescript
import { initializeLogger } from '@company/logger';

const isDevelopment = process.env.NODE_ENV === 'development';
const isProduction = process.env.NODE_ENV === 'production';

initializeLogger({
  level: isDevelopment ? 'debug' : 'info',
  enableConsole: isDevelopment,
  enableFile: true,
  enableRemote: isProduction,
  enableMetrics: isProduction,
  
  console: {
    colorize: isDevelopment,
    timestamp: true
  },
  
  file: {
    directory: isProduction ? '/var/log/app' : 'logs',
    maxSize: isProduction ? '100m' : '20m',
    maxFiles: isProduction ? '30d' : '7d'
  }
});
```

## API Reference

### LoggerFactory

- `getInstance(config?)`: Get singleton logger factory instance
- `createLogger(serviceName)`: Create service-specific logger
- `createLoggerWithCorrelation(serviceName, correlationId)`: Create logger with specific correlation ID
- `getMetrics()`: Get current log metrics
- `updateConfig(config)`: Update logger configuration
- `shutdown()`: Gracefully shutdown logger

### Correlation

- `generateCorrelationId()`: Generate new correlation ID
- `getCorrelationContext()`: Get current correlation context
- `setCorrelationContext(context, callback)`: Set correlation context for callback
- `createChildContext(overrides)`: Create child correlation context

### Transports

- `createConsoleTransport(options)`: Create console transport
- `createFileTransport(options)`: Create file transport with rotation
- `createRemoteTransport(options)`: Create remote logging transport

### Formatters

- `createJsonFormatter(options)`: Create JSON formatter
- `createPlainFormatter(options)`: Create plain text formatter
- `createCustomFormatter(options)`: Create custom template formatter

### Filters

- `createSensitiveDataFilter(options)`: Create sensitive data filter
- `createLevelFilter(levels)`: Create level-based filter
- `createServiceFilter(services)`: Create service-based filter
- `createSamplingFilter(rate)`: Create sampling filter

## License

MIT