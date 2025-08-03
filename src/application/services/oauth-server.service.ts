/**
 * OAuth2 Server Service
 * Implements OAuth2 server functionality for acting as identity provider
 */

import { nanoid } from 'nanoid';
import { createHash, randomBytes } from 'crypto';
import {
  IOAuthServer,
  OAuthTokens,
  TokenExchangeRequest,
} from '../interfaces/oauth.interface';
import { JWTTokenService } from '../../infrastructure/security/jwt-token.service';
import { PKCEService } from '../../infrastructure/security/pkce.service';

interface OAuthClient {
  clientId: string;
  clientSecret: string;
  name: string;
  redirectUris: string[];
  scopes: string[];
  grantTypes: string[];
  isPublic: boolean;
}

interface AuthorizationCode {
  code: string;
  clientId: string;
  userId: string;
  scopes: string[];
  redirectUri: string;
  codeChallenge?: string;
  codeChallengeMethod?: string;
  expiresAt: Date;
  used: boolean;
}

export class OAuthServerService implements IOAuthServer {
  private clients = new Map<string, OAuthClient>();
  private authorizationCodes = new Map<string, AuthorizationCode>();
  private jwtService: JWTTokenService;
  private pkceService: PKCEService;

  constructor(jwtService?: JWTTokenService, pkceService?: PKCEService) {
    this.jwtService = jwtService || new JWTTokenService();
    this.pkceService = pkceService || new PKCEService();

    this.initializeDefaultClients();

    // Clean up expired authorization codes every 5 minutes
    setInterval(() => this.cleanupExpiredCodes(), 5 * 60 * 1000);
  }

  /**
   * Generate authorization code for OAuth server functionality
   */
  async generateAuthorizationCode(
    clientId: string,
    userId: string,
    scopes: string[],
    redirectUri: string,
    codeChallenge?: string,
    codeChallengeMethod?: string
  ): Promise<string> {
    // Validate client
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error('Invalid client ID');
    }

    // Validate redirect URI
    if (!client.redirectUris.includes(redirectUri)) {
      throw new Error('Invalid redirect URI');
    }

    // Validate scopes
    const invalidScopes = scopes.filter(
      (scope) => !client.scopes.includes(scope)
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
    }

    // Validate PKCE if provided
    if (codeChallenge) {
      if (!codeChallengeMethod || codeChallengeMethod !== 'S256') {
        throw new Error('Invalid code challenge method');
      }

      if (!this.pkceService.validateCodeChallenge(codeChallenge)) {
        throw new Error('Invalid code challenge format');
      }
    }

    // Generate authorization code
    const code = this.generateSecureCode();
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    const authCode: AuthorizationCode = {
      code,
      clientId,
      userId,
      scopes,
      redirectUri,
      codeChallenge,
      codeChallengeMethod,
      expiresAt,
      used: false,
    };

    this.authorizationCodes.set(code, authCode);
    return code;
  }

  /**
   * Exchange authorization code for tokens (OAuth server)
   */
  async exchangeCodeForTokens(
    request: TokenExchangeRequest
  ): Promise<OAuthTokens> {
    if (request.grantType === 'authorization_code') {
      return this.handleAuthorizationCodeGrant(request);
    } else if (request.grantType === 'refresh_token') {
      return this.handleRefreshTokenGrant(request);
    } else if (request.grantType === 'client_credentials') {
      return this.handleClientCredentialsGrant(request);
    } else {
      throw new Error(`Unsupported grant type: ${request.grantType}`);
    }
  }

  /**
   * Validate client credentials
   */
  async validateClient(
    clientId: string,
    clientSecret?: string
  ): Promise<boolean> {
    const client = this.clients.get(clientId);
    if (!client) {
      return false;
    }

    // Public clients don't require secret
    if (client.isPublic) {
      return true;
    }

    // Confidential clients require secret
    return client.clientSecret === clientSecret;
  }

  /**
   * Generate access token for client credentials flow
   */
  async generateClientCredentialsToken(
    clientId: string,
    scopes: string[]
  ): Promise<OAuthTokens> {
    const client = this.clients.get(clientId);
    if (!client) {
      throw new Error('Invalid client ID');
    }

    if (!client.grantTypes.includes('client_credentials')) {
      throw new Error('Client credentials grant not allowed for this client');
    }

    // Validate scopes
    const invalidScopes = scopes.filter(
      (scope) => !client.scopes.includes(scope)
    );
    if (invalidScopes.length > 0) {
      throw new Error(`Invalid scopes: ${invalidScopes.join(', ')}`);
    }

    const payload = {
      sub: clientId,
      aud: 'api',
      scope: scopes.join(' '),
      client_id: clientId,
      token_type: 'client_credentials',
    };

    const accessToken = await this.jwtService.generateToken(payload, '1h');

    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      scope: scopes.join(' '),
    };
  }

  /**
   * Register OAuth client
   */
  registerClient(client: OAuthClient): void {
    this.validateClient(client);
    this.clients.set(client.clientId, client);
  }

  /**
   * Get client information
   */
  getClient(clientId: string): OAuthClient | undefined {
    return this.clients.get(clientId);
  }

  /**
   * Revoke authorization code
   */
  revokeAuthorizationCode(code: string): void {
    const authCode = this.authorizationCodes.get(code);
    if (authCode) {
      authCode.used = true;
    }
  }

  /**
   * Handle authorization code grant
   */
  private async handleAuthorizationCodeGrant(
    request: TokenExchangeRequest
  ): Promise<OAuthTokens> {
    if (!request.code) {
      throw new Error('Authorization code is required');
    }

    const authCode = this.authorizationCodes.get(request.code);
    if (!authCode) {
      throw new Error('Invalid authorization code');
    }

    if (authCode.used) {
      throw new Error('Authorization code already used');
    }

    if (new Date() > authCode.expiresAt) {
      throw new Error('Authorization code expired');
    }

    if (authCode.clientId !== request.clientId) {
      throw new Error('Client ID mismatch');
    }

    if (authCode.redirectUri !== request.redirectUri) {
      throw new Error('Redirect URI mismatch');
    }

    // Validate PKCE if present
    if (authCode.codeChallenge) {
      if (!request.codeVerifier) {
        throw new Error('Code verifier required for PKCE');
      }

      if (
        !this.pkceService.verifyChallenge(
          request.codeVerifier,
          authCode.codeChallenge,
          authCode.codeChallengeMethod
        )
      ) {
        throw new Error('Invalid code verifier');
      }
    }

    // Mark code as used
    authCode.used = true;

    // Generate tokens
    const payload = {
      sub: authCode.userId,
      aud: 'api',
      scope: authCode.scopes.join(' '),
      client_id: authCode.clientId,
    };

    const accessToken = await this.jwtService.generateToken(payload, '1h');
    const refreshToken = await this.jwtService.generateToken(
      { ...payload, token_type: 'refresh' },
      '30d'
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: 3600,
      scope: authCode.scopes.join(' '),
    };
  }

  /**
   * Handle refresh token grant
   */
  private async handleRefreshTokenGrant(
    request: TokenExchangeRequest
  ): Promise<OAuthTokens> {
    if (!request.refreshToken) {
      throw new Error('Refresh token is required');
    }

    try {
      const payload = await this.jwtService.verifyToken(request.refreshToken);

      if (payload.token_type !== 'refresh') {
        throw new Error('Invalid refresh token');
      }

      if (payload.client_id !== request.clientId) {
        throw new Error('Client ID mismatch');
      }

      // Generate new access token
      const newPayload = {
        sub: payload.sub,
        aud: payload.aud,
        scope: payload.scope,
        client_id: payload.client_id,
      };

      const accessToken = await this.jwtService.generateToken(newPayload, '1h');

      return {
        accessToken,
        refreshToken: request.refreshToken, // Keep same refresh token
        tokenType: 'Bearer',
        expiresIn: 3600,
        scope: payload.scope,
      };
    } catch (error) {
      throw new Error('Invalid refresh token');
    }
  }

  /**
   * Handle client credentials grant
   */
  private async handleClientCredentialsGrant(
    request: TokenExchangeRequest
  ): Promise<OAuthTokens> {
    const client = this.clients.get(request.clientId);
    if (!client) {
      throw new Error('Invalid client ID');
    }

    if (!client.grantTypes.includes('client_credentials')) {
      throw new Error('Client credentials grant not allowed');
    }

    // Use default scopes if none provided
    const scopes = client.scopes;

    return this.generateClientCredentialsToken(request.clientId, scopes);
  }

  /**
   * Initialize default OAuth clients
   */
  private initializeDefaultClients(): void {
    // Example web application client
    this.registerClient({
      clientId: process.env.OAUTH_DEFAULT_CLIENT_ID || 'default-web-client',
      clientSecret: process.env.OAUTH_DEFAULT_CLIENT_SECRET || 'default-secret',
      name: 'Default Web Application',
      redirectUris: [
        'http://localhost:3000/auth/callback',
        'https://app.example.com/auth/callback',
      ],
      scopes: ['openid', 'profile', 'email', 'read', 'write'],
      grantTypes: ['authorization_code', 'refresh_token'],
      isPublic: false,
    });

    // Example mobile application client (public)
    this.registerClient({
      clientId: process.env.OAUTH_MOBILE_CLIENT_ID || 'mobile-app-client',
      clientSecret: '',
      name: 'Mobile Application',
      redirectUris: [
        'com.example.app://auth/callback',
        'http://localhost:3000/mobile/callback',
      ],
      scopes: ['openid', 'profile', 'email', 'read'],
      grantTypes: ['authorization_code'],
      isPublic: true,
    });

    // Example API client for machine-to-machine
    this.registerClient({
      clientId: process.env.OAUTH_API_CLIENT_ID || 'api-client',
      clientSecret: process.env.OAUTH_API_CLIENT_SECRET || 'api-secret',
      name: 'API Client',
      redirectUris: [],
      scopes: ['api:read', 'api:write', 'admin'],
      grantTypes: ['client_credentials'],
      isPublic: false,
    });
  }

  /**
   * Validate OAuth client configuration
   */
  private validateClient(client: OAuthClient): void {
    if (!client.clientId || typeof client.clientId !== 'string') {
      throw new Error('Client ID is required and must be a string');
    }

    if (
      !client.isPublic &&
      (!client.clientSecret || typeof client.clientSecret !== 'string')
    ) {
      throw new Error('Client secret is required for confidential clients');
    }

    if (!client.name || typeof client.name !== 'string') {
      throw new Error('Client name is required and must be a string');
    }

    if (!Array.isArray(client.redirectUris)) {
      throw new Error('Redirect URIs must be an array');
    }

    if (!Array.isArray(client.scopes)) {
      throw new Error('Scopes must be an array');
    }

    if (!Array.isArray(client.grantTypes)) {
      throw new Error('Grant types must be an array');
    }

    if (typeof client.isPublic !== 'boolean') {
      throw new Error('isPublic must be a boolean');
    }

    // Validate redirect URIs
    client.redirectUris.forEach((uri) => {
      try {
        new URL(uri);
      } catch {
        throw new Error(`Invalid redirect URI: ${uri}`);
      }
    });

    // Validate grant types
    const validGrantTypes = [
      'authorization_code',
      'refresh_token',
      'client_credentials',
    ];
    const invalidGrantTypes = client.grantTypes.filter(
      (type) => !validGrantTypes.includes(type)
    );
    if (invalidGrantTypes.length > 0) {
      throw new Error(`Invalid grant types: ${invalidGrantTypes.join(', ')}`);
    }
  }

  /**
   * Generate cryptographically secure authorization code
   */
  private generateSecureCode(): string {
    return randomBytes(32).toString('base64url');
  }

  /**
   * Clean up expired authorization codes
   */
  private cleanupExpiredCodes(): void {
    const now = new Date();
    const expiredCodes: string[] = [];

    for (const [code, authCode] of this.authorizationCodes.entries()) {
      if (now > authCode.expiresAt || authCode.used) {
        expiredCodes.push(code);
      }
    }

    expiredCodes.forEach((code) => this.authorizationCodes.delete(code));
  }
}
