import {
  pgTable,
  varchar,
  timestamp,
  text,
  boolean,
} from 'drizzle-orm/pg-core';

// OAuth token cache for high-performance token operations
export const oauthTokenCache = pgTable('oauth_token_cache', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  idToken: text('id_token'),
  expiresAt: timestamp('expires_at'),
  tokenType: varchar('token_type', { length: 50 }),
  scope: text('scope'),
  sessionState: text('session_state'),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

// OAuth state tracking for security
export const oauthStateTracking = pgTable('oauth_state_tracking', {
  state: varchar('state', { length: 255 }).primaryKey(),
  provider: varchar('provider', { length: 50 }).notNull(),
  redirectUri: text('redirect_uri').notNull(),
  codeVerifier: varchar('code_verifier', { length: 255 }), // For PKCE
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false).notNull(),
  ipAddress: varchar('ip_address', { length: 45 }),
  userAgent: text('user_agent'),
});

// OAuth authorization codes cache
export const oauthAuthCodes = pgTable('oauth_auth_codes', {
  code: varchar('code', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  clientId: varchar('client_id', { length: 255 }).notNull(),
  redirectUri: text('redirect_uri').notNull(),
  scope: text('scope'),
  codeChallenge: varchar('code_challenge', { length: 255 }), // For PKCE
  codeChallengeMethod: varchar('code_challenge_method', { length: 10 }), // S256 or plain
  createdAt: timestamp('created_at').defaultNow().notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  used: boolean('used').default(false).notNull(),
});

export type OAuthTokenCacheEntry = typeof oauthTokenCache.$inferSelect;
export type NewOAuthTokenCacheEntry = typeof oauthTokenCache.$inferInsert;
export type OAuthStateEntry = typeof oauthStateTracking.$inferSelect;
export type NewOAuthStateEntry = typeof oauthStateTracking.$inferInsert;
export type OAuthAuthCode = typeof oauthAuthCodes.$inferSelect;
export type NewOAuthAuthCode = typeof oauthAuthCodes.$inferInsert;
