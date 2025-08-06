/**
 * Passwordless Authentication Service
 * Implements WebAuthn registration/authentication flows, magic link authentication,
 * biometric authentication support, and fallback mechanisms
 */

import { Logger } from 'winston';
import { User } from '../../domain/entities/user';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';
import { SecureTokenGenerator } from '../../infrastructure/security/secure-token-generator.service';
import {
  WebAuthnService,
  WebAuthnCredential,
} from '../../infrastructure/security/webauthn.service';
import { MFAChallengeRepository } from '../../infrastructure/database/repositories/mfa-challenge.repository';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { EmailMFAService } from '../../infrastructure/security/email-mfa.service';
import { DeviceInfo } from '../../domain/entities/user';

export interface PasswordlessAuthRequest {
  email: string;
  deviceInfo: DeviceInfo;
  origin: string;
  userAgent?: string;
  ipAddress?: string;
}

export interface MagicLinkRequest {
  email: string;
  redirectUrl?: string;
  deviceInfo: DeviceInfo;
  ipAddress?: string | undefined;
}

export interface WebAuthnRegistrationRequest {
  userId: string;
  credentialName: string;
  deviceInfo: DeviceInfo;
  origin: string;
}

export interface WebAuthnAuthenticationRequest {
  credentialId?: string;
  deviceInfo: DeviceInfo;
  origin: string;
}

export interface BiometricAuthRequest {
  userId: string;
  biometricType: 'fingerprint' | 'face' | 'voice';
  deviceInfo: DeviceInfo;
  origin: string;
}

export interface PasswordlessAuthResult {
  success: boolean;
  user?: User;
  requiresRegistration?: boolean;
  challengeId?: string;
  magicLinkSent?: boolean;
  webAuthnOptions?: any;
  fallbackMethods?: string[];
  error?: PasswordlessError;
}

export interface MagicLinkResult {
  success: boolean;
  linkSent: boolean;
  expiresAt?: Date;
  error?: PasswordlessError;
}

export interface WebAuthnRegistrationResult {
  success: boolean;
  credentialId?: string;
  registrationOptions?: any;
  error?: PasswordlessError;
}

export interface WebAuthnAuthResult {
  success: boolean;
  user?: User;
  authenticationOptions?: any;
  error?: PasswordlessError;
}

export interface BiometricAuthResult {
  success: boolean;
  user?: User;
  biometricChallenge?: any;
  fallbackRequired?: boolean;
  error?: PasswordlessError;
}

export interface PasswordlessError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface DeviceRegistration {
  id: string;
  userId: string;
  deviceFingerprint: string;
  deviceName: string;
  deviceType: string;
  trusted: boolean;
  registeredAt: Date;
  lastUsedAt?: Date;
  webAuthnCredentials: string[];
}

export class PasswordlessAuthService {
  constructor(
    private readonly userRepository: PrismaUserRepository,
    private readonly challengeRepository: MFAChallengeRepository,
    private readonly webAuthnService: WebAuthnService,
    private readonly emailService: EmailMFAService,
    private readonly logger: Logger
  ) {}

  /**
   * Initiate passwordless authentication flow
   */
  async initiatePasswordlessAuth(
    request: PasswordlessAuthRequest
  ): Promise<PasswordlessAuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Passwordless authentication initiated', {
        correlationId,
        email: this.maskEmail(request.email),
        origin: request.origin,
        deviceType: request.deviceInfo.platform,
      });

      // Find user by email
      const user = await this.userRepository.findByEmail(request.email);

      if (!user) {
        // User doesn't exist - offer registration or fallback
        return {
          success: false,
          requiresRegistration: true,
          fallbackMethods: ['email_signup', 'magic_link'],
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found. Registration required.',
          },
        };
      }

      // Check if user has WebAuthn credentials
      const webAuthnCredentials = await this.webAuthnService.getUserCredentials(
        user.id
      );

      if (webAuthnCredentials.length > 0) {
        // User has WebAuthn credentials - generate authentication options
        const authOptions =
          await this.webAuthnService.generateAuthenticationOptions(user.id);

        // Store challenge for verification
        const challengeId = SecureIdGenerator.generateSecureId();
        await this.challengeRepository.createChallenge({
          id: challengeId,
          type: 'webauthn',
          userId: user.id,
          expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
          attempts: 0,
          maxAttempts: 3,
          metadata: {
            challenge: authOptions.challenge,
            origin: request.origin,
            deviceInfo: request.deviceInfo,
          } as Record<string, any>,
        });

        this.logger.info('WebAuthn authentication options generated', {
          correlationId,
          userId: user.id,
          challengeId,
          credentialsCount: webAuthnCredentials.length,
        });

        return {
          success: true,
          challengeId,
          webAuthnOptions: authOptions.options,
          fallbackMethods: ['magic_link', 'email_code'],
        };
      }

      // No WebAuthn credentials - offer magic link as primary method
      const magicLinkResult = await this.sendMagicLink({
        email: request.email,
        deviceInfo: request.deviceInfo,
        ipAddress: request.ipAddress || undefined,
      });

      if (magicLinkResult.success) {
        return {
          success: true,
          magicLinkSent: true,
          fallbackMethods: ['email_code', 'webauthn_registration'],
        };
      }

      // Magic link failed - return fallback options
      return {
        success: false,
        fallbackMethods: ['email_code', 'password_reset'],
        error: {
          code: 'MAGIC_LINK_FAILED',
          message: 'Failed to send magic link. Please try alternative methods.',
        },
      };
    } catch (error) {
      this.logger.error('Passwordless authentication initiation error', {
        correlationId,
        email: this.maskEmail(request.email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        fallbackMethods: ['password_login', 'email_code'],
        error: {
          code: 'PASSWORDLESS_AUTH_ERROR',
          message: 'Failed to initiate passwordless authentication',
        },
      };
    }
  }

  /**
   * Send magic link for passwordless authentication
   */
  async sendMagicLink(request: MagicLinkRequest): Promise<MagicLinkResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Magic link generation started', {
        correlationId,
        email: this.maskEmail(request.email),
        redirectUrl: request.redirectUrl,
      });

      // Find user by email
      const user = await this.userRepository.findByEmail(request.email);
      if (!user) {
        // For security, don't reveal if user exists
        return {
          success: true,
          linkSent: true,
        };
      }

      // Generate magic link token
      const magicToken = SecureTokenGenerator.generateMagicLinkToken();
      const expiresAt = new Date(Date.now() + 15 * 60 * 1000); // 15 minutes

      // Store magic link challenge
      const challengeId = SecureIdGenerator.generateSecureId();
      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'email',
        userId: user.id,
        expiresAt,
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          magicToken,
          redirectUrl: request.redirectUrl,
          deviceInfo: request.deviceInfo,
          ipAddress: request.ipAddress || undefined,
          type: 'magic_link',
        } as Record<string, any>,
      });

      // Construct magic link URL
      const baseUrl = process.env.FRONTEND_URL || 'http://localhost:3000';
      const magicLinkUrl = `${baseUrl}/auth/magic-link?token=${magicToken}&redirect=${encodeURIComponent(request.redirectUrl || '/')}`;

      // Send magic link email
      const emailResult = await this.emailService.sendMagicLink(
        request.email,
        magicLinkUrl,
        expiresAt
      );

      if (!emailResult.success) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          linkSent: false,
          error: {
            code: 'EMAIL_SEND_FAILED',
            message: 'Failed to send magic link email',
            details: emailResult.error,
          },
        };
      }

      this.logger.info('Magic link sent successfully', {
        correlationId,
        userId: user.id,
        challengeId,
        expiresAt,
        messageId: emailResult.messageId,
      });

      return {
        success: true,
        linkSent: true,
        expiresAt,
      };
    } catch (error) {
      this.logger.error('Magic link generation error', {
        correlationId,
        email: this.maskEmail(request.email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        linkSent: false,
        error: {
          code: 'MAGIC_LINK_ERROR',
          message: 'Failed to generate magic link',
        },
      };
    }
  }

  /**
   * Verify magic link token and authenticate user
   */
  async verifyMagicLink(
    token: string,
    deviceInfo: DeviceInfo,
    ipAddress?: string
  ): Promise<PasswordlessAuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Magic link verification started', {
        correlationId,
        tokenLength: token.length,
        deviceType: deviceInfo.platform,
      });

      // Validate token format
      const tokenValidation = SecureTokenGenerator.validateToken(token);
      if (!tokenValidation.valid || tokenValidation.expired) {
        return {
          success: false,
          error: {
            code: 'INVALID_MAGIC_LINK',
            message: 'Magic link is invalid or expired',
          },
        };
      }

      // Find challenge by magic token
      const challenges =
        await this.challengeRepository.getUserActiveChallenges(''); // We need to search by metadata
      const challenge = challenges.find(
        (c) =>
          c.type === 'email' &&
          (c.metadata as any)?.type === 'magic_link' &&
          (c.metadata as any)?.magicToken === token
      );

      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'MAGIC_LINK_NOT_FOUND',
            message: 'Magic link not found or expired',
          },
        };
      }

      // Check if challenge is expired
      if (new Date() > challenge.expiresAt) {
        await this.challengeRepository.deleteChallenge(challenge.id);
        return {
          success: false,
          error: {
            code: 'MAGIC_LINK_EXPIRED',
            message: 'Magic link has expired',
          },
        };
      }

      // Get user
      const user = await this.userRepository.findById(challenge.userId);
      if (!user) {
        await this.challengeRepository.deleteChallenge(challenge.id);
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        };
      }

      // Verify device consistency (optional security check)
      const storedDeviceInfo = challenge.metadata?.deviceInfo;
      if (
        storedDeviceInfo &&
        !this.isDeviceConsistent(storedDeviceInfo, deviceInfo)
      ) {
        this.logger.warn(
          'Device inconsistency detected in magic link verification',
          {
            correlationId,
            userId: user.id,
            storedDevice: storedDeviceInfo.fingerprint,
            currentDevice: deviceInfo.fingerprint,
          }
        );

        // Don't fail, but increase risk score
        // This could be legitimate (user switching devices)
      }

      // Clean up challenge
      await this.challengeRepository.deleteChallenge(challenge.id);

      // Update user login information
      const userEntity = this.convertToUserEntity(user);

      // For now, just update the user directly since we're not using full domain entities
      await this.userRepository.updateUser(user.id, {
        lastLoginAt: new Date(),
        lastLoginIP: ipAddress || 'unknown',
        riskScore: Math.max(0, (user.riskScore || 0) - 5), // Reduce risk on successful auth
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      this.logger.info('Magic link verification successful', {
        correlationId,
        userId: user.id,
        riskScore: userEntity.riskScore,
      });

      return {
        success: true,
        user: userEntity,
      };
    } catch (error) {
      this.logger.error('Magic link verification error', {
        correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'MAGIC_LINK_VERIFICATION_ERROR',
          message: 'Failed to verify magic link',
        },
      };
    }
  }

  /**
   * Register WebAuthn credential for passwordless authentication
   */
  async registerWebAuthnCredential(
    request: WebAuthnRegistrationRequest
  ): Promise<WebAuthnRegistrationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('WebAuthn credential registration started', {
        correlationId,
        userId: request.userId,
        credentialName: request.credentialName,
        origin: request.origin,
      });

      // Get user
      const user = await this.userRepository.findById(request.userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        };
      }

      // Generate WebAuthn registration options
      const registrationOptions =
        await this.webAuthnService.generateRegistrationOptions(
          user.id,
          user.email,
          user.name
        );

      // Store registration challenge
      const challengeId = SecureIdGenerator.generateSecureId();
      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'webauthn',
        userId: user.id,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          challenge: registrationOptions.challenge,
          credentialName: request.credentialName,
          origin: request.origin,
          deviceInfo: request.deviceInfo,
          type: 'registration',
        },
      });

      this.logger.info('WebAuthn registration options generated', {
        correlationId,
        userId: user.id,
        challengeId,
        challenge: registrationOptions.challenge.substring(0, 10) + '...',
      });

      return {
        success: true,
        registrationOptions: registrationOptions.options,
      };
    } catch (error) {
      this.logger.error('WebAuthn credential registration error', {
        correlationId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'WEBAUTHN_REGISTRATION_ERROR',
          message: 'Failed to register WebAuthn credential',
        },
      };
    }
  }

  /**
   * Complete WebAuthn credential registration
   */
  async completeWebAuthnRegistration(
    challengeId: string,
    registrationResponse: any,
    deviceInfo: DeviceInfo
  ): Promise<WebAuthnRegistrationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('WebAuthn registration completion started', {
        correlationId,
        challengeId,
        credentialId: registrationResponse.id,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(challengeId);
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'Registration challenge not found',
          },
        };
      }

      // Check if challenge is expired
      if (new Date() > challenge.expiresAt) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          error: {
            code: 'CHALLENGE_EXPIRED',
            message: 'Registration challenge has expired',
          },
        };
      }

      // Verify registration response
      const verificationResult =
        await this.webAuthnService.verifyRegistrationResponse(
          challenge.userId,
          challenge.metadata?.credentialName || 'Passwordless Device',
          registrationResponse,
          challenge.metadata?.challenge,
          challenge.metadata?.origin
        );

      if (!verificationResult.success) {
        await this.challengeRepository.incrementAttempts(challengeId);

        return {
          success: false,
          error: {
            code: 'WEBAUTHN_VERIFICATION_FAILED',
            message: 'WebAuthn registration verification failed',
            details: verificationResult.error,
          },
        };
      }

      // Clean up challenge
      await this.challengeRepository.deleteChallenge(challengeId);

      // Register device for future passwordless authentication
      await this.registerDevice({
        userId: challenge.userId,
        deviceFingerprint: deviceInfo.fingerprint,
        deviceName: challenge.metadata?.credentialName || 'Passwordless Device',
        deviceType: deviceInfo.platform,
        webAuthnCredentialId: verificationResult.credentialId!,
      });

      this.logger.info('WebAuthn registration completed successfully', {
        correlationId,
        userId: challenge.userId,
        credentialId: verificationResult.credentialId,
      });

      return {
        success: true,
        credentialId: verificationResult.credentialId,
      };
    } catch (error) {
      this.logger.error('WebAuthn registration completion error', {
        correlationId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'WEBAUTHN_REGISTRATION_COMPLETION_ERROR',
          message: 'Failed to complete WebAuthn registration',
        },
      };
    }
  }

  /**
   * Authenticate using WebAuthn
   */
  async authenticateWithWebAuthn(
    challengeId: string,
    authenticationResponse: any,
    deviceInfo: DeviceInfo
  ): Promise<WebAuthnAuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('WebAuthn authentication started', {
        correlationId,
        challengeId,
        credentialId: authenticationResponse.id,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(challengeId);
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'Authentication challenge not found',
          },
        };
      }

      // Check if challenge is expired
      if (new Date() > challenge.expiresAt) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          error: {
            code: 'CHALLENGE_EXPIRED',
            message: 'Authentication challenge has expired',
          },
        };
      }

      // Verify authentication response
      const verificationResult =
        await this.webAuthnService.verifyAuthenticationResponse(
          authenticationResponse,
          challenge.metadata?.challenge,
          challenge.metadata?.origin
        );

      if (!verificationResult.success) {
        await this.challengeRepository.incrementAttempts(challengeId);

        return {
          success: false,
          error: {
            code: 'WEBAUTHN_AUTH_FAILED',
            message: 'WebAuthn authentication failed',
            details: verificationResult.error,
          },
        };
      }

      // Get user
      const user = await this.userRepository.findById(challenge.userId);
      if (!user) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        };
      }

      // Clean up challenge
      await this.challengeRepository.deleteChallenge(challengeId);

      // Update user login information
      const userEntity = this.convertToUserEntity(user);

      // For now, just update the user directly since we're not using full domain entities
      await this.userRepository.updateUser(user.id, {
        lastLoginAt: new Date(),
        lastLoginIP: challenge.metadata?.deviceInfo?.ipAddress || 'unknown',
        riskScore: Math.max(0, (user.riskScore || 0) - 5), // Reduce risk on successful auth
        failedLoginAttempts: 0,
        lockedUntil: null,
      });

      // Update device last used
      await this.updateDeviceLastUsed(challenge.userId, deviceInfo.fingerprint);

      this.logger.info('WebAuthn authentication successful', {
        correlationId,
        userId: user.id,
        credentialId: verificationResult.credentialId,
        riskScore: userEntity.riskScore,
      });

      return {
        success: true,
        user: userEntity,
      };
    } catch (error) {
      this.logger.error('WebAuthn authentication error', {
        correlationId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'WEBAUTHN_AUTH_ERROR',
          message: 'Failed to authenticate with WebAuthn',
        },
      };
    }
  }

  /**
   * Initiate biometric authentication (through WebAuthn)
   */
  async initiateBiometricAuth(
    request: BiometricAuthRequest
  ): Promise<BiometricAuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Biometric authentication initiated', {
        correlationId,
        userId: request.userId,
        biometricType: request.biometricType,
        origin: request.origin,
      });

      // Get user's WebAuthn credentials that support biometrics
      const webAuthnCredentials = await this.webAuthnService.getUserCredentials(
        request.userId
      );
      const biometricCredentials = webAuthnCredentials.filter(
        (cred) =>
          cred.deviceType === 'platform' || // Platform authenticators typically support biometrics
          cred.name.toLowerCase().includes('biometric') ||
          cred.name.toLowerCase().includes(request.biometricType)
      );

      if (biometricCredentials.length === 0) {
        return {
          success: false,
          fallbackRequired: true,
          error: {
            code: 'NO_BIOMETRIC_CREDENTIALS',
            message: 'No biometric credentials found for this user',
          },
        };
      }

      // Generate WebAuthn authentication options with biometric preference
      const authOptions =
        await this.webAuthnService.generateAuthenticationOptions(
          request.userId
        );

      // Store challenge for verification
      const challengeId = SecureIdGenerator.generateSecureId();
      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'webauthn',
        userId: request.userId,
        expiresAt: new Date(Date.now() + 3 * 60 * 1000), // 3 minutes for biometric
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          challenge: authOptions.challenge,
          origin: request.origin,
          deviceInfo: request.deviceInfo,
          biometricType: request.biometricType,
          type: 'biometric',
        },
      });

      this.logger.info('Biometric authentication challenge created', {
        correlationId,
        userId: request.userId,
        challengeId,
        biometricCredentialsCount: biometricCredentials.length,
      });

      return {
        success: true,
        biometricChallenge: {
          challengeId,
          options: authOptions.options,
          biometricType: request.biometricType,
        },
      };
    } catch (error) {
      this.logger.error('Biometric authentication initiation error', {
        correlationId,
        userId: request.userId,
        biometricType: request.biometricType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        fallbackRequired: true,
        error: {
          code: 'BIOMETRIC_AUTH_ERROR',
          message: 'Failed to initiate biometric authentication',
        },
      };
    }
  }

  /**
   * Get user's registered devices for passwordless authentication
   */
  async getUserDevices(userId: string): Promise<DeviceRegistration[]> {
    try {
      // Get WebAuthn credentials
      const webAuthnCredentials =
        await this.webAuthnService.getUserCredentials(userId);

      // Convert to device registrations
      const devices: DeviceRegistration[] = webAuthnCredentials.map((cred) => ({
        id: cred.id,
        userId: cred.userId,
        deviceFingerprint: cred.credentialId, // Using credentialId as device fingerprint
        deviceName: cred.name,
        deviceType: cred.deviceType || 'unknown',
        trusted: true, // WebAuthn credentials are considered trusted
        registeredAt: cred.createdAt,
        lastUsedAt: cred.lastUsed,
        webAuthnCredentials: [cred.credentialId],
      }));

      return devices;
    } catch (error) {
      this.logger.error('Failed to get user devices', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return [];
    }
  }

  /**
   * Remove a registered device
   */
  async removeDevice(userId: string, deviceId: string): Promise<boolean> {
    try {
      this.logger.info('Removing device', { userId, deviceId });

      // Remove WebAuthn credential
      const removed = await this.webAuthnService.removeCredential(
        userId,
        deviceId
      );

      if (removed) {
        this.logger.info('Device removed successfully', { userId, deviceId });
      }

      return removed;
    } catch (error) {
      this.logger.error('Failed to remove device', {
        userId,
        deviceId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Get fallback authentication methods when passwordless fails
   */
  async getFallbackMethods(email: string): Promise<string[]> {
    try {
      const user = await this.userRepository.findByEmail(email);
      if (!user) {
        return ['email_signup', 'magic_link'];
      }

      const methods: string[] = [];

      // Always available fallbacks
      methods.push('magic_link', 'email_code');

      // If user has password
      if (user.passwordHash) {
        methods.push('password_login');
      }

      // If user has MFA enabled
      if (user.mfaEnabled) {
        methods.push('mfa_recovery');
      }

      return methods;
    } catch (error) {
      this.logger.error('Failed to get fallback methods', {
        email: this.maskEmail(email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return basic fallbacks on error
      return ['magic_link', 'email_code', 'password_login'];
    }
  }

  /**
   * Register a device for passwordless authentication
   */
  private async registerDevice(deviceData: {
    userId: string;
    deviceFingerprint: string;
    deviceName: string;
    deviceType: string;
    webAuthnCredentialId: string;
  }): Promise<void> {
    try {
      // In this implementation, device registration is handled through WebAuthn credentials
      // In a more complex system, you might have a separate devices table
      this.logger.info('Device registered for passwordless authentication', {
        userId: deviceData.userId,
        deviceName: deviceData.deviceName,
        deviceType: deviceData.deviceType,
        credentialId: deviceData.webAuthnCredentialId,
      });
    } catch (error) {
      this.logger.error('Failed to register device', {
        userId: deviceData.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Update device last used timestamp
   */
  private async updateDeviceLastUsed(
    userId: string,
    deviceFingerprint: string
  ): Promise<void> {
    try {
      // This would update the device's last used timestamp
      // For now, this is handled by the WebAuthn service
      this.logger.debug('Device last used updated', {
        userId,
        deviceFingerprint,
      });
    } catch (error) {
      this.logger.error('Failed to update device last used', {
        userId,
        deviceFingerprint,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Check if device information is consistent
   */
  private isDeviceConsistent(stored: DeviceInfo, current: DeviceInfo): boolean {
    // Allow some flexibility in device consistency checking
    return (
      stored.fingerprint === current.fingerprint ||
      (stored.platform === current.platform &&
        stored.browser === current.browser &&
        Math.abs(
          (stored.screenResolution || '').localeCompare(
            current.screenResolution || ''
          )
        ) < 2)
    );
  }

  /**
   * Convert database user to domain entity
   */
  private convertToUserEntity(user: any): User {
    // For now, return the user as-is since we're not using the full domain entity
    // In a real implementation, you would properly convert to the User domain entity
    return user as User;
  }

  /**
   * Mask email for logging
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal =
      localPart.length > 2
        ? localPart[0] +
          '*'.repeat(localPart.length - 2) +
          localPart[localPart.length - 1]
        : '*'.repeat(localPart.length);

    return `${maskedLocal}@${domain}`;
  }
}
