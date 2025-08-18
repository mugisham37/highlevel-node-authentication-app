import { createTRPCReact } from '@trpc/react-query';
// Import the AppRouter type from api-contracts when available
// import type { AppRouter } from '@company/api-contracts';

// For now, we'll use a placeholder type until the API contracts are available
type AppRouter = any;

export const trpc = createTRPCReact<AppRouter>();

// tRPC client configuration
export const trpcConfig = {
  url: process.env.NEXT_PUBLIC_API_URL
    ? `${process.env.NEXT_PUBLIC_API_URL}/api/trpc`
    : 'http://localhost:3001/api/trpc',

  // Add authentication headers when available
  headers: () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('auth-token') : null;

    return token ? { authorization: `Bearer ${token}` } : {};
  },
};
