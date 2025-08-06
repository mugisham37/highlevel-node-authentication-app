/**
 * Request Utilities
 * Helper functions for handling HTTP requests and headers
 */

import { IncomingHttpHeaders } from 'http';
import { FastifyRequest } from 'fastify';

/**
 * Extract correlation ID from headers
 */
export function getCorrelationId(headers: IncomingHttpHeaders): string {
  const correlationId = headers['x-correlation-id'] || headers['correlation-id'];
  return typeof correlationId === 'string' ? correlationId : 
         Array.isArray(correlationId) ? correlationId[0] || '' : '';
}

/**
 * Extract request ID from headers
 */
export function getRequestId(headers: IncomingHttpHeaders): string {
  const requestId = headers['x-request-id'] || headers['request-id'];
  return typeof requestId === 'string' ? requestId : 
         Array.isArray(requestId) ? requestId[0] || '' : '';
}

/**
 * Safely extract string value from header
 */
export function safeHeaderValue(value: string | string[] | undefined): string {
  if (typeof value === 'string') return value;
  if (Array.isArray(value)) return value[0] || '';
  return '';
}

/**
 * Sanitize headers for logging (remove sensitive data)
 */
export function sanitizeHeaders(headers: IncomingHttpHeaders): Record<string, string> {
  const sensitiveHeaders = [
    'authorization',
    'cookie',
    'x-api-key',
    'x-auth-token',
    'x-access-token',
  ];

  const sanitized: Record<string, string> = {};

  for (const [key, value] of Object.entries(headers)) {
    if (sensitiveHeaders.includes(key.toLowerCase())) {
      sanitized[key] = '[REDACTED]';
    } else {
      sanitized[key] = safeHeaderValue(value);
    }
  }

  return sanitized;
}

/**
 * Get request size from headers
 */
export function getRequestSize(request: FastifyRequest): number {
  const contentLength = request.headers['content-length'];
  return contentLength ? parseInt(safeHeaderValue(contentLength), 10) || 0 : 0;
}

/**
 * Extract user agent from headers
 */
export function getUserAgent(headers: IncomingHttpHeaders): string {
  return safeHeaderValue(headers['user-agent']);
}

/**
 * Extract IP address from request
 */
export function getClientIP(request: FastifyRequest): string {
  return request.ip || '';
}

/**
 * Get safe correlation ID with fallback
 */
export function getSafeCorrelationId(headers: IncomingHttpHeaders, fallback?: string): string {
  const correlationId = getCorrelationId(headers);
  return correlationId || fallback || '';
}

/**
 * Get safe request ID with fallback
 */
export function getSafeRequestId(headers: IncomingHttpHeaders, fallback?: string): string {
  const requestId = getRequestId(headers);
  return requestId || fallback || '';
}
