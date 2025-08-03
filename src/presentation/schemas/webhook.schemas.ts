/**
 * Webhook Validation Schemas
 * Zod schemas for webhook request validation
 */

import { z } from 'zod';

// Webhook configuration schemas
export const RetryConfigSchema = z.object({
  maxRetries: z.number().min(0).max(10).optional(),
  backoffMultiplier: z.number().min(1).max(10).optional(),
  initialDelay: z.number().min(100).max(60000).optional(),
  maxDelay: z.number().min(1000).max(3600000).optional(),
});

export const CreateWebhookSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(500),
  url: z
    .string()
    .url()
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      },
      { message: 'URL must be a valid HTTP or HTTPS URL' }
    ),
  secret: z.string().min(16).max(256),
  events: z.array(z.string()).min(1).max(50),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).optional(),
  retryConfig: RetryConfigSchema.optional(),
});

export const UpdateWebhookSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().min(1).max(500).optional(),
  url: z
    .string()
    .url()
    .refine(
      (url) => {
        try {
          const parsed = new URL(url);
          return parsed.protocol === 'https:' || parsed.protocol === 'http:';
        } catch {
          return false;
        }
      },
      { message: 'URL must be a valid HTTP or HTTPS URL' }
    )
    .optional(),
  secret: z.string().min(16).max(256).optional(),
  events: z.array(z.string()).min(1).max(50).optional(),
  active: z.boolean().optional(),
  headers: z.record(z.string()).optional(),
  timeout: z.number().min(1000).max(30000).optional(),
  retryConfig: RetryConfigSchema.optional(),
});

// Query schemas
export const WebhookQuerySchema = z.object({
  active: z
    .string()
    .transform((val) => val === 'true')
    .optional(),
  eventType: z.string().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100)
    .optional(),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 0)
    .optional(),
});

export const EventQuerySchema = z.object({
  eventType: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100)
    .optional(),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 0)
    .optional(),
});

export const DeliveryAttemptQuerySchema = z.object({
  webhookId: z.string().optional(),
  eventId: z.string().optional(),
  status: z.enum(['pending', 'success', 'failed', 'timeout']).optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100)
    .optional(),
  offset: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val >= 0)
    .optional(),
});

// WebSocket event subscription schema
export const EventSubscriptionSchema = z.object({
  eventTypes: z.array(z.string()).min(1).max(20),
  userId: z.string().optional(),
});

// Webhook signature validation schema
export const WebhookSignatureSchema = z.object({
  payload: z.string(),
  signature: z.string(),
  timestamp: z.string(),
});

// Event streaming schemas
export const StreamEventSchema = z.object({
  id: z.string(),
  type: z.string(),
  data: z.record(z.any()),
  timestamp: z.string().datetime(),
  userId: z.string().optional(),
  sessionId: z.string().optional(),
  metadata: z.record(z.any()).optional(),
  correlationId: z.string().optional(),
});

// Dead letter queue schemas
export const DLQQuerySchema = z.object({
  webhookId: z.string().optional(),
  limit: z
    .string()
    .transform((val) => parseInt(val, 10))
    .refine((val) => val > 0 && val <= 100)
    .optional(),
  status: z.enum(['failed', 'abandoned', 'expired']).optional(),
});

// Webhook health check schema
export const WebhookHealthSchema = z.object({
  webhookId: z.string(),
  checkConnectivity: z.boolean().optional(),
  timeout: z.number().min(1000).max(10000).optional(),
});

// Bulk webhook operations schema
export const BulkWebhookActionSchema = z.object({
  action: z.enum(['activate', 'deactivate', 'delete', 'test']),
  webhookIds: z.array(z.string()).min(1).max(50),
});

// Webhook analytics schema
export const WebhookAnalyticsQuerySchema = z.object({
  webhookId: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  groupBy: z.enum(['hour', 'day', 'week', 'month']).optional(),
  metrics: z
    .array(z.enum(['deliveries', 'success_rate', 'response_time', 'errors']))
    .optional(),
});

// Export types
export type CreateWebhookRequest = z.infer<typeof CreateWebhookSchema>;
export type UpdateWebhookRequest = z.infer<typeof UpdateWebhookSchema>;
export type WebhookQuery = z.infer<typeof WebhookQuerySchema>;
export type EventQuery = z.infer<typeof EventQuerySchema>;
export type DeliveryAttemptQuery = z.infer<typeof DeliveryAttemptQuerySchema>;
export type EventSubscription = z.infer<typeof EventSubscriptionSchema>;
export type WebhookSignature = z.infer<typeof WebhookSignatureSchema>;
export type StreamEvent = z.infer<typeof StreamEventSchema>;
export type DLQQuery = z.infer<typeof DLQQuerySchema>;
export type WebhookHealth = z.infer<typeof WebhookHealthSchema>;
export type BulkWebhookAction = z.infer<typeof BulkWebhookActionSchema>;
export type WebhookAnalyticsQuery = z.infer<typeof WebhookAnalyticsQuerySchema>;

// Validation helpers
export const validateWebhookUrl = (url: string): boolean => {
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:';
  } catch {
    return false;
  }
};

export const validateEventType = (eventType: string): boolean => {
  const supportedEventTypes = [
    'authentication.login.success',
    'authentication.login.failure',
    'authentication.logout',
    'authentication.token.refresh',
    'authentication.token.revoke',
    'authentication.mfa.challenge',
    'authentication.mfa.success',
    'authentication.mfa.failure',
    'authentication.password.change',
    'authentication.password.reset',
    'authorization.access.granted',
    'authorization.access.denied',
    'security.high_risk.detected',
    'security.rate_limit.exceeded',
    'security.validation.failed',
    'security.suspicious.activity',
    'session.created',
    'session.expired',
    'session.revoked',
    'user.created',
    'user.updated',
    'user.deleted',
    'admin.action',
    'system.error',
    'webhook.registered',
    'webhook.updated',
    'webhook.deleted',
    'webhook.tested',
  ];

  // Support wildcard patterns
  if (eventType === '*') return true;
  if (eventType.endsWith('*')) {
    const prefix = eventType.slice(0, -1);
    return supportedEventTypes.some((type) => type.startsWith(prefix));
  }

  return supportedEventTypes.includes(eventType);
};

export const validateWebhookSecret = (
  secret: string
): {
  valid: boolean;
  errors: string[];
} => {
  const errors: string[] = [];

  if (!secret) {
    errors.push('Secret is required');
    return { valid: false, errors };
  }

  if (secret.length < 16) {
    errors.push('Secret must be at least 16 characters long');
  }

  if (secret.length > 256) {
    errors.push('Secret must not exceed 256 characters');
  }

  // Check for sufficient entropy (basic check)
  const uniqueChars = new Set(secret).size;
  if (uniqueChars < 8) {
    errors.push('Secret should contain more diverse characters');
  }

  // Check for common weak patterns
  if (/^(.)\1+$/.test(secret)) {
    errors.push('Secret should not consist of repeated characters');
  }

  if (/^(012|123|abc|password|secret)/i.test(secret)) {
    errors.push('Secret should not contain common patterns');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
};

// Schema validation middleware factory
export const createWebhookValidationMiddleware = (schema: z.ZodSchema) => {
  return async (request: any, reply: any) => {
    try {
      const validatedData = schema.parse(
        request.body || request.query || request.params
      );

      // Replace the original data with validated data
      if (request.body) request.body = validatedData;
      if (request.query) request.query = validatedData;
      if (request.params) request.params = validatedData;
    } catch (error) {
      if (error instanceof z.ZodError) {
        reply.code(400).send({
          success: false,
          error: 'Validation failed',
          details: error.errors.map((err) => ({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
          })),
        });
        return;
      }

      reply.code(400).send({
        success: false,
        error: 'Invalid request data',
      });
    }
  };
};
