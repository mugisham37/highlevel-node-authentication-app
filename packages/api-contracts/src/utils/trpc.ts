import { initTRPC, TRPCError } from '@trpc/server';
import superjson from 'superjson';
import { ZodError } from 'zod';
import { Context } from './context';

/**
 * Initialize tRPC with context and transformer
 */
const t = initTRPC.context<Context>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
      },
    };
  },
});

/**
 * Export reusable router and procedure helpers
 */
export const createTRPCRouter = t.router;
export const publicProcedure = t.procedure;

/**
 * Protected procedure that requires authentication
 */
export const protectedProcedure = t.procedure.use(({ ctx, next }) => {
  if (!ctx.user) {
    throw new TRPCError({ code: 'UNAUTHORIZED' });
  }
  return next({
    ctx: {
      ...ctx,
      // infers the `user` as non-nullable
      user: ctx.user,
    },
  });
});

/**
 * Admin procedure that requires admin role
 */
export const adminProcedure = protectedProcedure.use(({ ctx, next }) => {
  if (!ctx.user.roles.includes('admin')) {
    throw new TRPCError({ code: 'FORBIDDEN' });
  }
  return next({
    ctx,
  });
});

/**
 * Middleware for rate limiting
 */
export const rateLimitedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  // Rate limiting logic would be implemented here
  // This is a placeholder for the actual implementation
  return next({ ctx });
});

export { t };
