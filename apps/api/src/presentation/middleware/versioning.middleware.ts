/**
 * API Versioning Middleware
 * Handles API versioning and backward compatibility
 */

import { FastifyRequest, FastifyReply, FastifyPluginCallback } from 'fastify';
import { logger } from '@company/logger';

export interface VersioningOptions {
  defaultVersion?: string;
  supportedVersions?: string[];
  deprecatedVersions?: Record<
    string,
    { deprecatedAt: string; sunsetAt?: string }
  >;
}

/**
 * API versioning plugin for Fastify
 */
export const versioningPlugin: FastifyPluginCallback<VersioningOptions> = (
  fastify,
  options,
  done
) => {
  const {
    defaultVersion = 'v1',
    supportedVersions = ['v1'],
    deprecatedVersions = {},
  } = options;

  // Add version detection hook
  fastify.addHook(
    'preHandler',
    async (request: FastifyRequest, reply: FastifyReply) => {
      // Extract version from URL path, header, or query parameter
      const version = extractVersion(request, defaultVersion);

      // Validate version
      if (!supportedVersions.includes(version)) {
        return reply.status(400).send({
          success: false,
          error: 'UNSUPPORTED_API_VERSION',
          message: `API version '${version}' is not supported. Supported versions: ${supportedVersions.join(', ')}`,
          supportedVersions,
          correlationId: request.correlationId,
        });
      }

      // Check for deprecated versions
      if (deprecatedVersions[version]) {
        const deprecationInfo = deprecatedVersions[version];

        // Add deprecation headers
        reply.header('X-API-Deprecated', 'true');
        reply.header('X-API-Deprecated-Date', deprecationInfo.deprecatedAt);
        if (deprecationInfo.sunsetAt) {
          reply.header('X-API-Sunset-Date', deprecationInfo.sunsetAt);
        }
        reply.header('X-API-Supported-Versions', supportedVersions.join(', '));

        // Log deprecation usage
        logger.warn('Deprecated API version used', {
          correlationId: request.correlationId,
          version,
          url: request.url,
          method: request.method,
          userAgent: request.headers['user-agent'],
          deprecatedAt: deprecationInfo.deprecatedAt,
          sunsetAt: deprecationInfo.sunsetAt,
        });
      }

      // Add version to request context
      (request as any).apiVersion = version;
    }
  );

  // Add version helper methods
  fastify.decorate('getApiVersion', (request: FastifyRequest): string => {
    return (request as any).apiVersion || defaultVersion;
  });

  fastify.decorate('isVersionSupported', (version: string): boolean => {
    return supportedVersions.includes(version);
  });

  fastify.decorate('isVersionDeprecated', (version: string): boolean => {
    return version in deprecatedVersions;
  });

  done();
};

/**
 * Extract API version from request
 */
function extractVersion(
  request: FastifyRequest,
  defaultVersion: string
): string {
  // 1. Check URL path (e.g., /api/v1/auth/login)
  const pathMatch = request.url.match(/^\/api\/(v\d+)\//);
  if (pathMatch && pathMatch[1]) {
    return pathMatch[1];
  }

  // 2. Check Accept header (e.g., application/vnd.api+json;version=1)
  const acceptHeader = request.headers.accept;
  if (acceptHeader) {
    const versionMatch = acceptHeader.match(/version=(\d+)/);
    if (versionMatch) {
      return `v${versionMatch[1]}`;
    }
  }

  // 3. Check custom API-Version header
  const apiVersionHeader = request.headers['api-version'] as string;
  if (apiVersionHeader) {
    return apiVersionHeader.startsWith('v')
      ? apiVersionHeader
      : `v${apiVersionHeader}`;
  }

  // 4. Check query parameter
  const versionQuery = (request.query as any)?.version;
  if (versionQuery) {
    return versionQuery.startsWith('v') ? versionQuery : `v${versionQuery}`;
  }

  // 5. Return default version
  return defaultVersion;
}

/**
 * Version-specific route registration helper
 */
export function registerVersionedRoutes(
  _fastify: any,
  routes: Record<string, (fastify: any, options: any) => Promise<void>>,
  options: any = {}
) {
  return async (fastifyInstance: any, pluginOptions: any) => {
    for (const [version, routeHandler] of Object.entries(routes)) {
      await fastifyInstance.register(
        async (versionedInstance: any) => {
          // Add version context to all routes in this version
          versionedInstance.addHook(
            'preHandler',
            async (request: FastifyRequest) => {
              (request as any).routeVersion = version;
            }
          );

          await routeHandler(versionedInstance, {
            ...options,
            ...pluginOptions,
            version,
          });
        },
        { prefix: `/api/${version}` }
      );
    }
  };
}

/**
 * Backward compatibility transformation middleware
 */
export function createCompatibilityMiddleware(
  transformations: Record<string, any>
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const version = (request as any).apiVersion;

    if (transformations[version]) {
      const transformation = transformations[version];

      // Transform request data for backward compatibility
      if (transformation.request && request.body) {
        request.body = transformation.request(request.body);
      }

      // Store response transformation for later use
      if (transformation.response) {
        (reply as any).responseTransformation = transformation.response;
      }
    }
  };
}

/**
 * Response transformation hook
 */
export const responseTransformationHook = async (
  request: FastifyRequest,
  reply: FastifyReply,
  payload: any
) => {
  const transformation = (reply as any).responseTransformation;

  if (transformation && payload) {
    try {
      const transformedPayload = transformation(JSON.parse(payload));
      return JSON.stringify(transformedPayload);
    } catch (error) {
      logger.error('Response transformation error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        version: (request as any).apiVersion,
      });
      // Return original payload if transformation fails
      return payload;
    }
  }

  return payload;
};

// Declare module augmentation for TypeScript
declare module 'fastify' {
  interface FastifyInstance {
    getApiVersion: (request: FastifyRequest) => string;
    isVersionSupported: (version: string) => boolean;
    isVersionDeprecated: (version: string) => boolean;
  }
}

/**
 * Common version transformations for backward compatibility
 */
export const commonTransformations = {
  // Example: v1 to v2 transformations
  v1: {
    request: (data: any) => {
      // Transform v1 request format to current format
      if (data.user_name) {
        data.name = data.user_name;
        delete data.user_name;
      }
      return data;
    },
    response: (data: any) => {
      // Transform current response format to v1 format
      if (data.data?.user?.name) {
        data.data.user.user_name = data.data.user.name;
        delete data.data.user.name;
      }
      return data;
    },
  },
};

/**
 * Version deprecation notice middleware
 */
export function createDeprecationNotice(
  version: string,
  deprecatedAt: string,
  sunsetAt?: string,
  migrationGuide?: string
) {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    const currentVersion = (request as any).apiVersion;

    if (currentVersion === version) {
      const notice = {
        deprecated: true,
        version,
        deprecatedAt,
        sunsetAt,
        migrationGuide,
        message: `API version ${version} is deprecated. Please migrate to a newer version.`,
      };

      // Add to response headers
      reply.header('X-API-Deprecation-Notice', JSON.stringify(notice));

      // Log usage for monitoring
      logger.warn('Deprecated API version accessed', {
        correlationId: request.correlationId,
        version,
        url: request.url,
        method: request.method,
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });
    }
  };
}

