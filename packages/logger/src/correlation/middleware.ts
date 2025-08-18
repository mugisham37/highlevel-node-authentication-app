import { FastifyReply, FastifyRequest } from 'fastify';
import {
    CorrelationContext,
    correlationStorage,
    generateCorrelationId
} from './correlation';

export interface CorrelationMiddlewareOptions {
  headerName?: string;
  generateNew?: boolean;
  includeInResponse?: boolean;
  extractUserId?: (request: FastifyRequest) => string | undefined;
  extractSessionId?: (request: FastifyRequest) => string | undefined;
}

/**
 * Fastify middleware for correlation ID management
 */
export const correlationMiddleware = (options: CorrelationMiddlewareOptions = {}) => {
  const {
    headerName = 'x-correlation-id',
    generateNew = false,
    includeInResponse = true,
    extractUserId,
    extractSessionId
  } = options;

  return async (request: FastifyRequest, reply: FastifyReply) => {
    // Extract correlation ID from header or generate new one
    let correlationId = request.headers[headerName] as string;
    
    if (!correlationId || generateNew) {
      correlationId = generateCorrelationId();
    }

    // Create correlation context
    const context: CorrelationContext = {
      correlationId,
      requestId: generateCorrelationId(),
      traceId: generateCorrelationId(),
      spanId: generateCorrelationId(),
      userId: extractUserId?.(request),
      sessionId: extractSessionId?.(request),
      metadata: {
        method: request.method,
        url: request.url,
        userAgent: request.headers['user-agent'],
        ip: request.ip
      }
    };

    // Add correlation ID to response headers
    if (includeInResponse) {
      reply.header(headerName, correlationId);
    }

    // Run the request in correlation context
    return correlationStorage.run(context, async () => {
      // Continue with the request
    });
  };
};

/**
 * Express-style middleware for correlation ID management
 */
export const expressCorrelationMiddleware = (options: CorrelationMiddlewareOptions = {}) => {
  const {
    headerName = 'x-correlation-id',
    generateNew = false,
    includeInResponse = true
  } = options;

  return (req: any, res: any, next: any) => {
    // Extract correlation ID from header or generate new one
    let correlationId = req.headers[headerName];
    
    if (!correlationId || generateNew) {
      correlationId = generateCorrelationId();
    }

    // Create correlation context
    const context: CorrelationContext = {
      correlationId,
      requestId: generateCorrelationId(),
      traceId: generateCorrelationId(),
      spanId: generateCorrelationId(),
      metadata: {
        method: req.method,
        url: req.url,
        userAgent: req.headers['user-agent'],
        ip: req.ip
      }
    };

    // Add correlation ID to response headers
    if (includeInResponse) {
      res.setHeader(headerName, correlationId);
    }

    // Run the request in correlation context
    correlationStorage.run(context, () => {
      next();
    });
  };
};