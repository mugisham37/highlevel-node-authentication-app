/**
 * Multi-Factor Authentication (MFA) Service Implementation
 * Implements TOTP, SMS, email, and WebAuthn MFA with risk-based triggering
 */

import { Logger } from 'winston';
import { User } from '../../domain/entities/user';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';
import { SecureTokenGenerator } from '../../infrastructure/security/secure-token-generator.service';
import { TOTPService } from '../../infrastructure/security/totp.service';
import { SMSService } from '../../infrastructure/security/sms.service';
import { EmailMFAService } from '../../infrastructure/security/email-mfa.service';
import { WebAuthnService } from '../../infrastructure/security/webauthn.service';
import { MFAChallengeRepository } from '../../infrastructure/database/repositories/mfa-challenge.repository';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';

export interface MFASetupResult {
  success: boolean;
  secret?: string | undefined;
  qrCodeUrl?: string | undefined;
  backupCodes?: string[] | undefined;
  error?: MFAError | undefined;
}

export interface MFAVerificationResult {
  success: boolean;
  user?: User | undefined;
  backupCodeUsed?: boolean | undefined;
  tokens?: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    tokenType: string;
  } | undefined;
  session?: {
    id: string;
    expiresAt: string;
    deviceInfo: any;
  } | undefined;
  riskScore?: number | undefined;
  error?: MFAError | undefined;
}

export interface MFAChallenge {
  id: string;
  type: 'totp' | 'sms' | 'email' | 'webauthn';
  userId: string;
  expiresAt: Date;
  attempts: number;
  maxAttempts: number;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface MFAError {
  code: string;
  message: string;
  details?: Record<string, any> | string | undefined;
}

export interface WebAuthnCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  name: string;
  createdAt: Date;
  lastUsed?: Date;
}

export interface SMSMFARequest {
  userId: string;
  phoneNumber: string;
  challengeId?: string;
}

export interface EmailMFARequest {
  userId: string;
  email: string;
  challengeId?: string;
}

export interface WebAuthnRegistrationRequest {
  userId: string;
  credentialName: string;
  challenge: string;
  origin: string;
}

export interface WebAuthnAuthenticationRequest {
  userId: string;
  challengeId: string;
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
}

export class MFAService {
  constructor(
    private readonly userRepository: PrismaUserRepository,
    private readonly challengeRepository: MFAChallengeRepository,
    private readonly totpService: TOTPService,
    private readonly smsService: SMSService,
    private readonly emailMFAService: EmailMFAService,
    private readonly webAuthnService: WebAuthnService,
    private readonly logger: Logger
  ) {}

  /**
   * Setup MFA for a user
   */
  async setupMFA(
    userId: string,
    mfaType: 'totp' | 'sms' | 'email' = 'totp',
    options?: {
      phoneNumber?: string;
      email?: string;
      serviceName?: string;
    }
  ): Promise<MFASetupResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('MFA setup initiated', {
        correlationId,
        userId,
        mfaType,
      });

      switch (mfaType) {
        case 'totp':
          return await this.setupTOTP(userId, options?.serviceName);
        case 'sms':
          if (!options?.phoneNumber) {
            return {
              success: false,
              error: {
                code: 'PHONE_NUMBER_REQUIRED',
                message: 'Phone number is required for SMS MFA',
              },
            };
          }
          // For SMS, we just enable it and return success
          await this.userRepository.updateUser(userId, {
            mfaEnabled: true,
          });
          return {
            success: true,
          };
        case 'email':
          // For email MFA, we just enable it and return success
          await this.userRepository.updateUser(userId, {
            mfaEnabled: true,
          });
          return {
            success: true,
          };
        default:
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_MFA_TYPE',
              message: 'Unsupported MFA type',
            },
          };
      }
    } catch (error) {
      this.logger.error('MFA setup error', {
        correlationId,
        userId,
        mfaType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'MFA_SETUP_ERROR',
          message: 'Failed to setup MFA',
        },
      };
    }
  }

  /**
   * Verify MFA code/challenge
   */
  async verifyMFA(
    challengeId: string,
    mfaCode: string,
    mfaType: 'totp' | 'sms' | 'email'
  ): Promise<MFAVerificationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('MFA verification initiated', {
        correlationId,
        challengeId,
        mfaType,
      });

      switch (mfaType) {
        case 'totp':
          // For TOTP, we need to get the user from the challenge
          const challenge = await this.challengeRepository.findById(challengeId);
          if (!challenge) {
            return {
              success: false,
              error: {
                code: 'CHALLENGE_NOT_FOUND',
                message: 'MFA challenge not found',
              },
            };
          }
          return await this.verifyTOTP(challenge.userId, mfaCode);
        case 'sms':
          return await this.verifySMSCode(challengeId, mfaCode);
        case 'email':
          return await this.verifyEmailCode(challengeId, mfaCode);
        default:
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_MFA_TYPE',
              message: 'Unsupported MFA type',
            },
          };
      }
    } catch (error) {
      this.logger.error('MFA verification error', {
        correlationId,
        challengeId,
        mfaType,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'MFA_VERIFICATION_ERROR',
          message: 'Failed to verify MFA',
        },
      };
    }
  }

  /**
   * Complete MFA challenge (for multi-step flows)
   */
  async completeMFAChallenge(
    challengeId: string,
    challengeResponse: any,
    userId: string
  ): Promise<MFAVerificationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('MFA challenge completion initiated', {
        correlationId,
        challengeId,
        userId,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(challengeId);
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'MFA challenge not found',
          },
        };
      }

      // Verify challenge belongs to user
      if (challenge.userId !== userId) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_MISMATCH',
            message: 'Challenge does not belong to user',
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
            message: 'MFA challenge has expired',
          },
        };
      }

      // Handle different challenge types
      switch (challenge.type) {
        case 'webauthn':
          return await this.verifyWebAuthn({
            userId,
            challengeId,
            credentialId: challengeResponse.credentialId,
            authenticatorData: challengeResponse.authenticatorData,
            clientDataJSON: challengeResponse.clientDataJSON,
            signature: challengeResponse.signature,
          });
        case 'totp':
          return await this.verifyTOTP(userId, challengeResponse.code);
        case 'sms':
          return await this.verifySMSCode(challengeId, challengeResponse.code);
        case 'email':
          return await this.verifyEmailCode(challengeId, challengeResponse.code);
        default:
          return {
            success: false,
            error: {
              code: 'UNSUPPORTED_CHALLENGE_TYPE',
              message: 'Unsupported challenge type',
            },
          };
      }
    } catch (error) {
      this.logger.error('MFA challenge completion error', {
        correlationId,
        challengeId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'MFA_CHALLENGE_COMPLETION_ERROR',
          message: 'Failed to complete MFA challenge',
        },
      };
    }
  }

  /**
   * Setup TOTP (Time-based One-Time Password) for a user
   */
  async setupTOTP(
    userId: string,
    serviceName: string = 'Enterprise Auth'
  ): Promise<MFASetupResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('TOTP setup started', {
        correlationId,
        userId,
        serviceName,
      });

      // Get user
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        };
      }

      // Check if TOTP is already enabled
      if (user.mfaEnabled && user.totpSecret) {
        return {
          success: false,
          error: {
            code: 'TOTP_ALREADY_ENABLED',
            message: 'TOTP is already enabled for this user',
          },
        };
      }

      // Generate TOTP secret and setup
      const totpSetup = await this.totpService.generateSecret(
        user.email,
        serviceName
      );

      // Generate backup codes
      const backupCodes = SecureTokenGenerator.generateBackupCodes(10);

      // Store the secret temporarily (will be confirmed when user verifies)
      await this.userRepository.updateUser(userId, {
        totpSecret: totpSetup.secret,
        backupCodes: backupCodes,
        mfaEnabled: false, // Will be enabled after verification
      });

      this.logger.info('TOTP setup completed', {
        correlationId,
        userId,
        hasQrCode: !!totpSetup.qrCodeUrl,
        backupCodesCount: backupCodes.length,
      });

      return {
        success: true,
        secret: totpSetup.secret,
        qrCodeUrl: totpSetup.qrCodeUrl,
        backupCodes,
      };
    } catch (error) {
      this.logger.error('TOTP setup error', {
        correlationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'TOTP_SETUP_ERROR',
          message: 'Failed to setup TOTP',
        },
      };
    }
  }

  /**
   * Verify TOTP code and enable MFA
   */
  async verifyTOTP(
    userId: string,
    code: string
  ): Promise<MFAVerificationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('TOTP verification started', {
        correlationId,
        userId,
        codeLength: code.length,
      });

      // Get user
      const user = await this.userRepository.findById(userId);
      if (!user || !user.totpSecret) {
        return {
          success: false,
          error: {
            code: 'INVALID_TOTP_SETUP',
            message: 'TOTP is not set up for this user',
          },
        };
      }

      // Check if it's a backup code
      if (code.length > 6 && user.backupCodes.includes(code)) {
        // Use backup code
        const updatedBackupCodes = user.backupCodes.filter((c) => c !== code);
        await this.userRepository.updateUser(userId, {
          backupCodes: updatedBackupCodes,
          mfaEnabled: true,
        });

        this.logger.info('TOTP verification successful with backup code', {
          correlationId,
          userId,
          remainingBackupCodes: updatedBackupCodes.length,
        });

        const updatedUser = await this.userRepository.findById(userId);
        return {
          success: true,
          user: this.convertToUserEntity(updatedUser!),
          backupCodeUsed: true,
        };
      }

      // Verify TOTP code
      const verificationResult = await this.totpService.verifyToken(
        user.totpSecret,
        code
      );
      if (!verificationResult.valid) {
        this.logger.warn('TOTP verification failed', {
          correlationId,
          userId,
          reason: 'Invalid code',
        });

        return {
          success: false,
          error: {
            code: 'INVALID_TOTP_CODE',
            message: 'Invalid TOTP code',
          },
        };
      }

      // Enable MFA
      await this.userRepository.updateUser(userId, {
        mfaEnabled: true,
      });

      this.logger.info('TOTP verification successful', {
        correlationId,
        userId,
      });

      const updatedUser = await this.userRepository.findById(userId);
      return {
        success: true,
        user: this.convertToUserEntity(updatedUser!),
      };
    } catch (error) {
      this.logger.error('TOTP verification error', {
        correlationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'TOTP_VERIFICATION_ERROR',
          message: 'Failed to verify TOTP code',
        },
      };
    }
  }

  /**
   * Send SMS-based MFA code
   */
  async sendSMSCode(
    request: SMSMFARequest
  ): Promise<{ success: boolean; challengeId?: string; error?: MFAError }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('SMS MFA code generation started', {
        correlationId,
        userId: request.userId,
        phoneNumber: request.phoneNumber.replace(/\d(?=\d{4})/g, '*'),
      });

      // Generate 6-digit code
      const code = SecureTokenGenerator.generateOTP(6);
      const challengeId =
        request.challengeId || SecureIdGenerator.generateSecureId();
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

      // Store challenge
      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'sms',
        userId: request.userId,
        expiresAt,
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          phoneNumber: request.phoneNumber,
          code: code, // In production, this should be hashed
        },
      });

      // Send SMS
      const smsResult = await this.smsService.sendMFACode(
        request.phoneNumber,
        code
      );
      if (!smsResult.success) {
        return {
          success: false,
          error: {
            code: 'SMS_SEND_FAILED',
            message: 'Failed to send SMS code',
            details: smsResult.error,
          },
        };
      }

      this.logger.info('SMS MFA code sent successfully', {
        correlationId,
        userId: request.userId,
        challengeId,
        messageId: smsResult.messageId,
      });

      return {
        success: true,
        challengeId,
      };
    } catch (error) {
      this.logger.error('SMS MFA code generation error', {
        correlationId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'SMS_MFA_ERROR',
          message: 'Failed to generate SMS MFA code',
        },
      };
    }
  }

  /**
   * Verify SMS-based MFA code
   */
  async verifySMSCode(
    challengeId: string,
    code: string
  ): Promise<MFAVerificationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('SMS MFA verification started', {
        correlationId,
        challengeId,
        codeLength: code.length,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(challengeId);
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'MFA challenge not found',
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
            message: 'MFA challenge has expired',
          },
        };
      }

      // Check attempts
      if (challenge.attempts >= challenge.maxAttempts) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          error: {
            code: 'MAX_ATTEMPTS_EXCEEDED',
            message: 'Maximum verification attempts exceeded',
          },
        };
      }

      // Increment attempts
      await this.challengeRepository.incrementAttempts(challengeId);

      // Verify code
      const storedCode = (challenge.metadata as { code?: string } | undefined)?.code;
      if (!storedCode || storedCode !== code) {
        this.logger.warn('SMS MFA verification failed', {
          correlationId,
          challengeId,
          userId: challenge.userId,
          attempts: challenge.attempts + 1,
        });

        return {
          success: false,
          error: {
            code: 'INVALID_SMS_CODE',
            message: 'Invalid SMS code',
          },
        };
      }

      // Get user
      const user = await this.userRepository.findById(challenge.userId);
      if (!user) {
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

      this.logger.info('SMS MFA verification successful', {
        correlationId,
        challengeId,
        userId: challenge.userId,
      });

      return {
        success: true,
        user: this.convertToUserEntity(user),
      };
    } catch (error) {
      this.logger.error('SMS MFA verification error', {
        correlationId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'SMS_VERIFICATION_ERROR',
          message: 'Failed to verify SMS code',
        },
      };
    }
  }

  /**
   * Send email-based MFA code
   */
  async sendEmailCode(
    request: EmailMFARequest
  ): Promise<{ success: boolean; challengeId?: string; error?: MFAError }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Email MFA code generation started', {
        correlationId,
        userId: request.userId,
        email: request.email,
      });

      // Generate 6-digit code
      const code = SecureTokenGenerator.generateOTP(6);
      const challengeId =
        request.challengeId || SecureIdGenerator.generateSecureId();
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

      // Store challenge
      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'email',
        userId: request.userId,
        expiresAt,
        attempts: 0,
        maxAttempts: 5,
        metadata: {
          email: request.email,
          code: code, // In production, this should be hashed
        },
      });

      // Send email
      const emailResult = await this.emailMFAService.sendMFACode(
        request.email,
        code
      );
      if (!emailResult.success) {
        return {
          success: false,
          error: {
            code: 'EMAIL_SEND_FAILED',
            message: 'Failed to send email code',
            details: emailResult.error,
          },
        };
      }

      this.logger.info('Email MFA code sent successfully', {
        correlationId,
        userId: request.userId,
        challengeId,
        messageId: emailResult.messageId,
      });

      return {
        success: true,
        challengeId,
      };
    } catch (error) {
      this.logger.error('Email MFA code generation error', {
        correlationId,
        userId: request.userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'EMAIL_MFA_ERROR',
          message: 'Failed to generate email MFA code',
        },
      };
    }
  }

  /**
   * Verify email-based MFA code
   */
  async verifyEmailCode(
    challengeId: string,
    code: string
  ): Promise<MFAVerificationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Email MFA verification started', {
        correlationId,
        challengeId,
        codeLength: code.length,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(challengeId);
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'MFA challenge not found',
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
            message: 'MFA challenge has expired',
          },
        };
      }

      // Check attempts
      if (challenge.attempts >= challenge.maxAttempts) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          error: {
            code: 'MAX_ATTEMPTS_EXCEEDED',
            message: 'Maximum verification attempts exceeded',
          },
        };
      }

      // Increment attempts
      await this.challengeRepository.incrementAttempts(challengeId);

      // Verify code
      const storedCode = (challenge.metadata as { code?: string } | undefined)?.code;
      if (!storedCode || storedCode !== code) {
        this.logger.warn('Email MFA verification failed', {
          correlationId,
          challengeId,
          userId: challenge.userId,
          attempts: challenge.attempts + 1,
        });

        return {
          success: false,
          error: {
            code: 'INVALID_EMAIL_CODE',
            message: 'Invalid email code',
          },
        };
      }

      // Get user
      const user = await this.userRepository.findById(challenge.userId);
      if (!user) {
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

      this.logger.info('Email MFA verification successful', {
        correlationId,
        challengeId,
        userId: challenge.userId,
      });

      return {
        success: true,
        user: this.convertToUserEntity(user),
      };
    } catch (error) {
      this.logger.error('Email MFA verification error', {
        correlationId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'EMAIL_VERIFICATION_ERROR',
          message: 'Failed to verify email code',
        },
      };
    }
  }

  /**
   * Register WebAuthn credential
   */
  async registerWebAuthn(
    request: WebAuthnRegistrationRequest
  ): Promise<{ success: boolean; credentialId?: string | undefined; error?: MFAError | undefined }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('WebAuthn registration started', {
        correlationId,
        userId: request.userId,
        credentialName: request.credentialName,
        origin: request.origin,
      });

      // Register credential with WebAuthn service
      const registrationResult = await this.webAuthnService.registerCredential({
        userId: request.userId,
        credentialName: request.credentialName,
        challenge: request.challenge,
        origin: request.origin,
      });

      if (!registrationResult.success) {
        return {
          success: false,
          error: {
            code: 'WEBAUTHN_REGISTRATION_FAILED',
            message: 'Failed to register WebAuthn credential',
            details: registrationResult.error,
          },
        };
      }

      this.logger.info('WebAuthn registration successful', {
        correlationId,
        userId: request.userId,
        credentialId: registrationResult.credentialId,
      });

      return {
        success: true,
        credentialId: registrationResult.credentialId,
      };
    } catch (error) {
      this.logger.error('WebAuthn registration error', {
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
   * Verify WebAuthn authentication
   */
  async verifyWebAuthn(
    request: WebAuthnAuthenticationRequest
  ): Promise<MFAVerificationResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('WebAuthn verification started', {
        correlationId,
        userId: request.userId,
        challengeId: request.challengeId,
        credentialId: request.credentialId,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(
        request.challengeId
      );
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'WebAuthn challenge not found',
          },
        };
      }

      // Verify with WebAuthn service
      const expectedChallenge = (challenge.metadata as { challenge?: string } | undefined)?.challenge;
      if (!expectedChallenge) {
        return {
          success: false,
          error: {
            code: 'INVALID_CHALLENGE',
            message: 'Challenge data not found',
          },
        };
      }

      const authResponse = {
        id: request.credentialId,
        rawId: request.credentialId,
        response: {
          authenticatorData: request.authenticatorData,
          clientDataJSON: request.clientDataJSON,
          signature: request.signature,
        },
        type: 'public-key' as const,
        clientExtensionResults: {},
      };

      const verificationResult = await this.webAuthnService.verifyAuthenticationResponse(
        authResponse,
        expectedChallenge
      );

      if (!verificationResult.success) {
        this.logger.warn('WebAuthn verification failed', {
          correlationId,
          userId: request.userId,
          challengeId: request.challengeId,
          reason: verificationResult.error,
        });

        return {
          success: false,
          error: {
            code: 'WEBAUTHN_VERIFICATION_FAILED',
            message: 'WebAuthn verification failed',
            details: verificationResult.error,
          },
        };
      }

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

      // Clean up challenge
      await this.challengeRepository.deleteChallenge(request.challengeId);

      this.logger.info('WebAuthn verification successful', {
        correlationId,
        userId: request.userId,
        challengeId: request.challengeId,
        credentialId: request.credentialId,
      });

      return {
        success: true,
        user: this.convertToUserEntity(user),
      };
    } catch (error) {
      this.logger.error('WebAuthn verification error', {
        correlationId,
        userId: request.userId,
        challengeId: request.challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'WEBAUTHN_VERIFICATION_ERROR',
          message: 'Failed to verify WebAuthn authentication',
        },
      };
    }
  }

  /**
   * Generate new backup codes
   */
  async generateBackupCodes(
    userId: string
  ): Promise<{ success: boolean; backupCodes?: string[]; error?: MFAError }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Backup codes generation started', {
        correlationId,
        userId,
      });

      // Get user
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return {
          success: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
        };
      }

      // Generate new backup codes
      const backupCodes = SecureTokenGenerator.generateBackupCodes(10);

      // Update user with new backup codes
      await this.userRepository.updateUser(userId, {
        backupCodes,
      });

      this.logger.info('Backup codes generated successfully', {
        correlationId,
        userId,
        codesCount: backupCodes.length,
      });

      return {
        success: true,
        backupCodes,
      };
    } catch (error) {
      this.logger.error('Backup codes generation error', {
        correlationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'BACKUP_CODES_ERROR',
          message: 'Failed to generate backup codes',
        },
      };
    }
  }

  /**
   * Disable MFA for a user
   */
  async disableMFA(
    userId: string
  ): Promise<{ success: boolean; error?: MFAError }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('MFA disable started', {
        correlationId,
        userId,
      });

      // Update user to disable MFA
      await this.userRepository.updateUser(userId, {
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: [],
      });

      // Remove all WebAuthn credentials
      await this.webAuthnService.removeAllCredentials(userId);

      this.logger.info('MFA disabled successfully', {
        correlationId,
        userId,
      });

      return {
        success: true,
      };
    } catch (error) {
      this.logger.error('MFA disable error', {
        correlationId,
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'MFA_DISABLE_ERROR',
          message: 'Failed to disable MFA',
        },
      };
    }
  }

  /**
   * Check if user requires MFA based on risk assessment
   */
  async requiresMFA(userId: string, riskScore: number): Promise<boolean> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) return false;

      // Always require MFA if enabled
      if (user.mfaEnabled) return true;

      // Require MFA for high-risk scenarios
      if (riskScore > 70) return true;

      // Require MFA for users with recent failed attempts
      if (user.failedLoginAttempts > 2) return true;

      return false;
    } catch (error) {
      this.logger.error('MFA requirement check error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Default to requiring MFA on error for security
      return true;
    }
  }

  /**
   * Get user's MFA status and available methods
   */
  async getMFAStatus(userId: string): Promise<{
    enabled: boolean;
    methods: string[];
    backupCodesCount: number;
    webAuthnCredentials: number;
  }> {
    try {
      const user = await this.userRepository.findById(userId);
      if (!user) {
        return {
          enabled: false,
          methods: [],
          backupCodesCount: 0,
          webAuthnCredentials: 0,
        };
      }

      const methods: string[] = [];
      if (user.totpSecret) methods.push('totp');

      const webAuthnCredentials =
        await this.webAuthnService.getUserCredentials(userId);
      if (webAuthnCredentials.length > 0) methods.push('webauthn');

      // SMS and email are always available as fallback methods
      methods.push('sms', 'email');

      return {
        enabled: user.mfaEnabled,
        methods,
        backupCodesCount: user.backupCodes?.length || 0,
        webAuthnCredentials: webAuthnCredentials.length,
      };
    } catch (error) {
      this.logger.error('MFA status check error', {
        userId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        enabled: false,
        methods: [],
        backupCodesCount: 0,
        webAuthnCredentials: 0,
      };
    }
  }

  /**
   * Convert database user to domain entity
   */
  private convertToUserEntity(user: any): User {
    // For now, return the user as-is since we're not using the full domain entity
    // In a real implementation, you would properly convert to the User domain entity
    return user as User;
  }
}
