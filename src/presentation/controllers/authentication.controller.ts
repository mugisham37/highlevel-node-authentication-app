/**
 * Authentication Controller
 * Handles core authentication endpoints including login, logout, token refresh,
 * password reset, and MFA operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { AuthenticationService } from '../../application/services/authentication.service';
import { MFAService } from '../../application/services/mfa.service';
import { SessionManagementService } from '../../application/services/session-management.service';
import { logger } from '../../infrastructure/logging/winston-logger';
import {
  LoginRequest,
  RefreshTokenRequest,
  LogoutRequest,
  PasswordResetRequest,
  PasswordResetConfirm,
  ChangePassword,
  MFASetupRequest,
  MFAVerifyRequest,
  MFAChallengeRequest,
  AuthResponse,
} from '../schemas/auth.schemas';

export class AuthenticationController {
  constructor(
    private authenticationService: AuthenticationService,
    private mfaService: MFAService,
    private sessionService: SessionManagementService
  ) {}

  /**
   * Ensure DeviceInfo has required platform field
   */
  private ensureDeviceInfo(deviceInfo: any): import('../../domain/entities/user').DeviceInfo {
    return {
      ...deviceInfo,
      platform: deviceInfo.platform || 'unknown',
    };
  }

  /**
   * User login with email/password
   */
  async login(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const loginData = request.body as LoginRequest;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || '';

      const result = await this.authenticationService.authenticate({
        type: 'email_password',
        email: loginData.email,
        password: loginData.password,
        deviceInfo: this.ensureDeviceInfo(loginData.deviceInfo),
        ipAddress,
        userAgent,
      });

      logger.info('Login attempt', {
        correlationId: request.correlationId,
        email: loginData.email,
        success: result.success,
        requiresMFA: result.requiresMFA,
        riskScore: result.riskScore,
        ipAddress,
      });

      if (!result.success) {
        reply.status(401).send({
          success: false,
          error: result.error?.code || 'AUTHENTICATION_FAILED',
          message: result.error?.message || 'Authentication failed',
          correlationId: request.correlationId,
        });
        return;
      }

      const responseData: AuthResponse = {
        success: true,
        data: {
          user: result.user
            ? {
                id: result.user.id,
                email: result.user.email.value,
                name: result.user.name,
                image: result.user.image,
                emailVerified: result.user.isEmailVerified(),
                mfaEnabled: result.user.mfaEnabled,
                createdAt: result.user.createdAt.toISOString(),
                lastLoginAt: result.user.lastLoginAt?.toISOString() || null,
              }
            : undefined,
          tokens: result.tokens
            ? {
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
                tokenType: result.tokens.tokenType,
              }
            : undefined,
          session: result.session
            ? {
                id: result.session.id,
                expiresAt: result.session.expiresAt.toISOString(),
                deviceInfo: result.session.deviceInfo || {
                  fingerprint: 'unknown',
                  userAgent: userAgent,
                  platform: 'unknown',
                  isMobile: false,
                },
              }
            : undefined,
          requiresMFA: result.requiresMFA,
          mfaChallenge: result.mfaChallenge
            ? {
                challengeId: result.mfaChallenge.challengeId,
                type: result.mfaChallenge.type as any,
                expiresAt: result.mfaChallenge.expiresAt.toISOString(),
              }
            : undefined,
          riskScore: result.riskScore,
        },
        message: result.requiresMFA ? 'MFA required' : 'Login successful',
      };

      reply.status(200).send(responseData);
    } catch (error) {
      logger.error('Login error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        email: (request.body as any)?.email,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during authentication',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Refresh access token
   */
  async refreshToken(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const refreshData = request.body as RefreshTokenRequest;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || '';

      const result = await this.authenticationService.refreshToken(
        refreshData.refreshToken,
        {
          deviceInfo: this.ensureDeviceInfo(refreshData.deviceInfo),
          ipAddress,
          userAgent,
        }
      );

      logger.info('Token refresh attempt', {
        correlationId: request.correlationId,
        success: result.success,
        ipAddress,
      });

      if (!result.success) {
        reply.status(401).send({
          success: false,
          error: 'TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh token',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          tokens: {
            accessToken: result.tokens!.accessToken,
            refreshToken: result.tokens!.refreshToken,
            expiresIn: result.tokens!.expiresIn,
            tokenType: result.tokens!.tokenType,
          },
        },
        message: 'Token refreshed successfully',
      });
    } catch (error) {
      logger.error('Token refresh error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during token refresh',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * User logout
   */
  async logout(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const logoutData = request.body as LogoutRequest;
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      if (logoutData.allSessions) {
        await this.sessionService.terminateAllUserSessions(userId);
      } else if (logoutData.sessionId) {
        await this.sessionService.terminateSession(logoutData.sessionId);
      } else {
        // Terminate current session
        const currentSessionId = request.session?.id;
        if (currentSessionId) {
          await this.sessionService.terminateSession(currentSessionId);
        }
      }

      logger.info('User logout', {
        correlationId: request.correlationId,
        userId,
        allSessions: logoutData.allSessions,
        sessionId: logoutData.sessionId,
      });

      reply.status(200).send({
        success: true,
        message: 'Logout successful',
      });
    } catch (error) {
      logger.error('Logout error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during logout',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Initiate password reset
   */
  async initiatePasswordReset(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const resetData = request.body as PasswordResetRequest;

      await this.authenticationService.initiatePasswordReset(resetData.email);

      logger.info('Password reset initiated', {
        correlationId: request.correlationId,
        email: resetData.email,
      });

      // Always return success to prevent email enumeration
      reply.status(200).send({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
      });
    } catch (error) {
      logger.error('Password reset initiation error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        email: (request.body as any)?.email,
      });

      // Still return success to prevent information disclosure
      reply.status(200).send({
        success: true,
        message: 'If the email exists, a password reset link has been sent',
      });
    }
  }

  /**
   * Confirm password reset
   */
  async confirmPasswordReset(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const resetData = request.body as PasswordResetConfirm;

      const result = await this.authenticationService.confirmPasswordReset(
        resetData.token,
        resetData.password
      );

      logger.info('Password reset confirmation', {
        correlationId: request.correlationId,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: 'PASSWORD_RESET_FAILED',
          message: 'Invalid or expired reset token',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        message: 'Password reset successful',
      });
    } catch (error) {
      logger.error('Password reset confirmation error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during password reset',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Change password (authenticated user)
   */
  async changePassword(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const changeData = request.body as ChangePassword;
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const result = await this.authenticationService.changePassword(
        userId,
        changeData.currentPassword,
        changeData.newPassword
      );

      logger.info('Password change attempt', {
        correlationId: request.correlationId,
        userId,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: 'PASSWORD_CHANGE_FAILED',
          message: 'Current password is incorrect',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        message: 'Password changed successfully',
      });
    } catch (error) {
      logger.error('Password change error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during password change',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Setup MFA for user
   */
  async setupMFA(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const setupData = request.body as MFASetupRequest;
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const result = await this.mfaService.setupMFA(userId, setupData.type, {
        ...(setupData.phoneNumber && { phoneNumber: setupData.phoneNumber }),
      });

      logger.info('MFA setup initiated', {
        correlationId: request.correlationId,
        userId,
        type: setupData.type,
      });

      reply.status(200).send({
        success: true,
        data: result,
        message: 'MFA setup initiated',
      });
    } catch (error) {
      logger.error('MFA setup error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during MFA setup',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Verify MFA setup
   */
  async verifyMFA(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const verifyData = request.body as MFAVerifyRequest;
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const result = await this.mfaService.verifyMFA(
        userId, // Use userId as challengeId for now
        verifyData.code,
        verifyData.type
      );

      logger.info('MFA verification attempt', {
        correlationId: request.correlationId,
        userId,
        type: verifyData.type,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: 'MFA_VERIFICATION_FAILED',
          message: 'Invalid MFA code',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: result,
        message: 'MFA verified successfully',
      });
    } catch (error) {
      logger.error('MFA verification error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during MFA verification',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Handle MFA challenge during login
   */
  async handleMFAChallenge(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const challengeData = request.body as MFAChallengeRequest;

      const result = await this.mfaService.completeMFAChallenge(
        challengeData.sessionId,
        challengeData.type,
        challengeData.code
      );

      logger.info('MFA challenge attempt', {
        correlationId: request.correlationId,
        sessionId: challengeData.sessionId,
        type: challengeData.type,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: 'MFA_CHALLENGE_FAILED',
          message: 'Invalid MFA code',
          correlationId: request.correlationId,
        });
        return;
      }

      const responseData: AuthResponse = {
        success: true,
        data: {
          user: result.user
            ? {
                id: result.user.id,
                email: result.user.email.value,
                name: result.user.name,
                image: result.user.image,
                emailVerified: result.user.isEmailVerified(),
                mfaEnabled: result.user.mfaEnabled,
                createdAt: result.user.createdAt.toISOString(),
                lastLoginAt: result.user.lastLoginAt?.toISOString() || null,
              }
            : undefined,
          tokens: result.tokens
            ? {
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
                tokenType: result.tokens.tokenType,
              }
            : undefined,
          session: result.session
            ? {
                id: result.session.id,
                expiresAt: result.session.expiresAt,
                deviceInfo: result.session.deviceInfo,
              }
            : undefined,
          riskScore: result.riskScore || 0,
        },
        message: 'MFA challenge completed successfully',
      };

      reply.status(200).send(responseData);
    } catch (error) {
      logger.error('MFA challenge error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        sessionId: (request.body as any)?.sessionId,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during MFA challenge',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Get current user profile
   */
  async getProfile(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const user = await this.authenticationService.getUserById(userId);

      if (!user) {
        reply.status(404).send({
          success: false,
          error: 'USER_NOT_FOUND',
          message: 'User not found',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          user: {
            id: user.id,
            email: user.email.value,
            name: user.name,
            image: user.image,
            emailVerified: user.isEmailVerified(),
            mfaEnabled: user.mfaEnabled,
            createdAt: user.createdAt.toISOString(),
            lastLoginAt: user.lastLoginAt?.toISOString() || null,
          },
        },
      });
    } catch (error) {
      logger.error('Get profile error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error while fetching profile',
        correlationId: request.correlationId,
      });
    }
  }
}
