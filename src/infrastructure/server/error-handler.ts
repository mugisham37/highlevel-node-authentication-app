import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { logger } from '../logging/winston-logger';

export interface ErrorResponse {
  code: string;
  error: string;
  message: string;
  statusCode: number;
  correlationId?: string;
  details?: any;
}

export async function errorHandler(
  error: FastifyError,
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const correlationId = request.headers['x-correlation-id'] as string;

  // Log error with correlation ID
  logger.error('Request error occurred', {
    error: error.message,
    stack: error.stack,
    correlationId,
    method: request.method,
    url: request.url,
    ip: request.ip,
    userAgent: request.headers['user-agent'],
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    const errorResponse: ErrorResponse = {
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      message: 'Request validation failed',
      statusCode: 400,
      correlationId,
      details: error.errors.map((err) => ({
        path: err.path.join('.'),
        message: err.message,
        code: err.code,
      })),
    };

    return reply.status(400).send(errorResponse);
  }

  // Handle Fastify validation errors
  if (error.validation) {
    const errorResponse: ErrorResponse = {
      code: 'VALIDATION_ERROR',
      error: 'Bad Request',
      message: error.message || 'Request validation failed',
      statusCode: 400,
      correlationId,
      details: error.validation,
    };

    return reply.status(400).send(errorResponse);
  }

  // Handle rate limit errors
  if (error.statusCode === 429) {
    const errorResponse: ErrorResponse = {
      code: 'RATE_LIMIT_EXCEEDED',
      error: 'Too Many Requests',
      message: error.message || 'Rate limit exceeded',
      statusCode: 429,
      correlationId,
    };

    return reply.status(429).send(errorResponse);
  }

  // Handle known HTTP errors
  if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
    const errorResponse: ErrorResponse = {
      code: error.code || 'CLIENT_ERROR',
      error: getErrorName(error.statusCode),
      message: error.message,
      statusCode: error.statusCode,
      correlationId,
    };

    return reply.status(error.statusCode).send(errorResponse);
  }

  // Handle server errors (5xx)
  const statusCode = error.statusCode || 500;
  const errorResponse: ErrorResponse = {
    code: error.code || 'INTERNAL_SERVER_ERROR',
    error: getErrorName(statusCode),
    message: 'An internal server error occurred',
    statusCode,
    correlationId,
  };

  // Don't expose internal error details in production
  if (process.env['NODE_ENV'] === 'development') {
    errorResponse.details = {
      originalMessage: error.message,
      stack: error.stack,
    };
  }

  return reply.status(statusCode).send(errorResponse);
}

function getErrorName(statusCode: number): string {
  const errorNames: Record<number, string> = {
    400: 'Bad Request',
    401: 'Unauthorized',
    403: 'Forbidden',
    404: 'Not Found',
    405: 'Method Not Allowed',
    409: 'Conflict',
    422: 'Unprocessable Entity',
    429: 'Too Many Requests',
    500: 'Internal Server Error',
    502: 'Bad Gateway',
    503: 'Service Unavailable',
    504: 'Gateway Timeout',
  };

  return errorNames[statusCode] || 'Unknown Error';
}
