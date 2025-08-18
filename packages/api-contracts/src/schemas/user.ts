import { z } from 'zod';

/**
 * User profile update schema
 */
export const updateUserProfileSchema = z.object({
  firstName: z.string().min(1, 'First name is required').max(50).optional(),
  lastName: z.string().min(1, 'Last name is required').max(50).optional(),
  avatar: z.string().url('Invalid avatar URL').optional(),
  phoneNumber: z.string().regex(/^\+?[1-9]\d{1,14}$/, 'Invalid phone number').optional(),
  timezone: z.string().optional(),
  locale: z.string().optional(),
});

/**
 * User preferences schema
 */
export const updateUserPreferencesSchema = z.object({
  theme: z.enum(['light', 'dark', 'system']).optional(),
  language: z.string().optional(),
  notifications: z.object({
    email: z.boolean().optional(),
    push: z.boolean().optional(),
    sms: z.boolean().optional(),
  }).optional(),
  privacy: z.object({
    profileVisibility: z.enum(['public', 'private', 'friends']).optional(),
    showOnlineStatus: z.boolean().optional(),
  }).optional(),
});

/**
 * User security settings schema
 */
export const updateSecuritySettingsSchema = z.object({
  twoFactorEnabled: z.boolean().optional(),
  loginNotifications: z.boolean().optional(),
  sessionTimeout: z.number().int().positive().optional(),
});

/**
 * Get user sessions schema
 */
export const getUserSessionsSchema = z.object({
  includeInactive: z.boolean().default(false),
});

/**
 * Terminate session schema
 */
export const terminateSessionSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
});

/**
 * Terminate all sessions schema
 */
export const terminateAllSessionsSchema = z.object({
  excludeCurrent: z.boolean().default(true),
});

/**
 * User search schema
 */
export const searchUsersSchema = z.object({
  query: z.string().min(1, 'Search query is required').max(100),
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(50).default(20),
  filters: z.object({
    role: z.string().optional(),
    status: z.enum(['active', 'inactive', 'suspended']).optional(),
    emailVerified: z.boolean().optional(),
    mfaEnabled: z.boolean().optional(),
  }).optional(),
});

/**
 * User activity log schema
 */
export const getUserActivitySchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  activityType: z.enum(['login', 'logout', 'profile_update', 'password_change', 'mfa_setup']).optional(),
});

/**
 * Delete user account schema
 */
export const deleteUserAccountSchema = z.object({
  password: z.string().min(1, 'Password is required for account deletion'),
  reason: z.string().max(500).optional(),
});

/**
 * User response schema
 */
export const userResponseSchema = z.object({
  id: z.string(),
  email: z.string().email(),
  firstName: z.string(),
  lastName: z.string(),
  avatar: z.string().url().optional(),
  phoneNumber: z.string().optional(),
  timezone: z.string(),
  locale: z.string(),
  emailVerified: z.boolean(),
  phoneVerified: z.boolean(),
  mfaEnabled: z.boolean(),
  status: z.enum(['active', 'inactive', 'suspended']),
  roles: z.array(z.string()),
  preferences: z.object({
    theme: z.enum(['light', 'dark', 'system']),
    language: z.string(),
    notifications: z.object({
      email: z.boolean(),
      push: z.boolean(),
      sms: z.boolean(),
    }),
    privacy: z.object({
      profileVisibility: z.enum(['public', 'private', 'friends']),
      showOnlineStatus: z.boolean(),
    }),
  }),
  security: z.object({
    twoFactorEnabled: z.boolean(),
    loginNotifications: z.boolean(),
    sessionTimeout: z.number(),
    passwordLastChanged: z.string().datetime(),
    lastLoginAt: z.string().datetime().optional(),
  }),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});

/**
 * User activity log entry schema
 */
export const userActivityLogSchema = z.object({
  id: z.string(),
  userId: z.string(),
  activityType: z.string(),
  description: z.string(),
  ipAddress: z.string(),
  userAgent: z.string(),
  metadata: z.record(z.string(), z.any()).optional(),
  createdAt: z.string().datetime(),
});

/**
 * Type exports
 */
export type UpdateUserProfileInput = z.infer<typeof updateUserProfileSchema>;
export type UpdateUserPreferencesInput = z.infer<typeof updateUserPreferencesSchema>;
export type UpdateSecuritySettingsInput = z.infer<typeof updateSecuritySettingsSchema>;
export type GetUserSessionsInput = z.infer<typeof getUserSessionsSchema>;
export type TerminateSessionInput = z.infer<typeof terminateSessionSchema>;
export type TerminateAllSessionsInput = z.infer<typeof terminateAllSessionsSchema>;
export type SearchUsersInput = z.infer<typeof searchUsersSchema>;
export type GetUserActivityInput = z.infer<typeof getUserActivitySchema>;
export type DeleteUserAccountInput = z.infer<typeof deleteUserAccountSchema>;
export type UserResponse = z.infer<typeof userResponseSchema>;
export type UserActivityLog = z.infer<typeof userActivityLogSchema>;