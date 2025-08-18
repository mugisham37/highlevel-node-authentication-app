/**
 * Passwordless Authentication Controller
 * Handles HTTP requests for passwordless authentication flows
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { Logger } from 'winston';
import { z } from 'zod';
import { PasswordlessAuthService } from '../../application/services/passwordless-auth.service';
import { DeviceManagementService } from '../../application/services/device-management.service';
import { FallbackAuthService } from '../../application/services/fallback-auth.service';
import { DeviceInfo } from "@company/shared"entities/user';

// Helper function to filter out undefined values from deviceInfo
function filterDeviceInfo(deviceInfo: any): DeviceInfo {
  const filtered: DeviceInfo = {
    fingerprint: deviceInfo.fingerprint,
    userAgent: deviceInfo.userAgent,
    isMobile: deviceInfo.isMobile,
  };
  
  if (deviceInfo.platform !== undefined) filtered.platform = deviceInfo.platform;
  if (deviceInfo.browser !== undefined) filtered.browser = deviceInfo.browser;
  if (deviceInfo.version !== undefined) filtered.version = deviceInfo.version;
  if (deviceInfo.mobile !== undefined) filtered.mobile = deviceInfo.mobile;
  if (deviceInfo.screenResolution !== undefined) filtered.screenResolution = deviceInfo.screenResolution;
  if (deviceInfo.timezone !== undefined) filtered.timezone = deviceInfo.timezone;
  if (deviceInfo.language !== undefined) filtered.language = deviceInfo.language;
  
  return filtered;
}

// Request validation schemas
const DeviceInfoSchema = z.object({
  fingerprint: z.string().min(1),
  userAgent: z.string().min(1),
  platform: z.string().optional(),
  browser: z.string().optional(),
  version: z.string().optional(),
  isMobile: z.boolean(),
  mobile: z.boolean().optional(), // For backward compatibility
  screenResolution: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

const InitiatePasswordlessAuthSchema = z.object({
  email: z.string().email(),
  deviceInfo: DeviceInfoSchema,
  origin: z.string().url(),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
});

const MagicLinkRequestSchema = z.object({
  email: z.string().email(),
  redirectUrl: z.string().url().optional(),
  deviceInfo: DeviceInfoSchema,
  ipAddress: z.string().optional(),
});

const VerifyMagicLinkSchema = z.object({
  token: z.string().min(1),
  deviceInfo: DeviceInfoSchema,
  ipAddress: z.string().optional(),
});

const WebAuthnRegistrationSchema = z.object({
  userId: z.string().min(1),
  credentialName: z.string().min(1),
  deviceInfo: DeviceInfoSchema,
  origin: z.string().url(),
});

const CompleteWebAuthnRegistrationSchema = z.object({
  challengeId: z.string().min(1),
  registrationResponse: z.any(), // WebAuthn registration response
  deviceInfo: DeviceInfoSchema,
});

const WebAuthnAuthenticationSchema = z.object({
  challengeId: z.string().min(1),
  authenticationResponse: z.any(), // WebAuthn authentication response
  deviceInfo: DeviceInfoSchema,
});

const BiometricAuthSchema = z.object({
  userId: z.string().min(1),
  biometricType: z.enum(['fingerprint', 'face', 'voice']),
  deviceInfo: DeviceInfoSchema,
  origin: z.string().url(),
});

const FallbackAuthSchema = z.object({
  email: z.string().email(),
  method: z.enum([
    'email_code',
    'password_reset',
    'account_recovery',
    'support_contact',
  ]),
  deviceInfo: DeviceInfoSchema,
  ipAddress: z.string().optional(),
  reason: z.string().optional(),
});

export class PasswordlessAuthController {
  constructor(
    private readonly passwordlessAuthService: PasswordlessAuthService,
    private readonly deviceManagementService: DeviceManagementService,
    private readonly fallbackAuthService: FallbackAuthService,
    private readonly logger: Logger
  ) {}

  /**
   * Initiate passwordless authentication flow
   */
  async initiatePasswordlessAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = InitiatePasswordlessAuthSchema.safeParse(
        request.body
      );
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { email, deviceInfo, origin, userAgent, ipAddress } =
        validationResult.data;

      // Add IP address from request if not provided
      const clientIP = ipAddress || request.ip;

      const requestData: any = {
        email,
        deviceInfo: filterDeviceInfo(deviceInfo),
        origin,
        ipAddress: clientIP,
      };
      
      if (userAgent !== undefined) {
        requestData.userAgent = userAgent;
      }

      const result =
        await this.passwordlessAuthService.initiatePasswordlessAuth(requestData);

      if (result.success) {
        reply.status(200).send({
          success: true,
          data: {
            challengeId: result.challengeId,
            webAuthnOptions: result.webAuthnOptions,
            magicLinkSent: result.magicLinkSent,
            fallbackMethods: result.fallbackMethods,
            requiresRegistration: result.requiresRegistration,
          },
        });
      } else {
        const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
        reply.status(statusCode).send({
          success: false,
          error: result.error?.code || 'PASSWORDLESS_AUTH_FAILED',
          message:
            result.error?.message || 'Passwordless authentication failed',
          fallbackMethods: result.fallbackMethods,
          requiresRegistration: result.requiresRegistration,
        });
      }
    } catch (error) {
      this.logger.error('Initiate passwordless auth error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Send magic link for passwordless authentication
   */
  async sendMagicLink(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = MagicLinkRequestSchema.safeParse(request.body);
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { email, redirectUrl, deviceInfo, ipAddress } =
        validationResult.data;

      // Add IP address from request if not provided
      const clientIP = ipAddress || request.ip;

      const requestData: any = {
        email,
        deviceInfo: filterDeviceInfo(deviceInfo),
        ipAddress: clientIP,
      };
      
      if (redirectUrl !== undefined) {
        requestData.redirectUrl = redirectUrl;
      }

      const result = await this.passwordlessAuthService.sendMagicLink(requestData);

      if (result.success) {
        reply.status(200).send({
          success: true,
          data: {
            linkSent: result.linkSent,
            expiresAt: result.expiresAt,
          },
          message: 'Magic link sent successfully',
        });
      } else {
        reply.status(400).send({
          success: false,
          error: result.error?.code || 'MAGIC_LINK_FAILED',
          message: result.error?.message || 'Failed to send magic link',
        });
      }
    } catch (error) {
      this.logger.error('Send magic link error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Verify magic link token
   */
  async verifyMagicLink(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = VerifyMagicLinkSchema.safeParse(request.body);
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { token, deviceInfo, ipAddress } = validationResult.data;

      // Add IP address from request if not provided
      const clientIP = ipAddress || request.ip;

      const result = await this.passwordlessAuthService.verifyMagicLink(
        token,
        filterDeviceInfo(deviceInfo),
        clientIP
      );

      if (result.success && result.user) {
        reply.status(200).send({
          success: true,
          data: {
            user: {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              emailVerified: result.user.emailVerified,
            },
          },
          message: 'Magic link verified successfully',
        });
      } else {
        const statusCode =
          result.error?.code === 'INVALID_MAGIC_LINK' ? 400 : 401;
        reply.status(statusCode).send({
          success: false,
          error: result.error?.code || 'MAGIC_LINK_VERIFICATION_FAILED',
          message: result.error?.message || 'Magic link verification failed',
        });
      }
    } catch (error) {
      this.logger.error('Verify magic link error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Register WebAuthn credential
   */
  async registerWebAuthnCredential(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = WebAuthnRegistrationSchema.safeParse(
        request.body
      );
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { userId, credentialName, deviceInfo, origin } =
        validationResult.data;

      const result =
        await this.passwordlessAuthService.registerWebAuthnCredential({
          userId,
          credentialName,
          deviceInfo: filterDeviceInfo(deviceInfo),
          origin,
        });

      if (result.success) {
        reply.status(200).send({
          success: true,
          data: {
            registrationOptions: result.registrationOptions,
          },
          message: 'WebAuthn registration options generated',
        });
      } else {
        const statusCode = result.error?.code === 'USER_NOT_FOUND' ? 404 : 400;
        reply.status(statusCode).send({
          success: false,
          error: result.error?.code || 'WEBAUTHN_REGISTRATION_FAILED',
          message: result.error?.message || 'WebAuthn registration failed',
        });
      }
    } catch (error) {
      this.logger.error('Register WebAuthn credential error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Complete WebAuthn credential registration
   */
  async completeWebAuthnRegistration(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = CompleteWebAuthnRegistrationSchema.safeParse(
        request.body
      );
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { challengeId, registrationResponse, deviceInfo } =
        validationResult.data;

      const result =
        await this.passwordlessAuthService.completeWebAuthnRegistration(
          challengeId,
          registrationResponse,
          filterDeviceInfo(deviceInfo)
        );

      if (result.success) {
        reply.status(200).send({
          success: true,
          data: {
            credentialId: result.credentialId,
          },
          message: 'WebAuthn credential registered successfully',
        });
      } else {
        const statusCode =
          result.error?.code === 'CHALLENGE_NOT_FOUND' ? 404 : 400;
        reply.status(statusCode).send({
          success: false,
          error:
            result.error?.code || 'WEBAUTHN_REGISTRATION_COMPLETION_FAILED',
          message:
            result.error?.message || 'WebAuthn registration completion failed',
        });
      }
    } catch (error) {
      this.logger.error('Complete WebAuthn registration error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Authenticate with WebAuthn
   */
  async authenticateWithWebAuthn(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = WebAuthnAuthenticationSchema.safeParse(
        request.body
      );
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { challengeId, authenticationResponse, deviceInfo } =
        validationResult.data;

      const result =
        await this.passwordlessAuthService.authenticateWithWebAuthn(
          challengeId,
          authenticationResponse,
          filterDeviceInfo(deviceInfo)
        );

      if (result.success && result.user) {
        reply.status(200).send({
          success: true,
          data: {
            user: {
              id: result.user.id,
              email: result.user.email,
              name: result.user.name,
              emailVerified: result.user.emailVerified,
            },
          },
          message: 'WebAuthn authentication successful',
        });
      } else {
        const statusCode =
          result.error?.code === 'CHALLENGE_NOT_FOUND' ? 404 : 401;
        reply.status(statusCode).send({
          success: false,
          error: result.error?.code || 'WEBAUTHN_AUTH_FAILED',
          message: result.error?.message || 'WebAuthn authentication failed',
        });
      }
    } catch (error) {
      this.logger.error('WebAuthn authentication error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Initiate biometric authentication
   */
  async initiateBiometricAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = BiometricAuthSchema.safeParse(request.body);
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { userId, biometricType, deviceInfo, origin } =
        validationResult.data;

      const result = await this.passwordlessAuthService.initiateBiometricAuth({
        userId,
        biometricType,
        deviceInfo: filterDeviceInfo(deviceInfo),
        origin,
      });

      if (result.success) {
        reply.status(200).send({
          success: true,
          data: {
            biometricChallenge: result.biometricChallenge,
          },
          message: 'Biometric authentication initiated',
        });
      } else {
        const statusCode = result.fallbackRequired ? 400 : 500;
        reply.status(statusCode).send({
          success: false,
          error: result.error?.code || 'BIOMETRIC_AUTH_FAILED',
          message: result.error?.message || 'Biometric authentication failed',
          fallbackRequired: result.fallbackRequired,
        });
      }
    } catch (error) {
      this.logger.error('Initiate biometric auth error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Get user's registered devices
   */
  async getUserDevices(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId } = request.params as { userId: string };

      if (!userId) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'User ID is required',
        });
        return;
      }

      const devices = await this.deviceManagementService.getUserDevices(userId);

      reply.status(200).send({
        success: true,
        data: {
          devices: devices.map((device) => ({
            id: device.id,
            deviceName: device.deviceName,
            deviceType: device.deviceType,
            platform: device.platform,
            browser: device.browser,
            trusted: device.trusted,
            registeredAt: device.registeredAt,
            lastUsedAt: device.lastUsedAt,
            riskScore: device.riskScore,
          })),
        },
      });
    } catch (error) {
      this.logger.error('Get user devices error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Remove a registered device
   */
  async removeDevice(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { userId, deviceId } = request.params as {
        userId: string;
        deviceId: string;
      };

      if (!userId || !deviceId) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'User ID and Device ID are required',
        });
        return;
      }

      const removed = await this.deviceManagementService.removeDevice(
        userId,
        deviceId
      );

      if (removed) {
        reply.status(200).send({
          success: true,
          message: 'Device removed successfully',
        });
      } else {
        reply.status(404).send({
          success: false,
          error: 'DEVICE_NOT_FOUND',
          message: 'Device not found or access denied',
        });
      }
    } catch (error) {
      this.logger.error('Remove device error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Initiate fallback authentication
   */
  async initiateFallbackAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Validate request body
      const validationResult = FallbackAuthSchema.safeParse(request.body);
      if (!validationResult.success) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Invalid request data',
          details: validationResult.error.errors,
        });
        return;
      }

      const { email, method, deviceInfo, ipAddress, reason } =
        validationResult.data;

      // Add IP address from request if not provided
      const clientIP = ipAddress || request.ip;

      const requestData: any = {
        email,
        method,
        deviceInfo: filterDeviceInfo(deviceInfo),
        ipAddress: clientIP,
      };
      
      if (reason !== undefined) {
        requestData.reason = reason;
      }

      const result = await this.fallbackAuthService.initiateFallbackAuth(requestData);

      if (result.success) {
        reply.status(200).send({
          success: true,
          data: {
            method: result.method,
            challengeId: result.challengeId,
            nextSteps: result.nextSteps,
            estimatedTime: result.estimatedTime,
          },
          message: result.message,
        });
      } else {
        reply.status(400).send({
          success: false,
          error: result.error?.code || 'FALLBACK_AUTH_FAILED',
          message: result.error?.message || 'Fallback authentication failed',
        });
      }
    } catch (error) {
      this.logger.error('Initiate fallback auth error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }

  /**
   * Get available fallback methods
   */
  async getFallbackMethods(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { email } = request.query as { email: string };

      if (!email) {
        reply.status(400).send({
          success: false,
          error: 'VALIDATION_ERROR',
          message: 'Email is required',
        });
        return;
      }

      const result =
        await this.fallbackAuthService.getAvailableFallbackMethods(email);

      reply.status(200).send({
        success: true,
        data: {
          methods: result.methods,
          recommendations: result.recommendations,
        },
      });
    } catch (error) {
      this.logger.error('Get fallback methods error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        path: request.url,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error',
      });
    }
  }
}

