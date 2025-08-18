# @company/shared

Shared domain entities, value objects, types, and utilities for the fullstack monolith application.

## Overview

This package contains all the shared code that can be used across different applications in the monorepo:

- **Entities**: Domain entities like User, Session, Role, etc.
- **Value Objects**: Email, Password, JWT Token, etc.
- **Types**: Shared TypeScript types and interfaces
- **Utils**: Common utility functions
- **Constants**: Application-wide constants
- **Validators**: Validation schemas and functions using Zod
- **Interfaces**: Common interfaces for repositories, services, etc.
- **Enums**: Shared enumerations
- **Errors**: Custom error classes with proper error handling
- **Guards**: Type guards and authorization helpers

## Installation

```bash
# This package is part of the monorepo workspace
pnpm install
```

## Usage

### Importing Entities

```typescript
import { User, Session, Role } from '@company/shared';
// or
import { User } from '@company/shared/entities';
```

### Using Validators

```typescript
import { validateEmail, validatePassword, emailSchema } from '@company/shared/validators';

// Function validators
const isValid = validateEmail('test@example.com'); // boolean

// Zod schemas
const result = emailSchema.safeParse('test@example.com');
```

### Error Handling

```typescript
import { ErrorFactory, AuthenticationError } from '@company/shared/errors';

// Using factory
throw ErrorFactory.authentication('Invalid credentials', requestId);

// Direct instantiation
throw new AuthenticationError('Login failed', requestId);
```

### Type Guards

```typescript
import { isString, hasRole, isAdmin } from '@company/shared/guards';
import { UserRole } from '@company/shared/enums';

if (isString(value)) {
  // TypeScript knows value is string
}

if (hasRole(user, UserRole.ADMIN)) {
  // User has admin role
}
```

## Development

### Building

```bash
pnpm build
```

### Testing

```bash
# Run tests
pnpm test

# Run tests with coverage
pnpm test:coverage
```

### Linting

```bash
# Check for lint errors
pnpm lint

# Fix lint errors
pnpm lint:fix
```

## Package Structure

```
src/
├── entities/          # Domain entities
├── value-objects/     # Value objects
├── types/            # TypeScript types
├── utils/            # Utility functions
├── constants/        # Application constants
├── validators/       # Validation schemas
├── interfaces/       # Common interfaces
├── enums/           # Enumerations
├── errors/          # Error classes
├── guards/          # Type guards
├── __tests__/       # Test files
└── index.ts         # Main export file
```

## Dependencies

- **zod**: Schema validation
- **date-fns**: Date utilities
- **lodash**: Utility functions
- **class-validator**: Class-based validation
- **class-transformer**: Object transformation
- **nanoid**: ID generation

## Contributing

When adding new shared functionality:

1. Place it in the appropriate directory
2. Export it from the directory's `index.ts`
3. Add comprehensive tests
4. Update this README if needed
5. Ensure >90% test coverage

## License

Private - Internal use only