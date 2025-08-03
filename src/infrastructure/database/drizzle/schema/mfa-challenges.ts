import {
  pgTable,
  varchar,
  timestamp,
  integer,
  json,
  serial,
} from 'drizzle-orm/pg-core';

// MFA challenges for temporary storage of verification challenges
export const mfaChallenges = pgTable('mfa_challenges', {
  id: varchar('id', { length: 255 }).primaryKey(),
  type: varchar('type', { length: 20 }).notNull(), // 'totp', 'sms', 'email', 'webauthn'
  userId: varchar('user_id', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at').notNull(),
  attempts: integer('attempts').default(0).notNull(),
  maxAttempts: integer('max_attempts').default(3).notNull(),
  metadata: json('metadata'), // Store challenge-specific data
  createdAt: timestamp('created_at').defaultNow().notNull(),
});

export type MFAChallenge = typeof mfaChallenges.$inferSelect;
export type NewMFAChallenge = typeof mfaChallenges.$inferInsert;
