/**
 * PKCE Service Tests
 * Tests for Proof Key for Code Exchange functionality
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { PKCEService } from '../../../infrastructure/security/pkce.service';

describe('PKCEService', () => {
  let pkceService: PKCEService;

  beforeEach(() => {
    pkceService = new PKCEService();
  });

  describe('generateChallenge', () => {
    it('should generate valid PKCE challenge', () => {
      const challenge = pkceService.generateChallenge();

      expect(challenge).toHaveProperty('codeVerifier');
      expect(challenge).toHaveProperty('codeChallenge');
      expect(challenge).toHaveProperty('codeChallengeMethod');
      expect(challenge.codeChallengeMethod).toBe('S256');
    });

    it('should generate different challenges each time', () => {
      const challenge1 = pkceService.generateChallenge();
      const challenge2 = pkceService.generateChallenge();

      expect(challenge1.codeVerifier).not.toBe(challenge2.codeVerifier);
      expect(challenge1.codeChallenge).not.toBe(challenge2.codeChallenge);
    });

    it('should generate code verifier with correct length', () => {
      const challenge = pkceService.generateChallenge();

      // Base64url encoded 32 bytes should be 43 characters
      expect(challenge.codeVerifier.length).toBe(43);
    });

    it('should generate code challenge with correct length', () => {
      const challenge = pkceService.generateChallenge();

      // Base64url encoded SHA256 hash should be 43 characters
      expect(challenge.codeChallenge.length).toBe(43);
    });

    it('should generate URL-safe characters only', () => {
      const challenge = pkceService.generateChallenge();

      // Should only contain URL-safe base64 characters (no +, /, =)
      const urlSafePattern = /^[A-Za-z0-9\-_]+$/;
      expect(urlSafePattern.test(challenge.codeVerifier)).toBe(true);
      expect(urlSafePattern.test(challenge.codeChallenge)).toBe(true);
    });
  });

  describe('verifyChallenge', () => {
    it('should verify valid PKCE challenge', () => {
      const challenge = pkceService.generateChallenge();

      const isValid = pkceService.verifyChallenge(
        challenge.codeVerifier,
        challenge.codeChallenge,
        'S256'
      );

      expect(isValid).toBe(true);
    });

    it('should reject invalid code verifier', () => {
      const challenge = pkceService.generateChallenge();

      const isValid = pkceService.verifyChallenge(
        'invalid-verifier',
        challenge.codeChallenge,
        'S256'
      );

      expect(isValid).toBe(false);
    });

    it('should reject invalid code challenge', () => {
      const challenge = pkceService.generateChallenge();

      const isValid = pkceService.verifyChallenge(
        challenge.codeVerifier,
        'invalid-challenge',
        'S256'
      );

      expect(isValid).toBe(false);
    });

    it('should throw error for unsupported challenge method', () => {
      const challenge = pkceService.generateChallenge();

      expect(() => {
        pkceService.verifyChallenge(
          challenge.codeVerifier,
          challenge.codeChallenge,
          'plain'
        );
      }).toThrow('Only S256 code challenge method is supported');
    });

    it('should handle multiple verifications correctly', () => {
      const challenge1 = pkceService.generateChallenge();
      const challenge2 = pkceService.generateChallenge();

      // Valid verifications
      expect(
        pkceService.verifyChallenge(
          challenge1.codeVerifier,
          challenge1.codeChallenge,
          'S256'
        )
      ).toBe(true);

      expect(
        pkceService.verifyChallenge(
          challenge2.codeVerifier,
          challenge2.codeChallenge,
          'S256'
        )
      ).toBe(true);

      // Cross verifications should fail
      expect(
        pkceService.verifyChallenge(
          challenge1.codeVerifier,
          challenge2.codeChallenge,
          'S256'
        )
      ).toBe(false);

      expect(
        pkceService.verifyChallenge(
          challenge2.codeVerifier,
          challenge1.codeChallenge,
          'S256'
        )
      ).toBe(false);
    });
  });

  describe('validateCodeVerifier', () => {
    it('should validate correct code verifier format', () => {
      const challenge = pkceService.generateChallenge();

      const isValid = pkceService.validateCodeVerifier(challenge.codeVerifier);
      expect(isValid).toBe(true);
    });

    it('should reject code verifier that is too short', () => {
      const shortVerifier = 'short';

      const isValid = pkceService.validateCodeVerifier(shortVerifier);
      expect(isValid).toBe(false);
    });

    it('should reject code verifier that is too long', () => {
      const longVerifier = 'a'.repeat(129);

      const isValid = pkceService.validateCodeVerifier(longVerifier);
      expect(isValid).toBe(false);
    });

    it('should reject code verifier with invalid characters', () => {
      const invalidVerifier = 'invalid+characters/with=padding';

      const isValid = pkceService.validateCodeVerifier(invalidVerifier);
      expect(isValid).toBe(false);
    });

    it('should accept code verifier with valid characters', () => {
      const validVerifier =
        'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';

      const isValid = pkceService.validateCodeVerifier(validVerifier);
      expect(isValid).toBe(true);
    });
  });

  describe('validateCodeChallenge', () => {
    it('should validate correct code challenge format', () => {
      const challenge = pkceService.generateChallenge();

      const isValid = pkceService.validateCodeChallenge(
        challenge.codeChallenge
      );
      expect(isValid).toBe(true);
    });

    it('should reject code challenge that is too short', () => {
      const shortChallenge = 'short';

      const isValid = pkceService.validateCodeChallenge(shortChallenge);
      expect(isValid).toBe(false);
    });

    it('should reject code challenge that is too long', () => {
      const longChallenge = 'a'.repeat(44);

      const isValid = pkceService.validateCodeChallenge(longChallenge);
      expect(isValid).toBe(false);
    });

    it('should reject code challenge with invalid characters', () => {
      const invalidChallenge = 'invalid+characters/with=padding123456789012';

      const isValid = pkceService.validateCodeChallenge(invalidChallenge);
      expect(isValid).toBe(false);
    });

    it('should accept exactly 43 characters', () => {
      // Use a real generated challenge to ensure it's valid
      const challenge = pkceService.generateChallenge();
      expect(challenge.codeChallenge.length).toBe(43);

      const isValid = pkceService.validateCodeChallenge(
        challenge.codeChallenge
      );
      expect(isValid).toBe(true);
    });
  });

  describe('RFC 7636 compliance', () => {
    it('should generate code verifier according to RFC 7636', () => {
      const challenge = pkceService.generateChallenge();

      // RFC 7636: code verifier should be 43-128 characters
      expect(challenge.codeVerifier.length).toBeGreaterThanOrEqual(43);
      expect(challenge.codeVerifier.length).toBeLessThanOrEqual(128);

      // Should only contain unreserved characters
      const unreservedPattern = /^[A-Za-z0-9\-._~]+$/;
      expect(unreservedPattern.test(challenge.codeVerifier)).toBe(true);
    });

    it('should generate code challenge according to RFC 7636', () => {
      const challenge = pkceService.generateChallenge();

      // RFC 7636: code challenge should be base64url-encoded SHA256 hash
      expect(challenge.codeChallenge.length).toBe(43);

      // Should only contain base64url characters
      const base64urlPattern = /^[A-Za-z0-9\-_]+$/;
      expect(base64urlPattern.test(challenge.codeChallenge)).toBe(true);
    });

    it('should use S256 method as recommended by RFC 7636', () => {
      const challenge = pkceService.generateChallenge();

      expect(challenge.codeChallengeMethod).toBe('S256');
    });

    it('should be deterministic for same input', () => {
      // Generate a known verifier for testing
      const testVerifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';

      // The challenge should be the same for the same verifier
      const isValid1 = pkceService.verifyChallenge(
        testVerifier,
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'S256'
      );

      const isValid2 = pkceService.verifyChallenge(
        testVerifier,
        'E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM',
        'S256'
      );

      expect(isValid1).toBe(true);
      expect(isValid2).toBe(true);
    });
  });
});
