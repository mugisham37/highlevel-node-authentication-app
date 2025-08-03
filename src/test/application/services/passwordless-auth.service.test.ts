/**
 * Passwordless Authentication Service Tests
 * Tests for WebAuthn registration/authentication flows, magic link authentication,
 * biometric authentication support, and fallback mechanisms
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Logger } from 'winston';
import { PasswordlessAuthService } from '../../../application/services/passwordless-auth.service';
import { WebAuthnService } from '../../../infrastructure/security/webauthn.service';
import { MFAChallengeRepository } from '../../../infrastructure/database/repositories/mfa-challenge.repository';
import { PrismaUserRepository } from '../../../infrastructure/database/repositories/prisma-user-repository';
import { EmailMFAService } from '../../../infrastructure/security/email-mfa.service';
import { SecureTokenGenerator } from '../../../infrastructure/security/secure-token-generator.service';
import { DeviceInfo } from '../../../domain/entities/user';

// Mock dependencies
vi.mock('../../../infrastructure/security/webauthn.service');
vi.mock(
  '../../../infrastructure/database/repositories/mfa-challenge.repository'
);
vi.mock('../../../infrastructure/database/repositories/prisma-user-repository');
vi.mock('../../../infrastructure/security/email-mfa.service');
vi.mock(
  '../../../infrastructure/security/secure-token-generator.service',
  () => ({
    SecureTokenGenerator: {
      validateToken: vi.fn(),
      generateMagicLinkToken: vi.fn(() => 'mock-magic-token'),
    },
  })
);
vi.mock('../../../infrastructure/security/secure-id-generator.service', () => ({
  SecureIdGenerator: {
    generateCorrelationId: vi.fn(() => 'mock-correlation-id'),
    generateSecureId: vi.fn(() => 'mock-secure-id'),
  },
}));

describe('PasswordlessAuthService', () => {
  let passwordlessAuthService: PasswordlessAuthService;
  let mockUserRepository: vi.Mocked<PrismaUserRepository>;
  let mockChallengeRepository: vi.Mocked<MFAChallengeRepository>;
  let mockWebAuthnService: vi.Mocked<WebAuthnService>;
  let mockEmailService: vi.Mocked<EmailMFAService>;
  let mockLogger: vi.Mocked<Logger>;

  const mockDeviceInfo: DeviceInfo = {
    fingerprint: 'test-fingerprint-123',
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
    platform: 'Windows',
    browser: 'Chrome',
    version: '91.0.4472.124',
    isMobile: false,
    screenResolution: '1920x1080',
    timezone: 'America/New_York',
  };

  const mockUser = {
    id: 'user-123',
    email: 'test@example.com',
    name: 'Test User',
    emailVerified: new Date(),
    passwordHash: 'hashed-password',
    mfaEnabled: false,
    totpSecret: null,
    backupCodes: [],
    failedLoginAttempts: 0,
    lockedUntil: null,
    lastLoginAt: null,
    lastLoginIP: null,
    riskScore: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    // Reset all mocks
    vi.clearAllMocks();

    // Create mocked instances
    mockUserRepository = {
      findByEmail: vi.fn(),
      findById: vi.fn(),
      updateUser: vi.fn(),
    } as any;

    mockChallengeRepository = {
      createChallenge: vi.fn(),
      findById: vi.fn(),
      deleteChallenge: vi.fn(),
      incrementAttempts: vi.fn(),
      getUserActiveChallenges: vi.fn(),
    } as any;

    mockWebAuthnService = {
      getUserCredentials: vi.fn(),
      generateAuthenticationOptions: vi.fn(),
      generateRegistrationOptions: vi.fn(),
      verifyRegistrationResponse: vi.fn(),
      verifyAuthenticationResponse: vi.fn(),
      removeCredential: vi.fn(),
      removeAllCredentials: vi.fn(),
    } as any;

    mockEmailService = {
      sendMagicLink: vi.fn(),
    } as any;

    mockLogger = {
      info: vi.fn(),
      error: vi.fn(),
      warn: vi.fn(),
      debug: vi.fn(),
    } as any;

    // Create service instance
    passwordlessAuthService = new PasswordlessAuthService(
      mockUserRepository,
      mockChallengeRepository,
      mockWebAuthnService,
      mockEmailService,
      mockLogger
    );
  });

  describe('initiatePasswordlessAuth', () => {
    it('should return registration required for non-existent user', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const request = {
        email: 'nonexistent@example.com',
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
        ipAddress: '192.168.1.1',
      };

      // Act
      const result =
        await passwordlessAuthService.initiatePasswordlessAuth(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.requiresRegistration).toBe(true);
      expect(result.fallbackMethods).toContain('email_signup');
      expect(result.fallbackMethods).toContain('magic_link');
      expect(result.error?.code).toBe('USER_NOT_FOUND');
    });

    it('should generate WebAuthn options for user with credentials', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockWebAuthnService.getUserCredentials.mockResolvedValue([
        {
          id: 'cred-1',
          userId: 'user-123',
          credentialId: 'credential-123',
          publicKey: 'public-key',
          counter: 0,
          name: 'Test Credential',
          createdAt: new Date(),
        },
      ]);
      mockWebAuthnService.generateAuthenticationOptions.mockResolvedValue({
        options: { challenge: 'challenge-123' },
        challenge: 'challenge-123',
      });
      mockChallengeRepository.createChallenge.mockResolvedValue({} as any);

      const request = {
        email: 'test@example.com',
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
        ipAddress: '192.168.1.1',
      };

      // Act
      const result =
        await passwordlessAuthService.initiatePasswordlessAuth(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(result.webAuthnOptions).toEqual({ challenge: 'challenge-123' });
      expect(result.fallbackMethods).toContain('magic_link');
      expect(result.fallbackMethods).toContain('email_code');
      expect(mockChallengeRepository.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webauthn',
          userId: 'user-123',
        })
      );
    });

    it('should send magic link for user without WebAuthn credentials', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockWebAuthnService.getUserCredentials.mockResolvedValue([]);
      mockEmailService.sendMagicLink.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });
      mockChallengeRepository.createChallenge.mockResolvedValue({} as any);

      const request = {
        email: 'test@example.com',
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
        ipAddress: '192.168.1.1',
      };

      // Act
      const result =
        await passwordlessAuthService.initiatePasswordlessAuth(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.magicLinkSent).toBe(true);
      expect(result.fallbackMethods).toContain('email_code');
      expect(result.fallbackMethods).toContain('webauthn_registration');
    });

    it('should handle magic link send failure', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockWebAuthnService.getUserCredentials.mockResolvedValue([]);
      mockEmailService.sendMagicLink.mockResolvedValue({
        success: false,
        linkSent: false,
        error: { code: 'EMAIL_SEND_FAILED', message: 'Failed to send email' },
      });

      const request = {
        email: 'test@example.com',
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
        ipAddress: '192.168.1.1',
      };

      // Act
      const result =
        await passwordlessAuthService.initiatePasswordlessAuth(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.fallbackMethods).toContain('email_code');
      expect(result.fallbackMethods).toContain('password_reset');
      expect(result.error?.code).toBe('MAGIC_LINK_FAILED');
    });
  });

  describe('sendMagicLink', () => {
    it('should send magic link successfully', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      mockChallengeRepository.createChallenge.mockResolvedValue({} as any);
      mockEmailService.sendMagicLink.mockResolvedValue({
        success: true,
        messageId: 'msg-123',
      });

      const request = {
        email: 'test@example.com',
        deviceInfo: mockDeviceInfo,
        ipAddress: '192.168.1.1',
      };

      // Act
      const result = await passwordlessAuthService.sendMagicLink(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.linkSent).toBe(true);
      expect(result.expiresAt).toBeDefined();
      expect(mockChallengeRepository.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'email',
          userId: 'user-123',
          metadata: expect.objectContaining({
            type: 'magic_link',
          }),
        })
      );
    });

    it('should handle non-existent user gracefully', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      const request = {
        email: 'nonexistent@example.com',
        deviceInfo: mockDeviceInfo,
        ipAddress: '192.168.1.1',
      };

      // Act
      const result = await passwordlessAuthService.sendMagicLink(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.linkSent).toBe(true);
      // Should not reveal if user exists
      expect(mockChallengeRepository.createChallenge).not.toHaveBeenCalled();
    });

    it('should handle email send failure', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);
      const mockChallenge = { id: 'challenge-123' };
      mockChallengeRepository.createChallenge.mockResolvedValue(
        mockChallenge as any
      );
      mockChallengeRepository.deleteChallenge.mockResolvedValue();
      mockEmailService.sendMagicLink.mockResolvedValue({
        success: false,
        linkSent: false,
        error: { code: 'EMAIL_SEND_FAILED', message: 'SMTP error' },
      });

      const request = {
        email: 'test@example.com',
        deviceInfo: mockDeviceInfo,
        ipAddress: '192.168.1.1',
      };

      // Act
      const result = await passwordlessAuthService.sendMagicLink(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.linkSent).toBe(false);
      expect(result.error?.code).toBe('EMAIL_SEND_FAILED');
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        expect.any(String)
      );
    });
  });

  describe('verifyMagicLink', () => {
    it('should verify magic link successfully', async () => {
      // Arrange
      const mockChallenge = {
        id: 'challenge-123',
        type: 'email',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes from now
        metadata: {
          type: 'magic_link',
          magicToken: 'valid-token-123',
          deviceInfo: mockDeviceInfo,
        },
      };

      // Mock the challenge search - the service searches all challenges with empty userId
      mockChallengeRepository.getUserActiveChallenges.mockImplementation(
        (userId: string) => {
          // The service calls with empty string to search all challenges
          if (userId === '') {
            return Promise.resolve([mockChallenge]);
          }
          return Promise.resolve([]);
        }
      );
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockChallengeRepository.deleteChallenge.mockResolvedValue();
      mockUserRepository.updateUser.mockResolvedValue({} as any);

      // Mock token validation
      vi.mocked(SecureTokenGenerator.validateToken).mockReturnValue({
        valid: true,
        expired: false,
        hasChecksum: false,
      });

      // Act
      const result = await passwordlessAuthService.verifyMagicLink(
        'valid-token-123',
        mockDeviceInfo,
        '192.168.1.1'
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe('user-123');
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        'challenge-123'
      );
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(
        'user-123',
        expect.objectContaining({
          lastLoginAt: expect.any(Date),
          lastLoginIP: '192.168.1.1',
        })
      );
    });

    it('should reject invalid magic link token', async () => {
      // Arrange
      vi.mocked(SecureTokenGenerator.validateToken).mockReturnValue({
        valid: false,
        expired: false,
        hasChecksum: false,
      });

      // Act
      const result = await passwordlessAuthService.verifyMagicLink(
        'invalid-token',
        mockDeviceInfo,
        '192.168.1.1'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MAGIC_LINK');
    });

    it('should reject expired magic link token', async () => {
      // Arrange
      vi.mocked(SecureTokenGenerator.validateToken).mockReturnValue({
        valid: false,
        expired: true,
        hasChecksum: false,
      });

      // Act
      const result = await passwordlessAuthService.verifyMagicLink(
        'expired-token',
        mockDeviceInfo,
        '192.168.1.1'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_MAGIC_LINK');
    });

    it('should handle challenge not found', async () => {
      // Arrange
      mockChallengeRepository.getUserActiveChallenges.mockResolvedValue([]);

      vi.mocked(SecureTokenGenerator.validateToken).mockReturnValue({
        valid: true,
        expired: false,
        hasChecksum: false,
      });

      // Act
      const result = await passwordlessAuthService.verifyMagicLink(
        'token-not-found',
        mockDeviceInfo,
        '192.168.1.1'
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('MAGIC_LINK_NOT_FOUND');
    });
  });

  describe('registerWebAuthnCredential', () => {
    it('should generate registration options successfully', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockWebAuthnService.generateRegistrationOptions.mockResolvedValue({
        options: { challenge: 'reg-challenge-123' },
        challenge: 'reg-challenge-123',
      });
      mockChallengeRepository.createChallenge.mockResolvedValue({} as any);

      const request = {
        userId: 'user-123',
        credentialName: 'My Security Key',
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
      };

      // Act
      const result =
        await passwordlessAuthService.registerWebAuthnCredential(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.registrationOptions).toEqual({
        challenge: 'reg-challenge-123',
      });
      expect(
        mockWebAuthnService.generateRegistrationOptions
      ).toHaveBeenCalledWith('user-123', 'test@example.com', 'Test User');
      expect(mockChallengeRepository.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webauthn',
          userId: 'user-123',
          metadata: expect.objectContaining({
            credentialName: 'My Security Key',
            type: 'registration',
          }),
        })
      );
    });

    it('should handle user not found', async () => {
      // Arrange
      mockUserRepository.findById.mockResolvedValue(null);

      const request = {
        userId: 'nonexistent-user',
        credentialName: 'My Security Key',
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
      };

      // Act
      const result =
        await passwordlessAuthService.registerWebAuthnCredential(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('completeWebAuthnRegistration', () => {
    it('should complete registration successfully', async () => {
      // Arrange
      const mockChallenge = {
        id: 'challenge-123',
        type: 'webauthn',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // 5 minutes from now
        metadata: {
          challenge: 'reg-challenge-123',
          credentialName: 'My Security Key',
          origin: 'https://example.com',
          type: 'registration',
        },
      };

      const mockRegistrationResponse = {
        id: 'credential-123',
        response: {
          attestationObject: 'attestation-data',
          clientDataJSON: 'client-data',
        },
      };

      mockChallengeRepository.findById.mockResolvedValue(mockChallenge);
      mockWebAuthnService.verifyRegistrationResponse.mockResolvedValue({
        success: true,
        credentialId: 'credential-123',
      });
      mockChallengeRepository.deleteChallenge.mockResolvedValue();

      // Act
      const result = await passwordlessAuthService.completeWebAuthnRegistration(
        'challenge-123',
        mockRegistrationResponse,
        mockDeviceInfo
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.credentialId).toBe('credential-123');
      expect(
        mockWebAuthnService.verifyRegistrationResponse
      ).toHaveBeenCalledWith(
        'user-123',
        'My Security Key',
        mockRegistrationResponse,
        'reg-challenge-123',
        'https://example.com'
      );
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        'challenge-123'
      );
    });

    it('should handle challenge not found', async () => {
      // Arrange
      mockChallengeRepository.findById.mockResolvedValue(null);

      // Act
      const result = await passwordlessAuthService.completeWebAuthnRegistration(
        'nonexistent-challenge',
        {},
        mockDeviceInfo
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CHALLENGE_NOT_FOUND');
    });

    it('should handle expired challenge', async () => {
      // Arrange
      const expiredChallenge = {
        id: 'challenge-123',
        type: 'webauthn',
        userId: 'user-123',
        expiresAt: new Date(Date.now() - 5 * 60 * 1000), // 5 minutes ago
        metadata: {},
      };

      mockChallengeRepository.findById.mockResolvedValue(expiredChallenge);
      mockChallengeRepository.deleteChallenge.mockResolvedValue();

      // Act
      const result = await passwordlessAuthService.completeWebAuthnRegistration(
        'challenge-123',
        {},
        mockDeviceInfo
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CHALLENGE_EXPIRED');
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        'challenge-123'
      );
    });

    it('should handle verification failure', async () => {
      // Arrange
      const mockChallenge = {
        id: 'challenge-123',
        type: 'webauthn',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        metadata: {
          challenge: 'reg-challenge-123',
          credentialName: 'My Security Key',
          origin: 'https://example.com',
          type: 'registration',
        },
      };

      mockChallengeRepository.findById.mockResolvedValue(mockChallenge);
      mockWebAuthnService.verifyRegistrationResponse.mockResolvedValue({
        success: false,
        error: 'Verification failed',
      });
      mockChallengeRepository.incrementAttempts.mockResolvedValue();

      // Act
      const result = await passwordlessAuthService.completeWebAuthnRegistration(
        'challenge-123',
        {},
        mockDeviceInfo
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('WEBAUTHN_VERIFICATION_FAILED');
      expect(mockChallengeRepository.incrementAttempts).toHaveBeenCalledWith(
        'challenge-123'
      );
    });
  });

  describe('authenticateWithWebAuthn', () => {
    it('should authenticate successfully', async () => {
      // Arrange
      const mockChallenge = {
        id: 'challenge-123',
        type: 'webauthn',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        metadata: {
          challenge: 'auth-challenge-123',
          origin: 'https://example.com',
          deviceInfo: mockDeviceInfo,
        },
      };

      const mockAuthResponse = {
        id: 'credential-123',
        response: {
          authenticatorData: 'auth-data',
          clientDataJSON: 'client-data',
          signature: 'signature',
        },
      };

      mockChallengeRepository.findById.mockResolvedValue(mockChallenge);
      mockWebAuthnService.verifyAuthenticationResponse.mockResolvedValue({
        success: true,
        credentialId: 'credential-123',
      });
      mockUserRepository.findById.mockResolvedValue(mockUser);
      mockChallengeRepository.deleteChallenge.mockResolvedValue();
      mockUserRepository.updateUser.mockResolvedValue({} as any);

      // Act
      const result = await passwordlessAuthService.authenticateWithWebAuthn(
        'challenge-123',
        mockAuthResponse,
        mockDeviceInfo
      );

      // Assert
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.user?.id).toBe('user-123');
      expect(
        mockWebAuthnService.verifyAuthenticationResponse
      ).toHaveBeenCalledWith(
        mockAuthResponse,
        'auth-challenge-123',
        'https://example.com'
      );
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        'challenge-123'
      );
    });

    it('should handle authentication failure', async () => {
      // Arrange
      const mockChallenge = {
        id: 'challenge-123',
        type: 'webauthn',
        userId: 'user-123',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        metadata: {
          challenge: 'auth-challenge-123',
          origin: 'https://example.com',
        },
      };

      mockChallengeRepository.findById.mockResolvedValue(mockChallenge);
      mockWebAuthnService.verifyAuthenticationResponse.mockResolvedValue({
        success: false,
        error: 'Authentication failed',
      });
      mockChallengeRepository.incrementAttempts.mockResolvedValue();

      // Act
      const result = await passwordlessAuthService.authenticateWithWebAuthn(
        'challenge-123',
        {},
        mockDeviceInfo
      );

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('WEBAUTHN_AUTH_FAILED');
      expect(mockChallengeRepository.incrementAttempts).toHaveBeenCalledWith(
        'challenge-123'
      );
    });
  });

  describe('initiateBiometricAuth', () => {
    it('should initiate biometric authentication successfully', async () => {
      // Arrange
      const mockCredentials = [
        {
          id: 'cred-1',
          userId: 'user-123',
          credentialId: 'credential-123',
          publicKey: 'public-key',
          counter: 0,
          name: 'Biometric Device',
          createdAt: new Date(),
          deviceType: 'platform',
        },
      ];

      mockWebAuthnService.getUserCredentials.mockResolvedValue(mockCredentials);
      mockWebAuthnService.generateAuthenticationOptions.mockResolvedValue({
        options: { challenge: 'biometric-challenge-123' },
        challenge: 'biometric-challenge-123',
      });
      mockChallengeRepository.createChallenge.mockResolvedValue({} as any);

      const request = {
        userId: 'user-123',
        biometricType: 'fingerprint' as const,
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
      };

      // Act
      const result =
        await passwordlessAuthService.initiateBiometricAuth(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.biometricChallenge).toBeDefined();
      expect(result.biometricChallenge?.biometricType).toBe('fingerprint');
      expect(mockChallengeRepository.createChallenge).toHaveBeenCalledWith(
        expect.objectContaining({
          type: 'webauthn',
          userId: 'user-123',
          metadata: expect.objectContaining({
            biometricType: 'fingerprint',
            type: 'biometric',
          }),
        })
      );
    });

    it('should handle no biometric credentials', async () => {
      // Arrange
      mockWebAuthnService.getUserCredentials.mockResolvedValue([]);

      const request = {
        userId: 'user-123',
        biometricType: 'fingerprint' as const,
        deviceInfo: mockDeviceInfo,
        origin: 'https://example.com',
      };

      // Act
      const result =
        await passwordlessAuthService.initiateBiometricAuth(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.fallbackRequired).toBe(true);
      expect(result.error?.code).toBe('NO_BIOMETRIC_CREDENTIALS');
    });
  });

  describe('getUserDevices', () => {
    it('should return user devices', async () => {
      // Arrange
      const mockCredentials = [
        {
          id: 'cred-1',
          userId: 'user-123',
          credentialId: 'credential-123',
          publicKey: 'public-key',
          counter: 0,
          name: 'My Security Key',
          createdAt: new Date(),
          lastUsed: new Date(),
          deviceType: 'cross-platform',
        },
      ];

      mockWebAuthnService.getUserCredentials.mockResolvedValue(mockCredentials);

      // Act
      const result = await passwordlessAuthService.getUserDevices('user-123');

      // Assert
      expect(result).toHaveLength(1);
      expect(result[0].deviceName).toBe('My Security Key');
      expect(result[0].deviceType).toBe('cross-platform');
      expect(result[0].trusted).toBe(true);
      expect(result[0].webAuthnCredentials).toContain('credential-123');
    });

    it('should return empty array for user with no devices', async () => {
      // Arrange
      mockWebAuthnService.getUserCredentials.mockResolvedValue([]);

      // Act
      const result = await passwordlessAuthService.getUserDevices('user-123');

      // Assert
      expect(result).toHaveLength(0);
    });
  });

  describe('removeDevice', () => {
    it('should remove device successfully', async () => {
      // Arrange
      mockWebAuthnService.removeCredential.mockResolvedValue(true);

      // Act
      const result = await passwordlessAuthService.removeDevice(
        'user-123',
        'device-123'
      );

      // Assert
      expect(result).toBe(true);
      expect(mockWebAuthnService.removeCredential).toHaveBeenCalledWith(
        'user-123',
        'device-123'
      );
    });

    it('should handle device removal failure', async () => {
      // Arrange
      mockWebAuthnService.removeCredential.mockResolvedValue(false);

      // Act
      const result = await passwordlessAuthService.removeDevice(
        'user-123',
        'device-123'
      );

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getFallbackMethods', () => {
    it('should return fallback methods for existing user', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(mockUser);

      // Act
      const result =
        await passwordlessAuthService.getFallbackMethods('test@example.com');

      // Assert
      expect(result).toContain('magic_link');
      expect(result).toContain('email_code');
      expect(result).toContain('password_login'); // User has password
    });

    it('should return basic fallback methods for non-existent user', async () => {
      // Arrange
      mockUserRepository.findByEmail.mockResolvedValue(null);

      // Act
      const result = await passwordlessAuthService.getFallbackMethods(
        'nonexistent@example.com'
      );

      // Assert
      expect(result).toContain('email_signup');
      expect(result).toContain('magic_link');
    });
  });
});
