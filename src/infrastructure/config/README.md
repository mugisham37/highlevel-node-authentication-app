# Configuration Management System

A comprehensive configuration management system for the Enterprise Authentication Backend, featuring secure secrets management, dynamic configuration updates, environment-specific profiles, and type-safe configuration validation.

## Features

- **🔒 Secure Secrets Management**: Encrypted storage of sensitive configuration values
- **🔄 Dynamic Configuration**: Runtime configuration updates without restart
- **🌍 Environment Profiles**: Pre-configured settings for different environments
- **✅ Type Safety**: Full TypeScript support with Zod validation
- **📊 Configuration History**: Track and rollback configuration changes
- **🔧 CLI Tools**: Command-line interface for configuration management
- **📁 Import/Export**: Backup and restore configuration settings
- **🔄 Secret Rotation**: Automated and manual secret rotation policies

## Quick Start

### Basic Usage

```typescript
import { configManager } from './infrastructure/config';

// Initialize the configuration system
await configManager.initialize({
  enableDynamicConfig: true,
  secretsPath: '.secure-config',
});

// Get configuration
const config = configManager.getConfig();
console.log(`Server running on ${config.server.host}:${config.server.port}`);

// Get specific section
const databaseConfig = configManager.getConfigSection('database');
console.log(`Database URL: ${databaseConfig.url}`);
```

### Environment Variables

Create a `.env` file with your configuration:

```bash
# Server Configuration
NODE_ENV=development
SERVER_HOST=localhost
SERVER_PORT=3000

# Database Configuration
DATABASE_URL=postgresql://user:pass@localhost:5432/db
DATABASE_POOL_MIN=2
DATABASE_POOL_MAX=20

# Redis Configuration
REDIS_URL=redis://localhost:6379
REDIS_CLUSTER_ENABLED=false

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=15m
JWT_REFRESH_EXPIRES_IN=7d

# OAuth Configuration
GOOGLE_CLIENT_ID=your-google-client-id
GOOGLE_CLIENT_SECRET=your-google-client-secret
GITHUB_CLIENT_ID=your-github-client-id
GITHUB_CLIENT_SECRET=your-github-client-secret

# Security Configuration
ARGON2_MEMORY_COST=65536
ARGON2_TIME_COST=3
RATE_LIMIT_GLOBAL_MAX=1000
```

## Configuration Structure

The configuration system is organized into logical sections:

### Server Configuration

```typescript
{
  host: string;
  port: number;
  cors: {
    origin: string | string[] | boolean;
    credentials: boolean;
  };
  helmet: {
    contentSecurityPolicy: boolean;
    crossOriginEmbedderPolicy: boolean;
  };
}
```

### Database Configuration

```typescript
{
  url: string;
  replicaUrls: string[];
  pool: {
    min: number;
    max: number;
    idleTimeout: number;
    connectionTimeout: number;
  };
  retry: {
    maxRetries: number;
    retryDelay: number;
    backoffMultiplier: number;
  };
}
```

### Security Configuration

```typescript
{
  encryption: {
    algorithm: string;
    keyDerivation: {
      algorithm: string;
      iterations: number;
      keyLength: number;
      digest: string;
    }
  }
  hashing: {
    algorithm: 'argon2' | 'bcrypt';
    argon2: {
      type: 'argon2d' | 'argon2i' | 'argon2id';
      memoryCost: number;
      timeCost: number;
      parallelism: number;
    }
  }
  rateLimit: {
    global: {
      max: number;
      window: number;
    }
    auth: {
      max: number;
      window: number;
    }
    api: {
      max: number;
      window: number;
    }
  }
}
```

## Secrets Management

### Storing Secrets

```typescript
import { SecretsManager } from './infrastructure/config';

const secretsManager = new SecretsManager('.secure-config');

// Store a secret
await secretsManager.storeSecret('API_KEY', 'sk-1234567890', {
  description: 'External API key',
  tags: ['api', 'external'],
  rotationPolicy: {
    enabled: true,
    intervalDays: 30,
  },
});

// Retrieve a secret
const apiKey = await secretsManager.getSecret('API_KEY');
```

### Secret Rotation

```typescript
// Check which secrets need rotation
const needsRotation = await secretsManager.checkRotationNeeded();

// Rotate a specific secret
await secretsManager.rotateSecret('API_KEY', 'new-api-key-value');

// List all secrets with metadata
const secrets = await secretsManager.listSecrets();
```

### Configuration Value Resolution

The system follows this priority order:

1. Environment variables
2. Stored secrets
3. Default values

```typescript
// This will check env vars first, then secrets, then use default
const value = await secretsManager.getConfigValue(
  'DATABASE_PASSWORD',
  'default-password'
);
```

## Dynamic Configuration

### Runtime Updates

```typescript
// Update a configuration section
const result = await configManager.updateConfigSection('server', {
  host: 'localhost',
  port: 4000,
  cors: { origin: true, credentials: true },
  helmet: { contentSecurityPolicy: true, crossOriginEmbedderPolicy: false },
});

if (result.valid) {
  console.log('Configuration updated successfully');
} else {
  console.error('Update failed:', result.errors);
}
```

### Configuration Events

```typescript
const dynamicConfigManager = configManager.getDynamicConfigManager();

// Listen for configuration changes
dynamicConfigManager.on('configChange', (changeEvent) => {
  console.log(`Configuration changed: ${changeEvent.section}`);
  console.log(`Changed by: ${changeEvent.source}`);
  console.log(`User: ${changeEvent.userId}`);
});

// Listen for specific section changes
dynamicConfigManager.on('configChange:database', (changeEvent) => {
  console.log('Database configuration changed, reconnecting...');
});
```

### Configuration History

```typescript
// Get configuration history
const history = await dynamicConfigManager.getConfigHistory(10);

// Rollback to a previous version
const timestamp = history[1].timestamp;
await dynamicConfigManager.rollbackToVersion(timestamp);
```

## Environment Profiles

The system includes pre-configured profiles for different environments:

### Development Profile

- Debug logging enabled
- Lower security settings for easier development
- File logging disabled
- Higher rate limits

### Staging Profile

- Production-like settings with additional debugging
- Structured JSON logging
- Metrics and tracing enabled
- Moderate security settings

### Production Profile

- Maximum security and performance
- Minimal logging (warn level)
- All monitoring features enabled
- Strict rate limiting and session management

### Test Profile

- Minimal resource usage
- Error-only logging
- Disabled external integrations
- No rate limiting

### Using Profiles

```typescript
// Profiles are automatically applied based on NODE_ENV
process.env.NODE_ENV = 'production';

await configManager.initialize();
const config = configManager.getConfig();
// Configuration will include production profile overrides
```

## CLI Tools

The system includes a comprehensive CLI for configuration management:

```bash
# Initialize configuration system
tsx src/infrastructure/config/cli.ts init

# Get configuration values
tsx src/infrastructure/config/cli.ts get server
tsx src/infrastructure/config/cli.ts get server port

# Set configuration values
tsx src/infrastructure/config/cli.ts set server.port 4000

# Validate configuration
tsx src/infrastructure/config/cli.ts validate

# Manage secrets
tsx src/infrastructure/config/cli.ts secret store JWT_SECRET "your-secret-key"
tsx src/infrastructure/config/cli.ts secret get JWT_SECRET
tsx src/infrastructure/config/cli.ts secret list
tsx src/infrastructure/config/cli.ts secret delete OLD_SECRET

# Export/Import configuration
tsx src/infrastructure/config/cli.ts export config-backup.json
tsx src/infrastructure/config/cli.ts import config-backup.json

# Manage profiles
tsx src/infrastructure/config/cli.ts profile list
tsx src/infrastructure/config/cli.ts profile switch production

# Backup and restore
tsx src/infrastructure/config/cli.ts backup
tsx src/infrastructure/config/cli.ts restore config-backup-2024-01-01.json
```

## Configuration Validation

The system provides comprehensive validation:

### Schema Validation

All configuration is validated against Zod schemas with proper error messages.

### Environment-Specific Validation

- Production environments require certain secrets
- Port numbers must be valid ranges
- URLs must be properly formatted
- Security settings have minimum requirements

### Custom Validation Rules

```typescript
// Add custom validation in profiles
const customProfile: ConfigProfile = {
  name: 'custom',
  description: 'Custom environment',
  requiredSecrets: ['CUSTOM_SECRET'],
  validationRules: z.object({
    customField: z.string().min(10),
  }),
  overrides: {
    // ... configuration overrides
  },
};
```

## Import/Export

### Export Configuration

```typescript
// Export current configuration
await dynamicConfigManager.exportConfig('backup.json');

// Export secrets metadata (without values)
await secretsManager.exportSecrets('secrets-backup.json', false);
```

### Import Configuration

```typescript
// Import configuration
const result = await dynamicConfigManager.importConfig('backup.json');

// Import secrets
const importedCount = await secretsManager.importSecrets('secrets-backup.json');
```

## Security Considerations

### Secrets Encryption

- All secrets are encrypted using AES-256-GCM
- Master key derived using PBKDF2 with 100,000 iterations
- Each secret has unique IV and authentication tag
- File permissions set to 600 (owner read/write only)

### Configuration Security

- Sensitive values never logged in plain text
- Configuration changes are audited
- Validation prevents dangerous configurations
- Secrets are cached with TTL for performance

### Production Recommendations

- Use environment-specific master passwords
- Implement secret rotation policies
- Monitor configuration changes
- Regular backup of configuration and secrets
- Use external secret management (AWS KMS, HashiCorp Vault) for production

## Troubleshooting

### Common Issues

**Configuration not loading:**

```bash
# Check if configuration is initialized
tsx src/infrastructure/config/cli.ts validate

# Verify environment variables
env | grep -E "(NODE_ENV|DATABASE_URL|JWT_SECRET)"
```

**Secrets not accessible:**

```bash
# List available secrets
tsx src/infrastructure/config/cli.ts secret list

# Check secret permissions
ls -la .secure-config/
```

**Dynamic configuration not working:**

```typescript
// Ensure dynamic config is enabled
await configManager.initialize({
  enableDynamicConfig: true, // Make sure this is true
});
```

### Debug Mode

Enable debug logging to troubleshoot issues:

```bash
LOG_LEVEL=debug tsx src/index.ts
```

## Examples

See `src/examples/config-management-example.ts` for comprehensive usage examples including:

- Basic configuration setup
- Secrets management
- Dynamic updates
- Environment profiles
- Advanced encryption scenarios

## API Reference

### ConfigManager

- `initialize(options)` - Initialize the configuration system
- `getConfig()` - Get the complete configuration
- `getConfigSection(section)` - Get a specific configuration section
- `updateConfig(updates, userId?)` - Update configuration
- `updateConfigSection(section, value, userId?)` - Update a configuration section
- `reload()` - Reload configuration from sources
- `shutdown()` - Gracefully shutdown the configuration system

### SecretsManager

- `storeSecret(name, value, options?)` - Store an encrypted secret
- `getSecret(name)` - Retrieve a secret value
- `listSecrets()` - List all stored secrets with metadata
- `deleteSecret(name)` - Delete a secret
- `rotateSecret(name, newValue)` - Rotate a secret to a new value
- `checkRotationNeeded()` - Check which secrets need rotation
- `exportSecrets(path, includeValues?)` - Export secrets
- `importSecrets(path)` - Import secrets

### DynamicConfigManager

- `updateConfig(updates, source?, userId?)` - Update configuration dynamically
- `getConfigHistory(limit?)` - Get configuration change history
- `rollbackToVersion(timestamp)` - Rollback to a previous configuration
- `exportConfig(path)` - Export current configuration
- `importConfig(path, userId?)` - Import configuration from file

## Contributing

When adding new configuration options:

1. Update the appropriate schema in `types.ts`
2. Add default values in the relevant profile
3. Update validation rules if needed
4. Add tests for the new configuration
5. Update this documentation

## License

This configuration management system is part of the Enterprise Authentication Backend and follows the same license terms.
