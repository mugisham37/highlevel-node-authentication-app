/**
 * Swagger/OpenAPI Configuration
 * Comprehensive API documentation configuration with security schemes and examples
 */

import { FastifyDynamicSwaggerOptions } from '@fastify/swagger';
import { FastifySwaggerUiOptions } from '@fastify/swagger-ui';

export const swaggerConfig: FastifyDynamicSwaggerOptions = {
  openapi: {
    openapi: '3.0.3',
    info: {
      title: 'Enterprise Authentication API',
      description: `
# Enterprise Authentication Backend API

A comprehensive, enterprise-grade authentication system built with Node.js and TypeScript. This API provides:

- **Multi-factor Authentication (MFA)** - TOTP, SMS, Email, WebAuthn
- **OAuth2/OpenID Connect** - Google, GitHub, Microsoft providers
- **Passwordless Authentication** - WebAuthn, Magic Links
- **Advanced Security** - Zero-trust architecture, risk scoring, device fingerprinting
- **Session Management** - Redis-backed, concurrent session control
- **Role-Based Access Control (RBAC)** - Hierarchical permissions
- **Real-time Features** - WebSocket integration, event streaming
- **Enterprise Features** - Audit logging, compliance reporting, bulk operations

## Authentication

This API uses JWT Bearer tokens for authentication. Include the token in the Authorization header:

\`\`\`
Authorization: Bearer <your-jwt-token>
\`\`\`

## Rate Limiting

API endpoints are rate-limited based on user tier and risk scoring:
- **Public endpoints**: 100 requests/minute
- **Authenticated endpoints**: 1000 requests/minute
- **Administrative endpoints**: 500 requests/minute

## Error Handling

All API responses follow a consistent format:

\`\`\`json
{
  "success": boolean,
  "data": object | array,
  "message": string,
  "error": string,
  "correlationId": string
}
\`\`\`

## Versioning

The API supports versioning through URL paths:
- Current version: \`/api/v1/\`
- All endpoints are backward compatible within major versions

## Security

- All endpoints use HTTPS in production
- Request/response validation with Zod schemas
- CORS protection with configurable origins
- Security headers (CSP, HSTS, etc.)
- Input sanitization and SQL injection prevention
      `,
      version: '1.0.0',
      contact: {
        name: 'API Support',
        email: 'api-support@example.com',
        url: 'https://docs.example.com/support',
      },
      license: {
        name: 'MIT',
        url: 'https://opensource.org/licenses/MIT',
      },
      termsOfService: 'https://example.com/terms',
    },
    servers: [
      {
        url: 'https://api.example.com',
        description: 'Production server',
      },
      {
        url: 'https://staging-api.example.com',
        description: 'Staging server',
      },
      {
        url: 'http://localhost:3000',
        description: 'Development server',
      },
    ],
    components: {
      securitySchemes: {
        Bearer: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'JWT Bearer token authentication',
        },
        OAuth2: {
          type: 'oauth2',
          description: 'OAuth2 authentication flow',
          flows: {
            authorizationCode: {
              authorizationUrl: '/api/v1/oauth/authorize',
              tokenUrl: '/api/v1/oauth/token',
              scopes: {
                'read:profile': 'Read user profile',
                'write:profile': 'Update user profile',
                'read:users': 'Read user information',
                'write:users': 'Create and update users',
                admin: 'Administrative access',
              },
            },
          },
        },
        ApiKey: {
          type: 'apiKey',
          in: 'header',
          name: 'X-API-Key',
          description: 'API key for service-to-service authentication',
        },
      },
      schemas: {
        Error: {
          type: 'object',
          required: ['success', 'error', 'message'],
          properties: {
            success: {
              type: 'boolean',
              example: false,
            },
            error: {
              type: 'string',
              example: 'VALIDATION_ERROR',
            },
            message: {
              type: 'string',
              example: 'Request validation failed',
            },
            details: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  field: { type: 'string' },
                  message: { type: 'string' },
                  code: { type: 'string' },
                },
              },
            },
            correlationId: {
              type: 'string',
              example: 'req_123456789',
            },
          },
        },
        User: {
          type: 'object',
          required: ['id', 'email', 'emailVerified', 'mfaEnabled', 'createdAt'],
          properties: {
            id: {
              type: 'string',
              example: 'usr_clp123456789',
              description: 'Unique user identifier',
            },
            email: {
              type: 'string',
              format: 'email',
              example: 'user@example.com',
              description: 'User email address',
            },
            name: {
              type: 'string',
              nullable: true,
              example: 'John Doe',
              description: 'User full name',
            },
            image: {
              type: 'string',
              format: 'uri',
              nullable: true,
              example: 'https://example.com/avatar.jpg',
              description: 'User profile image URL',
            },
            emailVerified: {
              type: 'boolean',
              example: true,
              description: 'Email verification status',
            },
            mfaEnabled: {
              type: 'boolean',
              example: false,
              description: 'Multi-factor authentication status',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
              description: 'Account creation timestamp',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
              description: 'Last update timestamp',
            },
            lastLoginAt: {
              type: 'string',
              format: 'date-time',
              nullable: true,
              example: '2024-01-01T00:00:00.000Z',
              description: 'Last login timestamp',
            },
            riskScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 25,
              description: 'User risk score (0-100)',
            },
          },
        },
        TokenPair: {
          type: 'object',
          required: ['accessToken', 'refreshToken', 'expiresIn', 'tokenType'],
          properties: {
            accessToken: {
              type: 'string',
              example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
              description: 'JWT access token',
            },
            refreshToken: {
              type: 'string',
              example: 'rt_clp123456789abcdef',
              description: 'Refresh token for obtaining new access tokens',
            },
            expiresIn: {
              type: 'number',
              example: 3600,
              description: 'Access token expiration time in seconds',
            },
            tokenType: {
              type: 'string',
              example: 'Bearer',
              description: 'Token type',
            },
          },
        },
        Session: {
          type: 'object',
          required: ['id', 'userId', 'expiresAt', 'createdAt', 'isActive'],
          properties: {
            id: {
              type: 'string',
              example: 'ses_clp123456789',
              description: 'Session identifier',
            },
            userId: {
              type: 'string',
              example: 'usr_clp123456789',
              description: 'Associated user ID',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T01:00:00.000Z',
              description: 'Session expiration timestamp',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
              description: 'Session creation timestamp',
            },
            lastActivity: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:30:00.000Z',
              description: 'Last activity timestamp',
            },
            deviceInfo: {
              type: 'object',
              properties: {
                fingerprint: { type: 'string', example: 'fp_abc123' },
                userAgent: { type: 'string', example: 'Mozilla/5.0...' },
                platform: { type: 'string', example: 'Windows' },
                browser: { type: 'string', example: 'Chrome' },
                version: { type: 'string', example: '120.0.0.0' },
                mobile: { type: 'boolean', example: false },
              },
            },
            ipAddress: {
              type: 'string',
              example: '192.168.1.1',
              description: 'Client IP address',
            },
            riskScore: {
              type: 'number',
              minimum: 0,
              maximum: 100,
              example: 15,
              description: 'Session risk score',
            },
            isActive: {
              type: 'boolean',
              example: true,
              description: 'Session active status',
            },
          },
        },
        DeviceInfo: {
          type: 'object',
          required: ['fingerprint', 'userAgent'],
          properties: {
            fingerprint: {
              type: 'string',
              example: 'fp_abc123def456',
              description: 'Unique device fingerprint',
            },
            userAgent: {
              type: 'string',
              example:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              description: 'Browser user agent string',
            },
            platform: {
              type: 'string',
              example: 'Windows',
              description: 'Operating system platform',
            },
            browser: {
              type: 'string',
              example: 'Chrome',
              description: 'Browser name',
            },
            version: {
              type: 'string',
              example: '120.0.0.0',
              description: 'Browser version',
            },
            mobile: {
              type: 'boolean',
              example: false,
              description: 'Mobile device indicator',
            },
            screenResolution: {
              type: 'string',
              example: '1920x1080',
              description: 'Screen resolution',
            },
            timezone: {
              type: 'string',
              example: 'America/New_York',
              description: 'User timezone',
            },
            language: {
              type: 'string',
              example: 'en-US',
              description: 'Browser language',
            },
          },
        },
        Role: {
          type: 'object',
          required: ['id', 'name', 'description'],
          properties: {
            id: {
              type: 'string',
              example: 'rol_clp123456789',
              description: 'Role identifier',
            },
            name: {
              type: 'string',
              example: 'admin',
              description: 'Role name',
            },
            description: {
              type: 'string',
              example: 'Administrator role with full access',
              description: 'Role description',
            },
            permissions: {
              type: 'array',
              items: { $ref: '#/components/schemas/Permission' },
              description: 'Associated permissions',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
        },
        Permission: {
          type: 'object',
          required: ['id', 'name', 'resource', 'action'],
          properties: {
            id: {
              type: 'string',
              example: 'perm_clp123456789',
              description: 'Permission identifier',
            },
            name: {
              type: 'string',
              example: 'users:read',
              description: 'Permission name',
            },
            resource: {
              type: 'string',
              example: 'users',
              description: 'Resource type',
            },
            action: {
              type: 'string',
              example: 'read',
              description: 'Allowed action',
            },
            conditions: {
              type: 'object',
              nullable: true,
              description: 'Optional permission conditions',
            },
          },
        },
        OAuthAccount: {
          type: 'object',
          required: ['id', 'provider', 'providerAccountId', 'type'],
          properties: {
            id: {
              type: 'string',
              example: 'acc_clp123456789',
              description: 'Account identifier',
            },
            provider: {
              type: 'string',
              enum: ['google', 'github', 'microsoft'],
              example: 'google',
              description: 'OAuth provider name',
            },
            providerAccountId: {
              type: 'string',
              example: '1234567890',
              description: 'Provider-specific account ID',
            },
            type: {
              type: 'string',
              enum: ['oauth', 'oidc'],
              example: 'oauth',
              description: 'Account type',
            },
            accessToken: {
              type: 'string',
              example: 'ya29.a0AfH6SMC...',
              description: 'OAuth access token',
            },
            refreshToken: {
              type: 'string',
              nullable: true,
              example: '1//04...',
              description: 'OAuth refresh token',
            },
            expiresAt: {
              type: 'number',
              nullable: true,
              example: 1640995200,
              description: 'Token expiration timestamp',
            },
            tokenType: {
              type: 'string',
              example: 'Bearer',
              description: 'Token type',
            },
            scope: {
              type: 'string',
              example: 'openid email profile',
              description: 'Granted scopes',
            },
            createdAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
            updatedAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:00:00.000Z',
            },
          },
        },
        MFAChallenge: {
          type: 'object',
          required: ['challengeId', 'type', 'expiresAt'],
          properties: {
            challengeId: {
              type: 'string',
              example: 'mfa_clp123456789',
              description: 'MFA challenge identifier',
            },
            type: {
              type: 'string',
              enum: ['totp', 'sms', 'email', 'webauthn'],
              example: 'totp',
              description: 'MFA method type',
            },
            expiresAt: {
              type: 'string',
              format: 'date-time',
              example: '2024-01-01T00:05:00.000Z',
              description: 'Challenge expiration time',
            },
            metadata: {
              type: 'object',
              description: 'Challenge-specific metadata',
            },
          },
        },
      },
      examples: {
        LoginRequest: {
          summary: 'Standard login request',
          value: {
            email: 'user@example.com',
            password: 'SecurePassword123!',
            deviceInfo: {
              fingerprint: 'fp_abc123def456',
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
              platform: 'Windows',
              browser: 'Chrome',
              version: '120.0.0.0',
              mobile: false,
              screenResolution: '1920x1080',
              timezone: 'America/New_York',
              language: 'en-US',
            },
            rememberMe: false,
          },
        },
        LoginResponse: {
          summary: 'Successful login response',
          value: {
            success: true,
            data: {
              user: {
                id: 'usr_clp123456789',
                email: 'user@example.com',
                name: 'John Doe',
                image: 'https://example.com/avatar.jpg',
                emailVerified: true,
                mfaEnabled: false,
                createdAt: '2024-01-01T00:00:00.000Z',
                lastLoginAt: '2024-01-01T12:00:00.000Z',
              },
              tokens: {
                accessToken: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
                refreshToken: 'rt_clp123456789abcdef',
                expiresIn: 3600,
                tokenType: 'Bearer',
              },
              session: {
                id: 'ses_clp123456789',
                expiresAt: '2024-01-01T13:00:00.000Z',
                deviceInfo: {
                  fingerprint: 'fp_abc123def456',
                  userAgent: 'Mozilla/5.0...',
                  platform: 'Windows',
                  browser: 'Chrome',
                },
              },
              requiresMFA: false,
              riskScore: 25,
            },
            message: 'Login successful',
          },
        },
        MFARequiredResponse: {
          summary: 'MFA required response',
          value: {
            success: true,
            data: {
              requiresMFA: true,
              mfaChallenge: {
                challengeId: 'mfa_clp123456789',
                type: 'totp',
                expiresAt: '2024-01-01T00:05:00.000Z',
              },
              riskScore: 75,
            },
            message: 'MFA verification required',
          },
        },
        ValidationError: {
          summary: 'Validation error response',
          value: {
            success: false,
            error: 'VALIDATION_ERROR',
            message: 'Request validation failed',
            details: [
              {
                field: 'email',
                message: 'Invalid email format',
                code: 'invalid_format',
              },
              {
                field: 'password',
                message: 'Password must be at least 8 characters',
                code: 'min_length',
              },
            ],
            correlationId: 'req_123456789',
          },
        },
        AuthenticationError: {
          summary: 'Authentication error response',
          value: {
            success: false,
            error: 'AUTHENTICATION_FAILED',
            message: 'Invalid credentials',
            correlationId: 'req_123456789',
          },
        },
        RateLimitError: {
          summary: 'Rate limit error response',
          value: {
            success: false,
            error: 'RATE_LIMIT_EXCEEDED',
            message: 'Too many requests',
            correlationId: 'req_123456789',
          },
        },
      },
    },
    tags: [
      {
        name: 'Authentication',
        description:
          'Core authentication operations - login, logout, token management',
      },
      {
        name: 'MFA',
        description: 'Multi-factor authentication setup and verification',
      },
      {
        name: 'OAuth Client',
        description:
          'OAuth2/OpenID Connect client operations for external providers',
      },
      {
        name: 'OAuth Server',
        description:
          'OAuth2/OpenID Connect server operations (acting as provider)',
      },
      {
        name: 'Passwordless',
        description: 'Passwordless authentication - WebAuthn, magic links',
      },
      {
        name: 'User Management',
        description: 'User CRUD operations, role assignment, bulk operations',
      },
      {
        name: 'Role Management',
        description: 'Role and permission management',
      },
      {
        name: 'Admin',
        description: 'Administrative operations and system management',
      },
      {
        name: 'Webhooks',
        description: 'Webhook registration and event streaming',
      },
      {
        name: 'Security',
        description: 'Security compliance and audit operations',
      },
      {
        name: 'Health',
        description: 'System health and monitoring endpoints',
      },
      {
        name: 'Documentation',
        description: 'API documentation and integration resources',
      },
    ],
    externalDocs: {
      description: 'Complete Integration Guide',
      url: 'https://docs.example.com/integration-guide',
    },
  },
  hideUntagged: true,
  exposeRoute: true,
};

export const swaggerUiConfig: FastifySwaggerUiOptions = {
  routePrefix: '/docs',
  uiConfig: {
    docExpansion: 'list',
    deepLinking: true,
    defaultModelRendering: 'example',
    defaultModelsExpandDepth: 2,
    defaultModelExpandDepth: 2,
    displayOperationId: true,
    displayRequestDuration: true,
    filter: true,
    showExtensions: true,
    showCommonExtensions: true,
    tryItOutEnabled: true,
    requestSnippetsEnabled: true,
    syntaxHighlight: {
      activate: true,
      theme: 'agate',
    },
    layout: 'BaseLayout',
    plugins: [
      {
        name: 'topbar',
        version: '1.0.0',
      },
    ],
  },
  uiHooks: {
    onRequest: async (request, reply) => {
      // Add custom headers for documentation
      reply.header('X-Documentation-Version', '1.0.0');
    },
  },
  staticCSP: true,
  transformStaticCSP: (header) => header,
  transformSpecification: (swaggerObject, request, reply) => {
    // Add request-specific information to the spec
    const host = request.headers.host;
    if (host && !swaggerObject.servers?.some((s) => s.url.includes(host))) {
      swaggerObject.servers = swaggerObject.servers || [];
      swaggerObject.servers.unshift({
        url: `${request.protocol}://${host}`,
        description: 'Current server',
      });
    }
    return swaggerObject;
  },
  transformSpecificationClone: true,
};
