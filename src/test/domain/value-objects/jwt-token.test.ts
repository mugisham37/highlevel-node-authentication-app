/**
 * JWT Token Value Object Tests
 */

import { describe, it, expect } from 'vitest';
import { JWTToken } from '../../../domain/value-objects/jwt-token';

describe('JWT Token Value Object', () => {
  const secret = 'test-secret-key-for-jwt-signing';

  describe('Token creation', () => {
    it('should create a valid JWT token', () => {
      const token = JWTToken.create(
        {
          sub: 'user-123',
          type: 'access',
          sessionId: 'session-456',
        },
        secret,
        { expiresIn: '1h' }
      );

      expect(token.token).toBeDefined();
      expect(token.subject).toBe('user-123');
      expect(token.type).toBe('access');
      expect(token.sessionId).toBe('session-456');
    });

    it('should throw error for missing subject', () => {
      expect(() => {
        JWTToken.create({ sub: '' } as any, secret, { expiresIn: '1h' });
      }).toThrow('JWT payload must include subject');
    });

    it('should throw error for empty secret', () => {
      expect(() => {
        JWTToken.create({ sub: 'user-123' }, '', { expiresIn: '1h' });
      }).toThrow('JWT secret must be a non-empty string');
    });
  });

  describe('Token parsing', () => {
    it('should parse a valid token', () => {
      const originalToken = JWTToken.create(
        {
          sub: 'user-123',
          type: 'access',
        },
        secret,
        { expiresIn: '1h' }
      );

      const parsedToken = JWTToken.parse(originalToken.token, secret);
      expect(parsedToken.subject).toBe('user-123');
      expect(parsedToken.type).toBe('access');
    });

    it('should throw error for invalid token', () => {
      expect(() => {
        JWTToken.parse('invalid-token', secret);
      }).toThrow('Invalid token');
    });

    it('should throw error for wrong secret', () => {
      const token = JWTToken.create({ sub: 'user-123' }, secret, {
        expiresIn: '1h',
      });

      expect(() => {
        JWTToken.parse(token.token, 'wrong-secret');
      }).toThrow('Invalid token');
    });
  });

  describe('Token validation', () => {
    it('should validate non-expired token', () => {
      const token = JWTToken.create({ sub: 'user-123' }, secret, {
        expiresIn: '1h',
      });

      expect(token.isExpired()).toBe(false);
      expect(() => token.validate()).not.toThrow();
    });

    it('should detect expired token', () => {
      const token = JWTToken.create(
        { sub: 'user-123' },
        secret,
        { expiresIn: -1 } // Expired 1 second ago
      );

      expect(token.isExpired()).toBe(true);
      expect(() => token.validate()).toThrow('Token has expired');
    });

    it('should check expiration within timeframe', () => {
      const token = JWTToken.create(
        { sub: 'user-123' },
        secret,
        { expiresIn: 30 } // Expires in 30 seconds
      );

      expect(token.expiresWithin(60)).toBe(true); // Within 1 minute
      expect(token.expiresWithin(10)).toBe(false); // Not within 10 seconds
    });
  });

  describe('Token utilities', () => {
    it('should check token type', () => {
      const accessToken = JWTToken.create(
        { sub: 'user-123', type: 'access' },
        secret,
        { expiresIn: '1h' }
      );

      expect(accessToken.isType('access')).toBe(true);
      expect(accessToken.isType('refresh')).toBe(false);
    });

    it('should check token scope', () => {
      const token = JWTToken.create(
        { sub: 'user-123', scope: 'read write admin' },
        secret,
        { expiresIn: '1h' }
      );

      expect(token.hasScope('read')).toBe(true);
      expect(token.hasScope('admin')).toBe(true);
      expect(token.hasScope('delete')).toBe(false);
    });

    it('should get remaining time', () => {
      const token = JWTToken.create(
        { sub: 'user-123' },
        secret,
        { expiresIn: 3600 } // 1 hour
      );

      const remaining = token.getRemainingTime();
      expect(remaining).toBeGreaterThan(3590); // Should be close to 3600
      expect(remaining).toBeLessThanOrEqual(3600);
    });

    it('should create refresh token', () => {
      const accessToken = JWTToken.create(
        { sub: 'user-123', type: 'access', sessionId: 'session-456' },
        secret,
        { expiresIn: '1h' }
      );

      const refreshToken = accessToken.createRefreshToken(secret);
      expect(refreshToken.type).toBe('refresh');
      expect(refreshToken.subject).toBe('user-123');
      expect(refreshToken.sessionId).toBe('session-456');
      expect(refreshToken.hasScope('refresh')).toBe(true);
    });
  });

  describe('Serialization', () => {
    it('should serialize to token string', () => {
      const token = JWTToken.create({ sub: 'user-123' }, secret, {
        expiresIn: '1h',
      });

      expect(token.toString()).toBe(token.token);
      expect(token.toJSON()).toBe(token.token);
    });
  });

  describe('Equality', () => {
    it('should be equal for same token', () => {
      const token1 = JWTToken.create({ sub: 'user-123' }, secret, {
        expiresIn: '1h',
      });

      const token2 = JWTToken.parse(token1.token, secret);
      expect(token1.equals(token2)).toBe(true);
    });

    it('should not be equal for different tokens', () => {
      const token1 = JWTToken.create({ sub: 'user-123' }, secret, {
        expiresIn: '1h',
      });

      const token2 = JWTToken.create({ sub: 'user-456' }, secret, {
        expiresIn: '1h',
      });

      expect(token1.equals(token2)).toBe(false);
    });
  });
});
