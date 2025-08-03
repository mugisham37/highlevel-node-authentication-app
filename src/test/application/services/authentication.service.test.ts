/**
 * Authentication Service Tests
 * Comprehensive tests for the core authentication service
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { AuthenticationService } from '../../../application/services/authentication.service';
import { PrismaUserRepository } from '../../../infrastructure/database/repositories/prisma-user-repository';
import { DrizzleSessionRepository } from '../../../infrastructure/database/repositories/drizzle-session-repository';
import { PasswordHashingService } from '../../../infrastructure/security/password-hashing.service';
import { JWTTokenService } from '../../../infrastructure/security/jwt-token.service';
import { RiskScoringService } from '../../../infrastructure/security/risk-scoring.service';
import { DeviceFingerprintingService } from '../../../infrastructure/security/device-fingerprinting.service';
import { SecureIdGenerator } from '../../../infrastructure/security/secure-id-generator.service';
import { Email } from '../../../domain/value-objects/email';
import { Password } from '../../../domain/value-objects/password';
import { User } from '../../../domain/entities/user';
import { AuthCredentials } from '../../../application/interfaces/authentication.interface';

// Mock dependencies
const mockUserRepository = {
  findByEmail: vi.fn(),
  findById: vi.fn(),
  incrementFailedLoginAttempts: vi.fn(),
  resetFailedLoginAttempts: vi.fn(),
  updateUser: vi.fn(),
} as any;

const mockSessionRepository = {
  createSession: vi.fn(),
  validateSession: vi.fn(),
  refreshSession: vi.fn(),
  terminateSession: vi.fn(),
  recordAuthAttempt: vi.fn(),
} as any;

const mockPasswordHashingService = {
  verifyPassword: vi.fn(),
} as any;

const mockJwtTokenService = {
  createTokenPair: vi.fn(),
  verifyAccessToken: vi.fn(),
  verifyRefreshToken: vi.fn(),
} as any;

const mockRiskScoringService = {
  assessRisk: vi.fn(),
} as any;

const mockDeviceFingerprintingService = {
  createFingerprint: vi.fn(),
} as any;

// Mock the SecureIdGenerator static methods
vi.mock('../../../infrastructure/security/secure-id-generator.service', () => ({
  SecureIdGenerator: {
    generateCorrelationId: vi.fn(() => 'test-correlation-id'),
    generateSecureId: vi.fn(() => 'test-secure-id'),
  },
}));

const mockLogger = {
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
} as any;

describe('AuthenticationService', () => {
  let authService: AuthenticationService;

  beforeEach(() => {
    vi.clearAllMocks();

    authService = new AuthenticationService(
      mockUserRepository,
      mockSessionRepository,
      mockPasswordHashingService,
      mockJwtTokenService,
      mockRiskScoringService,
      mockDeviceFingerprintingService,
      mockLogger
    );

    // Default mock implementations
    mockSessionRepository.recordAuthAttempt.mockResolvedValue({});
  });

  describe('authenticate', () => {
    const validCredentials: AuthCredentials = {
      type: 'email_password',
      email: 'test@example.com',
      password: 'password123',
      deviceInfo: {
        fingerprint: 'device-fingerprint',
        userAgent: 'Mozilla/5.0',
        platform: 'Windows',
        browser: 'Chrome',
        version: '91.0',
        isMobile: false,
        screenResolution: '1920x1080',
        timezone: 'UTC',
      },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    const mockUser = {
      id: 'user-123',
      email: 'test@example.com',
      passwordHash: 'hashed-password',
      emailVerified: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      mfaEnabled: false,
      totpSecret: null,
      backupCodes: [],
      failedLoginAttempts: 0,
      lockedUntil: null,
      lastLoginAt: null,
      lastLoginIP: null,
      riskScore: 0,
    };

    it('should successfully authenticate valid credentials', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHashingService.verifyPassword.mockResolvedValue(true);
      mockDeviceFingerprintingService.createFingerprint.mockResolvedValue({
        id: 'fingerprint-id',
        trustScore: 80,
        createdAt: new Date(),
      });
      mockRiskScoringService.assessRisk.mockResolvedValue({
        overallScore: 20,
        level: 'low',
        factors: [],
        recommendations: [],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      });
      mockJwtTokenService.createTokenPair.mockReturnValue({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      });
      mockSessionRepository.createSession.mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
        token: 'access-token',
        refreshToken: 'refresh-token',
        expiresAt: new Date(Date.now() + 900000),
        refreshExpiresAt: new Date(Date.now() + 604800000),
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        riskScore: 20,
      });
      mockUserRepository.resetFailedLoginAttempts.mockResolvedValue(mockUser);
      mockUserRepository.updateUser.mockResolvedValue(mockUser);

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.session).toBeDefined();
      expect(result.riskScore).toBe(20);
      expect(mockUserRepository.findByEmail).toHaveBeenCalledWith(
        'test@example.com'
      );
      expect(mockPasswordHashingService.verifyPassword).toHaveBeenCalledWith(
        'password123',
        'hashed-password'
      );
      expect(mockUserRepository.resetFailedLoginAttempts).toHaveBeenCalledWith(
        'user-123'
      );
    });

    it('should fail authentication for non-existent user', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_CREDENTIALS');
      expect(result.riskScore).toBe(30);
      expect(mockPasswordHashingService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should fail authentication for invalid password', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHashingService.verifyPassword.mockResolvedValue(false);
      mockUserRepository.incrementFailedLoginAttempts.mockResolvedValue({
        ...mockUser,
        failedLoginAttempts: 1,
      });

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_CREDENTIALS');
      expect(result.riskScore).toBe(60);
      expect(
        mockUserRepository.incrementFailedLoginAttempts
      ).toHaveBeenCalledWith('user-123');
    });

    it('should fail authentication for locked account', async () => {
      // Arrange
      const lockedUser = {
        ...mockUser,
        failedLoginAttempts: 5,
        lockedUntil: new Date(Date.now() + 300000), // 5 minutes from now
      };
      mockUserRepository.findByEmail.mockResolvedValue(lockedUser);

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ACCOUNT_LOCKED');
      expect(result.riskScore).toBe(80);
      expect(mockPasswordHashingService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should fail authentication for unverified email', async () => {
      // Arrange
      const unverifiedUser = {
        ...mockUser,
        emailVerified: null,
      };
      mockUserRepository.findByEmail.mockResolvedValue(unverifiedUser);

      // Password verification should not be called for unverified email

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('ACCOUNT_NOT_VERIFIED');
      expect(result.riskScore).toBe(50);
      expect(mockPasswordHashingService.verifyPassword).not.toHaveBeenCalled();
    });

    it('should require MFA when risk score is high', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHashingService.verifyPassword.mockResolvedValue(true);
      mockDeviceFingerprintingService.createFingerprint.mockResolvedValue({
        id: 'fingerprint-id',
        trustScore: 80,
        createdAt: new Date(),
      });
      mockRiskScoringService.assessRisk.mockResolvedValue({
        overallScore: 70,
        level: 'high',
        factors: [],
        recommendations: [],
        requiresMFA: true,
        allowAccess: true,
        timestamp: new Date(),
      });

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.requiresMFA).toBe(true);
      expect(result.mfaChallenge).toBeDefined();
      expect(result.riskScore).toBe(70);
    });

    it('should require MFA when user has MFA enabled', async () => {
      // Arrange
      const mfaUser = {
        ...mockUser,
        mfaEnabled: true,
        totpSecret: 'totp-secret',
      };
      mockUserRepository.findByEmail.mockResolvedValue(mfaUser);
      mockPasswordHashingService.verifyPassword.mockResolvedValue(true);
      mockDeviceFingerprintingService.createFingerprint.mockResolvedValue({
        id: 'fingerprint-id',
        trustScore: 80,
        createdAt: new Date(),
      });
      mockRiskScoringService.assessRisk.mockResolvedValue({
        overallScore: 20,
        level: 'low',
        factors: [],
        recommendations: [],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      });

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.requiresMFA).toBe(true);
      expect(result.mfaChallenge?.type).toBe('totp');
    });

    it('should block authentication for high risk', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockPasswordHashingService.verifyPassword.mockResolvedValue(true);
      mockDeviceFingerprintingService.createFingerprint.mockResolvedValue({
        id: 'fingerprint-id',
        trustScore: 10,
        createdAt: new Date(),
      });
      mockRiskScoringService.assessRisk.mockResolvedValue({
        overallScore: 95,
        level: 'critical',
        factors: [],
        recommendations: ['Block access immediately'],
        requiresMFA: true,
        allowAccess: false,
        timestamp: new Date(),
      });

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('HIGH_RISK_BLOCKED');
      expect(result.riskScore).toBe(95);
    });

    it('should validate required credentials', async () => {
      // Arrange
      const invalidCredentials = {
        ...validCredentials,
        email: undefined,
      };

      // Act
      const result = await authService.authenticate(invalidCredentials as any);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MISSING_EMAIL');
    });

    it('should validate email format', async () => {
      // Arrange
      const invalidCredentials = {
        ...validCredentials,
        email: 'invalid-email',
      };

      // Act
      const result = await authService.authenticate(invalidCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_EMAIL');
    });

    it('should handle authentication errors gracefully', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockRejectedValue(
        new Error('Database error')
      );

      // Act
      const result = await authService.authenticate(validCredentials);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INTERNAL_ERROR');
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe('validateToken', () => {
    const validToken = 'valid.jwt.token';

    it('should successfully validate valid token with session', async () => {
      // Arrange
      mockJwtTokenService.verifyAccessToken.mockReturnValue({
        valid: true,
        payload: {
          sub: 'user-123',
          sessionId: 'session-123',
        },
      });
      mockSessionRepository.validateSession.mockResolvedValue({
        isValid: true,
        session: {
          id: 'session-123',
          userId: 'user-123',
          token: validToken,
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 900000),
          refreshExpiresAt: new Date(Date.now() + 604800000),
          createdAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
          riskScore: 20,
        },
      });
      mockUserRepository.findById.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaEnabled: false,
        backupCodes: [],
        failedLoginAttempts: 0,
        riskScore: 20,
      });

      // Act
      const result = await authService.validateToken(validToken);

      // Assert
      expect(result.valid).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
      expect(mockJwtTokenService.verifyAccessToken).toHaveBeenCalledWith(
        validToken
      );
      expect(mockSessionRepository.validateSession).toHaveBeenCalledWith(
        validToken
      );
    });

    it('should fail validation for invalid token', async () => {
      // Arrange
      mockJwtTokenService.verifyAccessToken.mockReturnValue({
        valid: false,
        error: 'Token is invalid',
      });

      // Act
      const result = await authService.validateToken('invalid.token');

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_TOKEN');
      expect(mockSessionRepository.validateSession).not.toHaveBeenCalled();
    });

    it('should fail validation for expired token', async () => {
      // Arrange
      mockJwtTokenService.verifyAccessToken.mockReturnValue({
        valid: false,
        error: 'Token has expired',
        expired: true,
      });

      // Act
      const result = await authService.validateToken('expired.token');

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_TOKEN');
      expect(result.requiresRefresh).toBe(true);
    });

    it('should fail validation for invalid session', async () => {
      // Arrange
      mockJwtTokenService.verifyAccessToken.mockReturnValue({
        valid: true,
        payload: {
          sub: 'user-123',
          sessionId: 'session-123',
        },
      });
      mockSessionRepository.validateSession.mockResolvedValue({
        isValid: false,
        reason: 'Session expired',
      });

      // Act
      const result = await authService.validateToken(validToken);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('INVALID_SESSION');
    });

    it('should fail validation when user not found', async () => {
      // Arrange
      mockJwtTokenService.verifyAccessToken.mockReturnValue({
        valid: true,
        payload: {
          sub: 'user-123',
          sessionId: 'session-123',
        },
      });
      mockSessionRepository.validateSession.mockResolvedValue({
        isValid: true,
        session: {
          id: 'session-123',
          userId: 'user-123',
          token: validToken,
          refreshToken: 'refresh-token',
          expiresAt: new Date(Date.now() + 900000),
          refreshExpiresAt: new Date(Date.now() + 604800000),
          createdAt: new Date(),
          lastActivity: new Date(),
          isActive: true,
          riskScore: 20,
        },
      });
      mockUserRepository.findById.mockResolvedValue(null);

      // Act
      const result = await authService.validateToken(validToken);

      // Assert
      expect(result.valid).toBe(false);
      expect(result.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('refreshToken', () => {
    const refreshRequest = {
      refreshToken: 'valid.refresh.token',
      deviceInfo: {
        fingerprint: 'device-fingerprint',
        userAgent: 'Mozilla/5.0',
        platform: 'Windows',
        browser: 'Chrome',
        version: '91.0',
        isMobile: false,
      },
      ipAddress: '192.168.1.1',
      userAgent: 'Mozilla/5.0',
    };

    it('should successfully refresh token', async () => {
      // Arrange
      mockJwtTokenService.verifyRefreshToken.mockReturnValue({
        valid: true,
        payload: {
          sub: 'user-123',
          sessionId: 'session-123',
        },
      });
      mockSessionRepository.refreshSession.mockResolvedValue({
        id: 'session-123',
        userId: 'user-123',
        token: 'old-access-token',
        refreshToken: 'valid.refresh.token',
        expiresAt: new Date(Date.now() + 900000),
        refreshExpiresAt: new Date(Date.now() + 604800000),
        createdAt: new Date(),
        lastActivity: new Date(),
        isActive: true,
        riskScore: 20,
      });
      mockUserRepository.findById.mockResolvedValue({
        id: 'user-123',
        email: 'test@example.com',
        emailVerified: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaEnabled: false,
        backupCodes: [],
        failedLoginAttempts: 0,
        riskScore: 20,
      });
      mockDeviceFingerprintingService.createFingerprint.mockResolvedValue({
        id: 'fingerprint-id',
        trustScore: 80,
        createdAt: new Date(),
      });
      mockRiskScoringService.assessRisk.mockResolvedValue({
        overallScore: 25,
        level: 'low',
        factors: [],
        recommendations: [],
        requiresMFA: false,
        allowAccess: true,
        timestamp: new Date(),
      });
      mockJwtTokenService.createTokenPair.mockReturnValue({
        accessToken: 'new-access-token',
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 900,
        refreshExpiresIn: 604800,
      });

      // Act
      const result = await authService.refreshToken(refreshRequest);

      // Assert
      expect(result.success).toBe(true);
      expect(result.tokens).toBeDefined();
      expect(result.tokens?.accessToken).toBe('new-access-token');
      expect(result.user).toBeDefined();
      expect(result.session).toBeDefined();
    });

    it('should fail refresh for invalid refresh token', async () => {
      // Arrange
      mockJwtTokenService.verifyRefreshToken.mockReturnValue({
        valid: false,
        error: 'Invalid refresh token',
      });

      // Act
      const result = await authService.refreshToken(refreshRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_REFRESH_TOKEN');
    });

    it('should fail refresh for expired session', async () => {
      // Arrange
      mockJwtTokenService.verifyRefreshToken.mockReturnValue({
        valid: true,
        payload: {
          sub: 'user-123',
          sessionId: 'session-123',
        },
      });
      mockSessionRepository.refreshSession.mockResolvedValue(null);

      // Act
      const result = await authService.refreshToken(refreshRequest);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SESSION_EXPIRED');
    });
  });

  describe('logout', () => {
    it('should successfully logout user', async () => {
      // Arrange
      const sessionId = 'session-123';
      mockSessionRepository.terminateSession.mockResolvedValue(undefined);

      // Act
      await authService.logout(sessionId);

      // Assert
      expect(mockSessionRepository.terminateSession).toHaveBeenCalledWith(
        sessionId
      );
      expect(mockLogger.info).toHaveBeenCalledWith('Logout successful', {
        correlationId: 'test-correlation-id',
        sessionId,
      });
    });

    it('should handle logout errors', async () => {
      // Arrange
      const sessionId = 'session-123';
      const error = new Error('Database error');
      mockSessionRepository.terminateSession.mockRejectedValue(error);

      // Act & Assert
      await expect(authService.logout(sessionId)).rejects.toThrow(
        'Database error'
      );
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });
});
