/**
 * Fallback Authentication Service
 * Provides alternative authentication methods when passwordless authentication fails
 */

import { Logger } from 'winston';
import { User } from "@company/shared"entities/user';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';
import { SecureTokenGenerator } from '../../infrastructure/security/secure-token-generator.service';
import { MFAService } from './mfa.service';
import { EmailMFAService } from '../../infrastructure/security/email-mfa.service';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { MFAChallengeRepository } from '../../infrastructure/database/repositories/mfa-challenge.repository';
import { DeviceInfo } from "@company/shared"entities/user';

export interface FallbackAuthRequest {
  email: string;
  method:
    | 'email_code'
    | 'password_reset'
    | 'account_recovery'
    | 'support_contact';
  deviceInfo: DeviceInfo;
  ipAddress?: string;
  reason?: string;
}

export interface FallbackAuthResult {
  success: boolean;
  method: string;
  challengeId?: string | undefined;
  message?: string | undefined;
  nextSteps?: string[] | undefined;
  estimatedTime?: string | undefined;
  error?: FallbackError | undefined;
}

export interface AccountRecoveryRequest {
  email: string;
  recoveryMethod:
    | 'security_questions'
    | 'backup_email'
    | 'phone_verification'
    | 'identity_verification';
  deviceInfo: DeviceInfo;
  ipAddress?: string;
}

export interface AccountRecoveryResult {
  success: boolean;
  recoveryId?: string;
  challengeType?: string;
  challenge?: any;
  instructions?: string;
  error?: FallbackError;
}

export interface FallbackError {
  code: string;
  message: string;
  details?: Record<string, any> | string | undefined;
}

export interface SupportContactInfo {
  email: string;
  phone?: string | undefined;
  chatUrl?: string | undefined;
  ticketUrl?: string | undefined;
  businessHours?: string | undefined;
  expectedResponseTime?: string | undefined;
}

export class FallbackAuthService {
  constructor(
    private readonly userRepository: PrismaUserRepository,
    private readonly challengeRepository: MFAChallengeRepository,
    private readonly mfaService: MFAService,
    private readonly emailService: EmailMFAService,
    private readonly logger: Logger
  ) {}

  /**
   * Initiate fallback authentication
   */
  async initiateFallbackAuth(
    request: FallbackAuthRequest
  ): Promise<FallbackAuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Fallback authentication initiated', {
        correlationId,
        email: this.maskEmail(request.email),
        method: request.method,
        reason: request.reason,
        deviceType: request.deviceInfo.platform,
      });

      switch (request.method) {
        case 'email_code':
          return await this.initiateEmailCodeFallback(request, correlationId);

        case 'password_reset':
          return await this.initiatePasswordResetFallback(
            request,
            correlationId
          );

        case 'account_recovery':
          return await this.initiateAccountRecoveryFallback(
            request,
            correlationId
          );

        case 'support_contact':
          return await this.provideSupportContactInfo(request, correlationId);

        default:
          return {
            success: false,
            method: request.method,
            error: {
              code: 'UNSUPPORTED_FALLBACK_METHOD',
              message: 'Unsupported fallback authentication method',
            },
          };
      }
    } catch (error) {
      this.logger.error('Fallback authentication initiation error', {
        correlationId,
        email: this.maskEmail(request.email),
        method: request.method,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: request.method,
        error: {
          code: 'FALLBACK_AUTH_ERROR',
          message: 'Failed to initiate fallback authentication',
        },
      };
    }
  }

  /**
   * Initiate email code fallback
   */
  private async initiateEmailCodeFallback(
    request: FallbackAuthRequest,
    correlationId: string
  ): Promise<FallbackAuthResult> {
    try {
      // Check if user exists
      const user = await this.userRepository.findByEmail(request.email);
      if (!user) {
        // For security, don't reveal if user exists
        return {
          success: true,
          method: 'email_code',
          message:
            'If an account exists with this email, a verification code has been sent.',
          nextSteps: [
            'Check your email for the verification code',
            'Enter the code to continue',
          ],
          estimatedTime: '5-10 minutes',
        };
      }

      // Send email verification code
      const emailResult = await this.mfaService.sendEmailCode({
        userId: user.id,
        email: request.email,
      });

      if (!emailResult.success) {
        return {
          success: false,
          method: 'email_code',
          error: {
            code: 'EMAIL_SEND_FAILED',
            message: 'Failed to send email verification code',
            details: emailResult.error,
          },
        };
      }

      this.logger.info('Email code fallback initiated successfully', {
        correlationId,
        userId: user.id,
        challengeId: emailResult.challengeId,
      });

      return {
        success: true,
        method: 'email_code',
        challengeId: emailResult.challengeId || undefined,
        message: 'A verification code has been sent to your email address.',
        nextSteps: [
          'Check your email inbox (and spam folder)',
          'Enter the 6-digit verification code',
          'Complete authentication',
        ],
        estimatedTime: '5-10 minutes',
      };
    } catch (error) {
      this.logger.error('Email code fallback error', {
        correlationId,
        email: this.maskEmail(request.email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'email_code',
        error: {
          code: 'EMAIL_CODE_FALLBACK_ERROR',
          message: 'Failed to initiate email code fallback',
        },
      };
    }
  }

  /**
   * Initiate password reset fallback
   */
  private async initiatePasswordResetFallback(
    request: FallbackAuthRequest,
    correlationId: string
  ): Promise<FallbackAuthResult> {
    try {
      // Check if user exists
      const user = await this.userRepository.findByEmail(request.email);
      if (!user) {
        // For security, don't reveal if user exists
        return {
          success: true,
          method: 'password_reset',
          message:
            'If an account exists with this email, password reset instructions have been sent.',
          nextSteps: ['Check your email for password reset instructions'],
          estimatedTime: '5-10 minutes',
        };
      }

      // Generate password reset token
      const resetToken = SecureTokenGenerator.generatePasswordResetToken();
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

      // Store password reset challenge
      const challengeId = SecureIdGenerator.generateSecureId();
      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'email',
        userId: user.id,
        expiresAt,
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          resetToken,
          type: 'password_reset',
          deviceInfo: request.deviceInfo,
          ipAddress: request.ipAddress,
          reason: request.reason,
        },
      });

      // Send password reset email
      const resetUrl = `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/reset-password?token=${resetToken}`;

      // For now, we'll use the email service to send a generic email
      // In a real implementation, you'd have a specific password reset email template
      const emailResult = await this.emailService.sendSecurityAlert(
        request.email,
        'password_change',
        {
          resetUrl,
          expiresAt: expiresAt.toISOString(),
          ipAddress: request.ipAddress,
          deviceInfo: request.deviceInfo,
        }
      );

      if (!emailResult.success) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          method: 'password_reset',
          error: {
            code: 'PASSWORD_RESET_EMAIL_FAILED',
            message: 'Failed to send password reset email',
            details: emailResult.error,
          },
        };
      }

      this.logger.info('Password reset fallback initiated successfully', {
        correlationId,
        userId: user.id,
        challengeId,
        expiresAt,
      });

      return {
        success: true,
        method: 'password_reset',
        challengeId,
        message:
          'Password reset instructions have been sent to your email address.',
        nextSteps: [
          'Check your email for password reset instructions',
          'Click the reset link in the email',
          'Create a new password',
          'Sign in with your new password',
        ],
        estimatedTime: '10-15 minutes',
      };
    } catch (error) {
      this.logger.error('Password reset fallback error', {
        correlationId,
        email: this.maskEmail(request.email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'password_reset',
        error: {
          code: 'PASSWORD_RESET_FALLBACK_ERROR',
          message: 'Failed to initiate password reset',
        },
      };
    }
  }

  /**
   * Initiate account recovery fallback
   */
  private async initiateAccountRecoveryFallback(
    request: FallbackAuthRequest,
    correlationId: string
  ): Promise<FallbackAuthResult> {
    try {
      // Check if user exists
      const user = await this.userRepository.findByEmail(request.email);
      if (!user) {
        return {
          success: false,
          method: 'account_recovery',
          error: {
            code: 'ACCOUNT_NOT_FOUND',
            message:
              'Account not found. Please contact support for assistance.',
          },
        };
      }

      // Create account recovery challenge
      const challengeId = SecureIdGenerator.generateSecureId();
      const recoveryToken = SecureTokenGenerator.generateToken({
        length: 32,
        encoding: 'base64url',
        includeChecksum: true,
      });

      await this.challengeRepository.createChallenge({
        id: challengeId,
        type: 'email',
        userId: user.id,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000), // 24 hours
        attempts: 0,
        maxAttempts: 5,
        metadata: {
          recoveryToken,
          type: 'account_recovery',
          deviceInfo: request.deviceInfo,
          ipAddress: request.ipAddress,
          reason: request.reason,
        },
      });

      // Send account recovery email with instructions
      const recoveryUrl = `${process.env['FRONTEND_URL'] || 'http://localhost:3000'}/auth/account-recovery?token=${recoveryToken}`;

      const emailResult = await this.emailService.sendSecurityAlert(
        request.email,
        'suspicious_activity',
        {
          recoveryUrl,
          reason: 'Account recovery requested',
          ipAddress: request.ipAddress,
          deviceInfo: request.deviceInfo,
        }
      );

      if (!emailResult.success) {
        await this.challengeRepository.deleteChallenge(challengeId);
        return {
          success: false,
          method: 'account_recovery',
          error: {
            code: 'RECOVERY_EMAIL_FAILED',
            message: 'Failed to send account recovery email',
            details: emailResult.error,
          },
        };
      }

      this.logger.info('Account recovery fallback initiated successfully', {
        correlationId,
        userId: user.id,
        challengeId,
      });

      return {
        success: true,
        method: 'account_recovery',
        challengeId,
        message:
          'Account recovery instructions have been sent to your email address.',
        nextSteps: [
          'Check your email for account recovery instructions',
          'Follow the recovery process outlined in the email',
          'Provide additional verification if requested',
          'Set up new authentication methods',
        ],
        estimatedTime: '30-60 minutes',
      };
    } catch (error) {
      this.logger.error('Account recovery fallback error', {
        correlationId,
        email: this.maskEmail(request.email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'account_recovery',
        error: {
          code: 'ACCOUNT_RECOVERY_FALLBACK_ERROR',
          message: 'Failed to initiate account recovery',
        },
      };
    }
  }

  /**
   * Provide support contact information
   */
  private async provideSupportContactInfo(
    request: FallbackAuthRequest,
    correlationId: string
  ): Promise<FallbackAuthResult> {
    try {
      const supportInfo: SupportContactInfo = {
        email: process.env['SUPPORT_EMAIL'] || 'support@example.com',
        phone: process.env['SUPPORT_PHONE'] || undefined,
        chatUrl: process.env['SUPPORT_CHAT_URL'] || undefined,
        ticketUrl: process.env['SUPPORT_TICKET_URL'] || undefined,
        businessHours:
          process.env['SUPPORT_HOURS'] || 'Monday-Friday, 9 AM - 5 PM EST',
        expectedResponseTime:
          process.env['SUPPORT_RESPONSE_TIME'] || '24-48 hours',
      };

      // Log support contact request for tracking
      this.logger.info('Support contact info requested', {
        correlationId,
        email: this.maskEmail(request.email),
        reason: request.reason,
        deviceType: request.deviceInfo.platform,
      });

      const nextSteps = [
        'Contact our support team using the information provided',
        'Provide your email address and describe the authentication issue',
        'Be prepared to verify your identity',
        "Follow the support team's instructions",
      ];

      if (supportInfo.ticketUrl) {
        nextSteps.unshift('Submit a support ticket for faster resolution');
      }

      if (supportInfo.chatUrl) {
        nextSteps.unshift(
          'Use live chat for immediate assistance (during business hours)'
        );
      }

      return {
        success: true,
        method: 'support_contact',
        message:
          "Here's how to contact our support team for assistance with authentication issues.",
        nextSteps,
        estimatedTime: supportInfo.expectedResponseTime || undefined,
        error: undefined,
      };
    } catch (error) {
      this.logger.error('Support contact info error', {
        correlationId,
        email: this.maskEmail(request.email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        method: 'support_contact',
        error: {
          code: 'SUPPORT_INFO_ERROR',
          message: 'Failed to retrieve support contact information',
        },
      };
    }
  }

  /**
   * Get available fallback methods for a user
   */
  async getAvailableFallbackMethods(email: string): Promise<{
    methods: string[];
    recommendations: string[];
  }> {
    try {
      const user = await this.userRepository.findByEmail(email);
      const methods: string[] = [];
      const recommendations: string[] = [];

      // Always available methods
      methods.push('email_code', 'support_contact');

      if (user) {
        // User exists - more options available
        if (user.passwordHash) {
          methods.push('password_reset');
          recommendations.push(
            'Try password reset if you remember having a password'
          );
        }

        if (user.mfaEnabled) {
          methods.push('account_recovery');
          recommendations.push(
            'Use account recovery if you have lost access to MFA devices'
          );
        }

        // Check for backup authentication methods
        const mfaStatus = await this.mfaService.getMFAStatus(user.id);
        if (mfaStatus.backupCodesCount > 0) {
          recommendations.push('Use MFA backup codes if you have them saved');
        }
      } else {
        // User doesn't exist
        recommendations.push(
          'Contact support if you believe you should have an account'
        );
        recommendations.push("Check if you're using the correct email address");
      }

      return { methods, recommendations };
    } catch (error) {
      this.logger.error('Failed to get available fallback methods', {
        email: this.maskEmail(email),
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return basic fallback methods on error
      return {
        methods: ['email_code', 'support_contact'],
        recommendations: ['Contact support for assistance'],
      };
    }
  }

  /**
   * Verify fallback authentication challenge
   */
  async verifyFallbackChallenge(
    challengeId: string,
    response: string,
    _deviceInfo: DeviceInfo // Underscore prefix to indicate intentionally unused
  ): Promise<{
    success: boolean;
    user?: User | undefined;
    nextStep?: string | undefined;
    error?: FallbackError | undefined;
  }> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Fallback challenge verification started', {
        correlationId,
        challengeId,
        responseLength: response.length,
      });

      // Get challenge
      const challenge = await this.challengeRepository.findById(challengeId);
      if (!challenge) {
        return {
          success: false,
          error: {
            code: 'CHALLENGE_NOT_FOUND',
            message: 'Challenge not found or expired',
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
            message: 'Challenge has expired',
          },
        };
      }

      // Verify based on challenge type
      const challengeType = (challenge.metadata as { type?: string } | undefined)?.type;

      if (challengeType === 'password_reset') {
        return await this.verifyPasswordResetChallenge(
          challenge,
          response,
          correlationId
        );
      } else if (challengeType === 'account_recovery') {
        return await this.verifyAccountRecoveryChallenge(
          challenge,
          response,
          correlationId
        );
      } else {
        // Default to email code verification
        return await this.verifyEmailCodeChallenge(
          challenge,
          response,
          correlationId
        );
      }
    } catch (error) {
      this.logger.error('Fallback challenge verification error', {
        correlationId,
        challengeId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        success: false,
        error: {
          code: 'CHALLENGE_VERIFICATION_ERROR',
          message: 'Failed to verify challenge',
        },
      };
    }
  }

  /**
   * Verify email code challenge
   */
  private async verifyEmailCodeChallenge(
    challenge: any,
    code: string,
    correlationId: string
  ): Promise<{
    success: boolean;
    user?: User | undefined;
    nextStep?: string | undefined;
    error?: FallbackError | undefined;
  }> {
    // Use MFA service to verify email code
    const verificationResult = await this.mfaService.verifyEmailCode(
      challenge.id,
      code
    );

    if (verificationResult.success) {
      this.logger.info('Email code fallback verification successful', {
        correlationId,
        userId: challenge.userId,
      });

      return {
        success: true,
        user: verificationResult.user || undefined,
        nextStep: 'authentication_complete',
      };
    }

    return {
      success: false,
      error: {
        code:
          verificationResult.error?.code || 'EMAIL_CODE_VERIFICATION_FAILED',
        message:
          verificationResult.error?.message || 'Email code verification failed',
      },
    };
  }

  /**
   * Verify password reset challenge
   */
  private async verifyPasswordResetChallenge(
    challenge: any,
    token: string,
    correlationId: string
  ): Promise<{
    success: boolean;
    user?: User | undefined;
    nextStep?: string | undefined;
    error?: FallbackError | undefined;
  }> {
    const storedToken = challenge.metadata?.resetToken;
    if (!storedToken || storedToken !== token) {
      await this.challengeRepository.incrementAttempts(challenge.id);
      return {
        success: false,
        error: {
          code: 'INVALID_RESET_TOKEN',
          message: 'Invalid password reset token',
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
    await this.challengeRepository.deleteChallenge(challenge.id);

    this.logger.info('Password reset token verification successful', {
      correlationId,
      userId: challenge.userId,
    });

    return {
      success: true,
      user: this.convertToUserEntity(user),
      nextStep: 'set_new_password',
    };
  }

  /**
   * Verify account recovery challenge
   */
  private async verifyAccountRecoveryChallenge(
    challenge: any,
    token: string,
    correlationId: string
  ): Promise<{
    success: boolean;
    user?: User | undefined;
    nextStep?: string | undefined;
    error?: FallbackError | undefined;
  }> {
    const storedToken = challenge.metadata?.recoveryToken;
    if (!storedToken || storedToken !== token) {
      await this.challengeRepository.incrementAttempts(challenge.id);
      return {
        success: false,
        error: {
          code: 'INVALID_RECOVERY_TOKEN',
          message: 'Invalid account recovery token',
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

    // Don't clean up challenge yet - recovery process may require multiple steps

    this.logger.info('Account recovery token verification successful', {
      correlationId,
      userId: challenge.userId,
    });

    return {
      success: true,
      user: this.convertToUserEntity(user),
      nextStep: 'complete_account_recovery',
    };
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
    if (!domain || !localPart) return email;

    const maskedLocal =
      localPart.length > 2
        ? localPart[0] +
          '*'.repeat(localPart.length - 2) +
          localPart[localPart.length - 1]
        : '*'.repeat(localPart.length);

    return `${maskedLocal}@${domain}`;
  }
}

