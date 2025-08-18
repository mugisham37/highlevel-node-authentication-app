/**
 * @company/api-contracts
 * 
 * Type-safe API contracts using tRPC for communication between frontend and backend
 */

// Export tRPC utilities
export * from './utils/context';
export * from './utils/trpc';

// Export main app router and type
export { appRouter, type AppRouter } from './routers';

// Export individual routers
export * from './routers/auth';
export * from './routers/user';

// Export schemas
export * from './schemas/auth';
export * from './schemas/user';

// Export types
export * from './types/errors';
export * from './types/responses';

// Export middleware
export * from './middleware';

