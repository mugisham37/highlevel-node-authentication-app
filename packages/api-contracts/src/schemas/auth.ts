import { z } from 'zod';

/**
 * Login credentials schema
 */
export const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(1, 'Password is required'),
  rememberMe: z.boolean().default(false),
  deviceFingerprint: z.string().optional(),
});

/**
 * Registration schema
 */
export const registerSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
  firstName: z.string().min(1, 'First name is required').max(50),
  lastName: z.string().min(1, 'Last name is required').max(50),
  acceptTerms: z.boolean().refine((val) => val === true, {
    message: 'You must accept the terms and conditions',
  }),
});

/**
 * Password reset request schema
 */
export const passwordResetRequestSchema = z.object({
  email: z.string().email('Invalid email address'),
});

/**
 * Password reset schema
 */
export const passwordResetSchema = z.object({
  token: z.string().min(1, 'Reset token is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

/**
 * Email verification schema
 */
export const emailVerificationSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

/**
 * MFA setup schema
 */
export const mfaSetupSchema = z.object({
  method: z.enum(['totp', 'sms', 'email']),
  phoneNumber: z.string().optional(),
});

/**
 * MFA verification schema
 */
export const mfaVerificationSchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits'),
  method: z.enum(['totp', 'sms', 'email']),
});

/**
 * Change password schema
 */
export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .regex(
      /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[@$!%*?&])[A-Za-z\d@$!%*?&]/,
      'Password must contain at least one uppercase letter, one lowercase letter, one number, and one special character'
    ),
});

/**
 * OAuth callback schema
 */
export const oauthCallbackSchema = z.object({
  provider: z.enum(['google', 'github', 'microsoft']),
  code: z.string().min(1, 'Authorization code is required'),
  state: z.string().optional(),
});

/**
 * Refresh token schema
 */
export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

/**
 * Authentication response schema
 */
export const authResponseSchema = z.object({
  user: z.object({
    id: z.string(),
    email: z.string().email(),
    firstName: z.string(),
    lastName: z.string(),
    avatar: z.string().url().optional(),
    emailVerified: z.boolean(),
    mfaEnabled: z.boolean(),
    roles: z.array(z.string()),
  }),
  tokens: z.object({
    accessToken: z.string(),
    refreshToken: z.string(),
    expiresIn: z.number(),
    tokenType: z.literal('Bearer'),
  }),
  session: z.object({
    id: z.string(),
    expiresAt: z.string().datetime(),
  }),
});

/**
 * Session info schema
 */
export const sessionInfoSchema = z.object({
  id: z.string(),
  userId: z.string(),
  deviceInfo: z.object({
    userAgent: z.string(),
    ip: z.string(),
    fingerprint: z.string().optional(),
  }),
  isActive: z.boolean(),
  expiresAt: z.string().datetime(),
  createdAt: z.string().datetime(),
  lastAccessedAt: z.string().datetime(),
});

/**
 * Type exports
 */
export type LoginInput = z.infer<typeof loginSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type PasswordResetRequestInput = z.infer<typeof passwordResetRequestSchema>;
export type PasswordResetInput = z.infer<typeof passwordResetSchema>;
export type EmailVerificationInput = z.infer<typeof emailVerificationSchema>;
export type MfaSetupInput = z.infer<typeof mfaSetupSchema>;
export type MfaVerificationInput = z.infer<typeof mfaVerificationSchema>;
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
export type OAuthCallbackInput = z.infer<typeof oauthCallbackSchema>;
export type RefreshTokenInput = z.infer<typeof refreshTokenSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type SessionInfo = z.infer<typeof sessionInfoSchema>;