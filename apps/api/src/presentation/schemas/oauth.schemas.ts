/**
 * OAuth API Validation Schemas
 * Zod schemas for request/response validation in OAuth endpoints
 */

import { z } from 'zod';
import { DeviceInfoSchema } from './auth.schemas';

// OAuth Provider Schema
export const OAuthProviderSchema = z.enum(['google', 'github', 'microsoft'], {
  errorMap: () => ({
    message: 'Provider must be google, github, or microsoft',
  }),
});

// OAuth Initiation Schemas
export const OAuthInitiateRequestSchema = z.object({
  provider: OAuthProviderSchema,
  redirectUri: z.string().url('Invalid redirect URI'),
  state: z.string().optional(),
  scopes: z.array(z.string()).optional(),
  deviceInfo: DeviceInfoSchema,
});

export const OAuthCallbackRequestSchema = z.object({
  provider: OAuthProviderSchema,
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
  deviceInfo: DeviceInfoSchema,
});

export const OAuthLinkAccountRequestSchema = z.object({
  provider: OAuthProviderSchema,
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().min(1, 'State parameter is required'),
});

export const OAuthUnlinkAccountRequestSchema = z.object({
  provider: OAuthProviderSchema,
});

// OAuth Server Schemas (when acting as OAuth provider)
export const OAuthServerAuthorizeRequestSchema = z.object({
  clientId: z.string().min(1, 'Client ID is required'),
  redirectUri: z.string().url('Invalid redirect URI'),
  responseType: z.enum(['code'], {
    errorMap: () => ({ message: 'Response type must be code' }),
  }),
  scope: z.string().optional(),
  state: z.string().optional(),
  codeChallenge: z.string().optional(),
  codeChallengeMethod: z.enum(['S256']).optional(),
});

export const OAuthServerTokenRequestSchema = z
  .object({
    grantType: z.enum(
      ['authorization_code', 'refresh_token', 'client_credentials'],
      {
        errorMap: () => ({ message: 'Invalid grant type' }),
      }
    ),
    code: z.string().optional(),
    redirectUri: z.string().url().optional(),
    clientId: z.string().min(1, 'Client ID is required'),
    clientSecret: z.string().optional(),
    refreshToken: z.string().optional(),
    codeVerifier: z.string().optional(),
  })
  .refine(
    (data) => {
      if (data.grantType === 'authorization_code') {
        return data.code && data.redirectUri;
      }
      if (data.grantType === 'refresh_token') {
        return data.refreshToken;
      }
      return true;
    },
    {
      message: 'Missing required parameters for grant type',
    }
  );

// Response Schemas
export const OAuthInitiateResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      authorizationUrl: z.string().url(),
      state: z.string(),
      codeChallenge: z.string().optional(),
      codeChallengeMethod: z.string().optional(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const OAuthCallbackResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      user: z
        .object({
          id: z.string(),
          email: z.string(),
          name: z.string().nullable(),
          image: z.string().nullable(),
          emailVerified: z.boolean(),
          mfaEnabled: z.boolean(),
          createdAt: z.string(),
        })
        .optional(),
      tokens: z
        .object({
          accessToken: z.string(),
          refreshToken: z.string(),
          expiresIn: z.number(),
          tokenType: z.string(),
        })
        .optional(),
      account: z
        .object({
          id: z.string(),
          provider: z.string(),
          providerAccountId: z.string(),
          type: z.string(),
        })
        .optional(),
      isNewUser: z.boolean().optional(),
      requiresMFA: z.boolean().optional(),
      riskScore: z.number().min(0).max(100),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const OAuthAccountsResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .array(
      z.object({
        id: z.string(),
        provider: z.string(),
        providerAccountId: z.string(),
        type: z.string(),
        accessToken: z.string().optional(),
        refreshToken: z.string().optional(),
        expiresAt: z.number().nullable(),
        tokenType: z.string().optional(),
        scope: z.string().optional(),
        createdAt: z.string(),
        updatedAt: z.string(),
      })
    )
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const OAuthServerTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
  refresh_token: z.string().optional(),
  scope: z.string().optional(),
});

export const OAuthServerUserInfoResponseSchema = z.object({
  sub: z.string(),
  email: z.string(),
  email_verified: z.boolean(),
  name: z.string().optional(),
  picture: z.string().optional(),
  given_name: z.string().optional(),
  family_name: z.string().optional(),
  locale: z.string().optional(),
});

// Type exports
export type OAuthProvider = z.infer<typeof OAuthProviderSchema>;
export type OAuthInitiateRequest = z.infer<typeof OAuthInitiateRequestSchema>;
export type OAuthCallbackRequest = z.infer<typeof OAuthCallbackRequestSchema>;
export type OAuthLinkAccountRequest = z.infer<
  typeof OAuthLinkAccountRequestSchema
>;
export type OAuthUnlinkAccountRequest = z.infer<
  typeof OAuthUnlinkAccountRequestSchema
>;
export type OAuthServerAuthorizeRequest = z.infer<
  typeof OAuthServerAuthorizeRequestSchema
>;
export type OAuthServerTokenRequest = z.infer<
  typeof OAuthServerTokenRequestSchema
>;
export type OAuthInitiateResponse = z.infer<typeof OAuthInitiateResponseSchema>;
export type OAuthCallbackResponse = z.infer<typeof OAuthCallbackResponseSchema>;
export type OAuthAccountsResponse = z.infer<typeof OAuthAccountsResponseSchema>;
export type OAuthServerTokenResponse = z.infer<
  typeof OAuthServerTokenResponseSchema
>;
export type OAuthServerUserInfoResponse = z.infer<
  typeof OAuthServerUserInfoResponseSchema
>;
