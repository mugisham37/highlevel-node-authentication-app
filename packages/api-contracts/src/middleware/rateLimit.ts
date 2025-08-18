import { createRateLimitError } from '../types/errors';
import { t } from '../utils/trpc';

/**
 * Rate limiting configuration
 */
interface RateLimitConfig {
  windowMs: number; // Time window in milliseconds
  maxRequests: number; // Maximum requests per window
  keyGenerator?: (ctx: any) => string; // Custom key generator
  skipSuccessfulRequests?: boolean; // Don't count successful requests
  skipFailedRequests?: boolean; // Don't count failed requests
}

/**
 * In-memory rate limit store
 * In production, this should be replaced with Redis
 */
class MemoryRateLimitStore {
  private store = new Map<string, { count: number; resetTime: number }>();

  get(key: string): { count: number; resetTime: number } | undefined {
    const entry = this.store.get(key);
    if (entry && entry.resetTime < Date.now()) {
      this.store.delete(key);
      return undefined;
    }
    return entry;
  }

  set(key: string, value: { count: number; resetTime: number }): void {
    this.store.set(key, value);
  }

  increment(key: string, windowMs: number): { count: number; resetTime: number } {
    const now = Date.now();
    const existing = this.get(key);

    if (existing) {
      existing.count++;
      this.set(key, existing);
      return existing;
    } else {
      const newEntry = { count: 1, resetTime: now + windowMs };
      this.set(key, newEntry);
      return newEntry;
    }
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.store.entries()) {
      if (entry.resetTime < now) {
        this.store.delete(key);
      }
    }
  }
}

const rateLimitStore = new MemoryRateLimitStore();

// Cleanup expired entries every 5 minutes
setInterval(() => rateLimitStore.cleanup(), 5 * 60 * 1000);

/**
 * Rate limiting middleware factory
 */
export const createRateLimitMiddleware = (config: RateLimitConfig) => {
  return t.middleware(async ({ ctx, next, path, type }) => {
    const key = config.keyGenerator ? config.keyGenerator(ctx) : `${ctx.ip}:${path}:${type}`;

    const { count } = rateLimitStore.increment(key, config.windowMs);

    if (count > config.maxRequests) {
      throw createRateLimitError();
    }

    try {
      const result = await next();

      // If configured to skip successful requests, decrement counter
      if (config.skipSuccessfulRequests) {
        const entry = rateLimitStore.get(key);
        if (entry) {
          entry.count = Math.max(0, entry.count - 1);
          rateLimitStore.set(key, entry);
        }
      }

      return result;
    } catch (error) {
      // If configured to skip failed requests, decrement counter
      if (config.skipFailedRequests) {
        const entry = rateLimitStore.get(key);
        if (entry) {
          entry.count = Math.max(0, entry.count - 1);
          rateLimitStore.set(key, entry);
        }
      }

      throw error;
    }
  });
};

/**
 * Common rate limit configurations
 */
export const rateLimitConfigs = {
  // Strict rate limiting for authentication endpoints
  auth: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts per 15 minutes
    keyGenerator: (ctx: any) => `auth:${ctx.ip}`,
  },

  // General API rate limiting
  api: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 100, // 100 requests per minute
    keyGenerator: (ctx: any) => (ctx.user ? `user:${ctx.user.id}` : `ip:${ctx.ip}`),
  },

  // Lenient rate limiting for read operations
  read: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 200, // 200 requests per minute
    keyGenerator: (ctx: any) => (ctx.user ? `user:${ctx.user.id}` : `ip:${ctx.ip}`),
    skipSuccessfulRequests: true,
  },

  // Strict rate limiting for write operations
  write: {
    windowMs: 60 * 1000, // 1 minute
    maxRequests: 50, // 50 requests per minute
    keyGenerator: (ctx: any) => (ctx.user ? `user:${ctx.user.id}` : `ip:${ctx.ip}`),
  },
};

/**
 * Pre-configured rate limit middlewares
 */
export const authRateLimit = createRateLimitMiddleware(rateLimitConfigs.auth);
export const apiRateLimit = createRateLimitMiddleware(rateLimitConfigs.api);
export const readRateLimit = createRateLimitMiddleware(rateLimitConfigs.read);
export const writeRateLimit = createRateLimitMiddleware(rateLimitConfigs.write);
