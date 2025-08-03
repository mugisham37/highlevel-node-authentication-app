/**
 * Administrative Routes
 * Defines API endpoints for administrative operations with elevated permissions
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AdminController } from '../controllers/admin.controller';
import { createAuthorizationMiddleware } from '../../infrastructure/server/middleware/authorization';
import { AuthorizationService } from '../../application/services/authorization.service';
import { validate } from '../middleware/validation.middleware';
import {
  SystemConfigUpdateSchema,
  AuditLogQuerySchema,
  SecurityEventQuerySchema,
  SecurityEventUpdateSchema,
  SystemStatsQuerySchema,
  BulkUserActionSchema,
  BulkSessionActionSchema,
} from '../schemas/admin.schemas';

export interface AdminRoutesOptions extends FastifyPluginOptions {
  adminController: AdminController;
  authorizationService: AuthorizationService;
}

export async function adminRoutes(
  fastify: FastifyInstance,
  options: AdminRoutesOptions
): Promise<void> {
  const { adminController, authorizationService } = options;
  const authMiddleware = createAuthorizationMiddleware(authorizationService);

  // Add authorization helpers to all routes
  await fastify.register(authMiddleware.addAuthorizationHelpers());

  // All admin routes require authentication and admin permissions
  const requireAdminAuth = [
    authMiddleware.requireAuthentication(),
    authMiddleware.requirePermission({
      resource: 'system',
      action: 'admin',
    }),
  ];

  // System Health and Configuration

  fastify.get('/admin/health', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Administration'],
      summary: 'Get system health status',
      description: 'Retrieve comprehensive system health information',
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                status: {
                  type: 'string',
                  enum: ['healthy', 'degraded', 'unhealthy'],
                },
                timestamp: { type: 'string', format: 'date-time' },
                uptime: { type: 'number' },
                version: { type: 'string' },
                environment: { type: 'string' },
                services: {
                  type: 'object',
                  properties: {
                    database: {
                      type: 'object',
                      properties: {
                        status: {
                          type: 'string',
                          enum: ['healthy', 'degraded', 'unhealthy'],
                        },
                        responseTime: { type: 'number' },
                        connections: {
                          type: 'object',
                          properties: {
                            active: { type: 'number' },
                            idle: { type: 'number' },
                            total: { type: 'number' },
                          },
                        },
                      },
                    },
                    redis: {
                      type: 'object',
                      properties: {
                        status: {
                          type: 'string',
                          enum: ['healthy', 'degraded', 'unhealthy'],
                        },
                        responseTime: { type: 'number' },
                        memory: {
                          type: 'object',
                          properties: {
                            used: { type: 'number' },
                            peak: { type: 'number' },
                            limit: { type: 'number' },
                          },
                        },
                      },
                    },
                  },
                },
                metrics: {
                  type: 'object',
                  properties: {
                    requests_per_minute: { type: 'number' },
                    average_response_time: { type: 'number' },
                    error_rate: { type: 'number' },
                    active_sessions: { type: 'number' },
                    memory_usage: { type: 'number' },
                    cpu_usage: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: adminController.getSystemHealth.bind(adminController),
  });

  fastify.put('/admin/config', {
    preHandler: [
      ...requireAdminAuth,
      validate({ body: SystemConfigUpdateSchema }),
    ],
    schema: {
      tags: ['Administration'],
      summary: 'Update system configuration',
      description: 'Update system-wide configuration settings',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        properties: {
          rateLimiting: {
            type: 'object',
            properties: {
              enabled: { type: 'boolean' },
              windowMs: { type: 'number', minimum: 1000 },
              maxRequests: { type: 'number', minimum: 1 },
              skipSuccessfulRequests: { type: 'boolean' },
            },
          },
          security: {
            type: 'object',
            properties: {
              passwordPolicy: {
                type: 'object',
                properties: {
                  minLength: { type: 'number', minimum: 8, maximum: 128 },
                  requireUppercase: { type: 'boolean' },
                  requireLowercase: { type: 'boolean' },
                  requireNumbers: { type: 'boolean' },
                  requireSpecialChars: { type: 'boolean' },
                  maxAge: { type: 'number', minimum: 0 },
                },
              },
              sessionTimeout: { type: 'number', minimum: 300, maximum: 86400 },
              maxConcurrentSessions: {
                type: 'number',
                minimum: 1,
                maximum: 100,
              },
              mfaRequired: { type: 'boolean' },
            },
          },
          oauth: {
            type: 'object',
            properties: {
              providers: {
                type: 'object',
                additionalProperties: {
                  type: 'object',
                  properties: {
                    enabled: { type: 'boolean' },
                    clientId: { type: 'string' },
                    clientSecret: { type: 'string' },
                    scopes: { type: 'array', items: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                updatedAt: { type: 'string', format: 'date-time' },
                updatedBy: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: adminController.updateSystemConfig.bind(adminController),
  });

  // Audit and Security Monitoring

  fastify.get('/admin/audit-logs', {
    preHandler: [
      ...requireAdminAuth,
      validate({ querystring: AuditLogQuerySchema }),
    ],
    schema: {
      tags: ['Administration'],
      summary: 'Get audit logs',
      description: 'Retrieve system audit logs with filtering options',
      security: [{ Bearer: [] }],
      querystring: {
        type: 'object',
        properties: {
          userId: { type: 'string' },
          action: { type: 'string' },
          resource: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          ipAddress: { type: 'string' },
          userAgent: { type: 'string' },
          success: { type: 'boolean' },
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'number', minimum: 0, default: 0 },
          sortBy: {
            type: 'string',
            enum: ['timestamp', 'userId', 'action', 'resource'],
            default: 'timestamp',
          },
          sortOrder: { type: 'string', enum: ['asc', 'desc'], default: 'desc' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                logs: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                      userId: { type: 'string' },
                      action: { type: 'string' },
                      resource: { type: 'string' },
                      ipAddress: { type: 'string' },
                      userAgent: { type: 'string' },
                      success: { type: 'boolean' },
                      details: { type: 'object' },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    limit: { type: 'number' },
                    offset: { type: 'number' },
                    hasMore: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: adminController.getAuditLogs.bind(adminController),
  });

  fastify.get('/admin/security-events', {
    preHandler: [
      ...requireAdminAuth,
      validate({ querystring: SecurityEventQuerySchema }),
    ],
    schema: {
      tags: ['Administration'],
      summary: 'Get security events',
      description: 'Retrieve security events and incidents',
      security: [{ Bearer: [] }],
      querystring: {
        type: 'object',
        properties: {
          type: {
            type: 'string',
            enum: [
              'failed_login',
              'account_locked',
              'suspicious_activity',
              'mfa_bypass_attempt',
              'token_manipulation',
              'rate_limit_exceeded',
            ],
          },
          severity: {
            type: 'string',
            enum: ['low', 'medium', 'high', 'critical'],
          },
          userId: { type: 'string' },
          ipAddress: { type: 'string' },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          resolved: { type: 'boolean' },
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                events: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      type: { type: 'string' },
                      severity: { type: 'string' },
                      timestamp: { type: 'string', format: 'date-time' },
                      userId: { type: 'string' },
                      ipAddress: { type: 'string' },
                      description: { type: 'string' },
                      resolved: { type: 'boolean' },
                      resolvedBy: { type: 'string' },
                      resolution: { type: 'string' },
                      details: { type: 'object' },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    limit: { type: 'number' },
                    offset: { type: 'number' },
                    hasMore: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: adminController.getSecurityEvents.bind(adminController),
  });

  fastify.put('/admin/security-events/:eventId', {
    preHandler: [
      ...requireAdminAuth,
      validate({ body: SecurityEventUpdateSchema }),
    ],
    schema: {
      tags: ['Administration'],
      summary: 'Update security event',
      description: 'Update security event status and resolution',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          eventId: { type: 'string' },
        },
        required: ['eventId'],
      },
      body: {
        type: 'object',
        required: ['resolved'],
        properties: {
          resolved: { type: 'boolean' },
          resolution: { type: 'string' },
          resolvedBy: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
            data: {
              type: 'object',
              properties: {
                eventId: { type: 'string' },
                updatedAt: { type: 'string', format: 'date-time' },
                updatedBy: { type: 'string' },
              },
            },
          },
        },
      },
    },
    handler: adminController.updateSecurityEvent.bind(adminController),
  });

  // System Statistics and Analytics

  fastify.get('/admin/stats', {
    preHandler: [
      ...requireAdminAuth,
      validate({ querystring: SystemStatsQuerySchema }),
    ],
    schema: {
      tags: ['Administration'],
      summary: 'Get system statistics',
      description: 'Retrieve system performance and usage statistics',
      security: [{ Bearer: [] }],
      querystring: {
        type: 'object',
        properties: {
          period: {
            type: 'string',
            enum: ['hour', 'day', 'week', 'month'],
            default: 'day',
          },
          startDate: { type: 'string', format: 'date-time' },
          endDate: { type: 'string', format: 'date-time' },
          metrics: {
            type: 'array',
            items: {
              type: 'string',
              enum: [
                'authentication_attempts',
                'successful_logins',
                'failed_logins',
                'new_users',
                'active_sessions',
                'mfa_challenges',
                'oauth_authentications',
                'password_resets',
              ],
            },
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                period: { type: 'string' },
                startDate: { type: 'string', format: 'date-time' },
                endDate: { type: 'string', format: 'date-time' },
                metrics: {
                  type: 'object',
                  properties: {
                    authentication_attempts: { type: 'number' },
                    successful_logins: { type: 'number' },
                    failed_logins: { type: 'number' },
                    new_users: { type: 'number' },
                    active_sessions: { type: 'number' },
                    mfa_challenges: { type: 'number' },
                    oauth_authentications: { type: 'number' },
                    password_resets: { type: 'number' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: adminController.getSystemStats.bind(adminController),
  });

  // Bulk Operations

  fastify.post('/admin/bulk/users', {
    preHandler: [...requireAdminAuth, validate({ body: BulkUserActionSchema })],
    schema: {
      tags: ['Administration'],
      summary: 'Bulk user actions',
      description: 'Perform bulk operations on multiple users',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['action', 'userIds'],
        properties: {
          action: {
            type: 'string',
            enum: [
              'lock',
              'unlock',
              'delete',
              'reset_password',
              'force_logout',
            ],
          },
          userIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 1000,
          },
          reason: { type: 'string' },
          notifyUsers: { type: 'boolean', default: false },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                processed: { type: 'number' },
                successful: { type: 'number' },
                failed: { type: 'number' },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: adminController.bulkUserAction.bind(adminController),
  });

  fastify.post('/admin/bulk/sessions', {
    preHandler: [
      ...requireAdminAuth,
      validate({ body: BulkSessionActionSchema }),
    ],
    schema: {
      tags: ['Administration'],
      summary: 'Bulk session actions',
      description: 'Perform bulk operations on multiple sessions',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['action', 'sessionIds'],
        properties: {
          action: { type: 'string', enum: ['terminate', 'extend'] },
          sessionIds: {
            type: 'array',
            items: { type: 'string' },
            minItems: 1,
            maxItems: 1000,
          },
          reason: { type: 'string' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                processed: { type: 'number' },
                successful: { type: 'number' },
                failed: { type: 'number' },
                errors: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      error: { type: 'string' },
                    },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: adminController.bulkSessionAction.bind(adminController),
  });

  // Session Management

  fastify.get('/admin/sessions', {
    preHandler: requireAdminAuth,
    schema: {
      tags: ['Administration'],
      summary: 'Get active sessions',
      description: 'Retrieve overview of all active user sessions',
      security: [{ Bearer: [] }],
      querystring: {
        type: 'object',
        properties: {
          limit: { type: 'number', minimum: 1, maximum: 1000, default: 100 },
          offset: { type: 'number', minimum: 0, default: 0 },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                sessions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      userId: { type: 'string' },
                      createdAt: { type: 'string', format: 'date-time' },
                      lastActivity: { type: 'string', format: 'date-time' },
                      expiresAt: { type: 'string', format: 'date-time' },
                      ipAddress: { type: 'string' },
                      userAgent: { type: 'string' },
                      riskScore: { type: 'number' },
                      deviceInfo: { type: 'object' },
                    },
                  },
                },
                pagination: {
                  type: 'object',
                  properties: {
                    limit: { type: 'number' },
                    offset: { type: 'number' },
                    total: { type: 'number' },
                    hasMore: { type: 'boolean' },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: adminController.getActiveSessions.bind(adminController),
  });
}
