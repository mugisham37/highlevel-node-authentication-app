import { FastifyPluginAsync } from 'fastify';
import { nanoid } from 'nanoid';

declare module 'fastify' {
  interface FastifyRequest {
    correlationId: string;
  }
}

export const correlationIdPlugin: FastifyPluginAsync = async (fastify) => {
  fastify.addHook('onRequest', async (request, _reply) => {
    // Get correlation ID from header or generate new one
    const correlationId =
      (request.headers['x-correlation-id'] as string) ||
      (request.headers['x-request-id'] as string) ||
      nanoid();

    // Add to request object
    request.correlationId = correlationId;
  });

  fastify.addHook('onSend', async (request, reply, payload) => {
    // Add correlation ID to response headers
    reply.header('x-correlation-id', request.correlationId);
    return payload;
  });
};
