/**
 * OAuth Provider Factory
 * Creates and manages OAuth provider configurations
 */

import {
  IOAuthProviderFactory,
  OAuthProvider,
} from '../interfaces/oauth.interface';

export class OAuthProviderFactory implements IOAuthProviderFactory {
  private providers = new Map<string, OAuthProvider>();

  constructor() {
    this.initializeDefaultProviders();
  }

  /**
   * Get OAuth provider configuration
   */
  getProvider(name: string): OAuthProvider {
    const provider = this.providers.get(name.toLowerCase());
    if (!provider) {
      throw new Error(`OAuth provider '${name}' is not supported`);
    }
    return provider;
  }

  /**
   * Register a new OAuth provider
   */
  registerProvider(provider: OAuthProvider): void {
    this.validateProvider(provider);
    this.providers.set(provider.name.toLowerCase(), provider);
  }

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[] {
    return Array.from(this.providers.keys());
  }

  /**
   * Check if provider is supported
   */
  isProviderSupported(name: string): boolean {
    return this.providers.has(name.toLowerCase());
  }

  /**
   * Initialize default OAuth providers
   */
  private initializeDefaultProviders(): void {
    // Google OAuth2/OIDC
    this.registerProvider({
      name: 'google',
      clientId: process.env['GOOGLE_CLIENT_ID'] || '',
      clientSecret: process.env['GOOGLE_CLIENT_SECRET'] || '',
      authorizationUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenUrl: 'https://oauth2.googleapis.com/token',
      userInfoUrl: 'https://www.googleapis.com/oauth2/v2/userinfo',
      scopes: ['openid', 'email', 'profile'],
      redirectUri: process.env['GOOGLE_REDIRECT_URI'] || '',
      supportsPKCE: true,
      supportsRefresh: true,
    });

    // GitHub OAuth2
    this.registerProvider({
      name: 'github',
      clientId: process.env['GITHUB_CLIENT_ID'] || '',
      clientSecret: process.env['GITHUB_CLIENT_SECRET'] || '',
      authorizationUrl: 'https://github.com/login/oauth/authorize',
      tokenUrl: 'https://github.com/login/oauth/access_token',
      userInfoUrl: 'https://api.github.com/user',
      scopes: ['user:email'],
      redirectUri: process.env['GITHUB_REDIRECT_URI'] || '',
      supportsPKCE: false,
      supportsRefresh: false,
    });

    // Microsoft Azure AD / Office 365
    this.registerProvider({
      name: 'microsoft',
      clientId: process.env['MICROSOFT_CLIENT_ID'] || '',
      clientSecret: process.env['MICROSOFT_CLIENT_SECRET'] || '',
      authorizationUrl:
        'https://login.microsoftonline.com/common/oauth2/v2.0/authorize',
      tokenUrl: 'https://login.microsoftonline.com/common/oauth2/v2.0/token',
      userInfoUrl: 'https://graph.microsoft.com/v1.0/me',
      scopes: ['openid', 'email', 'profile'],
      redirectUri: process.env['MICROSOFT_REDIRECT_URI'] || '',
      supportsPKCE: true,
      supportsRefresh: true,
    });
  }

  /**
   * Validate OAuth provider configuration
   */
  private validateProvider(provider: OAuthProvider): void {
    if (!provider.name || typeof provider.name !== 'string') {
      throw new Error('Provider name is required and must be a string');
    }

    if (!provider.clientId || typeof provider.clientId !== 'string') {
      throw new Error('Client ID is required and must be a string');
    }

    if (!provider.clientSecret || typeof provider.clientSecret !== 'string') {
      throw new Error('Client secret is required and must be a string');
    }

    if (
      !provider.authorizationUrl ||
      !this.isValidUrl(provider.authorizationUrl)
    ) {
      throw new Error('Authorization URL is required and must be a valid URL');
    }

    if (!provider.tokenUrl || !this.isValidUrl(provider.tokenUrl)) {
      throw new Error('Token URL is required and must be a valid URL');
    }

    if (!provider.userInfoUrl || !this.isValidUrl(provider.userInfoUrl)) {
      throw new Error('User info URL is required and must be a valid URL');
    }

    if (!Array.isArray(provider.scopes)) {
      throw new Error('Scopes must be an array');
    }

    if (!provider.redirectUri || !this.isValidUrl(provider.redirectUri)) {
      throw new Error('Redirect URI is required and must be a valid URL');
    }

    if (typeof provider.supportsPKCE !== 'boolean') {
      throw new Error('supportsPKCE must be a boolean');
    }

    if (typeof provider.supportsRefresh !== 'boolean') {
      throw new Error('supportsRefresh must be a boolean');
    }
  }

  /**
   * Validate URL format
   */
  private isValidUrl(url: string): boolean {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Create provider-specific authorization URL
   */
  createAuthorizationUrl(
    provider: OAuthProvider,
    state: string,
    codeChallenge?: string,
    nonce?: string
  ): string {
    const params = new URLSearchParams({
      client_id: provider.clientId,
      redirect_uri: provider.redirectUri,
      response_type: 'code',
      scope: provider.scopes.join(' '),
      state,
    });

    // Add PKCE parameters if supported
    if (provider.supportsPKCE && codeChallenge) {
      params.append('code_challenge', codeChallenge);
      params.append('code_challenge_method', 'S256');
    }

    // Add nonce for OIDC
    if (nonce) {
      params.append('nonce', nonce);
    }

    // Provider-specific parameters
    switch (provider.name.toLowerCase()) {
      case 'google':
        params.append('access_type', 'offline');
        params.append('prompt', 'consent');
        break;
      case 'github':
        params.append('allow_signup', 'true');
        break;
      case 'microsoft':
        params.append('response_mode', 'query');
        break;
    }

    return `${provider.authorizationUrl}?${params.toString()}`;
  }

  /**
   * Get provider-specific user info mapping
   */
  mapUserInfo(provider: OAuthProvider, rawUserInfo: any): any {
    switch (provider.name.toLowerCase()) {
      case 'google':
        return {
          id: rawUserInfo.id,
          email: rawUserInfo.email,
          name: rawUserInfo.name,
          picture: rawUserInfo.picture,
          emailVerified: rawUserInfo.verified_email,
          locale: rawUserInfo.locale,
        };

      case 'github':
        return {
          id: rawUserInfo.id.toString(),
          email: rawUserInfo.email,
          name: rawUserInfo.name || rawUserInfo.login,
          picture: rawUserInfo.avatar_url,
          emailVerified: true, // GitHub emails are considered verified
          login: rawUserInfo.login,
          company: rawUserInfo.company,
          location: rawUserInfo.location,
        };

      case 'microsoft':
        return {
          id: rawUserInfo.id,
          email: rawUserInfo.mail || rawUserInfo.userPrincipalName,
          name: rawUserInfo.displayName,
          picture: null, // Microsoft Graph requires separate call for photo
          emailVerified: true, // Azure AD emails are considered verified
          givenName: rawUserInfo.givenName,
          surname: rawUserInfo.surname,
          jobTitle: rawUserInfo.jobTitle,
        };

      default:
        return rawUserInfo;
    }
  }

  /**
   * Get provider-specific token request parameters
   */
  getTokenRequestParams(
    provider: OAuthProvider,
    code: string,
    codeVerifier?: string
  ): Record<string, string> {
    const params: Record<string, string> = {
      grant_type: 'authorization_code',
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      code,
      redirect_uri: provider.redirectUri,
    };

    // Add PKCE code verifier if supported
    if (provider.supportsPKCE && codeVerifier) {
      params['code_verifier'] = codeVerifier;
    }

    return params;
  }

  /**
   * Get provider-specific refresh token parameters
   */
  getRefreshTokenParams(
    provider: OAuthProvider,
    refreshToken: string
  ): Record<string, string> {
    return {
      grant_type: 'refresh_token',
      client_id: provider.clientId,
      client_secret: provider.clientSecret,
      refresh_token: refreshToken,
    };
  }
}
