import { describe, expect, it } from '@jest/globals';
import { loginSchema, registerSchema } from '../../schemas/auth';

describe('Auth Schemas', () => {
  describe('Login Schema', () => {
    it('should validate correct login data', () => {
      const validLogin = {
        email: 'test@example.com',
        password: 'password123',
        rememberMe: false,
      };

      const result = loginSchema.safeParse(validLogin);
      expect(result.success).toBe(true);
    });

    it('should reject invalid email', () => {
      const invalidLogin = {
        email: 'invalid-email',
        password: 'password123',
        rememberMe: false,
      };

      const result = loginSchema.safeParse(invalidLogin);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Invalid email address');
      }
    });

    it('should reject empty password', () => {
      const invalidLogin = {
        email: 'test@example.com',
        password: '',
        rememberMe: false,
      };

      const result = loginSchema.safeParse(invalidLogin);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('Password is required');
      }
    });
  });

  describe('Register Schema', () => {
    it('should validate correct registration data', () => {
      const validRegister = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: true,
      };

      const result = registerSchema.safeParse(validRegister);
      expect(result.success).toBe(true);
    });

    it('should reject weak password', () => {
      const invalidRegister = {
        email: 'test@example.com',
        password: 'weak',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: true,
      };

      const result = registerSchema.safeParse(invalidRegister);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(
          result.error.issues.some(issue =>
            issue.message.includes('Password must be at least 8 characters')
          )
        ).toBe(true);
      }
    });

    it('should reject without accepting terms', () => {
      const invalidRegister = {
        email: 'test@example.com',
        password: 'Password123!',
        firstName: 'John',
        lastName: 'Doe',
        acceptTerms: false,
      };

      const result = registerSchema.safeParse(invalidRegister);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe('You must accept the terms and conditions');
      }
    });
  });
});
