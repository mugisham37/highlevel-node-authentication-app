# @company/auth

Enterprise-grade authentication and authorization package for the fullstack monolith.

## Features

- **Multi-factor Authentication (MFA)**
  - TOTP (Time-based One-Time Password)
  - SMS-based authentication
  - Email-based authentication
  - WebAuthn/FIDO2 support

- **Authentication Strategies**
  - Email/password authentication
  - Passwordless authentication
  - OAuth integration
  - JWT token management

- **Authorization & RBAC**
  - Role-based access control
  - Permission management
  - Resource ownership validation
  - Fine-grained access control

- **Session Management**
  - Secure session creation and validation
  - Session refresh mechanisms
  - Concurrent session management
  - Device tracking and fingerprinting

- **Security Features**
  - Password hashing with Argon2/bcrypt
  - Risk-based authentication
  - Rate limiting
  - Device fingerprinting
  - Cryptographic services

- **Developer Experience**
  - TypeScript decorators for authentication
  - Middleware for Express/Fastify
  - Guards for route protection
  - Comprehensive logging and monitoring

## Installation

```bash
npm install @company/auth
```

## Quick Start

### Basic Authentication

```typescript
import { AuthenticationService, PasswordHashingService, JWTTokenService } from '@company/auth';

const authService = new AuthenticationService(
  userRepository,
  sessionRepository,
  passwordHashingService,
  jwtTokenService,
  riskScoringService,
  logger
);

// Authenticate user
const result = await authService.authenticate({
  type: 'email_password',
  email: 'user@example.com',
  password: 'securePassword',
  deviceInfo: deviceInfo,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

if (result.success) {
  console.log('Authentication successful', result.tokens);
} else {
  console.log('Authentication failed', result.error);
}
```

### Using Middleware

```typescript
import { AuthMiddleware } from '@company/auth';

const authMiddleware = new AuthMiddleware(jwtService, sessionService, logger);

// Protect all routes
app.use(authMiddleware.authenticate());

// Require specific roles
app.get('/admin', authMiddleware.requireRoles(['admin']), (req, res) => {
  res.json({ message: 'Admin only content' });
});

// Require specific permissions
app.get('/users', authMiddleware.requirePermissions(['users:read']), (req, res) => {
  res.json({ users: [] });
});
```

### Using Decorators

```typescript
import { RequireAuth, RequireRoles, RequireMFA } from '@company/auth';

@RequireAuth()
class UserController {
  @RequireRoles('admin')
  async deleteUser(userId: string) {
    // Admin only method
  }

  @RequireMFA()
  async sensitiveOperation() {
    // Requires MFA verification
  }
}
```

### MFA Setup

```typescript
import { MFAService } from '@company/auth';

const mfaService = new MFAService(
  userRepository,
  challengeRepository,
  totpService,
  smsService,
  emailMFAService,
  webAuthnService,
  logger
);

// Setup TOTP
const totpSetup = await mfaService.setupMFA(userId, 'totp');
console.log('TOTP Secret:', totpSetup.secret);
console.log('QR Code URL:', totpSetup.qrCodeUrl);

// Verify TOTP code
const verification = await mfaService.verifyMFA(challengeId, '123456', 'totp');
if (verification.success) {
  console.log('MFA verification successful');
}
```

### Session Management

```typescript
import { SessionManagementService } from '@company/auth';

const sessionService = new SessionManagementService(
  sessionRepository,
  sessionStorage,
  riskScoringService,
  deviceFingerprintingService,
  concurrentSessionConfig,
  logger
);

// Create session
const session = await sessionService.createSession({
  userId: 'user123',
  deviceInfo: deviceInfo,
  ipAddress: '192.168.1.1',
  userAgent: 'Mozilla/5.0...'
});

// Validate session
const validation = await sessionService.validateSession(session.id);
if (validation.valid) {
  console.log('Session is valid', validation.session);
}
```

### Using Guards

```typescript
import { RoleGuard, PermissionGuard, CompositeGuard } from '@company/auth';

// Create guards
const adminGuard = new RoleGuard(['admin']);
const readPermissionGuard = new PermissionGuard(['users:read']);

// Combine guards
const compositeGuard = new CompositeGuard([adminGuard, readPermissionGuard], 'OR');

// Check access
const result = await compositeGuard.canActivate({
  user: currentUser,
  session: currentSession,
  resource: targetResource
});

if (result.allowed) {
  // Grant access
} else {
  console.log('Access denied:', result.reason);
}
```

## Configuration

The auth package requires configuration for various services:

```typescript
import { config } from '@company/config';

// JWT configuration
const jwtConfig = {
  secret: config.JWT_SECRET,
  accessTokenExpiry: '1h',
  refreshTokenExpiry: '7d'
};

// MFA configuration
const mfaConfig = {
  totpWindow: 1,
  smsProvider: 'twilio',
  emailProvider: 'sendgrid'
};

// Session configuration
const sessionConfig = {
  maxSessionsPerUser: 5,
  maxSessionsPerDevice: 2,
  sessionLimitStrategy: 'oldest_first'
};
```

## Testing

Run the test suite:

```bash
npm test
```

Run tests with coverage:

```bash
npm run test:coverage
```

## Security Considerations

- Always use HTTPS in production
- Implement proper rate limiting
- Use strong JWT secrets (minimum 256 bits)
- Enable MFA for sensitive operations
- Monitor authentication events
- Implement proper session management
- Use secure password hashing (Argon2 recommended)
- Validate all inputs
- Implement proper CORS policies

## API Reference

### Services

- `AuthenticationService` - Core authentication logic
- `MFAService` - Multi-factor authentication
- `SessionManagementService` - Session lifecycle management
- `AuthorizationService` - Role and permission management
- `PasswordHashingService` - Secure password hashing
- `JWTTokenService` - JWT token operations
- `WebAuthnService` - WebAuthn/FIDO2 support

### Middleware

- `AuthMiddleware` - Express/Fastify authentication middleware
- `AuthRateLimitMiddleware` - Rate limiting for auth endpoints

### Guards

- `RoleGuard` - Role-based access control
- `PermissionGuard` - Permission-based access control
- `OwnershipGuard` - Resource ownership validation
- `SessionGuard` - Session validity checks
- `MFAGuard` - MFA requirement enforcement

### Decorators

- `@RequireAuth()` - Require authentication
- `@RequireRoles()` - Require specific roles
- `@RequirePermissions()` - Require specific permissions
- `@RequireMFA()` - Require MFA verification
- `@RateLimit()` - Apply rate limiting

## Contributing

1. Follow the existing code style
2. Add tests for new features
3. Update documentation
4. Ensure all tests pass
5. Follow security best practices

## License

MIT License - see LICENSE file for details.