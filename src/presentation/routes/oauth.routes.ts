/**
 * OAuth Routes
 * Defines API endpoints for OAuth2/OpenID Connect operations
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { OAuthController } from '../controllers/oauth.controller';
import { createAuthorizationMiddleware } from '../../infrastructure/server/middleware/authorization';
import { AuthorizationService } from '../../application/services/authorization.service';
import { validate } from '../middleware/validation.middleware';
import {
  OAuthInitiateRequestSchema,
  OAuthCallbackRequestSchema,
  OAuthLinkAccountRequestSchema,
  OAuthUnlinkAccountRequestSchema,
  OAuthServerAuthorizeRequestSchema,
  OAuthServerTokenRequestSchema,
} from '../schemas/oauth.schemas';

export interface OAuthRoutesOptions extends FastifyPluginOptions {
  oauthController: OAuthController;
  authorizationService: AuthorizationService;
}

export async function oauthRoutes(
  fastify: FastifyInstance,
  options: OAuthRoutesOptions
): Promise<void> {
  const { oauthController, authorizationService } = options;
  const authMiddleware = createAuthorizationMiddleware(authorizationService);

  // Add authorization helpers to all routes
  await fastify.register(authMiddleware.addAuthorizationHelpers());

  // OAuth Client Endpoints (for authenticating with external providers)

  fastify.post('/oauth/initiate', {
    preHandler: [validate({ body: OAuthInitiateRequestSchema })],
    schema: {
      tags: ['OAuth Client'],
      summary: 'Initiate OAuth flow',
      description: 'Start OAuth authentication flow with external provider',
      body: {
        type: 'object',
        required: ['provider', 'redirectUri', 'deviceInfo'],
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'github', 'microsoft'],
            description: 'OAuth provider name',
          },
          redirectUri: {
            type: 'string',
            format: 'uri',
            description: 'Callback URI after OAuth completion',
          },
          state: {
            type: 'string',
            description: 'Optional state parameter for CSRF protection',
          },
          scopes: {
            type: 'array',
            items: { type: 'string' },
            description: 'Requested OAuth scopes',
          },
          deviceInfo: {
            type: 'object',
            required: ['fingerprint', 'userAgent'],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              mobile: { type: 'boolean' },
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
                authorizationUrl: { type: 'string', format: 'uri' },
                state: { type: 'string' },
                codeChallenge: { type: 'string' },
                codeChallengeMethod: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.initiateOAuth.bind(oauthController),
  });

  fastify.post('/oauth/callback', {
    preHandler: [validate({ body: OAuthCallbackRequestSchema })],
    schema: {
      tags: ['OAuth Client'],
      summary: 'Handle OAuth callback',
      description: 'Process OAuth callback from external provider',
      body: {
        type: 'object',
        required: ['provider', 'code', 'state', 'deviceInfo'],
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'github', 'microsoft'],
            description: 'OAuth provider name',
          },
          code: {
            type: 'string',
            description: 'Authorization code from provider',
          },
          state: {
            type: 'string',
            description: 'State parameter for CSRF protection',
          },
          deviceInfo: {
            type: 'object',
            required: ['fingerprint', 'userAgent'],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
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
                user: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    email: { type: 'string' },
                    name: { type: 'string', nullable: true },
                    image: { type: 'string', nullable: true },
                    emailVerified: { type: 'boolean' },
                    mfaEnabled: { type: 'boolean' },
                    createdAt: { type: 'string', format: 'date-time' },
                  },
                },
                tokens: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    expiresIn: { type: 'number' },
                    tokenType: { type: 'string' },
                  },
                },
                account: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    provider: { type: 'string' },
                    providerAccountId: { type: 'string' },
                    type: { type: 'string' },
                  },
                },
                isNewUser: { type: 'boolean' },
                requiresMFA: { type: 'boolean' },
                riskScore: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.handleOAuthCallback.bind(oauthController),
  });

  // Account linking endpoints (require authentication)

  fastify.post('/oauth/link', {
    preHandler: [
      authMiddleware.requireAuthentication(),
      validate({ body: OAuthLinkAccountRequestSchema }),
    ],
    schema: {
      tags: ['OAuth Client'],
      summary: 'Link OAuth account',
      description: 'Link external OAuth account to current user',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['provider', 'code', 'state'],
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'github', 'microsoft'],
            description: 'OAuth provider name',
          },
          code: {
            type: 'string',
            description: 'Authorization code from provider',
          },
          state: {
            type: 'string',
            description: 'State parameter for CSRF protection',
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
                account: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    provider: { type: 'string' },
                    providerAccountId: { type: 'string' },
                    type: { type: 'string' },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.linkAccount.bind(oauthController),
  });

  fastify.post('/oauth/unlink', {
    preHandler: [
      authMiddleware.requireAuthentication(),
      validate({ body: OAuthUnlinkAccountRequestSchema }),
    ],
    schema: {
      tags: ['OAuth Client'],
      summary: 'Unlink OAuth account',
      description: 'Remove linked OAuth account from current user',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['provider'],
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'github', 'microsoft'],
            description: 'OAuth provider name',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.unlinkAccount.bind(oauthController),
  });

  fastify.get('/oauth/accounts', {
    preHandler: [authMiddleware.requireAuthentication()],
    schema: {
      tags: ['OAuth Client'],
      summary: 'Get linked accounts',
      description: 'Get all OAuth accounts linked to current user',
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  id: { type: 'string' },
                  provider: { type: 'string' },
                  providerAccountId: { type: 'string' },
                  type: { type: 'string' },
                  accessToken: { type: 'string' },
                  refreshToken: { type: 'string' },
                  expiresAt: { type: 'number', nullable: true },
                  tokenType: { type: 'string' },
                  scope: { type: 'string' },
                  createdAt: { type: 'string', format: 'date-time' },
                  updatedAt: { type: 'string', format: 'date-time' },
                },
              },
            },
          },
        },
      },
    },
    handler: oauthController.getLinkedAccounts.bind(oauthController),
  });

  fastify.post('/oauth/refresh/:provider', {
    preHandler: [authMiddleware.requireAuthentication()],
    schema: {
      tags: ['OAuth Client'],
      summary: 'Refresh provider token',
      description: 'Refresh OAuth access token for specific provider',
      security: [{ Bearer: [] }],
      params: {
        type: 'object',
        properties: {
          provider: {
            type: 'string',
            enum: ['google', 'github', 'microsoft'],
            description: 'OAuth provider name',
          },
        },
        required: ['provider'],
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: {
              type: 'object',
              properties: {
                accessToken: { type: 'string' },
                expiresIn: { type: 'number' },
                tokenType: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.refreshProviderToken.bind(oauthController),
  });

  // OAuth Server Endpoints (when acting as OAuth provider)

  fastify.get('/oauth/authorize', {
    preHandler: [
      authMiddleware.requireAuthentication(),
      validate({ querystring: OAuthServerAuthorizeRequestSchema }),
    ],
    schema: {
      tags: ['OAuth Server'],
      summary: 'OAuth authorization endpoint',
      description: 'OAuth 2.0 authorization endpoint (when acting as provider)',
      security: [{ Bearer: [] }],
      querystring: {
        type: 'object',
        required: ['clientId', 'redirectUri', 'responseType'],
        properties: {
          clientId: { type: 'string', description: 'OAuth client ID' },
          redirectUri: {
            type: 'string',
            format: 'uri',
            description: 'Redirect URI',
          },
          responseType: {
            type: 'string',
            enum: ['code'],
            description: 'OAuth response type',
          },
          scope: { type: 'string', description: 'Requested scopes' },
          state: { type: 'string', description: 'State parameter' },
          codeChallenge: { type: 'string', description: 'PKCE code challenge' },
          codeChallengeMethod: {
            type: 'string',
            enum: ['S256'],
            description: 'PKCE method',
          },
        },
      },
      response: {
        302: {
          description: 'Redirect to client with authorization code',
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.authorize.bind(oauthController),
  });

  fastify.post('/oauth/token', {
    preHandler: [validate({ body: OAuthServerTokenRequestSchema })],
    schema: {
      tags: ['OAuth Server'],
      summary: 'OAuth token endpoint',
      description: 'OAuth 2.0 token endpoint (when acting as provider)',
      body: {
        type: 'object',
        required: ['grantType', 'clientId'],
        properties: {
          grantType: {
            type: 'string',
            enum: ['authorization_code', 'refresh_token', 'client_credentials'],
            description: 'OAuth grant type',
          },
          code: {
            type: 'string',
            description: 'Authorization code (for authorization_code grant)',
          },
          redirectUri: {
            type: 'string',
            format: 'uri',
            description: 'Redirect URI',
          },
          clientId: { type: 'string', description: 'OAuth client ID' },
          clientSecret: { type: 'string', description: 'OAuth client secret' },
          refreshToken: {
            type: 'string',
            description: 'Refresh token (for refresh_token grant)',
          },
          codeVerifier: { type: 'string', description: 'PKCE code verifier' },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            access_token: { type: 'string' },
            token_type: { type: 'string' },
            expires_in: { type: 'number' },
            refresh_token: { type: 'string' },
            scope: { type: 'string' },
          },
        },
        400: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            error_description: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.token.bind(oauthController),
  });

  fastify.get('/oauth/userinfo', {
    preHandler: [authMiddleware.requireAuthentication()],
    schema: {
      tags: ['OAuth Server'],
      summary: 'OAuth user info endpoint',
      description: 'OAuth 2.0 user info endpoint (when acting as provider)',
      security: [{ Bearer: [] }],
      response: {
        200: {
          type: 'object',
          properties: {
            sub: { type: 'string', description: 'Subject identifier' },
            email: { type: 'string', description: 'User email' },
            email_verified: {
              type: 'boolean',
              description: 'Email verification status',
            },
            name: { type: 'string', description: 'Full name' },
            picture: { type: 'string', description: 'Profile picture URL' },
            given_name: { type: 'string', description: 'First name' },
            family_name: { type: 'string', description: 'Last name' },
            locale: { type: 'string', description: 'User locale' },
          },
        },
        401: {
          type: 'object',
          properties: {
            error: { type: 'string' },
            error_description: { type: 'string' },
          },
        },
      },
    },
    handler: oauthController.userInfo.bind(oauthController),
  });
}
