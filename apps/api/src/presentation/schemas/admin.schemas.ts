/**
 * Administrative API Validation Schemas
 * Zod schemas for request/response validation in administrative endpoints
 */

import { z } from 'zod';

// System Configuration Schemas
export const SystemConfigUpdateSchema = z.object({
  rateLimiting: z
    .object({
      enabled: z.boolean(),
      windowMs: z.number().min(1000),
      maxRequests: z.number().min(1),
      skipSuccessfulRequests: z.boolean().optional(),
    })
    .optional(),
  security: z
    .object({
      passwordPolicy: z
        .object({
          minLength: z.number().min(8).max(128),
          requireUppercase: z.boolean(),
          requireLowercase: z.boolean(),
          requireNumbers: z.boolean(),
          requireSpecialChars: z.boolean(),
          maxAge: z.number().min(0).optional(),
        })
        .optional(),
      sessionTimeout: z.number().min(300).max(86400),
      maxConcurrentSessions: z.number().min(1).max(100),
      mfaRequired: z.boolean(),
    })
    .optional(),
  oauth: z
    .object({
      providers: z.record(
        z.object({
          enabled: z.boolean(),
          clientId: z.string(),
          clientSecret: z.string(),
          scopes: z.array(z.string()),
        })
      ),
    })
    .optional(),
});

// Audit Log Schemas
export const AuditLogQuerySchema = z.object({
  userId: z.string().optional(),
  action: z.string().optional(),
  resource: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
  success: z.boolean().optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
  offset: z.number().min(0).optional().default(0),
  sortBy: z
    .enum(['timestamp', 'userId', 'action', 'resource'])
    .optional()
    .default('timestamp'),
  sortOrder: z.enum(['asc', 'desc']).optional().default('desc'),
});

// Security Event Schemas
export const SecurityEventQuerySchema = z.object({
  type: z
    .enum([
      'failed_login',
      'account_locked',
      'suspicious_activity',
      'mfa_bypass_attempt',
      'token_manipulation',
      'rate_limit_exceeded',
    ])
    .optional(),
  severity: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  userId: z.string().optional(),
  ipAddress: z.string().optional(),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  resolved: z.boolean().optional(),
  limit: z.number().min(1).max(1000).optional().default(100),
  offset: z.number().min(0).optional().default(0),
});

export const SecurityEventUpdateSchema = z.object({
  resolved: z.boolean(),
  resolution: z.string().optional(),
  resolvedBy: z.string().optional(),
});

// System Statistics Schemas
export const SystemStatsQuerySchema = z.object({
  period: z.enum(['hour', 'day', 'week', 'month']).optional().default('day'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  metrics: z
    .array(
      z.enum([
        'authentication_attempts',
        'successful_logins',
        'failed_logins',
        'new_users',
        'active_sessions',
        'mfa_challenges',
        'oauth_authentications',
        'password_resets',
      ])
    )
    .optional(),
});

// Bulk Operations Schemas
export const BulkUserActionSchema = z.object({
  action: z.enum([
    'lock',
    'unlock',
    'delete',
    'reset_password',
    'force_logout',
  ]),
  userIds: z.array(z.string()).min(1).max(1000),
  reason: z.string().optional(),
  notifyUsers: z.boolean().optional().default(false),
});

export const BulkSessionActionSchema = z.object({
  action: z.enum(['terminate', 'extend']),
  sessionIds: z.array(z.string()).min(1).max(1000),
  reason: z.string().optional(),
});

// System Health Schemas
export const SystemHealthResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    status: z.enum(['healthy', 'degraded', 'unhealthy']),
    timestamp: z.string(),
    uptime: z.number(),
    version: z.string(),
    environment: z.string(),
    services: z.object({
      database: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: z.number(),
        connections: z.object({
          active: z.number(),
          idle: z.number(),
          total: z.number(),
        }),
      }),
      redis: z.object({
        status: z.enum(['healthy', 'degraded', 'unhealthy']),
        responseTime: z.number(),
        memory: z.object({
          used: z.number(),
          peak: z.number(),
          limit: z.number(),
        }),
      }),
      external: z.object({
        oauth_providers: z.record(
          z.object({
            status: z.enum(['healthy', 'degraded', 'unhealthy']),
            responseTime: z.number(),
          })
        ),
        email_service: z.object({
          status: z.enum(['healthy', 'degraded', 'unhealthy']),
          responseTime: z.number(),
        }),
        sms_service: z.object({
          status: z.enum(['healthy', 'degraded', 'unhealthy']),
          responseTime: z.number(),
        }),
      }),
    }),
    metrics: z.object({
      requests_per_minute: z.number(),
      average_response_time: z.number(),
      error_rate: z.number(),
      active_sessions: z.number(),
      memory_usage: z.number(),
      cpu_usage: z.number(),
    }),
  }),
});

// Response Schemas
export const AdminResponseSchema = z.object({
  success: z.boolean(),
  data: z.any().optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  correlationId: z.string().optional(),
});

export const BulkOperationResponseSchema = z.object({
  success: z.boolean(),
  data: z.object({
    processed: z.number(),
    successful: z.number(),
    failed: z.number(),
    errors: z.array(
      z.object({
        id: z.string(),
        error: z.string(),
      })
    ),
  }),
  message: z.string(),
});

// Type exports
export type SystemConfigUpdate = z.infer<typeof SystemConfigUpdateSchema>;
export type AuditLogQuery = z.infer<typeof AuditLogQuerySchema>;
export type SecurityEventQuery = z.infer<typeof SecurityEventQuerySchema>;
export type SecurityEventUpdate = z.infer<typeof SecurityEventUpdateSchema>;
export type SystemStatsQuery = z.infer<typeof SystemStatsQuerySchema>;
export type BulkUserAction = z.infer<typeof BulkUserActionSchema>;
export type BulkSessionAction = z.infer<typeof BulkSessionActionSchema>;
export type SystemHealthResponse = z.infer<typeof SystemHealthResponseSchema>;
export type AdminResponse = z.infer<typeof AdminResponseSchema>;
export type BulkOperationResponse = z.infer<typeof BulkOperationResponseSchema>;
