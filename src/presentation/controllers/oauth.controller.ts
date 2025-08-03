/**
 * OAuth Controller
 * Handles OAuth2/OpenID Connect flows including provider authentication,
 * account linking, and OAuth server functionality
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { OAuthService } from '../../application/services/oauth.service';
import { OAuthServerService } from '../../application/services/oauth-server.service';
import { logger } from '../../infrastructure/logging/winston-logger';
import {
  OAuthInitiateRequest,
  OAuthCallbackRequest,
  OAuthLinkAccountRequest,
  OAuthUnlinkAccountRequest,
  OAuthServerAuthorizeRequest,
  OAuthServerTokenRequest,
} from '../schemas/oauth.schemas';

export class OAuthController {
  constructor(
    private oauthService: OAuthService,
    private oauthServerService: OAuthServerService
  ) {}

  /**
   * Initiate OAuth flow with provider
   */
  async initiateOAuth(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const initiateData = request.body as OAuthInitiateRequest;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || '';

      const result = await this.oauthService.initiateOAuthFlow(
        initiateData.provider,
        initiateData.redirectUri,
        {
          state: initiateData.state,
          scopes: initiateData.scopes,
          deviceInfo: initiateData.deviceInfo,
          ipAddress,
          userAgent,
        }
      );

      logger.info('OAuth flow initiated', {
        correlationId: request.correlationId,
        provider: initiateData.provider,
        redirectUri: initiateData.redirectUri,
        ipAddress,
      });

      reply.status(200).send({
        success: true,
        data: {
          authorizationUrl: result.authorizationUrl,
          state: result.state,
          codeChallenge: result.codeChallenge,
          codeChallengeMethod: result.codeChallengeMethod,
        },
        message: 'OAuth flow initiated successfully',
      });
    } catch (error) {
      logger.error('OAuth initiation error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: (request.body as any)?.provider,
      });

      reply.status(400).send({
        success: false,
        error: 'OAUTH_INITIATION_FAILED',
        message:
          error instanceof Error
            ? error.message
            : 'Failed to initiate OAuth flow',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Handle OAuth callback from provider
   */
  async handleOAuthCallback(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const callbackData = request.body as OAuthCallbackRequest;
      const ipAddress = request.ip;
      const userAgent = request.headers['user-agent'] || '';

      const result = await this.oauthService.handleCallback(
        callbackData.provider,
        callbackData.code,
        callbackData.state,
        {
          deviceInfo: callbackData.deviceInfo,
          ipAddress,
          userAgent,
        }
      );

      logger.info('OAuth callback processed', {
        correlationId: request.correlationId,
        provider: callbackData.provider,
        success: result.success,
        isNewUser: result.isNewUser,
        requiresMFA: result.requiresMFA,
        ipAddress,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: result.error?.code || 'OAUTH_CALLBACK_FAILED',
          message: result.error?.message || 'OAuth callback failed',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          user: result.user
            ? {
                id: result.user.id,
                email: result.user.email.value,
                name: result.user.name,
                image: result.user.image,
                emailVerified: result.user.isEmailVerified(),
                mfaEnabled: result.user.mfaEnabled,
                createdAt: result.user.createdAt.toISOString(),
              }
            : undefined,
          tokens: result.tokens
            ? {
                accessToken: result.tokens.accessToken,
                refreshToken: result.tokens.refreshToken,
                expiresIn: result.tokens.expiresIn,
                tokenType: result.tokens.tokenType,
              }
            : undefined,
          account: result.account
            ? {
                id: result.account.id,
                provider: result.account.provider,
                providerAccountId: result.account.providerAccountId,
                type: result.account.type,
              }
            : undefined,
          isNewUser: result.isNewUser,
          requiresMFA: result.requiresMFA,
          riskScore: result.riskScore || 0,
        },
        message: result.isNewUser
          ? 'Account created and linked successfully'
          : 'Authentication successful',
      });
    } catch (error) {
      logger.error('OAuth callback error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        provider: (request.body as any)?.provider,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during OAuth callback',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Link OAuth account to existing user
   */
  async linkAccount(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const linkData = request.body as OAuthLinkAccountRequest;
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const result = await this.oauthService.linkAccount(
        userId,
        linkData.provider,
        linkData.code,
        linkData.state
      );

      logger.info('OAuth account linking', {
        correlationId: request.correlationId,
        userId,
        provider: linkData.provider,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: 'ACCOUNT_LINKING_FAILED',
          message: 'Failed to link OAuth account',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          account: {
            id: result.account!.id,
            provider: result.account!.provider,
            providerAccountId: result.account!.providerAccountId,
            type: result.account!.type,
          },
        },
        message: 'Account linked successfully',
      });
    } catch (error) {
      logger.error('OAuth account linking error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
        provider: (request.body as any)?.provider,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during account linking',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Unlink OAuth account from user
   */
  async unlinkAccount(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const unlinkData = request.body as OAuthUnlinkAccountRequest;
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      await this.oauthService.unlinkAccount(userId, unlinkData.provider);

      logger.info('OAuth account unlinking', {
        correlationId: request.correlationId,
        userId,
        provider: unlinkData.provider,
      });

      reply.status(200).send({
        success: true,
        message: 'Account unlinked successfully',
      });
    } catch (error) {
      logger.error('OAuth account unlinking error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
        provider: (request.body as any)?.provider,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during account unlinking',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * Get user's linked OAuth accounts
   */
  async getLinkedAccounts(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const accounts = await this.oauthService.getUserAccounts(userId);

      reply.status(200).send({
        success: true,
        data: accounts.map((account) => ({
          id: account.id,
          provider: account.provider,
          providerAccountId: account.providerAccountId,
          type: account.type,
          accessToken: account.accessToken ? '***' : undefined, // Mask token
          refreshToken: account.refreshToken ? '***' : undefined, // Mask token
          expiresAt: account.expiresAt,
          tokenType: account.tokenType,
          scope: account.scope,
          createdAt: account.createdAt.toISOString(),
          updatedAt: account.updatedAt.toISOString(),
        })),
      });
    } catch (error) {
      logger.error('Get linked accounts error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error while fetching linked accounts',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * OAuth Server: Authorization endpoint
   */
  async authorize(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const authorizeData = request.query as OAuthServerAuthorizeRequest;
      const userId = request.user?.id;

      if (!userId) {
        // Redirect to login with return URL
        const loginUrl = `/auth/login?returnUrl=${encodeURIComponent(request.url)}`;
        reply.redirect(302, loginUrl);
        return;
      }

      const result = await this.oauthServerService.authorize(
        authorizeData,
        userId
      );

      logger.info('OAuth server authorization', {
        correlationId: request.correlationId,
        clientId: authorizeData.clientId,
        userId,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: result.error?.code || 'AUTHORIZATION_FAILED',
          message: result.error?.message || 'Authorization failed',
          correlationId: request.correlationId,
        });
        return;
      }

      // Redirect to client with authorization code
      const redirectUrl = new URL(authorizeData.redirectUri);
      redirectUrl.searchParams.set('code', result.code!);
      if (authorizeData.state) {
        redirectUrl.searchParams.set('state', authorizeData.state);
      }

      reply.redirect(302, redirectUrl.toString());
    } catch (error) {
      logger.error('OAuth server authorization error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        clientId: (request.query as any)?.clientId,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during authorization',
        correlationId: request.correlationId,
      });
    }
  }

  /**
   * OAuth Server: Token endpoint
   */
  async token(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const tokenData = request.body as OAuthServerTokenRequest;

      const result = await this.oauthServerService.token(tokenData);

      logger.info('OAuth server token exchange', {
        correlationId: request.correlationId,
        clientId: tokenData.clientId,
        grantType: tokenData.grantType,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          error: result.error?.code || 'invalid_request',
          error_description: result.error?.message || 'Token exchange failed',
        });
        return;
      }

      reply.status(200).send({
        access_token: result.accessToken,
        token_type: result.tokenType || 'Bearer',
        expires_in: result.expiresIn,
        refresh_token: result.refreshToken,
        scope: result.scope,
      });
    } catch (error) {
      logger.error('OAuth server token error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        clientId: (request.body as any)?.clientId,
      });

      reply.status(500).send({
        error: 'server_error',
        error_description: 'Internal server error during token exchange',
      });
    }
  }

  /**
   * OAuth Server: User info endpoint
   */
  async userInfo(request: FastifyRequest, reply: FastifyReply): Promise<void> {
    try {
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          error: 'invalid_token',
          error_description: 'Invalid or expired access token',
        });
        return;
      }

      const userInfo = await this.oauthServerService.getUserInfo(userId);

      if (!userInfo) {
        reply.status(404).send({
          error: 'user_not_found',
          error_description: 'User not found',
        });
        return;
      }

      reply.status(200).send({
        sub: userInfo.sub,
        email: userInfo.email,
        email_verified: userInfo.email_verified,
        name: userInfo.name,
        picture: userInfo.picture,
        given_name: userInfo.given_name,
        family_name: userInfo.family_name,
        locale: userInfo.locale,
      });
    } catch (error) {
      logger.error('OAuth server user info error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
      });

      reply.status(500).send({
        error: 'server_error',
        error_description: 'Internal server error while fetching user info',
      });
    }
  }

  /**
   * Refresh OAuth provider token
   */
  async refreshProviderToken(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const { provider } = request.params as { provider: string };
      const userId = request.user?.id;

      if (!userId) {
        reply.status(401).send({
          success: false,
          error: 'UNAUTHORIZED',
          message: 'User not authenticated',
          correlationId: request.correlationId,
        });
        return;
      }

      const result = await this.oauthService.refreshOAuthToken(
        userId,
        provider
      );

      logger.info('OAuth provider token refresh', {
        correlationId: request.correlationId,
        userId,
        provider,
        success: result.success,
      });

      if (!result.success) {
        reply.status(400).send({
          success: false,
          error: 'TOKEN_REFRESH_FAILED',
          message: 'Failed to refresh OAuth provider token',
          correlationId: request.correlationId,
        });
        return;
      }

      reply.status(200).send({
        success: true,
        data: {
          accessToken: '***', // Mask the actual token
          expiresIn: result.expiresIn,
          tokenType: result.tokenType,
        },
        message: 'Provider token refreshed successfully',
      });
    } catch (error) {
      logger.error('OAuth provider token refresh error', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.user?.id,
        provider: (request.params as any)?.provider,
      });

      reply.status(500).send({
        success: false,
        error: 'INTERNAL_SERVER_ERROR',
        message: 'Internal server error during token refresh',
        correlationId: request.correlationId,
      });
    }
  }
}
