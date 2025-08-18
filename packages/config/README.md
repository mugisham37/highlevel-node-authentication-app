# @company/config

A comprehensive configuration management package with environment validation, feature flags, and secret management for the authentication system.

## Features

- **Environment Validation**: Robust validation using Zod schemas
- **Feature Flags**: Dynamic feature flag management with conditions and rollout percentages
- **Secret Management**: Integration with HashiCorp Vault and AWS Secrets Manager
- **Database Configuration**: Support for both Prisma and Drizzle ORMs
- **Monitoring Configuration**: Comprehensive monitoring and observability settings
- **Configuration Validation**: Built-in validation with security recommendations

## Installation

```bash
npm install @company/config
```

## Usage

### Environment Configuration

```typescript
import { env, isDevelopment, isProduction } from '@company/config';

// Access validated environment variables
console.log(`Server running on port ${env.PORT}`);
console.log(`Database URL: ${env.DATABASE_URL}`);

// Environment helpers
if (isDevelopment) {
  console.log('Running in development mode');
}
```

### Feature Flags

```typescript
import { featureFlags } from '@company/config';

// Check if features are enabled
if (featureFlags.isRegistrationEnabled()) {
  // Enable user registration
}

if (featureFlags.isMfaEnabled()) {
  // Enable multi-factor authentication
}

// Custom feature flags with conditions
featureFlags.setFlag('beta-feature', {
  name: 'beta-feature',
  enabled: true,
  rolloutPercentage: 50, // 50% rollout
  conditions: [
    {
      type: 'user',
      operator: 'in',
      value: ['beta-tester', 'admin']
    }
  ]
});

// Check with context
const isEnabled = featureFlags.isEnabled('beta-feature', { 
  user: 'beta-tester' 
});
```

### Secret Management

```typescript
import { secretManager } from '@company/config';

// Get secrets
const dbPassword = await secretManager.getDatabasePassword();
const jwtSecret = await secretManager.getJwtSecret();

// Set secrets
await secretManager.setSecret('API_KEY', 'secret-value');

// OAuth secrets
const googleSecret = await secretManager.getOAuthClientSecret('google');
```

### Database Configuration

```typescript
import { databaseConfig } from '@company/config';

// Get database configuration
const dbConfig = databaseConfig.getDatabaseConfig();
const drizzleConfig = databaseConfig.getDrizzleConfig();
const prismaConfig = databaseConfig.getPrismaConfig();

// Environment-specific configuration
const config = databaseConfig.getConfigForEnvironment();
```

### Configuration Validation

```typescript
import { configValidator } from '@company/config';

// Validate environment
const envResult = configValidator.validateEnvironment();
if (!envResult.isValid) {
  console.error('Configuration errors:', envResult.errors);
}

// Validate connections
const connectionResult = await configValidator.validateAllConnections();

// Generate report
const report = configValidator.generateConfigReport();
console.log(report);
```

## Environment Variables

### Required Variables

- `DATABASE_URL`: PostgreSQL connection string
- `REDIS_URL`: Redis connection string
- `JWT_SECRET`: JWT signing secret (minimum 32 characters)
- `JWT_REFRESH_SECRET`: JWT refresh token secret (minimum 32 characters)

### Optional Variables

- `NODE_ENV`: Environment (development, staging, production)
- `PORT`: Server port (default: 3000)
- `HOST`: Server host (default: localhost)
- `LOG_LEVEL`: Logging level (error, warn, info, debug)
- `METRICS_ENABLED`: Enable metrics collection (default: true)
- `HEALTH_CHECK_ENABLED`: Enable health checks (default: true)

### Security Variables

- `BCRYPT_ROUNDS`: Password hashing rounds (default: 12)
- `CORS_ORIGIN`: CORS allowed origins (default: *)
- `RATE_LIMIT_WINDOW_MS`: Rate limiting window (default: 900000)
- `RATE_LIMIT_MAX_REQUESTS`: Max requests per window (default: 100)

### Feature Flags

- `FEATURE_REGISTRATION_ENABLED`: Enable user registration (default: true)
- `FEATURE_PASSWORD_RESET_ENABLED`: Enable password reset (default: true)
- `FEATURE_MFA_ENABLED`: Enable multi-factor authentication (default: true)
- `FEATURE_OAUTH_ENABLED`: Enable OAuth authentication (default: true)

### External Services

- `VAULT_ENDPOINT`: HashiCorp Vault endpoint
- `VAULT_TOKEN`: Vault authentication token
- `AWS_REGION`: AWS region for Secrets Manager
- `SMTP_HOST`: SMTP server host
- `GOOGLE_CLIENT_ID`: Google OAuth client ID
- `GITHUB_CLIENT_ID`: GitHub OAuth client ID

## Configuration Helpers

### Database Helpers

```typescript
import { getDatabaseConfig, getRedisConfig } from '@company/config';

const dbConfig = getDatabaseConfig();
const redisConfig = getRedisConfig();
```

### Security Helpers

```typescript
import { getSecurityConfig, getJwtConfig } from '@company/config';

const securityConfig = getSecurityConfig();
const jwtConfig = getJwtConfig();
```

### Feature Flag Helpers

```typescript
import { getFeatureFlags } from '@company/config';

const flags = getFeatureFlags();
```

## Validation

The package includes comprehensive validation:

- **Environment Variables**: Validates types, formats, and ranges
- **Security Settings**: Checks for security best practices
- **Production Readiness**: Warns about development settings in production
- **Connection Validation**: Tests database and Redis connections

## Secret Providers

### HashiCorp Vault

```typescript
import { VaultSecretProvider } from '@company/config';

const provider = new VaultSecretProvider({
  endpoint: 'https://vault.example.com',
  token: 'vault-token',
  namespace: 'my-namespace',
  mountPath: 'secret'
});
```

### AWS Secrets Manager

```typescript
import { AWSSecretsManagerProvider } from '@company/config';

const provider = new AWSSecretsManagerProvider({
  region: 'us-east-1',
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key'
});
```

### Environment Variables (Fallback)

```typescript
import { EnvironmentSecretProvider } from '@company/config';

const provider = new EnvironmentSecretProvider();
```

## Testing

```bash
npm test
npm run test:coverage
```

## Development

```bash
npm run dev     # Watch mode
npm run build   # Build package
npm run lint    # Lint code
```

## License

MIT