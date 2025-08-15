import {
  pgTable,
  varchar,
  timestamp,
  real,
  boolean,
  inet,
  text,
  serial,
} from 'drizzle-orm/pg-core';

// High-performance session storage for authentication flows
export const activeSessions = pgTable('active_sessions', {
  id: varchar('id', { length: 255 }).primaryKey(),
  userId: varchar('user_id', { length: 255 }).notNull(),
  token: varchar('token', { length: 500 }).notNull().unique(),
  refreshToken: varchar('refresh_token', { length: 500 }).notNull().unique(),
  expiresAt: timestamp('expires_at').notNull(),
  refreshExpiresAt: timestamp('refresh_expires_at').notNull(),
  lastActivity: timestamp('last_activity').defaultNow().notNull(),
  ipAddress: inet('ip_address'),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
  userAgent: text('user_agent'),
  riskScore: real('risk_score').default(0).notNull(),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

// Authentication attempts tracking for security analysis
export const authAttempts = pgTable('auth_attempts', {
  id: serial('id').primaryKey(),
  userId: varchar('user_id', { length: 255 }),
  email: varchar('email', { length: 255 }),
  ipAddress: inet('ip_address').notNull(),
  userAgent: text('user_agent'),
  success: boolean('success').notNull(),
  failureReason: varchar('failure_reason', { length: 255 }),
  timestamp: timestamp('timestamp').defaultNow().notNull(),
  riskScore: real('risk_score').default(0).notNull(),
  deviceFingerprint: varchar('device_fingerprint', { length: 255 }),
});

// Rate limiting tracking for performance-critical operations
export const rateLimitTracking = pgTable('rate_limit_tracking', {
  id: serial('id').primaryKey(),
  identifier: varchar('identifier', { length: 255 }).notNull(), // IP, user ID, etc.
  resource: varchar('resource', { length: 100 }).notNull(), // endpoint, operation type
  requestCount: real('request_count').default(1).notNull(),
  windowStart: timestamp('window_start').defaultNow().notNull(),
  windowEnd: timestamp('window_end').notNull(),
  blocked: boolean('blocked').default(false).notNull(),
});

// User authentication cache for fast lookups
export const userAuthCache = pgTable('user_auth_cache', {
  userId: varchar('user_id', { length: 255 }).primaryKey(),
  email: varchar('email', { length: 255 }).notNull(),
  passwordHash: text('password_hash'),
  mfaEnabled: boolean('mfa_enabled').default(false).notNull(),
  totpSecret: varchar('totp_secret', { length: 255 }),
  failedLoginAttempts: real('failed_login_attempts').default(0).notNull(),
  lockedUntil: timestamp('locked_until'),
  lastLoginAt: timestamp('last_login_at'),
  lastLoginIP: inet('last_login_ip'),
  riskScore: real('risk_score').default(0).notNull(),
  updatedAt: timestamp('updated_at').defaultNow().notNull(),
});

export type ActiveSession = typeof activeSessions.$inferSelect;
export type NewActiveSession = typeof activeSessions.$inferInsert;
export type AuthAttempt = typeof authAttempts.$inferSelect;
export type NewAuthAttempt = typeof authAttempts.$inferInsert;
export type RateLimitEntry = typeof rateLimitTracking.$inferSelect;
export type NewRateLimitEntry = typeof rateLimitTracking.$inferInsert;
export type UserAuthCacheEntry = typeof userAuthCache.$inferSelect;
export type NewUserAuthCacheEntry = typeof userAuthCache.$inferInsert;
