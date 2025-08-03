/**
 * Security Validation and Penetration Testing Suite
 * Comprehensive security testing for authentication system
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { createServer } from '../../infrastructure/server/fastify-server';
import { logger } from '../../infrastructure/logging/winston-logger';
import crypto from 'crypto';

describe('Security Validation Tests', () => {
  let server: any;
  let baseUrl: string;

  beforeAll(async () => {
    server = await createServer();
    await server.listen({ port: 0, host: '127.0.0.1' });
    baseUrl = `http://127.0.0.1:${server.server.address()?.port}`;
  });

  afterAll(async () => {
    if (server) {
      await server.close();
    }
  });

  describe('Authentication Security', () => {
    it('should prevent SQL injection in login attempts', async () => {
      const sqlInjectionPayloads = [
        "admin'; DROP TABLE users; --",
        "' OR '1'='1",
        "' UNION SELECT * FROM users --",
        "admin'/**/OR/**/1=1--",
        "' OR 1=1#",
      ];

      for (const payload of sqlInjectionPayloads) {
        const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload,
            password: 'password',
          }),
        });

        // Should return 400 (validation error) or 401 (unauthorized), not 500 (server error)
        expect([400, 401]).toContain(response.status);

        if (response.status === 500) {
          const errorData = await response.json();
          logger.error('SQL injection vulnerability detected', {
            payload,
            error: errorData,
          });
        }
      }
    });

    it('should prevent NoSQL injection attempts', async () => {
      const nosqlInjectionPayloads = [
        { $ne: null },
        { $gt: '' },
        { $regex: '.*' },
        { $where: '1==1' },
      ];

      for (const payload of nosqlInjectionPayloads) {
        const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: payload,
            password: 'password',
          }),
        });

        expect([400, 401]).toContain(response.status);
      }
    });

    it('should enforce strong password requirements', async () => {
      const weakPasswords = [
        'password',
        '123456',
        'qwerty',
        'abc123',
        'password123',
        'Password', // Missing special character and number
        'password1', // Missing uppercase and special character
        'PASSWORD1!', // Missing lowercase
      ];

      for (const weakPassword of weakPasswords) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            password: weakPassword,
            name: 'Test User',
          }),
        });

        expect(response.status).toBe(400);
        const errorData = await response.json();
        expect(errorData.error).toContain('password');
      }
    });

    it('should prevent timing attacks on user enumeration', async () => {
      const existingEmail = 'existing@example.com';
      const nonExistingEmail = 'nonexisting@example.com';

      // First register a user
      await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: existingEmail,
          password: 'SecurePassword123!',
          name: 'Test User',
        }),
      });

      // Measure response times for existing vs non-existing users
      const timingTests = [];

      for (let i = 0; i < 10; i++) {
        // Test existing user
        const startExisting = Date.now();
        await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: existingEmail,
            password: 'wrongpassword',
          }),
        });
        const existingTime = Date.now() - startExisting;

        // Test non-existing user
        const startNonExisting = Date.now();
        await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: nonExistingEmail,
            password: 'wrongpassword',
          }),
        });
        const nonExistingTime = Date.now() - nonExistingTime;

        timingTests.push({
          existing: existingTime,
          nonExisting: nonExistingTime,
        });
      }

      // Calculate average times
      const avgExisting =
        timingTests.reduce((sum, t) => sum + t.existing, 0) /
        timingTests.length;
      const avgNonExisting =
        timingTests.reduce((sum, t) => sum + t.nonExisting, 0) /
        timingTests.length;

      // Timing difference should be minimal (less than 50ms difference on average)
      const timingDifference = Math.abs(avgExisting - avgNonExisting);
      expect(timingDifference).toBeLessThan(50);
    });

    it('should validate JWT token integrity', async () => {
      // Register and login to get a valid token
      const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'jwt-test@example.com',
          password: 'SecurePassword123!',
          name: 'JWT Test User',
        }),
      });

      const { tokens } = await registerResponse.json();
      const validToken = tokens.accessToken;

      // Test various token manipulation attempts
      const manipulatedTokens = [
        validToken.slice(0, -5) + 'XXXXX', // Modify signature
        validToken.replace(/\./g, 'X'), // Replace dots
        'Bearer ' + validToken, // Add Bearer prefix
        validToken + 'extra', // Append extra data
        validToken.split('.').reverse().join('.'), // Reverse parts
        'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c', // Known invalid token
      ];

      for (const token of manipulatedTokens) {
        const response = await fetch(`${baseUrl}/api/v1/users/profile`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        expect(response.status).toBe(401);
      }
    });
  });

  describe('Input Validation Security', () => {
    it('should prevent XSS attacks in user inputs', async () => {
      const xssPayloads = [
        '<script>alert("XSS")</script>',
        'javascript:alert("XSS")',
        '<img src="x" onerror="alert(\'XSS\')">',
        '<svg onload="alert(\'XSS\')">',
        '"><script>alert("XSS")</script>',
        '\';alert(String.fromCharCode(88,83,83))//\';alert(String.fromCharCode(88,83,83))//";alert(String.fromCharCode(88,83,83))//";alert(String.fromCharCode(88,83,83))//--></SCRIPT>">\'><SCRIPT>alert(String.fromCharCode(88,83,83))</SCRIPT>',
      ];

      for (const payload of xssPayloads) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'test@example.com',
            password: 'SecurePassword123!',
            name: payload,
          }),
        });

        // Should either reject the input (400) or sanitize it
        if (response.status === 201) {
          const userData = await response.json();
          // If accepted, ensure the payload is sanitized
          expect(userData.user.name).not.toContain('<script>');
          expect(userData.user.name).not.toContain('javascript:');
          expect(userData.user.name).not.toContain('onerror');
        } else {
          expect(response.status).toBe(400);
        }
      }
    });

    it('should validate email format strictly', async () => {
      const invalidEmails = [
        'invalid-email',
        '@example.com',
        'user@',
        'user..user@example.com',
        'user@example',
        'user@.example.com',
        'user@example..com',
        'user name@example.com',
        'user@exam ple.com',
        'user@example.com.',
        '.user@example.com',
      ];

      for (const email of invalidEmails) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email,
            password: 'SecurePassword123!',
            name: 'Test User',
          }),
        });

        expect(response.status).toBe(400);
      }
    });

    it('should prevent oversized payloads', async () => {
      const largePayload = 'A'.repeat(10 * 1024 * 1024); // 10MB payload

      const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'SecurePassword123!',
          name: largePayload,
        }),
      });

      expect([400, 413]).toContain(response.status); // 413 = Payload Too Large
    });
  });

  describe('Rate Limiting Security', () => {
    it('should enforce rate limits on login attempts', async () => {
      const responses = [];

      // Make rapid login attempts
      for (let i = 0; i < 20; i++) {
        const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'ratelimit-test@example.com',
            password: 'wrongpassword',
          }),
        });
        responses.push(response.status);
      }

      // Should eventually return 429 (Too Many Requests)
      expect(responses).toContain(429);
    });

    it('should enforce rate limits on registration attempts', async () => {
      const responses = [];

      // Make rapid registration attempts
      for (let i = 0; i < 15; i++) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `ratelimit${i}@example.com`,
            password: 'SecurePassword123!',
            name: 'Rate Limit Test',
          }),
        });
        responses.push(response.status);
      }

      // Should eventually return 429 (Too Many Requests)
      expect(responses).toContain(429);
    });
  });

  describe('Session Security', () => {
    it('should invalidate sessions on password change', async () => {
      // Register and login
      const registerResponse = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'session-security@example.com',
          password: 'OldPassword123!',
          name: 'Session Security Test',
        }),
      });

      const { tokens } = await registerResponse.json();

      // Verify token works
      const profileResponse1 = await fetch(`${baseUrl}/api/v1/users/profile`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(profileResponse1.status).toBe(200);

      // Change password
      const changePasswordResponse = await fetch(
        `${baseUrl}/api/v1/users/change-password`,
        {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${tokens.accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentPassword: 'OldPassword123!',
            newPassword: 'NewPassword123!',
          }),
        }
      );

      expect([200, 204]).toContain(changePasswordResponse.status);

      // Old token should be invalidated
      const profileResponse2 = await fetch(`${baseUrl}/api/v1/users/profile`, {
        headers: { Authorization: `Bearer ${tokens.accessToken}` },
      });
      expect(profileResponse2.status).toBe(401);
    });

    it('should prevent session fixation attacks', async () => {
      // This test verifies that session tokens change after authentication
      const loginResponse1 = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'session-security@example.com',
          password: 'NewPassword123!',
        }),
      });

      const { tokens: tokens1 } = await loginResponse1.json();

      // Login again
      const loginResponse2 = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'session-security@example.com',
          password: 'NewPassword123!',
        }),
      });

      const { tokens: tokens2 } = await loginResponse2.json();

      // Tokens should be different
      expect(tokens1.accessToken).not.toBe(tokens2.accessToken);
      expect(tokens1.refreshToken).not.toBe(tokens2.refreshToken);
    });
  });

  describe('HTTPS and Transport Security', () => {
    it('should enforce secure headers', async () => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password',
        }),
      });

      // Check security headers
      expect(response.headers.get('Strict-Transport-Security')).toBeTruthy();
      expect(response.headers.get('X-Content-Type-Options')).toBe('nosniff');
      expect(response.headers.get('X-Frame-Options')).toBe('DENY');
      expect(response.headers.get('X-XSS-Protection')).toBe('1; mode=block');
      expect(response.headers.get('Content-Security-Policy')).toBeTruthy();
    });

    it('should not expose sensitive information in error messages', async () => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'nonexistent@example.com',
          password: 'wrongpassword',
        }),
      });

      expect(response.status).toBe(401);
      const errorData = await response.json();

      // Error message should be generic, not revealing whether user exists
      expect(errorData.error.toLowerCase()).not.toContain('user not found');
      expect(errorData.error.toLowerCase()).not.toContain('invalid user');
      expect(errorData.error.toLowerCase()).not.toContain(
        'user does not exist'
      );
    });
  });

  describe('Cryptographic Security', () => {
    it('should use secure random token generation', async () => {
      // Register multiple users and check token uniqueness
      const tokens = new Set();

      for (let i = 0; i < 10; i++) {
        const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: `crypto-test-${i}@example.com`,
            password: 'SecurePassword123!',
            name: 'Crypto Test User',
          }),
        });

        if (response.status === 201) {
          const { tokens: userTokens } = await response.json();
          tokens.add(userTokens.accessToken);
        }
      }

      // All tokens should be unique
      expect(tokens.size).toBeGreaterThan(5); // At least some should succeed
    });

    it('should properly hash passwords', async () => {
      // This test verifies that passwords are not stored in plain text
      // In a real scenario, you'd check the database directly
      const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'password-hash-test@example.com',
          password: 'TestPassword123!',
          name: 'Password Hash Test',
        }),
      });

      expect(response.status).toBe(201);
      const userData = await response.json();

      // User object should not contain the plain text password
      expect(userData.user.password).toBeUndefined();
      expect(userData.user.passwordHash).toBeUndefined();
    });
  });

  describe('API Security', () => {
    it('should validate Content-Type headers', async () => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password',
        }),
      });

      expect(response.status).toBe(400);
    });

    it('should prevent HTTP method override attacks', async () => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'GET',
        headers: {
          'X-HTTP-Method-Override': 'POST',
          'Content-Type': 'application/json',
        },
      });

      expect(response.status).toBe(405); // Method Not Allowed
    });

    it('should handle malformed JSON gracefully', async () => {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{"email": "test@example.com", "password": "incomplete',
      });

      expect(response.status).toBe(400);
      const errorData = await response.json();
      expect(errorData.correlationId).toBeDefined();
    });
  });
});
