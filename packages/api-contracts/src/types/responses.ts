import { z } from 'zod';

/**
 * Standard API response wrapper
 */
export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    message: z.string().optional(),
    meta: z
      .object({
        timestamp: z.string(),
        requestId: z.string(),
        version: z.string().optional(),
      })
      .optional(),
  });

/**
 * Paginated response schema
 */
export const paginatedResponseSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    items: z.array(itemSchema),
    pagination: z.object({
      page: z.number().int().positive(),
      limit: z.number().int().positive(),
      total: z.number().int().nonnegative(),
      totalPages: z.number().int().nonnegative(),
      hasNext: z.boolean(),
      hasPrev: z.boolean(),
    }),
  });

/**
 * Common pagination input schema
 */
export const paginationInputSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

/**
 * Search input schema
 */
export const searchInputSchema = paginationInputSchema.extend({
  query: z.string().min(1).max(100),
  filters: z.record(z.string(), z.any()).optional(),
});

/**
 * Success response helper
 */
export const createSuccessResponse = <T>(data: T, message?: string) => ({
  success: true as const,
  data,
  message,
  meta: {
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
  },
});

/**
 * Error response helper
 */
export const createErrorResponse = (message: string, code?: string) => ({
  success: false as const,
  error: {
    message,
    code,
    timestamp: new Date().toISOString(),
    requestId: crypto.randomUUID(),
  },
});

/**
 * Type helpers
 */
export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  message?: string;
  meta?: {
    timestamp: string;
    requestId: string;
    version?: string;
  };
};

export type PaginatedResponse<T> = {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNext: boolean;
    hasPrev: boolean;
  };
};

export type PaginationInput = z.infer<typeof paginationInputSchema>;
export type SearchInput = z.infer<typeof searchInputSchema>;