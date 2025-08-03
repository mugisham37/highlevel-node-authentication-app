/**
 * Core Authentication Service Implementation
 * Primary authentication service with email/password support, token validation,
 * account lockout logic, and risk scoring integration
 */

import { Logger } from 'winston';
import { User } from '../../domain/entities/user';
import { Session } from '../../domain/entities/session';
import { Email } from '../../domain/value-objects/email';
import { Password } from '../../domain/value-objects/password';
import { DeviceInfo } from '../../domain/entities/user';
import { PrismaUserRepository } from '../../infrastructure/database/repositories/prisma-user-repository';
import { DrizzleSessionRepository } from '../../infrastructure/database/repositories/drizzle-session-repository';
import { PasswordHashingService } from '../../infrastructure/security/password-hashing.service';
import {
  JWTTokenService,
  TokenPair,
} from '../../infrastructure/security/jwt-token.service';
import { RiskScoringService } from '../../infrastructure/security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../infrastructure/security/device-fingerprinting.service';
import { SecureIdGenerator } from '../../infrastructure/security/secure-id-generator.service';
import {
  SecurityContext,
  RiskAssessment,
} from '../../infrastructure/security/types';

export interface AuthCredentials {
  type: 'email_password' | 'oauth' | 'passwordless' | 'mfa';
  email?: string;
  password?: string;
  provider?: string;
  token?: string;
  mfaCode?: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
}

export interface AuthResult {
  success: boolean;
  user?: User;
  tokens?: TokenPair;
  session?: Session;
  requiresMFA?: boolean;
  mfaChallenge?: MFAChallenge;
  riskScore: number;
  riskAssessment?: RiskAssessment;
  error?: AuthError;
}

export interface MFAChallenge {
  type: 'totp' | 'sms' | 'email' | 'webauthn';
  challengeId: string;
  expiresAt: Date;
  metadata?: Record<string, any>;
}

export interface AuthError {
  code: string;
  message: string;
  details?: Record<string, any>;
}

export interface TokenValidation {
  valid: boolean;
  user?: User;
  session?: Session;
  error?: AuthError;
  requiresRefresh?: boolean;
}

export interface RefreshTokenRequest {
  refreshToken: string;
  deviceInfo: DeviceInfo;
  ipAddress: string;
  userAgent: string;
}

export class AuthenticationService {
  constructor(
    private readonly userRepository: PrismaUserRepository,
    private readonly sessionRepository: DrizzleSessionRepository,
    private readonly passwordHashingService: PasswordHashingService,
    private readonly jwtTokenService: JWTTokenService,
    private readonly riskScoringService: RiskScoringService,
    private readonly logger: Logger
  ) {}

  /**
   * Primary authentication method supporting email/password
   */
  async authenticate(credentials: AuthCredentials): Promise<AuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Authentication attempt started', {
        correlationId,
        type: credentials.type,
        email: credentials.email,
        ipAddress: credentials.ipAddress,
        userAgent: credentials.userAgent?.substring(0, 100),
      });

      // Validate credentials format
      const validationError = this.validateCredentials(credentials);
      if (validationError) {
        return this.createFailureResult(validationError, 0, correlationId);
      }

      // Handle different authentication types
      switch (credentials.type) {
        case 'email_password':
          return await this.authenticateEmailPassword(
            credentials,
            correlationId
          );
        case 'mfa':
          return await this.authenticateMFA(credentials, correlationId);
        default:
          return this.createFailureResult(
            {
              code: 'UNSUPPORTED_AUTH_TYPE',
              message: `Authentication type ${credentials.type} is not yet implemented`,
            },
            0,
            correlationId
          );
      }
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Authentication error', {
        correlationId,
        error: errorMessage,
        stack: errorStack,
        credentials: {
          type: credentials.type,
          email: credentials.email,
          ipAddress: credentials.ipAddress,
        },
      });

      return this.createFailureResult(
        {
          code: 'INTERNAL_ERROR',
          message: 'An internal error occurred during authentication',
        },
        0,
        correlationId
      );
    }
  }

  /**
   * Email/password authentication implementation
   */
  private async authenticateEmailPassword(
    credentials: AuthCredentials,
    correlationId: string
  ): Promise<AuthResult> {
    if (!credentials.email || !credentials.password) {
      return this.createFailureResult(
        {
          code: 'MISSING_CREDENTIALS',
          message: 'Email and password are required',
        },
        0,
        correlationId
      );
    }

    // Record authentication attempt
    await this.recordAuthAttempt({
      email: credentials.email,
      ipAddress: credentials.ipAddress,
      userAgent: credentials.userAgent,
      success: false, // Will update if successful
      deviceFingerprint: credentials.deviceInfo.fingerprint,
    });

    // Find user by email
    const user = await this.userRepository.findByEmail(credentials.email);
    if (!user) {
      this.logger.warn('Authentication failed - user not found', {
        correlationId,
        email: credentials.email,
        ipAddress: credentials.ipAddress,
      });

      return this.createFailureResult(
        {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
        30, // Base risk score for invalid credentials
        correlationId
      );
    }

    // Convert to domain entity
    const userEntity = this.convertToUserEntity(user);

    // Check if account is locked
    if (userEntity.isLocked()) {
      this.logger.warn('Authentication failed - account locked', {
        correlationId,
        userId: user.id,
        email: credentials.email,
        lockedUntil: userEntity.lockedUntil,
      });

      return this.createFailureResult(
        {
          code: 'ACCOUNT_LOCKED',
          message:
            'Account is temporarily locked due to too many failed attempts',
          details: {
            lockedUntil: userEntity.lockedUntil,
            failedAttempts: userEntity.failedLoginAttempts,
          },
        },
        80, // High risk score for locked account
        correlationId
      );
    }

    // Check if email is verified
    if (!userEntity.isEmailVerified()) {
      this.logger.warn('Authentication failed - email not verified', {
        correlationId,
        userId: user.id,
        email: credentials.email,
        emailVerified: userEntity.emailVerified,
      });

      return this.createFailureResult(
        {
          code: 'ACCOUNT_NOT_VERIFIED',
          message: 'Account email must be verified before authentication',
        },
        50,
        correlationId
      );
    }

    // Verify password
    if (!user.passwordHash) {
      return this.createFailureResult(
        {
          code: 'NO_PASSWORD_SET',
          message: 'No password set for this account',
        },
        40,
        correlationId
      );
    }

    const passwordValid = await this.passwordHashingService.verifyPassword(
      credentials.password,
      user.passwordHash
    );

    if (!passwordValid) {
      // Increment failed attempts
      await this.userRepository.incrementFailedLoginAttempts(user.id);

      this.logger.warn('Authentication failed - invalid password', {
        correlationId,
        userId: user.id,
        email: credentials.email,
        failedAttempts: user.failedLoginAttempts + 1,
      });

      return this.createFailureResult(
        {
          code: 'INVALID_CREDENTIALS',
          message: 'Invalid email or password',
        },
        60, // Higher risk for password failure
        correlationId
      );
    }

    // Perform risk assessment
    const riskAssessment = await this.performRiskAssessment(
      userEntity,
      credentials,
      correlationId
    );

    // Check if access should be blocked based on risk
    if (!riskAssessment.allowAccess) {
      this.logger.warn('Authentication blocked due to high risk', {
        correlationId,
        userId: user.id,
        riskScore: riskAssessment.overallScore,
        riskLevel: riskAssessment.level,
      });

      return this.createFailureResult(
        {
          code: 'HIGH_RISK_BLOCKED',
          message: 'Authentication blocked due to security concerns',
          details: {
            riskScore: riskAssessment.overallScore,
            recommendations: riskAssessment.recommendations,
          },
        },
        riskAssessment.overallScore,
        correlationId
      );
    }

    // Check if MFA is required
    if (riskAssessment.requiresMFA || userEntity.mfaEnabled) {
      this.logger.info('MFA required for authentication', {
        correlationId,
        userId: user.id,
        mfaEnabled: userEntity.mfaEnabled,
        riskScore: riskAssessment.overallScore,
      });

      // Create MFA challenge
      const mfaChallenge = await this.createMFAChallenge(
        userEntity,
        correlationId
      );

      return {
        success: false,
        requiresMFA: true,
        mfaChallenge,
        riskScore: riskAssessment.overallScore,
        riskAssessment,
      };
    }

    // Authentication successful - create session and tokens
    const result = await this.createSuccessfulAuthResult(
      userEntity,
      credentials,
      riskAssessment,
      correlationId
    );

    // Reset failed login attempts
    await this.userRepository.resetFailedLoginAttempts(user.id);

    // Update user login information
    userEntity.updateLastLogin(credentials.ipAddress, credentials.deviceInfo);
    const updateData: any = {
      riskScore: userEntity.riskScore,
    };
    if (userEntity.lastLoginAt) {
      updateData.lastLoginAt = userEntity.lastLoginAt;
    }
    if (userEntity.lastLoginIP) {
      updateData.lastLoginIP = userEntity.lastLoginIP;
    }
    await this.userRepository.updateUser(user.id, updateData);

    // Record successful authentication attempt
    await this.recordAuthAttempt({
      userId: user.id,
      email: credentials.email,
      ipAddress: credentials.ipAddress,
      userAgent: credentials.userAgent,
      success: true,
      deviceFingerprint: credentials.deviceInfo.fingerprint,
      riskScore: riskAssessment.overallScore,
    });

    this.logger.info('Authentication successful', {
      correlationId,
      userId: user.id,
      email: credentials.email,
      riskScore: riskAssessment.overallScore,
      sessionId: result.session?.id,
    });

    return result;
  }

  /**
   * MFA authentication implementation
   */
  private async authenticateMFA(
    _credentials: AuthCredentials,
    _correlationId: string
  ): Promise<AuthResult> {
    // MFA implementation would go here
    // For now, return not implemented
    return this.createFailureResult(
      {
        code: 'NOT_IMPLEMENTED',
        message: 'MFA authentication is not yet implemented',
      },
      0,
      _correlationId
    );
  }

  /**
   * Validate JWT token and return user/session information
   */
  async validateToken(token: string): Promise<TokenValidation> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.debug('Token validation started', {
        correlationId,
        tokenPrefix: token.substring(0, 10),
      });

      // Verify JWT token
      const tokenResult = this.jwtTokenService.verifyAccessToken(token);
      if (!tokenResult.valid || !tokenResult.payload) {
        this.logger.warn('Token validation failed - invalid token', {
          correlationId,
          error: tokenResult.error,
        });

        return {
          valid: false,
          error: {
            code: 'INVALID_TOKEN',
            message: tokenResult.error || 'Token is invalid',
          },
          requiresRefresh: tokenResult.expired || false,
        };
      }

      const payload = tokenResult.payload as any;

      // Validate session if sessionId is present
      if (payload.sessionId) {
        const sessionValidation =
          await this.sessionRepository.validateSession(token);
        if (!sessionValidation.isValid) {
          this.logger.warn('Token validation failed - invalid session', {
            correlationId,
            sessionId: payload.sessionId,
            reason: sessionValidation.reason,
          });

          return {
            valid: false,
            error: {
              code: 'INVALID_SESSION',
              message: sessionValidation.reason || 'Session is invalid',
            },
          };
        }

        // Convert session to domain entity
        const session = this.convertToSessionEntity(sessionValidation.session!);

        // Get user
        const user = await this.userRepository.findById(payload.sub);
        if (!user) {
          return {
            valid: false,
            error: {
              code: 'USER_NOT_FOUND',
              message: 'User associated with token not found',
            },
          };
        }

        const userEntity = this.convertToUserEntity(user);

        this.logger.debug('Token validation successful', {
          correlationId,
          userId: user.id,
          sessionId: session.id,
        });

        return {
          valid: true,
          user: userEntity,
          session,
        };
      }

      // Token without session (e.g., special tokens)
      const user = await this.userRepository.findById(payload.sub);
      if (!user) {
        return {
          valid: false,
          error: {
            code: 'USER_NOT_FOUND',
            message: 'User associated with token not found',
          },
        };
      }

      const userEntity = this.convertToUserEntity(user);

      return {
        valid: true,
        user: userEntity,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Token validation error', {
        correlationId,
        error: errorMessage,
        stack: errorStack,
      });

      return {
        valid: false,
        error: {
          code: 'VALIDATION_ERROR',
          message: 'An error occurred during token validation',
        },
      };
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshToken(request: RefreshTokenRequest): Promise<AuthResult> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Token refresh started', {
        correlationId,
        ipAddress: request.ipAddress,
      });

      // Verify refresh token
      const tokenResult = this.jwtTokenService.verifyRefreshToken(
        request.refreshToken
      );
      if (!tokenResult.valid || !tokenResult.payload) {
        this.logger.warn('Token refresh failed - invalid refresh token', {
          correlationId,
          error: tokenResult.error,
        });

        return this.createFailureResult(
          {
            code: 'INVALID_REFRESH_TOKEN',
            message: tokenResult.error || 'Refresh token is invalid',
          },
          30,
          correlationId
        );
      }

      const payload = tokenResult.payload as any;

      // Validate session
      const session = await this.sessionRepository.refreshSession(
        request.refreshToken
      );
      if (!session) {
        this.logger.warn(
          'Token refresh failed - session not found or expired',
          {
            correlationId,
            sessionId: payload.sessionId,
          }
        );

        return this.createFailureResult(
          {
            code: 'SESSION_EXPIRED',
            message: 'Session has expired, please log in again',
          },
          20,
          correlationId
        );
      }

      // Get user
      const user = await this.userRepository.findById(payload.sub);
      if (!user) {
        return this.createFailureResult(
          {
            code: 'USER_NOT_FOUND',
            message: 'User not found',
          },
          40,
          correlationId
        );
      }

      const userEntity = this.convertToUserEntity(user);
      const sessionEntity = this.convertToSessionEntity(session);

      // Perform risk assessment for refresh
      const riskAssessment = await this.performRiskAssessment(
        userEntity,
        {
          type: 'email_password',
          deviceInfo: request.deviceInfo,
          ipAddress: request.ipAddress,
          userAgent: request.userAgent,
        },
        correlationId
      );

      // Update session risk score
      sessionEntity.calculateRiskScore(request.ipAddress, request.deviceInfo);

      // Create new token pair
      const tokens = this.jwtTokenService.createTokenPair({
        sub: user.id,
        sessionId: session.id,
        deviceId: request.deviceInfo.fingerprint,
        riskScore: riskAssessment.overallScore,
        permissions: [], // Would be populated from user roles
        roles: [], // Would be populated from user roles
      });

      this.logger.info('Token refresh successful', {
        correlationId,
        userId: user.id,
        sessionId: session.id,
        riskScore: riskAssessment.overallScore,
      });

      return {
        success: true,
        user: userEntity,
        tokens,
        session: sessionEntity,
        riskScore: riskAssessment.overallScore,
        riskAssessment,
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : undefined;
      this.logger.error('Token refresh error', {
        correlationId,
        error: errorMessage,
        stack: errorStack,
      });

      return this.createFailureResult(
        {
          code: 'REFRESH_ERROR',
          message: 'An error occurred during token refresh',
        },
        0,
        correlationId
      );
    }
  }

  /**
   * Logout user and terminate session
   */
  async logout(sessionId: string): Promise<void> {
    const correlationId = SecureIdGenerator.generateCorrelationId();

    try {
      this.logger.info('Logout started', {
        correlationId,
        sessionId,
      });

      await this.sessionRepository.terminateSession(sessionId);

      this.logger.info('Logout successful', {
        correlationId,
        sessionId,
      });
    } catch (error) {
      this.logger.error('Logout error', {
        correlationId,
        sessionId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Validate credentials format
   */
  private validateCredentials(credentials: AuthCredentials): AuthError | null {
    if (!credentials.deviceInfo) {
      return {
        code: 'MISSING_DEVICE_INFO',
        message: 'Device information is required',
      };
    }

    if (!credentials.ipAddress) {
      return {
        code: 'MISSING_IP_ADDRESS',
        message: 'IP address is required',
      };
    }

    if (!credentials.userAgent) {
      return {
        code: 'MISSING_USER_AGENT',
        message: 'User agent is required',
      };
    }

    if (credentials.type === 'email_password') {
      if (!credentials.email) {
        return {
          code: 'MISSING_EMAIL',
          message: 'Email is required for email/password authentication',
        };
      }

      if (!credentials.password) {
        return {
          code: 'MISSING_PASSWORD',
          message: 'Password is required for email/password authentication',
        };
      }

      // Validate email format
      try {
        new Email(credentials.email);
      } catch (error) {
        return {
          code: 'INVALID_EMAIL',
          message: 'Invalid email format',
        };
      }
    }

    return null;
  }

  /**
   * Perform comprehensive risk assessment
   */
  private async performRiskAssessment(
    user: User,
    credentials: AuthCredentials,
    correlationId: string
  ): Promise<RiskAssessment> {
    try {
      // Get device fingerprint
      const fingerprintInput = {
        userAgent: credentials.userAgent,
        ipAddress: credentials.ipAddress,
        acceptLanguage: credentials.deviceInfo.browser,
        platform: credentials.deviceInfo.platform,
        ...(credentials.deviceInfo.screenResolution && { screenResolution: credentials.deviceInfo.screenResolution }),
        ...(credentials.deviceInfo.timezone && { timezone: credentials.deviceInfo.timezone }),
      };
      const deviceFingerprint = DeviceFingerprintingService.createFingerprint(fingerprintInput);

      // Build security context
      const securityContext: SecurityContext = {
        userId: user.id,
        deviceFingerprint,
        ipAddress: credentials.ipAddress,
        userAgent: credentials.userAgent,
        timestamp: new Date(),
        accountAge: Math.floor(
          (Date.now() - user.createdAt.getTime()) / (1000 * 60 * 60 * 24)
        ),
        failedAttempts: user.failedLoginAttempts,
      };

      // Perform risk assessment
      const riskAssessment =
        await this.riskScoringService.assessRisk(securityContext);

      this.logger.debug('Risk assessment completed', {
        correlationId,
        userId: user.id,
        riskScore: riskAssessment.overallScore,
        riskLevel: riskAssessment.level,
        factorCount: riskAssessment.factors.length,
      });

      return riskAssessment;
    } catch (error) {
      this.logger.error('Risk assessment error', {
        correlationId,
        userId: user.id,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      // Return default medium risk assessment on error
      return {
        overallScore: 50,
        level: 'medium',
        factors: [],
        recommendations: [
          'Monitor authentication closely due to assessment error',
        ],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      };
    }
  }

  /**
   * Create MFA challenge
   */
  private async createMFAChallenge(
    user: User,
    _correlationId: string
  ): Promise<MFAChallenge> {
    const challengeId = SecureIdGenerator.generateSecureId();
    const expiresAt = new Date(Date.now() + 5 * 60 * 1000); // 5 minutes

    // For now, default to TOTP if MFA is enabled
    if (user.mfaEnabled && user.totpSecret) {
      return {
        type: 'totp',
        challengeId,
        expiresAt,
        metadata: {
          userId: user.id,
        },
      };
    }

    // Default to email MFA
    return {
      type: 'email',
      challengeId,
      expiresAt,
      metadata: {
        userId: user.id,
        email: user.email.value,
      },
    };
  }

  /**
   * Create successful authentication result
   */
  private async createSuccessfulAuthResult(
    user: User,
    credentials: AuthCredentials,
    riskAssessment: RiskAssessment,
    _correlationId: string
  ): Promise<AuthResult> {
    // Generate session ID
    const sessionId = SecureIdGenerator.generateSecureId();

    // Create tokens
    const tokens = this.jwtTokenService.createTokenPair({
      sub: user.id,
      sessionId,
      deviceId: credentials.deviceInfo.fingerprint,
      riskScore: riskAssessment.overallScore,
      permissions: [], // Would be populated from user roles
      roles: [], // Would be populated from user roles
    });

    // Create session
    const sessionData = {
      id: sessionId,
      userId: user.id,
      token: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: new Date(Date.now() + tokens.expiresIn * 1000),
      refreshExpiresAt: new Date(Date.now() + tokens.refreshExpiresIn * 1000),
      ipAddress: credentials.ipAddress,
      deviceFingerprint: credentials.deviceInfo.fingerprint,
      userAgent: credentials.userAgent,
      riskScore: riskAssessment.overallScore,
    };

    const sessionRecord =
      await this.sessionRepository.createSession(sessionData);
    const session = this.convertToSessionEntity(sessionRecord);

    return {
      success: true,
      user,
      tokens,
      session,
      riskScore: riskAssessment.overallScore,
      riskAssessment,
    };
  }

  /**
   * Create failure result
   */
  private createFailureResult(
    error: AuthError,
    riskScore: number,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    correlationId: string
  ): AuthResult {
    this.logger.warn('Authentication failed', {
      correlationId,
      errorCode: error.code,
      errorMessage: error.message,
      riskScore,
    });

    return {
      success: false,
      error,
      riskScore,
    };
  }

  /**
   * Record authentication attempt
   */
  private async recordAuthAttempt(data: {
    userId?: string;
    email?: string;
    ipAddress: string;
    userAgent: string;
    success: boolean;
    failureReason?: string;
    deviceFingerprint?: string;
    riskScore?: number;
  }): Promise<void> {
    try {
      await this.sessionRepository.recordAuthAttempt(data);
    } catch (error) {
      this.logger.error('Failed to record auth attempt', {
        error: error instanceof Error ? error.message : 'Unknown error',
        data,
      });
      // Don't throw as this is not critical for authentication flow
    }
  }

  /**
   * Convert database user to domain entity
   */
  private convertToUserEntity(user: any): User {
    const userProps: any = {
      id: user.id,
      email: new Email(user.email),
      emailVerified: user.emailVerified,
      name: user.name,
      image: user.image,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      mfaEnabled: user.mfaEnabled,
      totpSecret: user.totpSecret,
      backupCodes: user.backupCodes || [],
      failedLoginAttempts: user.failedLoginAttempts,
      lockedUntil: user.lockedUntil,
      lastLoginAt: user.lastLoginAt,
      lastLoginIP: user.lastLoginIP,
      riskScore: user.riskScore,
    };

    if (user.passwordHash) {
      userProps.password = new Password(user.passwordHash, true);
    }

    return new User(userProps);
  }

  /**
   * Convert database session to domain entity
   */
  private convertToSessionEntity(session: any): Session {
    const sessionProps: any = {
      id: session.id,
      userId: session.userId,
      token: session.token,
      refreshToken: session.refreshToken,
      expiresAt: session.expiresAt,
      refreshExpiresAt: session.refreshExpiresAt,
      createdAt: session.createdAt,
      lastActivity: session.lastActivity,
      ipAddress: session.ipAddress,
      userAgent: session.userAgent,
      riskScore: session.riskScore,
      isActive: session.isActive,
    };

    if (session.deviceFingerprint) {
      sessionProps.deviceInfo = {
        fingerprint: session.deviceFingerprint,
        userAgent: session.userAgent || '',
        platform: '',
        browser: '',
        version: '',
        isMobile: false,
      };
    }

    return new Session(sessionProps);
  }
}
