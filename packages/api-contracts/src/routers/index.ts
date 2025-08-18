import { createTRPCRouter } from '../utils/trpc';
import { authRouter } from './auth';
import { userRouter } from './user';

/**
 * Main application router
 * Combines all feature routers into a single root router
 */
export const appRouter = createTRPCRouter({
  auth: authRouter,
  user: userRouter,
});

/**
 * Export router type for client-side type inference
 */
export type AppRouter = typeof appRouter;

/**
 * Export individual routers
 */
export { authRouter } from './auth';
export { userRouter } from './user';
