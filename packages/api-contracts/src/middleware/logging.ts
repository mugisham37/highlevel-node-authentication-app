import { t } from '../utils/trpc';

/**
 * Logging middleware for tRPC procedures
 * Logs all procedure calls with timing and context information
 */
export const loggingMiddleware = t.middleware(async ({ path, type, next, ctx }) => {
  const start = Date.now();
  
  // Log the incoming request
  console.log(`[tRPC] ${type.toUpperCase()} ${path} - User: ${ctx.user?.id || 'anonymous'} - IP: ${ctx.ip}`);
  
  try {
    const result = await next();
    const duration = Date.now() - start;
    
    // Log successful completion
    console.log(`[tRPC] ${type.toUpperCase()} ${path} - SUCCESS - ${duration}ms`);
    
    return result;
  } catch (error) {
    const duration = Date.now() - start;
    
    // Log error
    console.error(`[tRPC] ${type.toUpperCase()} ${path} - ERROR - ${duration}ms:`, error);
    
    throw error;
  }
});

/**
 * Performance monitoring middleware
 * Tracks slow queries and operations
 */
export const performanceMiddleware = t.middleware(async ({ path, type, next, ctx }) => {
  const start = Date.now();
  
  try {
    const result = await next();
    const duration = Date.now() - start;
    
    // Log slow operations (>1000ms)
    if (duration > 1000) {
      console.warn(`[tRPC] SLOW OPERATION: ${type.toUpperCase()} ${path} - ${duration}ms - User: ${ctx.user?.id || 'anonymous'}`);
    }
    
    return result;
  } catch (error) {
    throw error;
  }
});

/**
 * Request ID middleware
 * Adds request ID to context for tracing
 */
export const requestIdMiddleware = t.middleware(async ({ next, ctx }) => {
  return next({
    ctx: {
      ...ctx,
      requestId: ctx.requestId || crypto.randomUUID(),
    },
  });
});