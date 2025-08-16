/**
 * Documentation Plugin
 * Fastify plugin for comprehensive API documentation with Swagger/OpenAPI
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import fastifySwagger from '@fastify/swagger';
import fastifySwaggerUi from '@fastify/swagger-ui';
import * as yaml from 'js-yaml';
import { swaggerConfig, swaggerUiConfig } from './swagger-config';
import { registerSDKRoutes } from './sdk-generator';
import { registerGuideRoutes } from './guide-routes';
import { 
  PostmanCollection, 
  PostmanItem, 
  PostmanRequest
} from './types';

export interface DocumentationPluginOptions extends FastifyPluginOptions {
  enableDocs?: boolean;
  enableSwaggerUi?: boolean;
  customRoutePrefix?: string;
  environment?: string;
}

/**
 * Documentation plugin that registers Swagger/OpenAPI documentation
 */
export async function documentationPlugin(
  fastify: FastifyInstance,
  options: DocumentationPluginOptions = {}
): Promise<void> {
  const {
    enableDocs = true,
    enableSwaggerUi = true,
    customRoutePrefix,
    environment = process.env['NODE_ENV'] || 'development',
  } = options;

  // Only enable documentation in development and staging environments
  if (!enableDocs || environment === 'production') {
    fastify.log.info('API documentation disabled for production environment');
    return;
  }

  // Register Swagger/OpenAPI specification generator
  await fastify.register(fastifySwagger, swaggerConfig);

  // Register Swagger UI for interactive documentation
  if (enableSwaggerUi) {
    const uiConfig = { ...swaggerUiConfig };
    if (customRoutePrefix) {
      uiConfig.routePrefix = customRoutePrefix;
    }

    await fastify.register(fastifySwaggerUi, uiConfig);
  }

  // Add documentation metadata endpoints
  await fastify.register(async (docsInstance) => {
    // OpenAPI JSON specification endpoint
    docsInstance.get(
      '/docs/json',
      {
        schema: {
          tags: ['Documentation'],
          summary: 'Get OpenAPI specification (JSON)',
          description:
            'Returns the complete OpenAPI 3.0 specification in JSON format',
          response: {
            200: {
              type: 'object',
              description: 'OpenAPI 3.0 specification',
            },
          },
        },
      },
      async (_request, reply) => {
        const spec = fastify.swagger();
        reply.type('application/json');
        return spec;
      }
    );

    // OpenAPI YAML specification endpoint
    docsInstance.get(
      '/docs/yaml',
      {
        schema: {
          tags: ['Documentation'],
          summary: 'Get OpenAPI specification (YAML)',
          description:
            'Returns the complete OpenAPI 3.0 specification in YAML format',
          response: {
            200: {
              type: 'string',
              description: 'OpenAPI 3.0 specification in YAML format',
            },
          },
        },
      },
      async (_request, reply) => {
        const spec = fastify.swagger();
        const yamlSpec = yaml.dump(spec, {
          indent: 2,
          lineWidth: 120,
          noRefs: true,
        });
        reply.type('text/yaml');
        return yamlSpec;
      }
    );

    // API documentation metadata
    docsInstance.get(
      '/docs/info',
      {
        schema: {
          tags: ['Documentation'],
          summary: 'Get API documentation metadata',
          description:
            'Returns metadata about the API documentation and available resources',
          response: {
            200: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                version: { type: 'string' },
                description: { type: 'string' },
                documentation: {
                  type: 'object',
                  properties: {
                    swagger: { type: 'string' },
                    openapi: { type: 'string' },
                    yaml: { type: 'string' },
                    postman: { type: 'string' },
                    integrationGuides: { type: 'string' },
                    sdks: { type: 'object' },
                  },
                },
                endpoints: {
                  type: 'object',
                  properties: {
                    total: { type: 'number' },
                    byTag: { type: 'object' },
                  },
                },
                lastUpdated: { type: 'string', format: 'date-time' },
              },
            },
          },
        },
      },
      async () => {
        const spec = fastify.swagger();
        const paths = spec.paths || {};
        const totalEndpoints = Object.keys(paths).reduce((count, path) => {
          const pathItem = paths[path];
          if (pathItem && typeof pathItem === 'object') {
            return count + Object.keys(pathItem).length;
          }
          return count;
        }, 0);

        const endpointsByTag: Record<string, number> = {};
        Object.values(paths).forEach((pathMethods: any) => {
          if (pathMethods && typeof pathMethods === 'object') {
            Object.values(pathMethods).forEach((method: any) => {
              if (method && method.tags && Array.isArray(method.tags)) {
                method.tags.forEach((tag: string) => {
                  endpointsByTag[tag] = (endpointsByTag[tag] || 0) + 1;
                });
              }
            });
          }
        });

        return {
          title: spec.info?.title || 'Enterprise Authentication API',
          version: spec.info?.version || '1.0.0',
          description:
            spec.info?.description || 'Enterprise-grade authentication API',
          documentation: {
            swagger: '/docs',
            openapi: '/docs/json',
            yaml: '/docs/yaml',
            postman: '/docs/postman',
            integrationGuides: '/docs/guides',
            sdks: {
              javascript: '/docs/sdk/javascript',
              python: '/docs/sdk/python',
              curl: '/docs/sdk/curl',
            },
          },
          endpoints: {
            total: totalEndpoints,
            byTag: endpointsByTag,
          },
          lastUpdated: new Date().toISOString(),
        };
      }
    );

    // Postman collection export
    docsInstance.get(
      '/docs/postman',
      {
        schema: {
          tags: ['Documentation'],
          summary: 'Export Postman collection',
          description:
            'Generate and download Postman collection for API testing',
          response: {
            200: {
              type: 'object',
              description: 'Postman collection JSON',
            },
          },
        },
      },
      async (request, reply) => {
        const spec = fastify.swagger();
        const postmanCollection = await generatePostmanCollection(
          spec,
          request
        );

        reply.type('application/json');
        reply.header(
          'Content-Disposition',
          'attachment; filename="enterprise-auth-api.postman_collection.json"'
        );
        return postmanCollection;
      }
    );

    // Integration guides index
    docsInstance.get(
      '/docs/guides',
      {
        schema: {
          tags: ['Documentation'],
          summary: 'Get integration guides',
          description: 'List available integration guides and tutorials',
          response: {
            200: {
              type: 'object',
              properties: {
                guides: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      title: { type: 'string' },
                      description: { type: 'string' },
                      difficulty: {
                        type: 'string',
                        enum: ['beginner', 'intermediate', 'advanced'],
                      },
                      estimatedTime: { type: 'string' },
                      url: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                  },
                },
              },
            },
          },
        },
      },
      async () => {
        return {
          guides: [
            {
              id: 'quick-start',
              title: 'Quick Start Guide',
              description:
                'Get started with the Enterprise Authentication API in 5 minutes',
              difficulty: 'beginner',
              estimatedTime: '5 minutes',
              url: '/docs/guides/quick-start',
              tags: ['authentication', 'getting-started'],
            },
            {
              id: 'oauth-integration',
              title: 'OAuth2 Integration Guide',
              description: 'Complete guide to integrating OAuth2 providers',
              difficulty: 'intermediate',
              estimatedTime: '30 minutes',
              url: '/docs/guides/oauth-integration',
              tags: ['oauth', 'integration'],
            },
            {
              id: 'mfa-setup',
              title: 'Multi-Factor Authentication Setup',
              description: 'Implement MFA in your application',
              difficulty: 'intermediate',
              estimatedTime: '20 minutes',
              url: '/docs/guides/mfa-setup',
              tags: ['mfa', 'security'],
            },
            {
              id: 'passwordless-auth',
              title: 'Passwordless Authentication',
              description: 'Implement WebAuthn and magic link authentication',
              difficulty: 'advanced',
              estimatedTime: '45 minutes',
              url: '/docs/guides/passwordless-auth',
              tags: ['passwordless', 'webauthn', 'security'],
            },
            {
              id: 'webhook-integration',
              title: 'Webhook Integration',
              description:
                'Set up webhooks for real-time authentication events',
              difficulty: 'intermediate',
              estimatedTime: '25 minutes',
              url: '/docs/guides/webhook-integration',
              tags: ['webhooks', 'events', 'real-time'],
            },
            {
              id: 'enterprise-deployment',
              title: 'Enterprise Deployment Guide',
              description:
                'Deploy and scale the authentication system in production',
              difficulty: 'advanced',
              estimatedTime: '60 minutes',
              url: '/docs/guides/enterprise-deployment',
              tags: ['deployment', 'scaling', 'production'],
            },
          ],
        };
      }
    );
  });

  // Register SDK generation routes
  await registerSDKRoutes(fastify);

  // Register integration guides and troubleshooting routes
  await registerGuideRoutes(fastify, {
    enableMarkdownRendering: true,
  });

  fastify.log.info('API documentation registered successfully', {
    swaggerUi: enableSwaggerUi ? swaggerUiConfig.routePrefix : 'disabled',
    environment,
    features: ['swagger', 'guides', 'sdk-generation', 'troubleshooting'],
  });
}

/**
 * Generate Postman collection from OpenAPI specification
 */
async function generatePostmanCollection(
  spec: any,
  request: any
): Promise<PostmanCollection> {
  const baseUrl = `${request.protocol}://${request.headers.host}`;

  const collection: PostmanCollection = {
    info: {
      name: spec.info?.title || 'Enterprise Authentication API',
      description:
        spec.info?.description || 'Enterprise-grade authentication API',
      version: spec.info?.version || '1.0.0',
      schema:
        'https://schema.getpostman.com/json/collection/v2.1.0/collection.json',
    },
    auth: {
      type: 'bearer',
      bearer: [
        {
          key: 'token',
          value: '{{access_token}}',
          type: 'string',
        },
      ],
    },
    variable: [
      {
        key: 'base_url',
        value: baseUrl,
        type: 'string',
      },
      {
        key: 'access_token',
        value: 'your_jwt_token_here',
        type: 'string',
      },
      {
        key: 'refresh_token',
        value: 'your_refresh_token_here',
        type: 'string',
      },
    ],
    item: [],
  };

  // Group endpoints by tags
  const itemsByTag: Record<string, PostmanItem[]> = {};

  Object.entries(spec.paths || {}).forEach(([path, methods]: [string, any]) => {
    Object.entries(methods).forEach(([method, operation]: [string, any]) => {
      const tags = operation.tags || ['Untagged'];
      const primaryTag = tags[0];

      if (!itemsByTag[primaryTag]) {
        itemsByTag[primaryTag] = [];
      }

      const itemRequest: PostmanRequest = {
        method: method.toUpperCase(),
        header: [
          {
            key: 'Content-Type',
            value: 'application/json',
            type: 'text',
          },
        ],
        url: {
          raw: `{{base_url}}${path}`,
          host: ['{{base_url}}'],
          path: path.split('/').filter(Boolean),
        },
        description: operation.description || operation.summary,
      };

      // Add authentication if required
      if (operation.security) {
        itemRequest.auth = {
          type: 'bearer',
          bearer: [
            {
              key: 'token',
              value: '{{access_token}}',
              type: 'string',
            },
          ],
        };
      }

      // Add request body if present
      if (operation.requestBody) {
        const schema =
          operation.requestBody.content?.['application/json']?.schema;
        if (schema && schema.example) {
          itemRequest.body = {
            mode: 'raw',
            raw: JSON.stringify(schema.example, null, 2),
            options: {
              raw: {
                language: 'json',
              },
            },
          };
        }
      }

      const item: PostmanItem = {
        name: operation.summary || `${method.toUpperCase()} ${path}`,
        request: itemRequest,
        response: [],
      };

      itemsByTag[primaryTag].push(item);
    });
  });

  // Add all items to collection (flattened structure)
  Object.values(itemsByTag).forEach((items) => {
    collection.item.push(...items);
  });

  return collection;
}

export default documentationPlugin;
