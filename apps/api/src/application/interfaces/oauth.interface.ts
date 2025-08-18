/**
 * OAuth2/OpenID Connect Service Interfaces
 * Defines contracts for OAuth integration
 */

import { User } from "@company/shared/entities/user';
import { Account } from "@company/shared/entities/account';

export interface OAuthProvider {
  name: string;
  clientId: string;
  clientSecret: string;
  authorizationUrl: string;
  tokenUrl: string;
  userInfoUrl: string;
  scopes: string[];
  redirectUri: string;
  supportsPKCE: boolean;
  supportsRefresh: boolean;
}

export interface OAuthInitiation {
  authorizationUrl: string;
  state: string;
  codeChallenge?: string | undefined; // For PKCE
  codeChallengeMethod?: string | undefined; // For PKCE
  codeVerifier?: string | undefined; // For PKCE
  nonce?: string | undefined; // For OIDC
}

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string | undefined;
  idToken?: string | undefined;
  tokenType: string;
  expiresIn: number;
  scope?: string | undefined;
}

export interface OAuthUserInfo {
  id: string;
  email?: string | undefined;
  name?: string | undefined;
  picture?: string | undefined;
  emailVerified?: boolean | undefined;
  locale?: string | undefined;
  [key: string]: any;
}

export interface OAuthResult {
  success: boolean;
  user?: User;
  account?: Account;
  tokens?: OAuthTokens;
  userInfo?: OAuthUserInfo;
  isNewUser?: boolean;
  requiresMFA?: boolean;
  riskScore?: number;
  error?: OAuthError;
}

export interface OAuthError {
  code: string;
  message: string;
  description?: string | undefined;
  uri?: string | undefined;
}

export interface OAuthCallbackRequest {
  code: string;
  state: string;
  error?: string;
  errorDescription?: string;
  codeVerifier?: string; // For PKCE
}

export interface TokenExchangeRequest {
  grantType: 'authorization_code' | 'refresh_token' | 'client_credentials';
  code?: string;
  refreshToken?: string;
  redirectUri?: string;
  codeVerifier?: string; // For PKCE
  clientId: string;
  clientSecret?: string;
}

export interface IOAuthService {
  /**
   * Initiate OAuth flow and return authorization URL
   */
  initiateOAuthFlow(
    provider: string,
    redirectUri: string,
    scopes?: string[],
    state?: string
  ): Promise<OAuthInitiation>;

  /**
   * Handle OAuth callback and exchange code for tokens
   */
  handleCallback(
    provider: string,
    callbackRequest: OAuthCallbackRequest
  ): Promise<OAuthResult>;

  /**
   * Refresh OAuth access token
   */
  refreshOAuthToken(userId: string, provider: string): Promise<OAuthTokens>;

  /**
   * Revoke OAuth access for a user
   */
  revokeOAuthAccess(userId: string, provider: string): Promise<void>;

  /**
   * Get user information from OAuth provider
   */
  getUserInfo(provider: string, accessToken: string): Promise<OAuthUserInfo>;

  /**
   * Link OAuth account to existing user
   */
  linkAccount(
    userId: string,
    provider: string,
    tokens: OAuthTokens,
    userInfo: OAuthUserInfo
  ): Promise<Account>;

  /**
   * Unlink OAuth account from user
   */
  unlinkAccount(userId: string, provider: string): Promise<void>;
}

export interface IOAuthProviderFactory {
  /**
   * Get OAuth provider configuration
   */
  getProvider(name: string): OAuthProvider;

  /**
   * Register a new OAuth provider
   */
  registerProvider(provider: OAuthProvider): void;

  /**
   * Get all available providers
   */
  getAvailableProviders(): string[];

  /**
   * Check if provider is supported
   */
  isProviderSupported(name: string): boolean;
}

export interface IOAuthServer {
  /**
   * Generate authorization code for OAuth server functionality
   */
  generateAuthorizationCode(
    clientId: string,
    userId: string,
    scopes: string[],
    redirectUri: string,
    codeChallenge?: string,
    codeChallengeMethod?: string
  ): Promise<string>;

  /**
   * Exchange authorization code for tokens (OAuth server)
   */
  exchangeCodeForTokens(request: TokenExchangeRequest): Promise<OAuthTokens>;

  /**
   * Validate client credentials
   */
  validateClient(clientId: string, clientSecret?: string): Promise<boolean>;

  /**
   * Generate access token for client credentials flow
   */
  generateClientCredentialsToken(
    clientId: string,
    scopes: string[]
  ): Promise<OAuthTokens>;
}


