/**
 * User Entity Tests
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { User, UserProps } from '../../../domain/entities/user';
import { Email } from '../../../domain/value-objects/email';
import { Password } from '../../../domain/value-objects/password';

describe('User Entity', () => {
  let validUserProps: UserProps;

  beforeEach(() => {
    validUserProps = {
      id: 'user-123',
      email: new Email('test@example.com'),
      createdAt: new Date(),
      updatedAt: new Date(),
      mfaEnabled: false,
      backupCodes: [],
      failedLoginAttempts: 0,
      riskScore: 0,
    };
  });

  describe('User creation', () => {
    it('should create user with valid props', () => {
      const user = new User(validUserProps);
      expect(user.id).toBe('user-123');
      expect(user.email.value).toBe('test@example.com');
      expect(user.mfaEnabled).toBe(false);
      expect(user.riskScore).toBe(0);
    });

    it('should throw error for invalid ID', () => {
      expect(() => new User({ ...validUserProps, id: '' })).toThrow(
        'User ID must be a non-empty string'
      );
    });

    it('should throw error for invalid email', () => {
      expect(
        () => new User({ ...validUserProps, email: 'invalid' as any })
      ).toThrow('Email must be an Email value object');
    });

    it('should throw error for invalid risk score', () => {
      expect(() => new User({ ...validUserProps, riskScore: -1 })).toThrow(
        'Risk score must be between 0 and 100'
      );
      expect(() => new User({ ...validUserProps, riskScore: 101 })).toThrow(
        'Risk score must be between 0 and 100'
      );
    });
  });

  describe('Account locking', () => {
    it('should not be locked initially', () => {
      const user = new User(validUserProps);
      expect(user.isLocked()).toBe(false);
      expect(user.canAuthenticate()).toBe(false); // Email not verified
    });

    it('should increment failed attempts', () => {
      const user = new User(validUserProps);
      user.incrementFailedAttempts();
      expect(user.failedLoginAttempts).toBe(1);
    });

    it('should lock account after multiple failed attempts', () => {
      const user = new User(validUserProps);

      // Increment to trigger lock
      for (let i = 0; i < 3; i++) {
        user.incrementFailedAttempts();
      }

      expect(user.isLocked()).toBe(true);
      expect(user.canAuthenticate()).toBe(false);
    });

    it('should reset failed attempts', () => {
      const user = new User(validUserProps);
      user.incrementFailedAttempts();
      user.resetFailedAttempts();
      expect(user.failedLoginAttempts).toBe(0);
      expect(user.isLocked()).toBe(false);
    });
  });

  describe('Email verification', () => {
    it('should not be verified initially', () => {
      const user = new User(validUserProps);
      expect(user.isEmailVerified()).toBe(false);
    });

    it('should verify email', () => {
      const user = new User(validUserProps);
      user.verifyEmail();
      expect(user.isEmailVerified()).toBe(true);
      expect(user.emailVerified).toBeInstanceOf(Date);
    });

    it('should reduce risk score when email verified', () => {
      const user = new User({ ...validUserProps, riskScore: 50 });
      user.verifyEmail();
      expect(user.riskScore).toBeLessThan(50);
    });
  });

  describe('MFA management', () => {
    it('should enable MFA', () => {
      const user = new User(validUserProps);
      const backupCodes = Array.from({ length: 8 }, (_, i) => `backup-${i}`);

      user.enableMFA('totp-secret', backupCodes);
      expect(user.mfaEnabled).toBe(true);
      expect(user.totpSecret).toBe('totp-secret');
      expect(user.backupCodes).toEqual(backupCodes);
    });

    it('should throw error for invalid MFA setup', () => {
      const user = new User(validUserProps);
      expect(() => user.enableMFA('', [])).toThrow(
        'TOTP secret is required to enable MFA'
      );
      expect(() => user.enableMFA('secret', ['code1'])).toThrow(
        'At least 8 backup codes are required'
      );
    });

    it('should disable MFA', () => {
      const user = new User(validUserProps);
      const backupCodes = Array.from({ length: 8 }, (_, i) => `backup-${i}`);

      user.enableMFA('totp-secret', backupCodes);
      user.disableMFA();

      expect(user.mfaEnabled).toBe(false);
      expect(user.totpSecret).toBeUndefined();
      expect(user.backupCodes).toEqual([]);
    });

    it('should use backup code', () => {
      const user = new User(validUserProps);
      const backupCodes = [
        'code1',
        'code2',
        'code3',
        'code4',
        'code5',
        'code6',
        'code7',
        'code8',
      ];

      user.enableMFA('totp-secret', backupCodes);

      const used = user.useBackupCode('code1');
      expect(used).toBe(true);
      expect(user.backupCodes).not.toContain('code1');
      expect(user.backupCodes.length).toBe(7);

      const usedAgain = user.useBackupCode('code1');
      expect(usedAgain).toBe(false);
    });
  });

  describe('Risk scoring', () => {
    it('should update risk score on login', () => {
      const user = new User(validUserProps);
      user.updateLastLogin('192.168.1.1');
      expect(user.lastLoginAt).toBeInstanceOf(Date);
      expect(user.lastLoginIP).toBe('192.168.1.1');
    });

    it('should increase risk score for different IP', () => {
      const user = new User({ ...validUserProps, lastLoginIP: '192.168.1.1' });
      user.updateLastLogin('10.0.0.1');
      expect(user.riskScore).toBeGreaterThan(0);
    });

    it('should require MFA for high risk score', () => {
      const user = new User({ ...validUserProps, riskScore: 60 });
      expect(user.requiresMFA()).toBe(true);
    });
  });

  describe('Profile updates', () => {
    it('should update profile information', () => {
      const user = new User(validUserProps);
      user.updateProfile({
        name: 'John Doe',
        image: 'https://example.com/avatar.jpg',
      });

      expect(user.name).toBe('John Doe');
      expect(user.image).toBe('https://example.com/avatar.jpg');
    });

    it('should reset email verification when email changes', () => {
      const user = new User({ ...validUserProps, emailVerified: new Date() });
      const newEmail = new Email('new@example.com');

      user.updateProfile({ email: newEmail });
      expect(user.email.equals(newEmail)).toBe(true);
      expect(user.emailVerified).toBeUndefined();
    });

    it('should validate profile updates', () => {
      const user = new User(validUserProps);
      expect(() => user.updateProfile({ name: '' })).toThrow(
        'Name cannot be empty'
      );
      expect(() => user.updateProfile({ image: 'invalid-url' })).toThrow(
        'Image must be a valid URL'
      );
    });
  });

  describe('Security status', () => {
    it('should return security status', () => {
      const user = new User(validUserProps);
      const status = user.getSecurityStatus();

      expect(status.isSecure).toBe(false);
      expect(status.issues).toContain('Email not verified');
      expect(status.issues).toContain('No password set');
      expect(status.issues).toContain('MFA not enabled');
    });

    it('should show secure status for fully configured user', async () => {
      const password = await Password.fromPlainText('StrongPass123!');
      const user = new User({
        ...validUserProps,
        password,
        emailVerified: new Date(),
        mfaEnabled: true,
      });

      const status = user.getSecurityStatus();
      expect(status.isSecure).toBe(true);
      expect(status.issues).toHaveLength(0);
    });
  });

  describe('Serialization', () => {
    it('should serialize to JSON without sensitive data', () => {
      const user = new User(validUserProps);
      const json = user.toJSON();

      expect(json.id).toBe('user-123');
      expect(json.email).toBe('test@example.com');
      expect(json).not.toHaveProperty('password');
      expect(json).not.toHaveProperty('totpSecret');
    });
  });

  describe('Equality', () => {
    it('should be equal for same ID', () => {
      const user1 = new User(validUserProps);
      const user2 = new User(validUserProps);
      expect(user1.equals(user2)).toBe(true);
    });

    it('should not be equal for different IDs', () => {
      const user1 = new User(validUserProps);
      const user2 = new User({ ...validUserProps, id: 'different-id' });
      expect(user1.equals(user2)).toBe(false);
    });
  });
});
