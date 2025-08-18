/**
 * Authentication Routes
 * Defines API endpoints for core authentication operations
 */

import { createAuthorizationMiddleware } from '@company/auth';
import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { AuthorizationService } from '../../application/services/authorization.service';
import { AuthenticationController } from '../controllers/authentication.controller';
import { validate } from '../middleware/validation.middleware';
import {
  ChangePasswordSchema,
  LoginRequestSchema,
  LogoutRequestSchema,
  MFAChallengeRequestSchema,
  MFASetupRequestSchema,
  MFAVerifyRequestSchema,
  PasswordResetConfirmSchema,
  PasswordResetRequestSchema,
  RefreshTokenRequestSchema,
} from '../schemas/auth.schemas';

export interface AuthenticationRoutesOptions extends FastifyPluginOptions {
  authenticationController: AuthenticationController;
  authorizationService: AuthorizationService;
}

export async function authenticationRoutes(
  fastify: FastifyInstance,
  options: AuthenticationRoutesOptions
): Promise<void> {
  const { authenticationController, authorizationService } = options;
  const authMiddleware = createAuthorizationMiddleware(authorizationService);

  // Add authorization helpers to all routes
  await fastify.register(authMiddleware.addAuthorizationHelpers());

  // Public authentication endpoints
  fastify.post('/auth/login', {
    preHandler: [validate({ body: LoginRequestSchema })],
    schema: {
      tags: ['Authentication'],
      summary: 'User login with email and password',
      description:
        'Authenticate user with email/password credentials and return JWT tokens',
      body: {
        type: 'object',
        required: ['email', 'password', 'deviceInfo'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
          },
          password: {
            type: 'string',
            minLength: 8,
            description: 'User password',
          },
          deviceInfo: {
            type: 'object',
            required: ['fingerprint', 'userAgent'],
            properties: {
              fingerprint: {
                type: 'string',
                description: 'Device fingerprint',
              },
              userAgent: { type: 'string', description: 'Browser user agent' },
              platform: {
                type: 'string',
                description: 'Operating system platform',
              },
              browser: { type: 'string', description: 'Browser name' },
              version: { type: 'string', description: 'Browser version' },
              mobile: { type: 'boolean', description: 'Is mobile device' },
              screenResolution: {
                type: 'string',
                description: 'Screen resolution',
              },
              timezone: { type: 'string', description: 'User timezone' },
              language: { type: 'string', description: 'Browser language' },
            },
          },
          rememberMe: {
            type: 'boolean',
            description: 'Extended session duration',
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
                    lastLoginAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
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
                session: {
                  type: 'object',
                  properties: {
                    id: { type: 'string' },
                    expiresAt: { type: 'string', format: 'date-time' },
                    deviceInfo: { type: 'object' },
                  },
                },
                requiresMFA: { type: 'boolean' },
                mfaChallenge: {
                  type: 'object',
                  properties: {
                    challengeId: { type: 'string' },
                    type: { type: 'string', enum: ['totp', 'sms', 'email'] },
                    expiresAt: { type: 'string', format: 'date-time' },
                  },
                },
                riskScore: { type: 'number', minimum: 0, maximum: 100 },
              },
            },
            message: { type: 'string' },
          },
        },
        401: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
            correlationId: { type: 'string' },
          },
        },
      },
    },
    handler: authenticationController.login.bind(authenticationController),
  });

  fastify.post('/auth/refresh', {
    preHandler: [validate({ body: RefreshTokenRequestSchema })],
    schema: {
      tags: ['Authentication'],
      summary: 'Refresh access token',
      description: 'Exchange refresh token for new access token',
      body: {
        type: 'object',
        required: ['refreshToken', 'deviceInfo'],
        properties: {
          refreshToken: { type: 'string', description: 'Valid refresh token' },
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
                tokens: {
                  type: 'object',
                  properties: {
                    accessToken: { type: 'string' },
                    refreshToken: { type: 'string' },
                    expiresIn: { type: 'number' },
                    tokenType: { type: 'string' },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: authenticationController.refreshToken.bind(
      authenticationController
    ),
  });

  fastify.post('/auth/logout', {
    preHandler: [
      authMiddleware.requireAuthenticationHandler(),
      validate({ body: LogoutRequestSchema }),
    ],
    schema: {
      tags: ['Authentication'],
      summary: 'User logout',
      description: 'Terminate user session(s)',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        properties: {
          sessionId: {
            type: 'string',
            description: 'Specific session to terminate',
          },
          allSessions: {
            type: 'boolean',
            description: 'Terminate all user sessions',
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
    handler: authenticationController.logout.bind(authenticationController),
  });

  // Password management endpoints
  fastify.post('/auth/password/reset', {
    preHandler: [validate({ body: PasswordResetRequestSchema })],
    schema: {
      tags: ['Authentication'],
      summary: 'Initiate password reset',
      description: 'Send password reset email to user',
      body: {
        type: 'object',
        required: ['email'],
        properties: {
          email: {
            type: 'string',
            format: 'email',
            description: 'User email address',
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
    handler: authenticationController.initiatePasswordReset.bind(
      authenticationController
    ),
  });

  fastify.post('/auth/password/confirm', {
    preHandler: [validate({ body: PasswordResetConfirmSchema })],
    schema: {
      tags: ['Authentication'],
      summary: 'Confirm password reset',
      description: 'Complete password reset with token and new password',
      body: {
        type: 'object',
        required: ['token', 'password', 'confirmPassword'],
        properties: {
          token: { type: 'string', description: 'Password reset token' },
          password: {
            type: 'string',
            minLength: 8,
            description: 'New password',
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            description: 'Password confirmation',
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
    handler: authenticationController.confirmPasswordReset.bind(
      authenticationController
    ),
  });

  fastify.post('/auth/password/change', {
    preHandler: [
      authMiddleware.requireAuthenticationHandler(),
      validate({ body: ChangePasswordSchema }),
    ],
    schema: {
      tags: ['Authentication'],
      summary: 'Change password',
      description: 'Change password for authenticated user',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['currentPassword', 'newPassword', 'confirmPassword'],
        properties: {
          currentPassword: { type: 'string', description: 'Current password' },
          newPassword: {
            type: 'string',
            minLength: 8,
            description: 'New password',
          },
          confirmPassword: {
            type: 'string',
            minLength: 8,
            description: 'Password confirmation',
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
    handler: authenticationController.changePassword.bind(
      authenticationController
    ),
  });

  // MFA endpoints
  fastify.post('/auth/mfa/setup', {
    preHandler: [
      authMiddleware.requireAuthenticationHandler(),
      validate({ body: MFASetupRequestSchema }),
    ],
    schema: {
      tags: ['Authentication', 'MFA'],
      summary: 'Setup MFA',
      description: 'Initialize MFA setup for user',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['type'],
        properties: {
          type: {
            type: 'string',
            enum: ['totp', 'sms', 'email'],
            description: 'MFA method type',
          },
          phoneNumber: {
            type: 'string',
            description: 'Phone number for SMS MFA',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: authenticationController.setupMFA.bind(authenticationController),
  });

  fastify.post('/auth/mfa/verify', {
    preHandler: [
      authMiddleware.requireAuthenticationHandler(),
      validate({ body: MFAVerifyRequestSchema }),
    ],
    schema: {
      tags: ['Authentication', 'MFA'],
      summary: 'Verify MFA setup',
      description: 'Verify MFA code during setup',
      security: [{ Bearer: [] }],
      body: {
        type: 'object',
        required: ['code', 'type'],
        properties: {
          code: {
            type: 'string',
            minLength: 6,
            maxLength: 6,
            description: 'MFA verification code',
          },
          type: {
            type: 'string',
            enum: ['totp', 'sms', 'email'],
            description: 'MFA method type',
          },
          backupCode: {
            type: 'boolean',
            description: 'Whether this is a backup code',
          },
        },
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            data: { type: 'object' },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: authenticationController.verifyMFA.bind(authenticationController),
  });

  fastify.post('/auth/mfa/challenge', {
    preHandler: [validate({ body: MFAChallengeRequestSchema })],
    schema: {
      tags: ['Authentication', 'MFA'],
      summary: 'Complete MFA challenge',
      description: 'Complete MFA challenge during login',
      body: {
        type: 'object',
        required: ['sessionId', 'code', 'type'],
        properties: {
          sessionId: {
            type: 'string',
            description: 'MFA challenge session ID',
          },
          code: {
            type: 'string',
            minLength: 6,
            maxLength: 6,
            description: 'MFA verification code',
          },
          type: {
            type: 'string',
            enum: ['totp', 'sms', 'email'],
            description: 'MFA method type',
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
                user: { type: 'object' },
                tokens: { type: 'object' },
                session: { type: 'object' },
                riskScore: { type: 'number' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: authenticationController.handleMFAChallenge.bind(
      authenticationController
    ),
  });

  // User profile endpoint
  fastify.get('/auth/profile', {
    preHandler: [authMiddleware.requireAuthenticationHandler()],
    schema: {
      tags: ['Authentication'],
      summary: 'Get user profile',
      description: 'Get current authenticated user profile',
      security: [{ Bearer: [] }],
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
                    lastLoginAt: {
                      type: 'string',
                      format: 'date-time',
                      nullable: true,
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: authenticationController.getProfile.bind(authenticationController),
  });
}
