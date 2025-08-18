# @company/api-contracts

Type-safe API contracts using tRPC for communication between frontend and backend applications.

## Overview

This package provides:
- tRPC router definitions with Zod validation schemas
- Input/output validation schemas
- Generated TypeScript types
- Error handling definitions
- Type-safe client and server communication

## Features

- **Type Safety**: End-to-end type safety from client to server
- **Runtime Validation**: Input/output validation using Zod schemas
- **Error Handling**: Consistent error handling across all API calls
- **Code Generation**: Automatic TypeScript type generation
- **React Integration**: React Query integration for caching and synchronization

## Usage

### Server-side (API)

```typescript
import { createTRPCRouter } from '@company/api-contracts';
import { authRouter } from '@company/api-contracts/routers/auth';
import { userRouter } from '@company/api-contracts/routers/user';

export const appRouter = createTRPCRouter({
  auth: authRouter,
  user: userRouter,
});

export type AppRouter = typeof appRouter;
```

### Client-side (Web/Mobile)

```typescript
import { createTRPCReact } from '@trpc/react-query';
import type { AppRouter } from '@company/api-contracts';

export const trpc = createTRPCReact<AppRouter>();

// In your component
const { data, isLoading } = trpc.auth.login.useMutation();
```

## Available Routers

- **auth**: Authentication and authorization endpoints
- **user**: User management and profile endpoints
- **session**: Session management endpoints

## Development

```bash
# Build the package
pnpm build

# Run tests
pnpm test

# Run tests in watch mode
pnpm test:watch

# Type checking
pnpm type-check
```

## Dependencies

- `@trpc/server` - tRPC server implementation
- `@trpc/client` - tRPC client implementation
- `@trpc/react-query` - React Query integration
- `zod` - Runtime type validation
- `superjson` - JSON serialization with support for dates, undefined, etc.