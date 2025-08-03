/**
 * OAuth Service Tests
 * Comprehensive tests for OAuth2/OpenID Connect functionality
 */

import { describe, it, expect, beforeEach, vi, Mock } from 'vitest';
import { OAuthService } from '../../../application/services/oauth.service';
import { OAuthProviderFactory } from '../../../application/factories/oauth-provider.factory';
import { PKCEService } from '../../../infrastructure/security/pkce.service';
import {
  IOAuthUserRepository,
  IOAuthAccountRepository,
  IOAuthStateRepository,
} from '../../../application/interfaces/oauth-repository.interface';
import { User } from '../../../domain/entities/user';
import { Account } from '../../../domain/entities/account';
import { Email } from '../../../domain/value-objects/email';
import axios from 'axios';

// Mock axios
vi.mock('axios');
const mockedAxios = axios as any;

// Mock repositories
const mockUserRepository: IOAuthUserRepository = {
  findByEmail: vi.fn(),
  findByProviderAccount: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

const mockAccountRepository: IOAuthAccountRepository = {
  findByUserAndProvider: vi.fn(),
  findByProviderAccount: vi.fn(),
  findByUserId: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  deleteByUserId: vi.fn(),
};

const mockStateRepository: IOAuthStateRepository = {
  storeState: vi.fn(),
  consumeState: vi.fn(),
  cleanupExpiredStates: vi.fn(),
};

describe('OAuthService', () => {
  let oauthService: OAuthService;
  let providerFactory: OAuthProviderFactory;
  let pkceService: PKCEService;

  beforeEach(() => {
    vi.clearAllMocks();

    providerFactory = new OAuthProviderFactory();
    pkceService = new PKCEService();

    oauthService = new OAuthService(
      mockUserRepository,
      mockAccountRepository,
      mockStateRepository,
      providerFactory,
      pkceService
    );
  });

  describe('initiateOAuthFlow', () => {
    it('should initiate OAuth flow with PKCE for Google', async () => {
      const mockStoreState = mockStateRepository.storeState as Mock;
      mockStoreState.mockResolvedValue(undefined);

      const result = await oauthService.initiateOAuthFlow(
        'google',
        'http://localhost:3000/callback'
      );

      expect(result).toHaveProperty('authorizationUrl');
      expect(result).toHaveProperty('state');
      expect(result).toHaveProperty('codeVerifier');
      expect(result).toHaveProperty('nonce');
      expect(result.authorizationUrl).toContain('accounts.google.com');
      expect(result.authorizationUrl).toContain('code_challenge');
      expect(mockStoreState).toHaveBeenCalledWith(
        result.state,
        expect.objectContaining({
          provider: 'google',
          codeVerifier: result.codeVerifier,
          nonce: result.nonce,
        }),
        600
      );
    });

    it('should initiate OAuth flow without PKCE for GitHub', async () => {
      const mockStoreState = mockStateRepository.storeState as Mock;
      mockStoreState.mockResolvedValue(undefined);

      const result = await oauthService.initiateOAuthFlow(
        'github',
        'http://localhost:3000/callback'
      );

      expect(result).toHaveProperty('authorizationUrl');
      expect(result).toHaveProperty('state');
      expect(result.codeVerifier).toBeUndefined();
      expect(result.authorizationUrl).toContain('github.com');
      expect(result.authorizationUrl).not.toContain('code_challenge');
    });

    it('should use custom scopes when provided', async () => {
      const mockStoreState = mockStateRepository.storeState as Mock;
      mockStoreState.mockResolvedValue(undefined);

      const customScopes = ['read:user', 'user:email'];
      const result = await oauthService.initiateOAuthFlow(
        'github',
        'http://localhost:3000/callback',
        customScopes
      );

      expect(result.authorizationUrl).toContain(
        'scope=read%3Auser%20user%3Aemail'
      );
    });

    it('should throw error for unsupported provider', async () => {
      await expect(
        oauthService.initiateOAuthFlow(
          'unsupported',
          'http://localhost:3000/callback'
        )
      ).rejects.toThrow("OAuth provider 'unsupported' is not supported");
    });
  });

  describe('handleCallback', () => {
    it('should handle successful OAuth callback for new user', async () => {
      const mockConsumeState = mockStateRepository.consumeState as Mock;
      const mockFindByEmail = mockUserRepository.findByEmail as Mock;
      const mockFindByProviderAccount =
        mockUserRepository.findByProviderAccount as Mock;
      const mockCreateUser = mockUserRepository.create as Mock;
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;
      const mockCreateAccount = mockAccountRepository.create as Mock;

      // Mock state validation
      mockConsumeState.mockResolvedValue({
        provider: 'google',
        codeVerifier: 'test-verifier',
        nonce: 'test-nonce',
      });

      // Mock token exchange
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'access-token',
          refresh_token: 'refresh-token',
          id_token: 'id-token',
          token_type: 'Bearer',
          expires_in: 3600,
          scope: 'openid email profile',
        },
      });

      // Mock user info
      mockedAxios.get.mockResolvedValue({
        data: {
          id: 'google-123',
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg',
          verified_email: true,
        },
      });

      // Mock user not found (new user)
      mockFindByEmail.mockResolvedValue(null);
      mockFindByProviderAccount.mockResolvedValue(null);

      // Mock user creation
      const newUser = new User({
        id: 'user-123',
        email: new Email('test@example.com'),
        emailVerified: new Date(),
        name: 'Test User',
        image: 'https://example.com/avatar.jpg',
        createdAt: new Date(),
        updatedAt: new Date(),
        mfaEnabled: false,
        backupCodes: [],
        failedLoginAttempts: 0,
        riskScore: 0,
      });
      mockCreateUser.mockResolvedValue(newUser);

      // Mock account creation
      mockFindByUserAndProvider.mockResolvedValue(null);
      const newAccount = new Account({
        id: 'account-123',
        userId: 'user-123',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        idToken: 'id-token',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
        tokenType: 'Bearer',
        scope: 'openid email profile',
      });
      mockCreateAccount.mockResolvedValue(newAccount);

      const result = await oauthService.handleCallback('google', {
        code: 'auth-code',
        state: 'test-state',
      });

      expect(result.success).toBe(true);
      expect(result.user).toBeDefined();
      expect(result.account).toBeDefined();
      expect(result.tokens).toBeDefined();
      expect(result.userInfo).toBeDefined();
      expect(result.isNewUser).toBe(true);
    });

    it('should handle OAuth callback error', async () => {
      const result = await oauthService.handleCallback('google', {
        code: '',
        state: 'test-state',
        error: 'access_denied',
        errorDescription: 'User denied access',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBeDefined();
      expect(result.error?.code).toBe('access_denied');
    });

    it('should handle invalid state', async () => {
      const mockConsumeState = mockStateRepository.consumeState as Mock;
      mockConsumeState.mockResolvedValue(null);

      const result = await oauthService.handleCallback('google', {
        code: 'auth-code',
        state: 'invalid-state',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('invalid_state');
    });

    it('should handle provider mismatch', async () => {
      const mockConsumeState = mockStateRepository.consumeState as Mock;
      mockConsumeState.mockResolvedValue({
        provider: 'github',
        codeVerifier: 'test-verifier',
      });

      const result = await oauthService.handleCallback('google', {
        code: 'auth-code',
        state: 'test-state',
      });

      expect(result.success).toBe(false);
      expect(result.error?.code).toBe('provider_mismatch');
    });
  });

  describe('refreshOAuthToken', () => {
    it('should refresh OAuth token successfully', async () => {
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;
      const mockUpdateAccount = mockAccountRepository.update as Mock;

      const existingAccount = new Account({
        id: 'account-123',
        userId: 'user-123',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        accessToken: 'old-access-token',
        refreshToken: 'refresh-token',
        expiresAt: Math.floor(Date.now() / 1000) - 100, // Expired
        tokenType: 'Bearer',
      });

      mockFindByUserAndProvider.mockResolvedValue(existingAccount);

      // Mock token refresh
      mockedAxios.post.mockResolvedValue({
        data: {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          token_type: 'Bearer',
          expires_in: 3600,
        },
      });

      mockUpdateAccount.mockResolvedValue(existingAccount);

      const result = await oauthService.refreshOAuthToken('user-123', 'google');

      expect(result.accessToken).toBe('new-access-token');
      expect(result.refreshToken).toBe('new-refresh-token');
      expect(mockUpdateAccount).toHaveBeenCalled();
    });

    it('should throw error for provider without refresh support', async () => {
      await expect(
        oauthService.refreshOAuthToken('user-123', 'github')
      ).rejects.toThrow('Provider github does not support token refresh');
    });

    it('should throw error when no refresh token available', async () => {
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;

      const accountWithoutRefreshToken = new Account({
        id: 'account-123',
        userId: 'user-123',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        accessToken: 'access-token',
        tokenType: 'Bearer',
      });

      mockFindByUserAndProvider.mockResolvedValue(accountWithoutRefreshToken);

      await expect(
        oauthService.refreshOAuthToken('user-123', 'google')
      ).rejects.toThrow('No refresh token available for this account');
    });
  });

  describe('revokeOAuthAccess', () => {
    it('should revoke OAuth access successfully', async () => {
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;
      const mockDeleteAccount = mockAccountRepository.delete as Mock;

      const existingAccount = new Account({
        id: 'account-123',
        userId: 'user-123',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        accessToken: 'access-token',
        tokenType: 'Bearer',
      });

      mockFindByUserAndProvider.mockResolvedValue(existingAccount);
      mockDeleteAccount.mockResolvedValue(undefined);

      // Mock provider revocation (should not fail even if it does)
      mockedAxios.post.mockRejectedValue(
        new Error('Provider revocation failed')
      );

      await expect(
        oauthService.revokeOAuthAccess('user-123', 'google')
      ).resolves.not.toThrow();

      expect(mockDeleteAccount).toHaveBeenCalledWith('account-123');
    });

    it('should throw error when account not found', async () => {
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;
      mockFindByUserAndProvider.mockResolvedValue(null);

      await expect(
        oauthService.revokeOAuthAccess('user-123', 'google')
      ).rejects.toThrow('No OAuth account found for this user and provider');
    });
  });

  describe('linkAccount', () => {
    it('should link OAuth account to existing user', async () => {
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;
      const mockCreateAccount = mockAccountRepository.create as Mock;

      mockFindByUserAndProvider.mockResolvedValue(null); // No existing account

      const tokens = {
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      const userInfo = {
        id: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      const newAccount = new Account({
        id: 'account-123',
        userId: 'user-123',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        accessToken: 'access-token',
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        expiresAt: Math.floor(Date.now() / 1000) + 3600,
      });

      mockCreateAccount.mockResolvedValue(newAccount);

      const result = await oauthService.linkAccount(
        'user-123',
        'google',
        tokens,
        userInfo
      );

      expect(result).toBe(newAccount);
      expect(mockCreateAccount).toHaveBeenCalled();
    });

    it('should throw error when account already linked', async () => {
      const mockFindByUserAndProvider =
        mockAccountRepository.findByUserAndProvider as Mock;

      const existingAccount = new Account({
        id: 'account-123',
        userId: 'user-123',
        provider: 'google',
        providerAccountId: 'google-123',
        type: 'oauth',
        accessToken: 'access-token',
        tokenType: 'Bearer',
      });

      mockFindByUserAndProvider.mockResolvedValue(existingAccount);

      const tokens = {
        accessToken: 'access-token',
        tokenType: 'Bearer',
        expiresIn: 3600,
      };

      const userInfo = {
        id: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
      };

      await expect(
        oauthService.linkAccount('user-123', 'google', tokens, userInfo)
      ).rejects.toThrow('OAuth account already linked to this user');
    });
  });

  describe('getUserInfo', () => {
    it('should get user info from Google', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          id: 'google-123',
          email: 'test@example.com',
          name: 'Test User',
          picture: 'https://example.com/avatar.jpg',
          verified_email: true,
          locale: 'en',
        },
      });

      const result = await oauthService.getUserInfo('google', 'access-token');

      expect(result).toEqual({
        id: 'google-123',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://example.com/avatar.jpg',
        emailVerified: true,
        locale: 'en',
      });

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://www.googleapis.com/oauth2/v2/userinfo',
        {
          headers: {
            Authorization: 'Bearer access-token',
            Accept: 'application/json',
          },
        }
      );
    });

    it('should get user info from GitHub', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          id: 12345,
          login: 'testuser',
          name: 'Test User',
          email: 'test@example.com',
          avatar_url: 'https://github.com/avatar.jpg',
          company: 'Test Company',
          location: 'Test City',
        },
      });

      const result = await oauthService.getUserInfo('github', 'access-token');

      expect(result).toEqual({
        id: '12345',
        email: 'test@example.com',
        name: 'Test User',
        picture: 'https://github.com/avatar.jpg',
        emailVerified: true,
        login: 'testuser',
        company: 'Test Company',
        location: 'Test City',
      });
    });

    it('should handle API errors', async () => {
      mockedAxios.get.mockRejectedValue(new Error('API Error'));

      await expect(
        oauthService.getUserInfo('google', 'invalid-token')
      ).rejects.toThrow('Failed to get user information from provider');
    });
  });
});
