/**
 * MFA Service Tests
 * Tests for Multi-Factor Authentication functionality
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { MFAService } from '../../../application/services/mfa.service';
import { TOTPService } from '../../../infrastructure/security/totp.service';
import { SMSService } from '../../../infrastructure/security/sms.service';
import { EmailMFAService } from '../../../infrastructure/security/email-mfa.service';
import { WebAuthnService } from '../../../infrastructure/security/webauthn.service';
import { MFAChallengeRepository } from '../../../infrastructure/database/repositories/mfa-challenge.repository';
import { PrismaUserRepository } from '../../../infrastructure/database/repositories/prisma-user-repository';
import { Logger } from 'winston';

// Mock dependencies
const mockLogger = {
  info: vi.fn(),
  error: vi.fn(),
  warn: vi.fn(),
  debug: vi.fn(),
} as unknown as Logger;

const mockUserRepository = {
  findById: vi.fn(),
  updateUser: vi.fn(),
} as unknown as PrismaUserRepository;

const mockChallengeRepository = {
  createChallenge: vi.fn(),
  findById: vi.fn(),
  incrementAttempts: vi.fn(),
  deleteChallenge: vi.fn(),
} as unknown as MFAChallengeRepository;

const mockTOTPService = {
  generateSecret: vi.fn(),
  verifyToken: vi.fn(),
} as unknown as TOTPService;

const mockSMSService = {
  sendMFACode: vi.fn(),
} as unknown as SMSService;

const mockEmailMFAService = {
  sendMFACode: vi.fn(),
} as unknown as EmailMFAService;

const mockWebAuthnService = {
  registerCredential: vi.fn(),
  verifyAuthentication: vi.fn(),
  removeAllCredentials: vi.fn(),
  getUserCredentials: vi.fn(),
} as unknown as WebAuthnService;

describe('MFAService', () => {
  let mfaService: MFAService;

  beforeEach(() => {
    vi.clearAllMocks();

    mfaService = new MFAService(
      mockUserRepository,
      mockChallengeRepository,
      mockTOTPService,
      mockSMSService,
      mockEmailMFAService,
      mockWebAuthnService,
      mockLogger
    );
  });

  describe('setupTOTP', () => {
    it('should successfully setup TOTP for a user', async () => {
      // Arrange
      const userId = 'user123';
      const userEmail = 'test@example.com';
      const mockUser = {
        id: userId,
        email: userEmail,
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: [],
      };

      const mockTOTPSetup = {
        secret: 'JBSWY3DPEHPK3PXP',
        qrCodeUrl: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAA...',
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTOTPService.generateSecret).mockResolvedValue(
        mockTOTPSetup
      );
      vi.mocked(mockUserRepository.updateUser).mockResolvedValue({
        ...mockUser,
        totpSecret: mockTOTPSetup.secret,
        backupCodes: ['CODE1', 'CODE2'],
      });

      // Act
      const result = await mfaService.setupTOTP(userId, 'Test Service');

      // Assert
      expect(result.success).toBe(true);
      expect(result.secret).toBe(mockTOTPSetup.secret);
      expect(result.qrCodeUrl).toBe(mockTOTPSetup.qrCodeUrl);
      expect(result.backupCodes).toHaveLength(10);
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(userId, {
        totpSecret: mockTOTPSetup.secret,
        backupCodes: expect.any(Array),
        mfaEnabled: false, // Not enabled until verified
      });
    });

    it('should fail if user not found', async () => {
      // Arrange
      const userId = 'nonexistent';
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act
      const result = await mfaService.setupTOTP(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('USER_NOT_FOUND');
    });

    it('should fail if TOTP already enabled', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        mfaEnabled: true,
        totpSecret: 'existing-secret',
        backupCodes: [],
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      // Act
      const result = await mfaService.setupTOTP(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('TOTP_ALREADY_ENABLED');
    });
  });

  describe('verifyTOTP', () => {
    it('should successfully verify TOTP code', async () => {
      // Arrange
      const userId = 'user123';
      const code = '123456';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        mfaEnabled: false,
        totpSecret: 'JBSWY3DPEHPK3PXP',
        backupCodes: ['CODE1', 'CODE2'],
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTOTPService.verifyToken).mockResolvedValue({ valid: true });
      vi.mocked(mockUserRepository.updateUser).mockResolvedValue({
        ...mockUser,
        mfaEnabled: true,
      });

      // Act
      const result = await mfaService.verifyTOTP(userId, code);

      // Assert
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(userId, {
        mfaEnabled: true,
      });
    });

    it('should successfully verify backup code', async () => {
      // Arrange
      const userId = 'user123';
      const backupCode = 'BACKUPCODE1';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        mfaEnabled: false,
        totpSecret: 'JBSWY3DPEHPK3PXP',
        backupCodes: ['BACKUPCODE1', 'BACKUPCODE2'],
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockUserRepository.updateUser).mockResolvedValue({
        ...mockUser,
        mfaEnabled: true,
        backupCodes: ['BACKUPCODE2'],
      });

      // Act
      const result = await mfaService.verifyTOTP(userId, backupCode);

      // Assert
      expect(result.success).toBe(true);
      expect(result.backupCodeUsed).toBe(true);
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(userId, {
        backupCodes: ['BACKUPCODE2'],
        mfaEnabled: true,
      });
    });

    it('should fail with invalid TOTP code', async () => {
      // Arrange
      const userId = 'user123';
      const code = '000000';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        mfaEnabled: false,
        totpSecret: 'JBSWY3DPEHPK3PXP',
        backupCodes: [],
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockTOTPService.verifyToken).mockResolvedValue({
        valid: false,
      });

      // Act
      const result = await mfaService.verifyTOTP(userId, code);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_TOTP_CODE');
    });
  });

  describe('sendSMSCode', () => {
    it('should successfully send SMS MFA code', async () => {
      // Arrange
      const request = {
        userId: 'user123',
        phoneNumber: '+1234567890',
      };

      const mockChallenge = {
        id: 'challenge123',
        type: 'sms' as const,
        userId: request.userId,
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          phoneNumber: request.phoneNumber,
          code: '123456',
        },
        createdAt: new Date(),
      };

      vi.mocked(mockChallengeRepository.createChallenge).mockResolvedValue(
        mockChallenge
      );
      vi.mocked(mockSMSService.sendMFACode).mockResolvedValue({
        success: true,
        messageId: 'msg123',
      });

      // Act
      const result = await mfaService.sendSMSCode(request);

      // Assert
      expect(result.success).toBe(true);
      expect(result.challengeId).toBeDefined();
      expect(mockChallengeRepository.createChallenge).toHaveBeenCalled();
      expect(mockSMSService.sendMFACode).toHaveBeenCalledWith(
        request.phoneNumber,
        expect.any(String)
      );
    });

    it('should fail if SMS sending fails', async () => {
      // Arrange
      const request = {
        userId: 'user123',
        phoneNumber: '+1234567890',
      };

      vi.mocked(mockChallengeRepository.createChallenge).mockResolvedValue({
        id: 'challenge123',
        type: 'sms' as const,
        userId: request.userId,
        expiresAt: new Date(),
        attempts: 0,
        maxAttempts: 3,
        metadata: {},
        createdAt: new Date(),
      });
      vi.mocked(mockSMSService.sendMFACode).mockResolvedValue({
        success: false,
        error: 'SMS service unavailable',
      });

      // Act
      const result = await mfaService.sendSMSCode(request);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('SMS_SEND_FAILED');
    });
  });

  describe('verifySMSCode', () => {
    it('should successfully verify SMS code', async () => {
      // Arrange
      const challengeId = 'challenge123';
      const code = '123456';
      const mockChallenge = {
        id: challengeId,
        type: 'sms' as const,
        userId: 'user123',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000), // Future date
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          phoneNumber: '+1234567890',
          code: '123456',
        },
        createdAt: new Date(),
      };

      const mockUser = {
        id: 'user123',
        email: 'test@example.com',
        mfaEnabled: true,
      };

      vi.mocked(mockChallengeRepository.findById).mockResolvedValue(
        mockChallenge
      );
      vi.mocked(mockChallengeRepository.incrementAttempts).mockResolvedValue();
      vi.mocked(mockChallengeRepository.deleteChallenge).mockResolvedValue();
      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      // Act
      const result = await mfaService.verifySMSCode(challengeId, code);

      // Assert
      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        challengeId
      );
    });

    it('should fail with expired challenge', async () => {
      // Arrange
      const challengeId = 'challenge123';
      const code = '123456';
      const mockChallenge = {
        id: challengeId,
        type: 'sms' as const,
        userId: 'user123',
        expiresAt: new Date(Date.now() - 1000), // Past date
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          code: '123456',
        },
        createdAt: new Date(),
      };

      vi.mocked(mockChallengeRepository.findById).mockResolvedValue(
        mockChallenge
      );
      vi.mocked(mockChallengeRepository.deleteChallenge).mockResolvedValue();

      // Act
      const result = await mfaService.verifySMSCode(challengeId, code);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('CHALLENGE_EXPIRED');
      expect(mockChallengeRepository.deleteChallenge).toHaveBeenCalledWith(
        challengeId
      );
    });

    it('should fail with invalid code', async () => {
      // Arrange
      const challengeId = 'challenge123';
      const code = '000000';
      const mockChallenge = {
        id: challengeId,
        type: 'sms' as const,
        userId: 'user123',
        expiresAt: new Date(Date.now() + 5 * 60 * 1000),
        attempts: 0,
        maxAttempts: 3,
        metadata: {
          code: '123456',
        },
        createdAt: new Date(),
      };

      vi.mocked(mockChallengeRepository.findById).mockResolvedValue(
        mockChallenge
      );
      vi.mocked(mockChallengeRepository.incrementAttempts).mockResolvedValue();

      // Act
      const result = await mfaService.verifySMSCode(challengeId, code);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('INVALID_SMS_CODE');
      expect(mockChallengeRepository.incrementAttempts).toHaveBeenCalledWith(
        challengeId
      );
    });
  });

  describe('generateBackupCodes', () => {
    it('should successfully generate backup codes', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        email: 'test@example.com',
        mfaEnabled: true,
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockUserRepository.updateUser).mockResolvedValue({
        ...mockUser,
        backupCodes: ['CODE1', 'CODE2'],
      });

      // Act
      const result = await mfaService.generateBackupCodes(userId);

      // Assert
      expect(result.success).toBe(true);
      expect(result.backupCodes).toHaveLength(10);
      expect(mockUserRepository.updateUser).toHaveBeenCalledWith(userId, {
        backupCodes: expect.any(Array),
      });
    });

    it('should fail if user not found', async () => {
      // Arrange
      const userId = 'nonexistent';
      vi.mocked(mockUserRepository.findById).mockResolvedValue(null);

      // Act
      const result = await mfaService.generateBackupCodes(userId);

      // Assert
      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('USER_NOT_FOUND');
    });
  });

  describe('requiresMFA', () => {
    it('should require MFA if user has MFA enabled', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        mfaEnabled: true,
        failedLoginAttempts: 0,
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      // Act
      const result = await mfaService.requiresMFA(userId, 30);

      // Assert
      expect(result).toBe(true);
    });

    it('should require MFA for high risk score', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        mfaEnabled: false,
        failedLoginAttempts: 0,
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      // Act
      const result = await mfaService.requiresMFA(userId, 80);

      // Assert
      expect(result).toBe(true);
    });

    it('should require MFA for users with failed attempts', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        mfaEnabled: false,
        failedLoginAttempts: 3,
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      // Act
      const result = await mfaService.requiresMFA(userId, 30);

      // Assert
      expect(result).toBe(true);
    });

    it('should not require MFA for low risk users', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        mfaEnabled: false,
        failedLoginAttempts: 0,
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);

      // Act
      const result = await mfaService.requiresMFA(userId, 30);

      // Assert
      expect(result).toBe(false);
    });
  });

  describe('getMFAStatus', () => {
    it('should return correct MFA status', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        mfaEnabled: true,
        totpSecret: 'JBSWY3DPEHPK3PXP',
        backupCodes: ['CODE1', 'CODE2'],
      };

      const mockWebAuthnCredentials = [
        { id: 'cred1', name: 'YubiKey' },
        { id: 'cred2', name: 'TouchID' },
      ];

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockWebAuthnService.getUserCredentials).mockResolvedValue(
        mockWebAuthnCredentials
      );

      // Act
      const result = await mfaService.getMFAStatus(userId);

      // Assert
      expect(result.enabled).toBe(true);
      expect(result.methods).toContain('totp');
      expect(result.methods).toContain('webauthn');
      expect(result.methods).toContain('sms');
      expect(result.methods).toContain('email');
      expect(result.backupCodesCount).toBe(2);
      expect(result.webAuthnCredentials).toBe(2);
    });

    it('should return disabled status for user without MFA', async () => {
      // Arrange
      const userId = 'user123';
      const mockUser = {
        id: userId,
        mfaEnabled: false,
        totpSecret: null,
        backupCodes: [],
      };

      vi.mocked(mockUserRepository.findById).mockResolvedValue(mockUser);
      vi.mocked(mockWebAuthnService.getUserCredentials).mockResolvedValue([]);

      // Act
      const result = await mfaService.getMFAStatus(userId);

      // Assert
      expect(result.enabled).toBe(false);
      expect(result.methods).not.toContain('totp');
      expect(result.methods).not.toContain('webauthn');
      expect(result.methods).toContain('sms');
      expect(result.methods).toContain('email');
      expect(result.backupCodesCount).toBe(0);
      expect(result.webAuthnCredentials).toBe(0);
    });
  });
});
