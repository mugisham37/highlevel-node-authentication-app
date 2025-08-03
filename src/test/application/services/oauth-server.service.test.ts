/**
 * OAuth Server Service Tests
 * Tests for OAuth2 server functionality (acting as identity provider)
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { OAuthServerService } from '../../../application/services/oauth-server.service';
import { JWTTokenService } from '../../../infrastructure/security/jwt-token.service';
import { PKCEService } from '../../../infrastructure/security/pkce.service';

// Mock JWT service
const mockJWTService = {
  generateToken: vi.fn(),
  verifyToken: vi.fn(),
} as any;

describe('OAuthServerService', () => {
  let oauthServer: OAuthServerService;
  let pkceService: PKCEService;

  beforeEach(() => {
    vi.clearAllMocks();
    pkceService = new PKCEService();
    oauthServer = new OAuthServerService(mockJWTService, pkceService);
  });

  describe('generateAuthorizationCode', () => {
    it('should generate authorization code for valid client', async () => {
      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid', 'profile'],
        'http://localhost:3000/auth/callback'
      );

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
      expect(code.length).toBeGreaterThan(0);
    });

    it('should generate authorization code with PKCE', async () => {
      const codeChallenge = 'test-challenge';
      const codeChallengeMethod = 'S256';

      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid', 'profile'],
        'http://localhost:3000/auth/callback',
        codeChallenge,
        codeChallengeMethod
      );

      expect(code).toBeDefined();
      expect(typeof code).toBe('string');
    });

    it('should throw error for invalid client', async () => {
      await expect(
        oauthServer.generateAuthorizationCode(
          'invalid-client',
          'user-123',
          ['openid'],
          'http://localhost:3000/callback'
        )
      ).rejects.toThrow('Invalid client ID');
    });

    it('should throw error for invalid redirect URI', async () => {
      await expect(
        oauthServer.generateAuthorizationCode(
          'default-web-client',
          'user-123',
          ['openid'],
          'http://evil.com/callback'
        )
      ).rejects.toThrow('Invalid redirect URI');
    });

    it('should throw error for invalid scopes', async () => {
      await expect(
        oauthServer.generateAuthorizationCode(
          'default-web-client',
          'user-123',
          ['invalid-scope'],
          'http://localhost:3000/auth/callback'
        )
      ).rejects.toThrow('Invalid scopes: invalid-scope');
    });

    it('should throw error for invalid code challenge method', async () => {
      await expect(
        oauthServer.generateAuthorizationCode(
          'default-web-client',
          'user-123',
          ['openid'],
          'http://localhost:3000/auth/callback',
          'challenge',
          'plain'
        )
      ).rejects.toThrow('Invalid code challenge method');
    });
  });

  describe('exchangeCodeForTokens', () => {
    it('should exchange authorization code for tokens', async () => {
      // First generate a code
      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid', 'profile'],
        'http://localhost:3000/auth/callback'
      );

      // Mock JWT generation
      mockJWTService.generateToken
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const tokens = await oauthServer.exchangeCodeForTokens({
        grantType: 'authorization_code',
        code,
        clientId: 'default-web-client',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

      expect(tokens).toEqual({
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'openid profile',
      });
    });

    it('should exchange authorization code with PKCE verification', async () => {
      const pkceChallenge = pkceService.generateChallenge();

      // Generate code with PKCE
      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid'],
        'http://localhost:3000/auth/callback',
        pkceChallenge.codeChallenge,
        'S256'
      );

      mockJWTService.generateToken
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      const tokens = await oauthServer.exchangeCodeForTokens({
        grantType: 'authorization_code',
        code,
        clientId: 'default-web-client',
        redirectUri: 'http://localhost:3000/auth/callback',
        codeVerifier: pkceChallenge.codeVerifier,
      });

      expect(tokens.accessToken).toBe('access-token');
    });

    it('should throw error for invalid authorization code', async () => {
      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'authorization_code',
          code: 'invalid-code',
          clientId: 'default-web-client',
          redirectUri: 'http://localhost:3000/auth/callback',
        })
      ).rejects.toThrow('Invalid authorization code');
    });

    it('should throw error for used authorization code', async () => {
      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid'],
        'http://localhost:3000/auth/callback'
      );

      mockJWTService.generateToken
        .mockResolvedValueOnce('access-token')
        .mockResolvedValueOnce('refresh-token');

      // Use the code once
      await oauthServer.exchangeCodeForTokens({
        grantType: 'authorization_code',
        code,
        clientId: 'default-web-client',
        redirectUri: 'http://localhost:3000/auth/callback',
      });

      // Try to use it again
      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'authorization_code',
          code,
          clientId: 'default-web-client',
          redirectUri: 'http://localhost:3000/auth/callback',
        })
      ).rejects.toThrow('Authorization code already used');
    });

    it('should throw error for client ID mismatch', async () => {
      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid'],
        'http://localhost:3000/auth/callback'
      );

      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'authorization_code',
          code,
          clientId: 'different-client',
          redirectUri: 'http://localhost:3000/auth/callback',
        })
      ).rejects.toThrow('Client ID mismatch');
    });

    it('should throw error for redirect URI mismatch', async () => {
      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid'],
        'http://localhost:3000/auth/callback'
      );

      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'authorization_code',
          code,
          clientId: 'default-web-client',
          redirectUri: 'http://different.com/callback',
        })
      ).rejects.toThrow('Redirect URI mismatch');
    });

    it('should throw error for invalid PKCE verifier', async () => {
      const pkceChallenge = pkceService.generateChallenge();

      const code = await oauthServer.generateAuthorizationCode(
        'default-web-client',
        'user-123',
        ['openid'],
        'http://localhost:3000/auth/callback',
        pkceChallenge.codeChallenge,
        'S256'
      );

      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'authorization_code',
          code,
          clientId: 'default-web-client',
          redirectUri: 'http://localhost:3000/auth/callback',
          codeVerifier: 'invalid-verifier',
        })
      ).rejects.toThrow('Invalid code verifier');
    });
  });

  describe('refresh token grant', () => {
    it('should refresh access token', async () => {
      const refreshTokenPayload = {
        sub: 'user-123',
        aud: 'api',
        scope: 'openid profile',
        client_id: 'default-web-client',
        token_type: 'refresh',
      };

      mockJWTService.verifyToken.mockResolvedValue(refreshTokenPayload);
      mockJWTService.generateToken.mockResolvedValue('new-access-token');

      const tokens = await oauthServer.exchangeCodeForTokens({
        grantType: 'refresh_token',
        refreshToken: 'valid-refresh-token',
        clientId: 'default-web-client',
      });

      expect(tokens).toEqual({
        accessToken: 'new-access-token',
        refreshToken: 'valid-refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'openid profile',
      });
    });

    it('should throw error for invalid refresh token', async () => {
      mockJWTService.verifyToken.mockRejectedValue(new Error('Invalid token'));

      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'refresh_token',
          refreshToken: 'invalid-refresh-token',
          clientId: 'default-web-client',
        })
      ).rejects.toThrow('Invalid refresh token');
    });

    it('should throw error for client ID mismatch in refresh token', async () => {
      const refreshTokenPayload = {
        sub: 'user-123',
        client_id: 'different-client',
        token_type: 'refresh',
      };

      mockJWTService.verifyToken.mockResolvedValue(refreshTokenPayload);

      await expect(
        oauthServer.exchangeCodeForTokens({
          grantType: 'refresh_token',
          refreshToken: 'valid-refresh-token',
          clientId: 'default-web-client',
        })
      ).rejects.toThrow('Client ID mismatch');
    });
  });

  describe('client credentials grant', () => {
    it('should generate client credentials token', async () => {
      mockJWTService.generateToken.mockResolvedValue('client-access-token');

      const tokens = await oauthServer.generateClientCredentialsToken(
        'api-client',
        ['api:read', 'api:write']
      );

      expect(tokens).toEqual({
        accessToken: 'client-access-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: 'api:read api:write',
      });
    });

    it('should throw error for invalid client', async () => {
      await expect(
        oauthServer.generateClientCredentialsToken('invalid-client', [
          'api:read',
        ])
      ).rejects.toThrow('Invalid client ID');
    });

    it('should throw error for client without client credentials grant', async () => {
      await expect(
        oauthServer.generateClientCredentialsToken('default-web-client', [
          'read',
        ])
      ).rejects.toThrow('Client credentials grant not allowed for this client');
    });

    it('should throw error for invalid scopes', async () => {
      await expect(
        oauthServer.generateClientCredentialsToken('api-client', [
          'invalid-scope',
        ])
      ).rejects.toThrow('Invalid scopes: invalid-scope');
    });
  });

  describe('validateClient', () => {
    it('should validate confidential client with correct secret', async () => {
      const isValid = await oauthServer.validateClient(
        'default-web-client',
        'default-secret'
      );
      expect(isValid).toBe(true);
    });

    it('should reject confidential client with wrong secret', async () => {
      const isValid = await oauthServer.validateClient(
        'default-web-client',
        'wrong-secret'
      );
      expect(isValid).toBe(false);
    });

    it('should validate public client without secret', async () => {
      const isValid = await oauthServer.validateClient('mobile-app-client');
      expect(isValid).toBe(true);
    });

    it('should reject invalid client ID', async () => {
      const isValid = await oauthServer.validateClient('invalid-client');
      expect(isValid).toBe(false);
    });
  });

  describe('client registration', () => {
    it('should register new OAuth client', () => {
      const newClient = {
        clientId: 'test-client',
        clientSecret: 'test-secret',
        name: 'Test Client',
        redirectUris: ['http://localhost:3000/callback'],
        scopes: ['read', 'write'],
        grantTypes: ['authorization_code'],
        isPublic: false,
      };

      expect(() => oauthServer.registerClient(newClient)).not.toThrow();

      const retrievedClient = oauthServer.getClient('test-client');
      expect(retrievedClient).toEqual(newClient);
    });

    it('should throw error for invalid client configuration', () => {
      const invalidClient = {
        clientId: '',
        clientSecret: 'secret',
        name: 'Invalid Client',
        redirectUris: ['invalid-url'],
        scopes: ['read'],
        grantTypes: ['authorization_code'],
        isPublic: false,
      };

      expect(() => oauthServer.registerClient(invalidClient as any)).toThrow();
    });
  });
});
