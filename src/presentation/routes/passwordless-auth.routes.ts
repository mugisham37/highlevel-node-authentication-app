/**
 * Passwordless Authentication Routes
 * Defines HTTP routes for passwordless authentication endpoints
 */

import { FastifyInstance, FastifyPluginOptions } from 'fastify';
import { PasswordlessAuthController } from '../controllers/passwordless-auth.controller';

export async function passwordlessAuthRoutes(
  fastify: FastifyInstance,
  options: FastifyPluginOptions & {
    passwordlessAuthController: PasswordlessAuthController;
  }
): Promise<void> {
  const { passwordlessAuthController } = options;

  // Passwordless Authentication Flow Routes

  /**
   * POST /api/auth/passwordless/initiate
   * Initiate passwordless authentication flow
   */
  fastify.post('/initiate', {
    schema: {
      description: 'Initiate passwordless authentication flow',
      tags: ['Passwordless Authentication'],
      body: {
        type: 'object',
        required: ['email', 'deviceInfo', 'origin'],
        properties: {
          email: { type: 'string', format: 'email' },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          origin: { type: 'string', format: 'uri' },
          userAgent: { type: 'string' },
          ipAddress: { type: 'string' },
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
                challengeId: { type: 'string' },
                webAuthnOptions: { type: 'object' },
                magicLinkSent: { type: 'boolean' },
                fallbackMethods: { type: 'array', items: { type: 'string' } },
                requiresRegistration: { type: 'boolean' },
              },
            },
          },
        },
        400: {
          type: 'object',
          properties: {
            success: { type: 'boolean' },
            error: { type: 'string' },
            message: { type: 'string' },
            fallbackMethods: { type: 'array', items: { type: 'string' } },
            requiresRegistration: { type: 'boolean' },
          },
        },
      },
    },
    handler: passwordlessAuthController.initiatePasswordlessAuth.bind(
      passwordlessAuthController
    ),
  });

  /**
   * POST /api/auth/passwordless/magic-link
   * Send magic link for passwordless authentication
   */
  fastify.post('/magic-link', {
    schema: {
      description: 'Send magic link for passwordless authentication',
      tags: ['Passwordless Authentication'],
      body: {
        type: 'object',
        required: ['email', 'deviceInfo'],
        properties: {
          email: { type: 'string', format: 'email' },
          redirectUrl: { type: 'string', format: 'uri' },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          ipAddress: { type: 'string' },
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
                linkSent: { type: 'boolean' },
                expiresAt: { type: 'string', format: 'date-time' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.sendMagicLink.bind(
      passwordlessAuthController
    ),
  });

  /**
   * POST /api/auth/passwordless/magic-link/verify
   * Verify magic link token
   */
  fastify.post('/magic-link/verify', {
    schema: {
      description: 'Verify magic link token',
      tags: ['Passwordless Authentication'],
      body: {
        type: 'object',
        required: ['token', 'deviceInfo'],
        properties: {
          token: { type: 'string' },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          ipAddress: { type: 'string' },
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
                    name: { type: 'string' },
                    emailVerified: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.verifyMagicLink.bind(
      passwordlessAuthController
    ),
  });

  // WebAuthn Routes

  /**
   * POST /api/auth/passwordless/webauthn/register
   * Register WebAuthn credential
   */
  fastify.post('/webauthn/register', {
    schema: {
      description:
        'Register WebAuthn credential for passwordless authentication',
      tags: ['WebAuthn'],
      body: {
        type: 'object',
        required: ['userId', 'credentialName', 'deviceInfo', 'origin'],
        properties: {
          userId: { type: 'string' },
          credentialName: { type: 'string' },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          origin: { type: 'string', format: 'uri' },
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
                registrationOptions: { type: 'object' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.registerWebAuthnCredential.bind(
      passwordlessAuthController
    ),
  });

  /**
   * POST /api/auth/passwordless/webauthn/register/complete
   * Complete WebAuthn credential registration
   */
  fastify.post('/webauthn/register/complete', {
    schema: {
      description: 'Complete WebAuthn credential registration',
      tags: ['WebAuthn'],
      body: {
        type: 'object',
        required: ['challengeId', 'registrationResponse', 'deviceInfo'],
        properties: {
          challengeId: { type: 'string' },
          registrationResponse: { type: 'object' },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
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
                credentialId: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.completeWebAuthnRegistration.bind(
      passwordlessAuthController
    ),
  });

  /**
   * POST /api/auth/passwordless/webauthn/authenticate
   * Authenticate with WebAuthn
   */
  fastify.post('/webauthn/authenticate', {
    schema: {
      description: 'Authenticate using WebAuthn credential',
      tags: ['WebAuthn'],
      body: {
        type: 'object',
        required: ['challengeId', 'authenticationResponse', 'deviceInfo'],
        properties: {
          challengeId: { type: 'string' },
          authenticationResponse: { type: 'object' },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
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
                    name: { type: 'string' },
                    emailVerified: { type: 'string', format: 'date-time' },
                  },
                },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.authenticateWithWebAuthn.bind(
      passwordlessAuthController
    ),
  });

  // Biometric Authentication Routes

  /**
   * POST /api/auth/passwordless/biometric/initiate
   * Initiate biometric authentication
   */
  fastify.post('/biometric/initiate', {
    schema: {
      description: 'Initiate biometric authentication',
      tags: ['Biometric Authentication'],
      body: {
        type: 'object',
        required: ['userId', 'biometricType', 'deviceInfo', 'origin'],
        properties: {
          userId: { type: 'string' },
          biometricType: {
            type: 'string',
            enum: ['fingerprint', 'face', 'voice'],
          },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          origin: { type: 'string', format: 'uri' },
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
                biometricChallenge: { type: 'object' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.initiateBiometricAuth.bind(
      passwordlessAuthController
    ),
  });

  // Device Management Routes

  /**
   * GET /api/auth/passwordless/devices/:userId
   * Get user's registered devices
   */
  fastify.get('/devices/:userId', {
    schema: {
      description:
        "Get user's registered devices for passwordless authentication",
      tags: ['Device Management'],
      params: {
        type: 'object',
        required: ['userId'],
        properties: {
          userId: { type: 'string' },
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
                devices: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      deviceName: { type: 'string' },
                      deviceType: { type: 'string' },
                      platform: { type: 'string' },
                      browser: { type: 'string' },
                      trusted: { type: 'boolean' },
                      registeredAt: { type: 'string', format: 'date-time' },
                      lastUsedAt: { type: 'string', format: 'date-time' },
                      riskScore: { type: 'number' },
                    },
                  },
                },
              },
            },
          },
        },
      },
    },
    handler: passwordlessAuthController.getUserDevices.bind(
      passwordlessAuthController
    ),
  });

  /**
   * DELETE /api/auth/passwordless/devices/:userId/:deviceId
   * Remove a registered device
   */
  fastify.delete('/devices/:userId/:deviceId', {
    schema: {
      description: 'Remove a registered device',
      tags: ['Device Management'],
      params: {
        type: 'object',
        required: ['userId', 'deviceId'],
        properties: {
          userId: { type: 'string' },
          deviceId: { type: 'string' },
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
    handler: passwordlessAuthController.removeDevice.bind(
      passwordlessAuthController
    ),
  });

  // Fallback Authentication Routes

  /**
   * POST /api/auth/passwordless/fallback
   * Initiate fallback authentication
   */
  fastify.post('/fallback', {
    schema: {
      description: 'Initiate fallback authentication when passwordless fails',
      tags: ['Fallback Authentication'],
      body: {
        type: 'object',
        required: ['email', 'method', 'deviceInfo'],
        properties: {
          email: { type: 'string', format: 'email' },
          method: {
            type: 'string',
            enum: [
              'email_code',
              'password_reset',
              'account_recovery',
              'support_contact',
            ],
          },
          deviceInfo: {
            type: 'object',
            required: [
              'fingerprint',
              'userAgent',
              'platform',
              'browser',
              'version',
              'isMobile',
            ],
            properties: {
              fingerprint: { type: 'string' },
              userAgent: { type: 'string' },
              platform: { type: 'string' },
              browser: { type: 'string' },
              version: { type: 'string' },
              isMobile: { type: 'boolean' },
              screenResolution: { type: 'string' },
              timezone: { type: 'string' },
            },
          },
          ipAddress: { type: 'string' },
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
                method: { type: 'string' },
                challengeId: { type: 'string' },
                nextSteps: { type: 'array', items: { type: 'string' } },
                estimatedTime: { type: 'string' },
              },
            },
            message: { type: 'string' },
          },
        },
      },
    },
    handler: passwordlessAuthController.initiateFallbackAuth.bind(
      passwordlessAuthController
    ),
  });

  /**
   * GET /api/auth/passwordless/fallback/methods
   * Get available fallback methods
   */
  fastify.get('/fallback/methods', {
    schema: {
      description: 'Get available fallback authentication methods',
      tags: ['Fallback Authentication'],
      querystring: {
        type: 'object',
        required: ['email'],
        properties: {
          email: { type: 'string', format: 'email' },
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
                methods: { type: 'array', items: { type: 'string' } },
                recommendations: { type: 'array', items: { type: 'string' } },
              },
            },
          },
        },
      },
    },
    handler: passwordlessAuthController.getFallbackMethods.bind(
      passwordlessAuthController
    ),
  });
}
