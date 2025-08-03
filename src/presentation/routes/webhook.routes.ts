/**
 * Webhook Routes
 * Defines HTTP routes for webhook management and event streaming
 */

import { FastifyInstance } from 'fastify';
import { WebhookController } from '../controllers/webhook.controller';
import {
  CreateWebhookSchema,
  UpdateWebhookSchema,
  WebhookQuerySchema,
  EventQuerySchema,
} from '../schemas/webhook.schemas';

export async function webhookRoutes(
  fastify: FastifyInstance,
  webhookController: WebhookController
): Promise<void> {
  // Register a new webhook
  fastify.post('/webhooks', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Register a new webhook',
      description: 'Register a new webhook to receive authentication events',
      security: [{ Bearer: [] }],
      body: CreateWebhookSchema,
      response: {
        201: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                url: { type: 'string' },
                events: { type: 'array', items: { type: 'string' } },
                active: { type: 'boolean' },
                timeout: { type: 'number' },
                retryConfig: { type: 'object' },
                createdAt: { type: 'string', format: 'date-time' },
                deliveryStats: { type: 'object' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: webhookController.registerWebhook.bind(webhookController),
  });

  // Update an existing webhook
  fastify.put('/webhooks/:webhookId', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Update a webhook',
      description: 'Update an existing webhook configuration',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          webhookId: { type: 'string' },
        },
        required: ['webhookId'],
      },
      body: UpdateWebhookSchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                url: { type: 'string' },
                events: { type: 'array', items: { type: 'string' } },
                active: { type: 'boolean' },
                timeout: { type: 'number' },
                retryConfig: { type: 'object' },
                updatedAt: { type: 'string', format: 'date-time' },
                deliveryStats: { type: 'object' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: webhookController.updateWebhook.bind(webhookController),
  });

  // Delete a webhook
  fastify.delete('/webhooks/:webhookId', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Delete a webhook',
      description: 'Delete an existing webhook',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          webhookId: { type: 'string' },
        },
        required: ['webhookId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: webhookController.deleteWebhook.bind(webhookController),
  });

  // Get a webhook by ID
  fastify.get('/webhooks/:webhookId', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Get a webhook',
      description: 'Get webhook details by ID',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          webhookId: { type: 'string' },
        },
        required: ['webhookId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                name: { type: 'string' },
                description: { type: 'string' },
                url: { type: 'string' },
                events: { type: 'array', items: { type: 'string' } },
                active: { type: 'boolean' },
                timeout: { type: 'number' },
                retryConfig: { type: 'object' },
                createdAt: { type: 'string', format: 'date-time' },
                updatedAt: { type: 'string', format: 'date-time' },
                lastDeliveryAt: { type: 'string', format: 'date-time' },
                deliveryStats: { type: 'object' },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: webhookController.getWebhook.bind(webhookController),
  });

  // List webhooks
  fastify.get('/webhooks', {
    schema: {
      tags: ['Webhooks'],
      summary: 'List webhooks',
      description: 'List webhooks for the authenticated user',
      security: [{ Bearer: [] }],
      querystring: WebhookQuerySchema,
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                webhooks: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      name: { type: 'string' },
                      description: { type: 'string' },
                      url: { type: 'string' },
                      events: { type: 'array', items: { type: 'string' } },
                      active: { type: 'boolean' },
                      createdAt: { type: 'string', format: 'date-time' },
                      lastDeliveryAt: { type: 'string', format: 'date-time' },
                      deliveryStats: { type: 'object' },
                    },
                  },
                },
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: webhookController.listWebhooks.bind(webhookController),
  });

  // Test a webhook
  fastify.post('/webhooks/:webhookId/test', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Test a webhook',
      description: 'Send a test event to a webhook',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          webhookId: { type: 'string' },
        },
        required: ['webhookId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                webhookId: { type: 'string' },
                testResult: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    httpStatus: { type: 'number' },
                    responseTime: { type: 'number' },
                    errorMessage: { type: 'string' },
                  },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: webhookController.testWebhook.bind(webhookController),
  });

  // Get webhook statistics
  fastify.get('/webhooks/:webhookId/stats', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Get webhook statistics',
      description: 'Get delivery statistics for a webhook',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          webhookId: { type: 'string' },
        },
        required: ['webhookId'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                webhookId: { type: 'string' },
                stats: {
                  type: 'object',
                  properties: {
                    totalDeliveries: { type: 'number' },
                    successfulDeliveries: { type: 'number' },
                    failedDeliveries: { type: 'number' },
                    averageResponseTime: { type: 'number' },
                    recentDeliveries: { type: 'array' },
                  },
                },
              },
            },
          },
        },
        404: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
          },
        },
      },
    },
    handler: webhookController.getWebhookStats.bind(webhookController),
  });

  // Get supported event types
  fastify.get('/webhooks/event-types', {
    schema: {
      tags: ['Webhooks'],
      summary: 'Get supported event types',
      description: 'Get list of supported webhook event types',
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                eventTypes: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      type: { type: 'string' },
                      description: { type: 'string' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: webhookController.getSupportedEventTypes.bind(webhookController),
  });

  // List recent events
  fastify.get('/events', {
    schema: {
      tags: ['Events'],
      summary: 'List recent events',
      description: 'List recent authentication events',
      security: [{ Bearer: [] }],
      querystring: EventQuerySchema,
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
                      data: { type: 'object' },
                      timestamp: { type: 'string', format: 'date-time' },
                      metadata: { type: 'object' },
                    },
                  },
                },
                total: { type: 'number' },
                limit: { type: 'number' },
                offset: { type: 'number' },
              },
            },
          },
        },
      },
    },
    handler: webhookController.listEvents.bind(webhookController),
  });
}
