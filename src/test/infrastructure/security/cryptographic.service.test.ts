/**
 * Cryptographic Service Tests
 * Test suite for the main cryptographic service
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { CryptographicService } from '../../../infrastructure/security/cryptographic.service';

describe('CryptographicService', () => {
  let cryptoService: CryptographicService;
  const testConfig = {
    accessTokenSecret:
      'test-access-secret-that-is-long-enough-for-security-requirements',
    refreshTokenSecret:
      'test-refresh-secret-that-is-different-and-long-enough-too',
    riskScoringEnabled: true,
    deviceFingerprintingEnabled: true,
  };

  beforeEach(() => {
    cryptoService = new CryptographicService(testConfig);
  });

  describe('Password Operations', () => {
    it('should hash and verify passwords correctly', async () => {
      const password = 'TestPassword123!';
      const hash = await cryptoService.hashPassword(password);

      expect(hash).toBeDefined();
      expect(hash).not.toBe(password);
      expect(hash.length).toBeGreaterThan(50);

      const isValid = await cryptoService.verifyPassword(password, hash);
      expect(isValid).toBe(true);

      const isInvalid = await cryptoService.verifyPassword(
        'WrongPassword',
        hash
      );
      expect(isInvalid).toBe(false);
    });

    it('should validate password strength', () => {
      const weakPassword = '123';
      const strongPassword = 'StrongPassword123!@#';

      const weakResult = cryptoService.validatePasswordStrength(weakPassword);
      expect(weakResult.level).toBe('very-weak');
      expect(weakResult.isValid).toBe(false);

      const strongResult =
        cryptoService.validatePasswordStrength(strongPassword);
      expect(strongResult.level).toMatch(/^(good|strong)$/);
      expect(strongResult.score).toBeGreaterThan(60);
    });
  });

  describe('JWT Token Operations', () => {
    it('should create and verify access tokens', () => {
      const payload = { sub: 'user123', email: 'test@example.com' };
      const token = cryptoService.createAccessToken(payload);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');

      const verification = cryptoService.verifyAccessToken(token);
      expect(verification.valid).toBe(true);
      expect(verification.payload?.sub).toBe('user123');
    });

    it('should create token pairs', () => {
      const payload = { sub: 'user123', sessionId: 'session123' };
      const tokenPair = cryptoService.createTokenPair(payload);

      expect(tokenPair.accessToken).toBeDefined();
      expect(tokenPair.refreshToken).toBeDefined();
      expect(tokenPair.tokenType).toBe('Bearer');
      expect(tokenPair.expiresIn).toBeGreaterThan(0);
    });

    it('should refresh access tokens', () => {
      const payload = { sub: 'user123', sessionId: 'session123' };
      const tokenPair = cryptoService.createTokenPair(payload);

      const newTokenPair = cryptoService.refreshAccessToken(
        tokenPair.refreshToken
      );
      expect(newTokenPair.accessToken).toBeDefined();
      expect(newTokenPair.accessToken).not.toBe(tokenPair.accessToken);
    });
  });

  describe('Secure ID Generation', () => {
    it('should generate unique user IDs', () => {
      const id1 = cryptoService.generateUserId();
      const id2 = cryptoService.generateUserId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^usr_/);
    });

    it('should generate session IDs', () => {
      const sessionId = cryptoService.generateSessionId();

      expect(sessionId).toBeDefined();
      expect(sessionId).toMatch(/^sess_/);
      expect(sessionId.length).toBeGreaterThan(20);
    });

    it('should validate generated IDs', () => {
      const id = cryptoService.generateCustomId({ length: 16 });
      const validation = cryptoService.validateId(id);

      expect(validation.valid).toBe(true);
      expect(validation.entropy).toBeGreaterThan(0);
    });
  });

  describe('Token Generation', () => {
    it('should generate various token types', () => {
      const resetToken = cryptoService.generatePasswordResetToken();
      const verificationToken = cryptoService.generateEmailVerificationToken();
      const csrfToken = cryptoService.generateCSRFToken();
      const otp = cryptoService.generateOTP(6);

      expect(resetToken).toBeDefined();
      expect(verificationToken).toBeDefined();
      expect(csrfToken).toBeDefined();
      expect(otp).toBeDefined();
      expect(otp).toMatch(/^\d{6}$/);
    });

    it('should generate backup codes', () => {
      const codes = cryptoService.generateBackupCodes(5);

      expect(codes).toHaveLength(5);
      expect(codes.every((code) => typeof code === 'string')).toBe(true);
      expect(new Set(codes).size).toBe(5); // All unique
    });
  });

  describe('PKCE Operations', () => {
    it('should generate PKCE code verifier and challenge', () => {
      const verifier = cryptoService.generatePKCECodeVerifier();
      const challenge = cryptoService.generatePKCECodeChallenge(verifier);

      expect(verifier).toBeDefined();
      expect(challenge).toBeDefined();
      expect(verifier).not.toBe(challenge);
      expect(verifier.length).toBe(128);
    });
  });

  describe('Device Fingerprinting', () => {
    it('should generate device fingerprints', () => {
      const input = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.1',
        acceptLanguage: 'en-US,en;q=0.9',
      };

      const fingerprint = cryptoService.generateDeviceFingerprint(input);

      expect(fingerprint).toBeDefined();
      expect(fingerprint.id).toMatch(/^fp_/);
      expect(fingerprint.userAgent).toBe(input.userAgent);
      expect(fingerprint.trustScore).toBeGreaterThanOrEqual(0);
      expect(fingerprint.trustScore).toBeLessThanOrEqual(100);
    });

    it('should analyze devices', () => {
      const input = {
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        ipAddress: '192.168.1.1',
      };

      const analysis = cryptoService.analyzeDevice(input);

      expect(analysis).toBeDefined();
      expect(analysis.fingerprint).toBeDefined();
      expect(analysis.deviceType).toBeDefined();
      expect(analysis.isBot).toBeDefined();
      expect(typeof analysis.trustScore).toBe('number');
    });
  });

  describe('Security Context', () => {
    it('should create security context', () => {
      const input = {
        userId: 'user123',
        ipAddress: '192.168.1.1',
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        accountAge: 30,
        failedAttempts: 0,
      };

      const context = cryptoService.createSecurityContext(input);

      expect(context).toBeDefined();
      expect(context.userId).toBe(input.userId);
      expect(context.ipAddress).toBe(input.ipAddress);
      expect(context.deviceFingerprint).toBeDefined();
      expect(context.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Health Status', () => {
    it('should return health status', () => {
      const health = cryptoService.getHealthStatus();

      expect(health).toBeDefined();
      expect(health.status).toMatch(/^(healthy|degraded|unhealthy)$/);
      expect(health.services).toBeDefined();
      expect(health.timestamp).toBeInstanceOf(Date);
    });
  });

  describe('Configuration', () => {
    it('should generate secure configuration', () => {
      const config = CryptographicService.generateSecureConfig();

      expect(config.accessTokenSecret).toBeDefined();
      expect(config.refreshTokenSecret).toBeDefined();
      expect(config.accessTokenSecret).not.toBe(config.refreshTokenSecret);
      expect(config.accessTokenSecret.length).toBeGreaterThanOrEqual(32);
      expect(config.refreshTokenSecret.length).toBeGreaterThanOrEqual(32);
    });

    it('should validate configuration on construction', () => {
      expect(() => {
        new CryptographicService({
          accessTokenSecret: 'short',
          refreshTokenSecret: 'also-short',
        });
      }).toThrow();
    });
  });
});
