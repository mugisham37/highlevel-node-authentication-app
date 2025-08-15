/**
 * Authentication API Validation Schemas
 * Zod schemas for request/response validation in authentication endpoints
 */

import { z } from 'zod';

// Device Info Schema
export const DeviceInfoSchema = z.object({
  fingerprint: z.string().min(1),
  userAgent: z.string().min(1),
  platform: z.string().optional(),
  browser: z.string().optional(),
  version: z.string().optional(),
  isMobile: z.boolean(),
  mobile: z.boolean().optional(), // For backward compatibility
  screenResolution: z.string().optional(),
  timezone: z.string().optional(),
  language: z.string().optional(),
});

// Authentication Schemas
export const LoginRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  deviceInfo: DeviceInfoSchema,
  rememberMe: z.boolean().optional().default(false),
});

export const RefreshTokenRequestSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
  deviceInfo: DeviceInfoSchema,
});

export const LogoutRequestSchema = z.object({
  sessionId: z.string().optional(),
  allSessions: z.boolean().optional().default(false),
});

export const PasswordResetRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
});

export const PasswordResetConfirmSchema = z
  .object({
    token: z.string().min(1, 'Reset token is required'),
    password: z.string().min(8, 'Password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Password confirmation is required'),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

export const ChangePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z
      .string()
      .min(8, 'New password must be at least 8 characters'),
    confirmPassword: z.string().min(8, 'Password confirmation is required'),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Passwords don't match",
    path: ['confirmPassword'],
  });

// MFA Schemas
export const MFASetupRequestSchema = z.object({
  type: z.enum(['totp', 'sms', 'email'], {
    errorMap: () => ({ message: 'MFA type must be totp, sms, or email' }),
  }),
  phoneNumber: z.string().optional(),
});

export const MFAVerifyRequestSchema = z.object({
  code: z.string().length(6, 'MFA code must be 6 digits'),
  type: z.enum(['totp', 'sms', 'email']),
  backupCode: z.boolean().optional().default(false),
});

export const MFAChallengeRequestSchema = z.object({
  sessionId: z.string().min(1, 'Session ID is required'),
  code: z.string().length(6, 'MFA code must be 6 digits'),
  type: z.enum(['totp', 'sms', 'email']),
});

// Response Schemas
export const AuthResponseSchema = z.object({
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
          lastLoginAt: z.string().nullable(),
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
      session: z
        .object({
          id: z.string(),
          expiresAt: z.string(),
          deviceInfo: DeviceInfoSchema,
        })
        .optional(),
      requiresMFA: z.boolean().optional(),
      mfaChallenge: z
        .object({
          challengeId: z.string(),
          type: z.enum(['totp', 'sms', 'email']),
          expiresAt: z.string(),
        })
        .optional(),
      riskScore: z.number().min(0).max(100),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  success: z.literal(false),
  error: z.string(),
  message: z.string(),
  details: z
    .array(
      z.object({
        field: z.string(),
        message: z.string(),
      })
    )
    .optional(),
  correlationId: z.string().optional(),
});

// Type exports
export type LoginRequest = z.infer<typeof LoginRequestSchema>;
export type RefreshTokenRequest = z.infer<typeof RefreshTokenRequestSchema>;
export type LogoutRequest = z.infer<typeof LogoutRequestSchema>;
export type PasswordResetRequest = z.infer<typeof PasswordResetRequestSchema>;
export type PasswordResetConfirm = z.infer<typeof PasswordResetConfirmSchema>;
export type ChangePassword = z.infer<typeof ChangePasswordSchema>;
export type MFASetupRequest = z.infer<typeof MFASetupRequestSchema>;
export type MFAVerifyRequest = z.infer<typeof MFAVerifyRequestSchema>;
export type MFAChallengeRequest = z.infer<typeof MFAChallengeRequestSchema>;
export type AuthResponse = z.infer<typeof AuthResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type DeviceInfo = z.infer<typeof DeviceInfoSchema>;
