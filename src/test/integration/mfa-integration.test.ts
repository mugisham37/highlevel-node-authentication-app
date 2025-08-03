/**
 * MFA Integration Tests
 * End-to-end tests for the Multi-Factor Authentication system
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TOTPService } from '../../infrastructure/security/totp.service';
import { SMSService } from '../../infrastructure/security/sms.service';
import { EmailMFAService } from '../../infrastructure/security/email-mfa.service';
import { WebAuthnService } from '../../infrastructure/security/webauthn.service';
import { SecureTokenGenerator } from '../../infrastructure/security/secure-token-generator.service';
import { Logger } from 'winston';

// Mock logger for testing
const mockLogger = {
  info: () => {},
  error: () => {},
  warn: () => {},
  debug: () => {},
} as unknown as Logger;

describe('MFA Integration Tests', () => {
  describe('TOTP Service', () => {
    let totpService: TOTPService;

    beforeEach(() => {
      totpService = new TOTPService(mockLogger);
    });

    it('should generate and verify TOTP tokens', async () => {
      // Generate TOTP secret
      const setup = await totpService.generateSecret(
        'test@example.com',
        'Test Service'
      );

      expect(setup.secret).toBeDefined();
      expect(setup.qrCodeUrl).toBeDefined();
      expect(setup.manualEntryKey).toBe(setup.secret);

      // Generate current token
      const currentToken = totpService.generateCurrentToken(setup.secret);
      expect(currentToken).toMatch(/^\d{6}$/);

      // Verify the token
      const verification = await totpService.verifyToken(
        setup.secret,
        currentToken
      );
      expect(verification.valid).toBe(true);

      // Verify invalid token
      const invalidVerification = await totpService.verifyToken(
        setup.secret,
        '000000'
      );
      expect(invalidVerification.valid).toBe(false);
    });

    it('should validate TOTP secrets', () => {
      const validSecret = 'JBSWY3DPEHPK3PXP';
      const invalidSecret = 'invalid-secret';

      expect(totpService.validateSecret(validSecret)).toBe(true);
      expect(totpService.validateSecret(invalidSecret)).toBe(false);
    });

    it('should generate and verify backup codes', () => {
      const backupCodes = totpService.generateBackupCodes(10);

      expect(backupCodes).toHaveLength(10);
      expect(backupCodes[0]).toMatch(/^[A-Z0-9]{8}$/);

      // Test backup code verification
      expect(totpService.verifyBackupCode(backupCodes, backupCodes[0])).toBe(
        true
      );
      expect(totpService.verifyBackupCode(backupCodes, 'INVALID')).toBe(false);
    });

    it('should get remaining time for TOTP token', () => {
      const remainingTime = totpService.getRemainingTime();
      expect(remainingTime).toBeGreaterThan(0);
      expect(remainingTime).toBeLessThanOrEqual(30);
    });
  });

  describe('SMS Service', () => {
    let smsService: SMSService;

    beforeEach(() => {
      const config = {
        accountSid: 'ACtest1234567890123456789012345678',
        authToken: 'test-token',
        fromNumber: '+1234567890',
        serviceName: 'Test Service',
      };
      smsService = new SMSService(config, mockLogger);
    });

    it('should validate phone numbers', () => {
      // Access private method through type assertion for testing
      const service = smsService as any;

      expect(service.isValidPhoneNumber('+1234567890')).toBe(true);
      expect(service.isValidPhoneNumber('1234567890')).toBe(false);
      expect(service.isValidPhoneNumber('+1')).toBe(false); // Too short (needs at least 2 digits)
      expect(service.isValidPhoneNumber('+0123456789')).toBe(false); // Starts with 0
    });

    it('should validate MFA codes', () => {
      const service = smsService as any;

      expect(service.isValidCode('123456')).toBe(true);
      expect(service.isValidCode('12345')).toBe(false);
      expect(service.isValidCode('abcdef')).toBe(false);
    });

    it('should mask phone numbers for logging', () => {
      const service = smsService as any;

      expect(service.maskPhoneNumber('+1234567890')).toBe('*******7890');
      expect(service.maskPhoneNumber('+123')).toBe('****'); // 4 chars or less = all masked
    });

    it('should format MFA messages', () => {
      const service = smsService as any;
      const message = service.formatMFAMessage('123456', 5);

      expect(message).toContain('123456');
      expect(message).toContain('5 minutes');
      expect(message).toContain('Test Service');
    });
  });

  describe('Email MFA Service', () => {
    let emailService: EmailMFAService;

    beforeEach(() => {
      const config = {
        smtpHost: 'smtp.test.com',
        smtpPort: 587,
        smtpSecure: false,
        smtpUser: 'test@test.com',
        smtpPassword: 'password',
        fromEmail: 'noreply@test.com',
        fromName: 'Test Service',
        serviceName: 'Test Service',
      };
      emailService = new EmailMFAService(config, mockLogger);
    });

    it('should validate email addresses', () => {
      const service = emailService as any;

      expect(service.isValidEmail('test@example.com')).toBe(true);
      expect(service.isValidEmail('invalid-email')).toBe(false);
      expect(service.isValidEmail('test@')).toBe(false);
    });

    it('should validate MFA codes', () => {
      const service = emailService as any;

      expect(service.isValidCode('123456')).toBe(true);
      expect(service.isValidCode('12345')).toBe(false);
      expect(service.isValidCode('abcdef')).toBe(false);
    });

    it('should mask emails for logging', () => {
      const service = emailService as any;

      expect(service.maskEmail('test@example.com')).toBe('t**t@example.com');
      expect(service.maskEmail('a@example.com')).toBe('*@example.com');
    });

    it('should generate message IDs', () => {
      const service = emailService as any;
      const messageId1 = service.generateMessageId();
      const messageId2 = service.generateMessageId();

      expect(messageId1).toBeDefined();
      expect(messageId2).toBeDefined();
      expect(messageId1).not.toBe(messageId2);
    });

    it('should generate MFA code templates', () => {
      const service = emailService as any;
      const template = service.getMFACodeTemplate('123456', 10);

      expect(template.subject).toContain('Test Service');
      expect(template.htmlBody).toContain('123456');
      expect(template.htmlBody).toContain('10 minutes');
      expect(template.textBody).toContain('123456');
      expect(template.textBody).toContain('10 minutes');
    });
  });

  describe('WebAuthn Service', () => {
    let webAuthnService: WebAuthnService;

    beforeEach(() => {
      const config = {
        rpName: 'Test Service',
        rpID: 'localhost',
        origin: 'http://localhost:3000',
      };
      webAuthnService = new WebAuthnService(config, mockLogger);
    });

    it('should generate unique credential IDs', () => {
      const service = webAuthnService as any;
      const id1 = service.generateCredentialId();
      const id2 = service.generateCredentialId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toBe(id2);
      expect(id1).toMatch(/^cred_\d+_[a-z0-9]+$/);
    });

    it('should mask emails for logging', () => {
      const service = webAuthnService as any;

      expect(service.maskEmail('test@example.com')).toBe('t**t@example.com');
      expect(service.maskEmail('a@example.com')).toBe('*@example.com');
    });

    it('should manage user credentials', async () => {
      const userId = 'user123';
      const credentialName = 'YubiKey';

      // Initially no credentials
      let credentials = await webAuthnService.getUserCredentials(userId);
      expect(credentials).toHaveLength(0);

      // Register a credential (simplified)
      const result = await webAuthnService.registerCredential({
        userId,
        credentialName,
        challenge: 'test-challenge',
        origin: 'http://localhost:3000',
      });

      expect(result.success).toBe(true);
      expect(result.credentialId).toBeDefined();

      // Check credentials now exist
      credentials = await webAuthnService.getUserCredentials(userId);
      expect(credentials).toHaveLength(1);
      expect(credentials[0].name).toBe(credentialName);

      // Remove credential
      const removed = await webAuthnService.removeCredential(
        userId,
        result.credentialId!
      );
      expect(removed).toBe(true);

      // Check credentials are gone
      credentials = await webAuthnService.getUserCredentials(userId);
      expect(credentials).toHaveLength(0);
    });

    it('should update credential names', async () => {
      const userId = 'user123';
      const credentialName = 'Old Name';
      const newName = 'New Name';

      // Register a credential
      const result = await webAuthnService.registerCredential({
        userId,
        credentialName,
        challenge: 'test-challenge',
        origin: 'http://localhost:3000',
      });

      expect(result.success).toBe(true);

      // Update credential name
      const updated = await webAuthnService.updateCredentialName(
        userId,
        result.credentialId!,
        newName
      );
      expect(updated).toBe(true);

      // Verify name was updated
      const credentials = await webAuthnService.getUserCredentials(userId);
      expect(credentials[0].name).toBe(newName);
    });

    it('should remove all credentials for a user', async () => {
      const userId = 'user123';

      // Register multiple credentials
      await webAuthnService.registerCredential({
        userId,
        credentialName: 'Credential 1',
        challenge: 'test-challenge-1',
        origin: 'http://localhost:3000',
      });

      await webAuthnService.registerCredential({
        userId,
        credentialName: 'Credential 2',
        challenge: 'test-challenge-2',
        origin: 'http://localhost:3000',
      });

      // Verify credentials exist
      let credentials = await webAuthnService.getUserCredentials(userId);
      expect(credentials).toHaveLength(2);

      // Remove all credentials
      const count = await webAuthnService.removeAllCredentials(userId);
      expect(count).toBe(2);

      // Verify all credentials are gone
      credentials = await webAuthnService.getUserCredentials(userId);
      expect(credentials).toHaveLength(0);
    });

    it('should get service health status', async () => {
      const health = await webAuthnService.getServiceHealth();

      expect(health.healthy).toBe(true);
      expect(health.credentialsCount).toBe(0);
      expect(health.error).toBeUndefined();
    });
  });

  describe('Secure Token Generator', () => {
    it('should generate OTP codes', () => {
      const otp4 = SecureTokenGenerator.generateOTP(4);
      const otp6 = SecureTokenGenerator.generateOTP(6);
      const otp8 = SecureTokenGenerator.generateOTP(8);

      expect(otp4).toMatch(/^\d{4}$/);
      expect(otp6).toMatch(/^\d{6}$/);
      expect(otp8).toMatch(/^\d{8}$/);
    });

    it('should generate backup codes', () => {
      const codes = SecureTokenGenerator.generateBackupCodes(10);

      expect(codes).toHaveLength(10);
      codes.forEach((code) => {
        expect(code).toMatch(/^[A-Za-z0-9]{8}$/);
      });

      // All codes should be unique
      const uniqueCodes = new Set(codes);
      expect(uniqueCodes.size).toBe(codes.length);
    });

    it('should generate secure tokens with different options', () => {
      const hexToken = SecureTokenGenerator.generateToken({
        length: 16,
        encoding: 'hex',
      });
      const base64Token = SecureTokenGenerator.generateToken({
        length: 16,
        encoding: 'base64',
      });
      const customToken = SecureTokenGenerator.generateToken({
        length: 8,
        alphabet: 'ABCDEF123456',
        prefix: 'test_',
        suffix: '_end',
      });

      expect(hexToken).toMatch(/^[a-f0-9]{16}$/);
      expect(base64Token).toHaveLength(16);
      expect(customToken).toMatch(/^test_[ABCDEF123456]{8}_end$/);
    });

    it('should generate timestamped tokens', () => {
      const timestamped = SecureTokenGenerator.generateTimestampedToken({
        length: 16,
        expiresIn: 300, // 5 minutes
      });

      expect(timestamped.token).toBeDefined();
      expect(timestamped.timestamp).toBeGreaterThan(Date.now() - 1000);
      expect(timestamped.expiresAt).toBeGreaterThan(Date.now());

      // Extract timestamp
      const extractedTimestamp = SecureTokenGenerator.extractTimestamp(
        timestamped.token
      );
      expect(extractedTimestamp).toBe(timestamped.timestamp);
    });

    it('should validate tokens', () => {
      const validToken = SecureTokenGenerator.generateToken({
        length: 32,
        includeChecksum: true,
      });
      const invalidToken = 'invalid';

      const validResult = SecureTokenGenerator.validateToken(validToken);
      const invalidResult = SecureTokenGenerator.validateToken(invalidToken);

      expect(validResult.valid).toBe(true);
      expect(validResult.hasChecksum).toBe(true);
      expect(validResult.checksumValid).toBe(true);

      expect(invalidResult.valid).toBe(false);
    });

    it('should check token expiration', () => {
      const expiredToken = SecureTokenGenerator.generateExpiringToken(-1); // Expired 1 second ago
      const validToken = SecureTokenGenerator.generateExpiringToken(300); // Expires in 5 minutes

      expect(SecureTokenGenerator.isTokenExpired(expiredToken.token)).toBe(
        true
      );
      expect(SecureTokenGenerator.isTokenExpired(validToken.token)).toBe(false);
    });

    it('should generate and verify signed tokens', () => {
      const secret = 'test-secret';
      const payload = 'user123';

      const signedToken = SecureTokenGenerator.generateSignedToken(
        payload,
        secret
      );
      expect(signedToken).toBeDefined();

      const verification = SecureTokenGenerator.verifySignedToken(
        signedToken,
        secret
      );
      expect(verification.valid).toBe(true);
      expect(verification.payload).toBe(payload);

      // Test with wrong secret
      const wrongVerification = SecureTokenGenerator.verifySignedToken(
        signedToken,
        'wrong-secret'
      );
      expect(wrongVerification.valid).toBe(false);
    });

    it('should generate and verify device binding tokens', () => {
      const deviceId = 'device123';
      const secret = 'binding-secret';

      const bindingToken = SecureTokenGenerator.generateDeviceBindingToken(
        deviceId,
        secret
      );
      expect(bindingToken).toBeDefined();

      const isValid = SecureTokenGenerator.verifyDeviceBindingToken(
        bindingToken,
        deviceId,
        secret
      );
      expect(isValid).toBe(true);

      // Test with wrong device ID
      const wrongDeviceValid = SecureTokenGenerator.verifyDeviceBindingToken(
        bindingToken,
        'wrong-device',
        secret
      );
      expect(wrongDeviceValid).toBe(false);

      // Test with wrong secret
      const wrongSecretValid = SecureTokenGenerator.verifyDeviceBindingToken(
        bindingToken,
        deviceId,
        'wrong-secret'
      );
      expect(wrongSecretValid).toBe(false);
    });
  });
});
