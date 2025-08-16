import { FastifyPluginAsync } from 'fastify';
import { logger } from '../../logging/winston-logger';

export const requestLoggingPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, _reply) => {
    const startTime = Date.now();

    // Store start time for duration calculation
    (request as any).startTime = startTime;

    logger.info('Incoming request', {
      correlationId: request.correlationId,
      method: request.method,
      url: request.url,
      ip: request.ip,
      userAgent: request.headers['user-agent'],
      contentLength: request.headers['content-length'],
    });
  });

  fastify.addHook('onResponse', async (request, reply) => {
    const duration = Date.now() - ((request as any).startTime || Date.now());

    logger.info('Request completed', {
      correlationId: request.correlationId,
      method: request.method,
      url: request.url,
      statusCode: reply.statusCode,
      duration: `${duration}ms`,
      contentLength: reply.getHeader('content-length'),
    });

    // Log slow requests as warnings
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        correlationId: request.correlationId,
        method: request.method,
        url: request.url,
        duration: `${duration}ms`,
      });
    }
  });

  fastify.addHook('onError', async (request, _reply, error) => {
    const duration = Date.now() - ((request as any).startTime || Date.now());

    logger.error('Request error', {
      correlationId: request.correlationId,
      method: request.method,
      url: request.url,
      error: error.message,
      duration: `${duration}ms`,
    });
  });
};
