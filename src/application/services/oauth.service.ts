/**
 * OAuth2/OpenID Connect Service Implementation
 * Handles OAuth flows, token exchange, and account linking with repository integration
 */

import axios, { AxiosResponse } from 'axios';
import { nanoid } from 'nanoid';
import {
  IOAuthService,
  OAuthInitiation,
  OAuthResult,
  OAuthTokens,
  OAuthUserInfo,
  OAuthCallbackRequest,
  OAuthError,
} from '../interfaces/oauth.interface';
import {
  IOAuthUserRepository,
  IOAuthAccountRepository,
  IOAuthStateRepository,
} from '../interfaces/oauth-repository.interface';
import { OAuthProviderFactory } from '../factories/oauth-provider.factory';
import { PKCEService } from '../../infrastructure/security/pkce.service';
import { User } from '../../domain/entities/user';
import { Account } from '../../domain/entities/account';
import { Email } from '../../domain/value-objects/email';

export class OAuthService implements IOAuthService {
  private providerFactory: OAuthProviderFactory;
  private pkceService: PKCEService;

  constructor(
    private userRepository: IOAuthUserRepository,
    private accountRepository: IOAuthAccountRepository,
    private stateRepository: IOAuthStateRepository,
    providerFactory?: OAuthProviderFactory,
    pkceService?: PKCEService
  ) {
    this.providerFactory = providerFactory || new OAuthProviderFactory();
    this.pkceService = pkceService || new PKCEService();

    // Clean up expired state entries every 10 minutes
    setInterval(
      () => this.stateRepository.cleanupExpiredStates(),
      10 * 60 * 1000
    );
  }

  /**
   * Initiate OAuth flow and return authorization URL
   */
  async initiateOAuthFlow(
    provider: string,
    redirectUri: string,
    scopes?: string[],
    state?: string
  ): Promise<OAuthInitiation> {
    try {
      const providerConfig = this.providerFactory.getProvider(provider);

      // Generate state if not provided
      const flowState = state || nanoid(32);

      // Generate PKCE challenge if supported
      let codeVerifier: string | undefined;
      let codeChallenge: string | undefined;

      if (providerConfig.supportsPKCE) {
        const pkceChallenge = this.pkceService.generateChallenge();
        codeVerifier = pkceChallenge.codeVerifier;
        codeChallenge = pkceChallenge.codeChallenge;
      }

      // Generate nonce for OIDC
      const nonce = nanoid(16);

      // Store state information for validation (10 minutes expiry)
      await this.stateRepository.storeState(
        flowState,
        {
          provider,
          codeVerifier,
          nonce,
          redirectUri,
          scopes,
        },
        600 // 10 minutes
      );

      // Use custom scopes if provided
      if (scopes && scopes.length > 0) {
        providerConfig.scopes = scopes;
      }

      // Update redirect URI if provided
      if (redirectUri) {
        providerConfig.redirectUri = redirectUri;
      }

      const authorizationUrl = this.providerFactory.createAuthorizationUrl(
        providerConfig,
        flowState,
        codeChallenge,
        nonce
      );

      return {
        authorizationUrl,
        state: flowState,
        codeVerifier,
        nonce,
      };
    } catch (error) {
      throw this.createOAuthError(
        'initiation_failed',
        'Failed to initiate OAuth flow',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  async handleCallback(
    provider: string,
    callbackRequest: OAuthCallbackRequest
  ): Promise<OAuthResult> {
    try {
      // Check for OAuth error in callback
      if (callbackRequest.error) {
        return {
          success: false,
          error: this.createOAuthError(
            callbackRequest.error,
            callbackRequest.errorDescription ||
              'OAuth provider returned an error'
          ),
        };
      }

      // Validate and consume state
      const stateInfo = await this.stateRepository.consumeState(
        callbackRequest.state
      );
      if (!stateInfo) {
        return {
          success: false,
          error: this.createOAuthError(
            'invalid_state',
            'Invalid or expired state parameter'
          ),
        };
      }

      // Validate provider matches
      if (stateInfo.provider !== provider) {
        return {
          success: false,
          error: this.createOAuthError(
            'provider_mismatch',
            'Provider mismatch in OAuth callback'
          ),
        };
      }

      const providerConfig = this.providerFactory.getProvider(provider);

      // Exchange authorization code for tokens
      const tokens = await this.exchangeCodeForTokens(
        providerConfig,
        callbackRequest.code,
        stateInfo.codeVerifier
      );

      // Get user information from provider
      const userInfo = await this.getUserInfo(provider, tokens.accessToken);

      // Create or find user
      const { user, account, isNewUser } = await this.createOrFindUser(
        provider,
        tokens,
        userInfo
      );

      return {
        success: true,
        user,
        account,
        tokens,
        userInfo,
        isNewUser,
      };
    } catch (error) {
      return {
        success: false,
        error: this.createOAuthError(
          'callback_failed',
          'Failed to handle OAuth callback',
          error instanceof Error ? error.message : 'Unknown error'
        ),
      };
    }
  }

  /**
   * Refresh OAuth access token
   */
  async refreshOAuthToken(
    userId: string,
    provider: string
  ): Promise<OAuthTokens> {
    try {
      const providerConfig = this.providerFactory.getProvider(provider);

      if (!providerConfig.supportsRefresh) {
        throw new Error(`Provider ${provider} does not support token refresh`);
      }

      // Get user's account for this provider
      const account = await this.accountRepository.findByUserAndProvider(
        userId,
        provider
      );
      if (!account || !account.refreshToken) {
        throw new Error('No refresh token available for this account');
      }

      const params = this.providerFactory.getRefreshTokenParams(
        providerConfig,
        account.refreshToken
      );

      const response = await axios.post(providerConfig.tokenUrl, params, {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          Accept: 'application/json',
        },
      });

      const tokens = this.parseTokenResponse(response);

      // Update account with new tokens
      account.updateTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken || account.refreshToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
      });

      // Save updated account
      await this.accountRepository.update(account);

      return tokens;
    } catch (error) {
      throw this.createOAuthError(
        'refresh_failed',
        'Failed to refresh OAuth token',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Revoke OAuth access for a user
   */
  async revokeOAuthAccess(userId: string, provider: string): Promise<void> {
    try {
      const account = await this.accountRepository.findByUserAndProvider(
        userId,
        provider
      );
      if (!account) {
        throw new Error('No OAuth account found for this user and provider');
      }

      const providerConfig = this.providerFactory.getProvider(provider);

      // Attempt to revoke tokens at provider
      if (account.accessToken) {
        try {
          await this.revokeTokenAtProvider(providerConfig, account.accessToken);
        } catch (error) {
          // Log but don't fail - provider revocation is best effort
          console.warn(
            `Failed to revoke token at provider ${provider}:`,
            error
          );
        }
      }

      // Delete the account
      await this.accountRepository.delete(account.id);
    } catch (error) {
      throw this.createOAuthError(
        'revocation_failed',
        'Failed to revoke OAuth access',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Get user information from OAuth provider
   */
  async getUserInfo(
    provider: string,
    accessToken: string
  ): Promise<OAuthUserInfo> {
    try {
      const providerConfig = this.providerFactory.getProvider(provider);

      const response = await axios.get(providerConfig.userInfoUrl, {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: 'application/json',
        },
      });

      return this.providerFactory.mapUserInfo(providerConfig, response.data);
    } catch (error) {
      throw this.createOAuthError(
        'userinfo_failed',
        'Failed to get user information from provider',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Link OAuth account to existing user
   */
  async linkAccount(
    userId: string,
    provider: string,
    tokens: OAuthTokens,
    userInfo: OAuthUserInfo
  ): Promise<Account> {
    try {
      // Check if account already exists
      const existingAccount =
        await this.accountRepository.findByUserAndProvider(userId, provider);
      if (existingAccount) {
        throw new Error('OAuth account already linked to this user');
      }

      // Create new account
      const account = new Account({
        id: nanoid(),
        userId,
        provider,
        providerAccountId: userInfo.id,
        type: 'oauth',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
      });

      return await this.accountRepository.create(account);
    } catch (error) {
      throw this.createOAuthError(
        'linking_failed',
        'Failed to link OAuth account',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Unlink OAuth account from user
   */
  async unlinkAccount(userId: string, provider: string): Promise<void> {
    try {
      const account = await this.accountRepository.findByUserAndProvider(
        userId,
        provider
      );
      if (!account) {
        throw new Error('No OAuth account found for this user and provider');
      }

      // Revoke access first
      await this.revokeOAuthAccess(userId, provider);
    } catch (error) {
      throw this.createOAuthError(
        'unlinking_failed',
        'Failed to unlink OAuth account',
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  }

  /**
   * Exchange authorization code for tokens
   */
  private async exchangeCodeForTokens(
    providerConfig: any,
    code: string,
    codeVerifier?: string
  ): Promise<OAuthTokens> {
    const params = this.providerFactory.getTokenRequestParams(
      providerConfig,
      code,
      codeVerifier
    );

    const response = await axios.post(providerConfig.tokenUrl, params, {
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Accept: 'application/json',
      },
    });

    return this.parseTokenResponse(response);
  }

  /**
   * Parse token response from OAuth provider
   */
  private parseTokenResponse(response: AxiosResponse): OAuthTokens {
    const data = response.data;

    if (data.error) {
      throw new Error(
        `Token exchange failed: ${data.error_description || data.error}`
      );
    }

    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      idToken: data.id_token,
      tokenType: data.token_type || 'Bearer',
      expiresIn: data.expires_in || 3600,
      scope: data.scope,
    };
  }

  /**
   * Create or find user based on OAuth information
   */
  private async createOrFindUser(
    provider: string,
    tokens: OAuthTokens,
    userInfo: OAuthUserInfo
  ): Promise<{ user: User; account: Account; isNewUser: boolean }> {
    // Try to find existing user by email
    let user: User | null = null;
    let isNewUser = false;

    if (userInfo.email) {
      user = await this.userRepository.findByEmail(userInfo.email);
    }

    // If no user found by email, try by provider account
    if (!user) {
      user = await this.userRepository.findByProviderAccount(
        provider,
        userInfo.id
      );
    }

    // If no user found, create new one
    if (!user) {
      user = await this.createUserFromOAuth(userInfo);
      isNewUser = true;
    }

    // Create or update account
    let account = await this.accountRepository.findByUserAndProvider(
      user.id,
      provider
    );
    if (!account) {
      account = new Account({
        id: nanoid(),
        userId: user.id,
        provider,
        providerAccountId: userInfo.id,
        type: 'oauth',
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
      });
      account = await this.accountRepository.create(account);
    } else {
      account.updateTokens({
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken,
        idToken: tokens.idToken,
        expiresAt: Math.floor(Date.now() / 1000) + tokens.expiresIn,
        tokenType: tokens.tokenType,
        scope: tokens.scope,
      });
      account = await this.accountRepository.update(account);
    }

    return { user, account, isNewUser };
  }

  /**
   * Create user from OAuth information
   */
  private async createUserFromOAuth(userInfo: OAuthUserInfo): Promise<User> {
    const user = new User({
      id: nanoid(),
      email: new Email(userInfo.email || ''),
      emailVerified: userInfo.emailVerified ? new Date() : undefined,
      name: userInfo.name,
      image: userInfo.picture,
      createdAt: new Date(),
      updatedAt: new Date(),
      mfaEnabled: false,
      backupCodes: [],
      failedLoginAttempts: 0,
      riskScore: 0,
    });

    return await this.userRepository.create(user);
  }

  /**
   * Revoke token at OAuth provider
   */
  private async revokeTokenAtProvider(
    providerConfig: any,
    accessToken: string
  ): Promise<void> {
    // Provider-specific revocation endpoints
    const revocationUrls: Record<string, string> = {
      google: 'https://oauth2.googleapis.com/revoke',
      github: 'https://api.github.com/applications/{client_id}/token',
      microsoft: 'https://login.microsoftonline.com/common/oauth2/v2.0/logout',
    };

    const revocationUrl = revocationUrls[providerConfig.name.toLowerCase()];
    if (!revocationUrl) {
      throw new Error(
        `No revocation endpoint for provider ${providerConfig.name}`
      );
    }

    if (providerConfig.name.toLowerCase() === 'github') {
      // GitHub requires different approach
      await axios.delete(
        revocationUrl.replace('{client_id}', providerConfig.clientId),
        {
          auth: {
            username: providerConfig.clientId,
            password: providerConfig.clientSecret,
          },
          data: { access_token: accessToken },
        }
      );
    } else {
      await axios.post(revocationUrl, {
        token: accessToken,
        client_id: providerConfig.clientId,
        client_secret: providerConfig.clientSecret,
      });
    }
  }

  /**
   * Create OAuth error object
   */
  private createOAuthError(
    code: string,
    message: string,
    description?: string
  ): OAuthError {
    return {
      code,
      message,
      description,
    };
  }
}
