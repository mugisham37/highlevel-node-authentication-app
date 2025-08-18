import { describe, expect, it } from 'vitest';
import { validateEmail, validatePassword, validateUuid } from '../validators';

describe('Validators', () => {
  describe('validateEmail', () => {
    it('should validate correct email addresses', () => {
      expect(validateEmail('test@example.com')).toBe(true);
      expect(validateEmail('user.name@domain.co.uk')).toBe(true);
      expect(validateEmail('user+tag@example.org')).toBe(true);
    });

    it('should reject invalid email addresses', () => {
      expect(validateEmail('invalid-email')).toBe(false);
      expect(validateEmail('test@')).toBe(false);
      expect(validateEmail('@example.com')).toBe(false);
      expect(validateEmail('')).toBe(false);
    });
  });

  describe('validatePassword', () => {
    it('should validate strong passwords', () => {
      expect(validatePassword('StrongPass123!')).toBe(true);
      expect(validatePassword('MySecure@Pass1')).toBe(true);
    });

    it('should reject weak passwords', () => {
      expect(validatePassword('weak')).toBe(false);
      expect(validatePassword('onlylowercase')).toBe(false);
      expect(validatePassword('ONLYUPPERCASE')).toBe(false);
      expect(validatePassword('NoSpecialChar123')).toBe(false);
      expect(validatePassword('NoNumbers!')).toBe(false);
    });
  });

  describe('validateUuid', () => {
    it('should validate correct UUIDs', () => {
      expect(validateUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(validateUuid('550e8400-e29b-41d4-a716-446655440000')).toBe(true);
    });

    it('should reject invalid UUIDs', () => {
      expect(validateUuid('invalid-uuid')).toBe(false);
      expect(validateUuid('123e4567-e89b-12d3-a456')).toBe(false);
      expect(validateUuid('')).toBe(false);
    });
  });
});