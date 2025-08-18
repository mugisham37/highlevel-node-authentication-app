/**
 * Validation Middleware
 * Zod-based request validation middleware for Fastify
 */

import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { ZodSchema, ZodError } from 'zod';
import { logger } from '@company/logger';

export interface ValidationOptions {
  body?: ZodSchema;
  params?: ZodSchema;
  querystring?: ZodSchema;
  headers?: ZodSchema;
}

/**
 * Creates a validation middleware that validates request data against Zod schemas
 */
export function createValidationMiddleware(options: ValidationOptions) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Validate request body
      if (options.body && request.body) {
        const result = options.body.safeParse(request.body);
        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Request body validation failed',
            details: formatZodErrors(result.error),
            correlationId: request.correlationId,
          });
        }
        // Replace request body with validated and transformed data
        request.body = result.data;
      }

      // Validate request parameters
      if (options.params && request.params) {
        const result = options.params.safeParse(request.params);
        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Request parameters validation failed',
            details: formatZodErrors(result.error),
            correlationId: request.correlationId,
          });
        }
        request.params = result.data;
      }

      // Validate query string
      if (options.querystring && request.query) {
        const result = options.querystring.safeParse(request.query);
        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Query parameters validation failed',
            details: formatZodErrors(result.error),
            correlationId: request.correlationId,
          });
        }
        request.query = result.data;
      }

      // Validate headers
      if (options.headers && request.headers) {
        const result = options.headers.safeParse(request.headers);
        if (!result.success) {
          return reply.status(400).send({
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Request headers validation failed',
            details: formatZodErrors(result.error),
            correlationId: request.correlationId,
          });
        }
        // Note: We don't replace headers as they're read-only
      }
    } catch (error) {
      logger.error('Validation middleware error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        url: request.url,
        method: request.method,
      });

      return reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal validation error',
        correlationId: request.correlationId,
      });
    }
  };
}

/**
 * Formats Zod validation errors into a user-friendly format
 */
function formatZodErrors(
  error: ZodError
): Array<{ field: string; message: string }> {
  return error.errors.map((err) => ({
    field: err.path.join('.'),
    message: err.message,
  }));
}

/**
 * Fastify plugin for registering validation helpers
 */
export const validationPlugin: FastifyPluginCallback = (
  fastify,
  _options,
  done
) => {
  // Add validation helper to fastify instance
  fastify.decorate('validate', createValidationMiddleware);

  // Add response validation helper
  fastify.decorate('validateResponse', (schema: ZodSchema, data: any) => {
    const result = schema.safeParse(data);
    if (!result.success) {
      logger.error('Response validation failed', {
        errors: formatZodErrors(result.error),
        data,
      });
      throw new Error('Response validation failed');
    }
    return result.data;
  });

  done();
};

// Declare module augmentation for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    validate: typeof createValidationMiddleware;
    validateResponse: (schema: ZodSchema, data: any) => any;
  }
}

/**
 * Utility function to create a validation preHandler
 */
export function validate(options: ValidationOptions) {
  return createValidationMiddleware(options);
}

/**
 * Utility function to validate and transform request data
 */
export function validateRequest<T>(
  schema: ZodSchema<T>,
  data: unknown,
  fieldName: string = 'data'
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const errors = formatZodErrors(result.error);
    throw new Error(
      `${fieldName} validation failed: ${errors.map((e) => e.message).join(', ')}`
    );
  }
  return result.data;
}

/**
 * Utility function to safely validate response data
 */
export function validateResponse<T>(
  schema: ZodSchema<T>,
  data: unknown,
  correlationId?: string
): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    logger.error('Response validation failed', {
      correlationId,
      errors: formatZodErrors(result.error),
      data,
    });
    // In production, we might want to return a generic error response
    // instead of exposing validation details
    throw new Error('Response validation failed');
  }
  return result.data;
}

