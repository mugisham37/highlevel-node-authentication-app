/**
 * Password Value Object Tests
 */

import { describe, it, expect } from 'vitest';
import { Password } from '../../../domain/value-objects/password';

describe('Password Value Object', () => {
  describe('Valid passwords', () => {
    it('should create password from valid plain text', async () => {
      const password = await Password.fromPlainText('StrongPass123!');
      expect(password.hashedValue).toBeDefined();
      expect(password.hashedValue.length).toBeGreaterThan(0);
    });

    it('should verify correct password', async () => {
      const password = await Password.fromPlainText('StrongPass123!');
      const isValid = await password.verify('StrongPass123!');
      expect(isValid).toBe(true);
    });

    it('should not verify incorrect password', async () => {
      const password = await Password.fromPlainText('StrongPass123!');
      const isValid = await password.verify('WrongPassword');
      expect(isValid).toBe(false);
    });
  });

  describe('Invalid passwords', () => {
    it('should throw error for too short password', async () => {
      await expect(Password.fromPlainText('Short1!')).rejects.toThrow(
        'Password must be at least 8 characters long'
      );
    });

    it('should throw error for missing lowercase', async () => {
      await expect(Password.fromPlainText('PASSWORD123!')).rejects.toThrow(
        'Password must contain at least one lowercase letter'
      );
    });

    it('should throw error for missing uppercase', async () => {
      await expect(Password.fromPlainText('password123!')).rejects.toThrow(
        'Password must contain at least one uppercase letter'
      );
    });

    it('should throw error for missing digit', async () => {
      await expect(Password.fromPlainText('Password!')).rejects.toThrow(
        'Password must contain at least one digit'
      );
    });

    it('should throw error for missing special character', async () => {
      await expect(Password.fromPlainText('Password123')).rejects.toThrow(
        'Password must contain at least one special character'
      );
    });

    it('should throw error for common password', async () => {
      await expect(Password.fromPlainText('password')).rejects.toThrow(
        'Password is too common and not allowed'
      );
    });

    it('should throw error for sequential characters', async () => {
      await expect(Password.fromPlainText('Abcd1234!')).rejects.toThrow(
        'Password cannot contain sequential characters'
      );
    });

    it('should throw error for repeated characters', async () => {
      await expect(Password.fromPlainText('Passsword123!')).rejects.toThrow(
        'Password cannot contain more than 2 consecutive identical characters'
      );
    });
  });

  describe('Password strength', () => {
    it('should calculate strength for weak password', () => {
      const strength = Password.calculateStrength('Password1!');
      expect(strength).toBeGreaterThan(0);
      expect(strength).toBeLessThan(100);
    });

    it('should calculate higher strength for strong password', () => {
      const strength = Password.calculateStrength(
        'MyVeryStr0ng&UniqueP@ssw0rd!'
      );
      expect(strength).toBeGreaterThan(70);
    });
  });

  describe('Hash operations', () => {
    it('should create password from existing hash', () => {
      const hash = '$argon2id$v=19$m=65536,t=3,p=1$somehashedvalue';
      const password = Password.fromHash(hash);
      expect(password.hashedValue).toBe(hash);
    });

    it('should throw error for invalid hash', () => {
      expect(() => Password.fromHash('')).toThrow(
        'Hashed password must be a non-empty string'
      );
    });
  });

  describe('Security', () => {
    it('should not expose password in JSON', async () => {
      const password = await Password.fromPlainText('StrongPass123!');
      expect(password.toJSON()).toBe('[PROTECTED]');
    });

    it('should not expose password in toString', async () => {
      const password = await Password.fromPlainText('StrongPass123!');
      expect(password.toString()).toBe('[PROTECTED]');
    });
  });
});
