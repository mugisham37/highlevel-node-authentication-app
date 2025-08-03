/**
 * Email Value Object Tests
 */

import { describe, it, expect } from 'vitest';
import { Email } from '../../../domain/value-objects/email';

describe('Email Value Object', () => {
  describe('Valid emails', () => {
    it('should create email with valid format', () => {
      const email = new Email('test@example.com');
      expect(email.value).toBe('test@example.com');
      expect(email.domain).toBe('example.com');
      expect(email.localPart).toBe('test');
    });

    it('should normalize email to lowercase', () => {
      const email = new Email('TEST@EXAMPLE.COM');
      expect(email.value).toBe('test@example.com');
    });

    it('should trim whitespace', () => {
      const email = new Email('  test@example.com  ');
      expect(email.value).toBe('test@example.com');
    });
  });

  describe('Invalid emails', () => {
    it('should throw error for empty email', () => {
      expect(() => new Email('')).toThrow('Email cannot be empty');
    });

    it('should throw error for invalid format', () => {
      expect(() => new Email('invalid-email')).toThrow('Invalid email format');
    });

    it('should throw error for consecutive dots', () => {
      expect(() => new Email('test..user@example.com')).toThrow(
        'Email cannot contain consecutive dots'
      );
    });

    it('should throw error for local part starting with dot', () => {
      expect(() => new Email('.test@example.com')).toThrow(
        'Email local part cannot start or end with a dot'
      );
    });

    it('should throw error for too long email', () => {
      const longEmail = 'a'.repeat(250) + '@example.com';
      expect(() => new Email(longEmail)).toThrow('Email address too long');
    });
  });

  describe('Business rules', () => {
    it('should identify disposable email', () => {
      const email = new Email('test@10minutemail.com');
      expect(email.isDisposable()).toBe(true);
    });

    it('should identify corporate email', () => {
      const email = new Email('test@company.com');
      expect(email.isCorporate()).toBe(true);
    });

    it('should identify personal email', () => {
      const email = new Email('test@gmail.com');
      expect(email.isCorporate()).toBe(false);
    });
  });

  describe('Equality', () => {
    it('should be equal for same email', () => {
      const email1 = new Email('test@example.com');
      const email2 = new Email('test@example.com');
      expect(email1.equals(email2)).toBe(true);
    });

    it('should not be equal for different emails', () => {
      const email1 = new Email('test1@example.com');
      const email2 = new Email('test2@example.com');
      expect(email1.equals(email2)).toBe(false);
    });
  });
});
