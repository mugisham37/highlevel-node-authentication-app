/**
 * Error Handler Integration Example
 * Demonstrates proper usage of the fixed error handling system
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { errorHandler } from '../middleware/error-handler';
import { NotFoundError, ValidationError, InternalServerError } from '../../application/errors/base.errors';
import { 
  createLogContext, 
  createErrorLogContext, 
  getSafeCorrelationId,
  ENV 
} from '../utils';

/**
 * Example Fastify plugin demonstrating proper error handling
 */
export async function exampleErrorHandlingPlugin(fastify: FastifyInstance) {
  // Register the error handler
  errorHandler.register(fastify);

  // Example route that can throw different types of errors
  fastify.get('/api/test/errors/:type', async (request: FastifyRequest<{
    Params: { type: string };
  }>, reply: FastifyReply) => {
    const correlationId = getSafeCorrelationId(request.headers);
    const errorType = request.params.type;

    // Create proper log context
    const logContext = createLogContext(request, {
      operation: 'test-error-handling',
      component: 'error-test-endpoint',
    });

    fastify.log.info('Testing error handling', logContext);

    switch (errorType) {
      case 'not-found':
        throw new NotFoundError(
          'Test resource not found',
          'test-resource',
          'resource-123',
          { correlationId, operation: 'test-not-found' }
        );

      case 'validation':
        throw new ValidationError(
          { 
            email: 'Invalid email format',
            age: 'Must be a positive number' 
          },
          'Request validation failed',
          { correlationId, operation: 'test-validation' }
        );

      case 'internal':
        throw new InternalServerError(
          'Something went wrong internally',
          new Error('Database connection failed'),
          { correlationId, operation: 'test-internal-error' }
        );

      case 'generic':
        throw new Error('Generic JavaScript error for testing');

      default:
        reply.code(200).send({
          message: 'Error handler is working correctly!',
          timestamp: new Date().toISOString(),
          correlationId,
          environment: ENV.NODE_ENV,
          version: ENV.APP_VERSION,
        });
    }
  });

  // Example route demonstrating proper error logging
  fastify.post('/api/test/log-error', async (request: FastifyRequest<{
    Body: { errorType: string; message: string; };
  }>, reply: FastifyReply) => {
    const correlationId = getSafeCorrelationId(request.headers);
    const { errorType, message } = request.body;

    // Create error log context
    const errorLogContext = createErrorLogContext(
      errorType || 'test-error',
      request,
      {
        impact: 'low',
        errorCode: 'TEST_ERROR_001',
      }
    );

    fastify.log.error(message || 'Test error logged', errorLogContext);

    reply.code(200).send({
      message: 'Error logged successfully',
      correlationId,
      timestamp: new Date().toISOString(),
    });
  });

  // Health check endpoint with error handler metrics
  fastify.get('/api/test/error-stats', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getSafeCorrelationId(request.headers);
    const stats = errorHandler.getErrorStats();

    reply.code(200).send({
      stats,
      correlationId,
      timestamp: new Date().toISOString(),
      message: 'Error statistics retrieved successfully',
    });
  });

  // Example of async error handling
  fastify.get('/api/test/async-error', async (request: FastifyRequest, reply: FastifyReply) => {
    const correlationId = getSafeCorrelationId(request.headers);

    // Simulate async operation that might fail
    try {
      await new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Async operation failed'));
        }, 100);
      });

      reply.code(200).send({ message: 'Success' });
    } catch (error) {
      // Convert to proper error type
      throw new InternalServerError(
        'Async operation failed',
        error as Error,
        { correlationId, operation: 'async-test' }
      );
    }
  });

  fastify.log.info('Error handling test routes registered', {
    component: 'error-handler-example',
    environment: ENV.NODE_ENV,
    version: ENV.APP_VERSION,
  });
}

/**
 * Example of how to handle errors in a service layer
 */
export class ExampleService {
  async fetchUser(userId: string, correlationId?: string): Promise<any> {
    try {
      // Simulate database call
      if (!userId) {
        throw new ValidationError(
          { userId: 'User ID is required' },
          'Invalid user request',
          { correlationId, operation: 'fetch-user' }
        );
      }

      if (userId === 'not-found') {
        throw new NotFoundError(
          'User not found',
          'user',
          userId,
          { correlationId, operation: 'fetch-user' }
        );
      }

      // Simulate successful response
      return {
        id: userId,
        name: 'Test User',
        email: 'test@example.com',
      };
    } catch (error) {
      // Re-throw known errors as-is
      if (error instanceof NotFoundError || error instanceof ValidationError) {
        throw error;
      }

      // Wrap unknown errors
      throw new InternalServerError(
        'Failed to fetch user',
        error as Error,
        { correlationId, operation: 'fetch-user' }
      );
    }
  }
}

export default exampleErrorHandlingPlugin;
