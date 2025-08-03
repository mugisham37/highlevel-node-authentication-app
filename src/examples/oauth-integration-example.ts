/**
 * OAuth Integration Example
 * Demonstrates complete OAuth2/OpenID Connect flows
 */

import { OAuthService } from '../application/services/oauth.service';
import { OAuthServerService } from '../application/services/oauth-server.service';
import { OAuthProviderFactory } from '../application/factories/oauth-provider.factory';
import { PKCEService } from '../infrastructure/security/pkce.service';
import { JWTTokenService } from '../infrastructure/security/jwt-token.service';
import { OAuthUserRepository } from '../infrastructure/database/repositories/oauth-user.repository';
import { OAuthAccountRepository } from '../infrastructure/database/repositories/oauth-account.repository';
import { OAuthStateRepository } from '../infrastructure/database/repositories/oauth-state.repository';
import { OAuthAuthorizationCodeRepository } from '../infrastructure/database/repositories/oauth-authorization-code.repository';
import { PrismaClient } from '../generated/prisma/client';
import Redis from 'ioredis';

/**
 * OAuth Client Flow Example
 * Demonstrates how to integrate with external OAuth providers
 */
export class OAuthClientExample {
  private oauthService: OAuthService;

  constructor() {
    // Initialize dependencies
    const prisma = new PrismaClient();
    const redis = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');

    const userRepository = new OAuthUserRepository(prisma);
    const accountRepository = new OAuthAccountRepository(prisma);
    const stateRepository = new OAuthStateRepository(redis);

    this.oauthService = new OAuthService(
      userRepository,
      accountRepository,
      stateRepository
    );
  }

  /**
   * Example: Initiate OAuth flow with Google
   */
  async initiateGoogleOAuth(): Promise<void> {
    try {
      console.log('🚀 Initiating Google OAuth flow...');

      const result = await this.oauthService.initiateOAuthFlow(
        'google',
        'http://localhost:3000/auth/google/callback',
        ['openid', 'email', 'profile']
      );

      console.log('✅ OAuth flow initiated successfully');
      console.log('📋 Authorization URL:', result.authorizationUrl);
      console.log('🔑 State:', result.state);
      console.log('🔐 Code Verifier (PKCE):', result.codeVerifier);
      console.log('🎲 Nonce:', result.nonce);

      // In a real application, you would redirect the user to the authorization URL
      console.log('\n📝 Next steps:');
      console.log('1. Redirect user to the authorization URL');
      console.log('2. User authorizes your application');
      console.log('3. Provider redirects back with authorization code');
      console.log('4. Exchange code for tokens using handleCallback()');
    } catch (error) {
      console.error('❌ Failed to initiate OAuth flow:', error);
    }
  }

  /**
   * Example: Handle OAuth callback from Google
   */
  async handleGoogleCallback(code: string, state: string): Promise<void> {
    try {
      console.log('🔄 Handling Google OAuth callback...');

      const result = await this.oauthService.handleCallback('google', {
        code,
        state,
      });

      if (result.success) {
        console.log('✅ OAuth callback handled successfully');
        console.log('👤 User:', {
          id: result.user?.id,
          email: result.user?.email.value,
          name: result.user?.name,
          isNewUser: result.isNewUser,
        });
        console.log('🔗 Account:', {
          id: result.account?.id,
          provider: result.account?.provider,
          hasValidToken: result.account?.hasValidAccessToken(),
        });
        console.log('🎫 Tokens:', {
          accessToken: result.tokens?.accessToken.substring(0, 20) + '...',
          hasRefreshToken: !!result.tokens?.refreshToken,
          expiresIn: result.tokens?.expiresIn,
        });
      } else {
        console.error('❌ OAuth callback failed:', result.error);
      }
    } catch (error) {
      console.error('❌ Failed to handle OAuth callback:', error);
    }
  }

  /**
   * Example: Refresh OAuth token
   */
  async refreshGoogleToken(userId: string): Promise<void> {
    try {
      console.log('🔄 Refreshing Google OAuth token...');

      const tokens = await this.oauthService.refreshOAuthToken(
        userId,
        'google'
      );

      console.log('✅ Token refreshed successfully');
      console.log('🎫 New tokens:', {
        accessToken: tokens.accessToken.substring(0, 20) + '...',
        hasRefreshToken: !!tokens.refreshToken,
        expiresIn: tokens.expiresIn,
      });
    } catch (error) {
      console.error('❌ Failed to refresh token:', error);
    }
  }

  /**
   * Example: Link additional OAuth account
   */
  async linkGitHubAccount(userId: string): Promise<void> {
    try {
      console.log('🔗 Linking GitHub account...');

      // First initiate GitHub OAuth flow
      const initResult = await this.oauthService.initiateOAuthFlow(
        'github',
        'http://localhost:3000/auth/github/callback',
        ['user:email']
      );

      console.log('📋 GitHub authorization URL:', initResult.authorizationUrl);

      // In a real application, after user authorizes and you get the callback:
      // const callbackResult = await this.oauthService.handleCallback('github', {
      //   code: 'authorization-code-from-github',
      //   state: initResult.state,
      // });

      // Then link the account:
      // if (callbackResult.success && callbackResult.tokens && callbackResult.userInfo) {
      //   const account = await this.oauthService.linkAccount(
      //     userId,
      //     'github',
      //     callbackResult.tokens,
      //     callbackResult.userInfo
      //   );
      //   console.log('✅ GitHub account linked successfully:', account.id);
      // }
    } catch (error) {
      console.error('❌ Failed to link GitHub account:', error);
    }
  }

  /**
   * Example: Revoke OAuth access
   */
  async revokeGoogleAccess(userId: string): Promise<void> {
    try {
      console.log('🚫 Revoking Google OAuth access...');

      await this.oauthService.revokeOAuthAccess(userId, 'google');

      console.log('✅ Google OAuth access revoked successfully');
    } catch (error) {
      console.error('❌ Failed to revoke OAuth access:', error);
    }
  }
}

/**
 * OAuth Server Flow Example
 * Demonstrates how to act as an OAuth2 identity provider
 */
export class OAuthServerExample {
  private oauthServer: OAuthServerService;

  constructor() {
    const jwtService = new JWTTokenService();
    const pkceService = new PKCEService();

    this.oauthServer = new OAuthServerService(jwtService, pkceService);
  }

  /**
   * Example: Authorization endpoint (OAuth server)
   */
  async handleAuthorizationRequest(
    clientId: string,
    redirectUri: string,
    scopes: string[],
    userId: string,
    codeChallenge?: string
  ): Promise<void> {
    try {
      console.log('🔐 Handling OAuth authorization request...');
      console.log('📋 Client ID:', clientId);
      console.log('🔗 Redirect URI:', redirectUri);
      console.log('🎯 Scopes:', scopes);
      console.log('👤 User ID:', userId);

      // Validate client
      const isValidClient = await this.oauthServer.validateClient(clientId);
      if (!isValidClient) {
        throw new Error('Invalid client');
      }

      // Generate authorization code
      const authCode = await this.oauthServer.generateAuthorizationCode(
        clientId,
        userId,
        scopes,
        redirectUri,
        codeChallenge,
        codeChallenge ? 'S256' : undefined
      );

      console.log('✅ Authorization code generated:', authCode);
      console.log(
        '📝 Next step: Redirect user to:',
        `${redirectUri}?code=${authCode}&state=example-state`
      );
    } catch (error) {
      console.error('❌ Failed to handle authorization request:', error);
    }
  }

  /**
   * Example: Token endpoint (OAuth server)
   */
  async handleTokenRequest(
    grantType: 'authorization_code' | 'refresh_token' | 'client_credentials',
    clientId: string,
    code?: string,
    refreshToken?: string,
    codeVerifier?: string
  ): Promise<void> {
    try {
      console.log('🎫 Handling OAuth token request...');
      console.log('📋 Grant Type:', grantType);
      console.log('🆔 Client ID:', clientId);

      let tokens;

      if (grantType === 'authorization_code' && code) {
        tokens = await this.oauthServer.exchangeCodeForTokens({
          grantType: 'authorization_code',
          code,
          clientId,
          redirectUri: 'http://localhost:3000/callback', // Should match authorization request
          codeVerifier,
        });
      } else if (grantType === 'refresh_token' && refreshToken) {
        tokens = await this.oauthServer.exchangeCodeForTokens({
          grantType: 'refresh_token',
          refreshToken,
          clientId,
        });
      } else if (grantType === 'client_credentials') {
        tokens = await this.oauthServer.generateClientCredentialsToken(
          clientId,
          ['api:read', 'api:write']
        );
      } else {
        throw new Error('Invalid grant type or missing parameters');
      }

      console.log('✅ Tokens generated successfully');
      console.log(
        '🎫 Access Token:',
        tokens.accessToken.substring(0, 20) + '...'
      );
      console.log(
        '🔄 Refresh Token:',
        tokens.refreshToken
          ? tokens.refreshToken.substring(0, 20) + '...'
          : 'N/A'
      );
      console.log('⏰ Expires In:', tokens.expiresIn, 'seconds');
      console.log('🎯 Scope:', tokens.scope);
    } catch (error) {
      console.error('❌ Failed to handle token request:', error);
    }
  }

  /**
   * Example: Client credentials flow
   */
  async demonstrateClientCredentialsFlow(): Promise<void> {
    try {
      console.log('🤖 Demonstrating client credentials flow...');

      const tokens = await this.oauthServer.generateClientCredentialsToken(
        'api-client',
        ['api:read', 'api:write']
      );

      console.log('✅ Client credentials tokens generated');
      console.log(
        '🎫 Access Token:',
        tokens.accessToken.substring(0, 20) + '...'
      );
      console.log('🎯 Scope:', tokens.scope);
      console.log('⏰ Expires In:', tokens.expiresIn, 'seconds');
    } catch (error) {
      console.error('❌ Failed to generate client credentials token:', error);
    }
  }
}

/**
 * Complete OAuth Flow Example
 * Demonstrates end-to-end OAuth integration
 */
export class CompleteOAuthExample {
  private clientExample: OAuthClientExample;
  private serverExample: OAuthServerExample;

  constructor() {
    this.clientExample = new OAuthClientExample();
    this.serverExample = new OAuthServerExample();
  }

  /**
   * Run complete OAuth examples
   */
  async runExamples(): Promise<void> {
    console.log('🎯 OAuth Integration Examples');
    console.log('============================\n');

    // OAuth Client Examples
    console.log('📱 OAuth Client Examples:');
    console.log('--------------------------');

    await this.clientExample.initiateGoogleOAuth();
    console.log('\n');

    // Note: In a real application, you would get these from the actual callback
    // await this.clientExample.handleGoogleCallback('example-code', 'example-state');
    // await this.clientExample.refreshGoogleToken('user-123');
    // await this.clientExample.linkGitHubAccount('user-123');
    // await this.clientExample.revokeGoogleAccess('user-123');

    // OAuth Server Examples
    console.log('🏢 OAuth Server Examples:');
    console.log('--------------------------');

    await this.serverExample.handleAuthorizationRequest(
      'default-web-client',
      'http://localhost:3000/callback',
      ['openid', 'profile', 'email'],
      'user-123'
    );
    console.log('\n');

    await this.serverExample.demonstrateClientCredentialsFlow();
    console.log('\n');

    console.log('✅ All OAuth examples completed!');
    console.log('\n📚 Key Features Demonstrated:');
    console.log('- OAuth2/OpenID Connect client flows');
    console.log('- PKCE (Proof Key for Code Exchange) support');
    console.log('- Multiple provider support (Google, GitHub, Microsoft)');
    console.log('- OAuth2 server functionality');
    console.log(
      '- Authorization code, refresh token, and client credentials grants'
    );
    console.log('- Account linking and token management');
    console.log('- Secure state management with Redis');
    console.log('- Comprehensive error handling');
  }
}

// Run examples if this file is executed directly
if (require.main === module) {
  const example = new CompleteOAuthExample();
  example.runExamples().catch(console.error);
}
