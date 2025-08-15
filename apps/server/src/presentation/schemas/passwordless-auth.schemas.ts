/**
 * Passwordless Authentication API Validation Schemas
 * Zod schemas for request/response validation in passwordless authentication endpoints
 */

import { z } from 'zod';
import { DeviceInfoSchema } from './auth.schemas';

// Passwordless Authentication Initiation Schema
export const InitiatePasswordlessAuthSchema = z.object({
  email: z.string().email('Invalid email format'),
  deviceInfo: DeviceInfoSchema,
  origin: z.string().url('Invalid origin URL'),
  userAgent: z.string().optional(),
  ipAddress: z.string().optional(),
});

// Magic Link Schemas
export const MagicLinkRequestSchema = z.object({
  email: z.string().email('Invalid email format'),
  redirectUrl: z.string().url('Invalid redirect URL').optional(),
  deviceInfo: DeviceInfoSchema,
  ipAddress: z.string().optional(),
});

export const VerifyMagicLinkSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  deviceInfo: DeviceInfoSchema,
  ipAddress: z.string().optional(),
});

// WebAuthn Schemas
export const WebAuthnRegistrationSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  credentialName: z.string().min(1, 'Credential name is required'),
  deviceInfo: DeviceInfoSchema,
  origin: z.string().url('Invalid origin URL'),
});

export const CompleteWebAuthnRegistrationSchema = z.object({
  challengeId: z.string().min(1, 'Challenge ID is required'),
  registrationResponse: z.any(), // WebAuthn registration response object
  deviceInfo: DeviceInfoSchema,
});

export const WebAuthnAuthenticationSchema = z.object({
  challengeId: z.string().min(1, 'Challenge ID is required'),
  authenticationResponse: z.any(), // WebAuthn authentication response object
  deviceInfo: DeviceInfoSchema,
});

// Biometric Authentication Schema
export const BiometricAuthSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  biometricType: z.enum(['fingerprint', 'face', 'voice'], {
    errorMap: () => ({
      message: 'Biometric type must be fingerprint, face, or voice',
    }),
  }),
  deviceInfo: DeviceInfoSchema,
  origin: z.string().url('Invalid origin URL'),
});

// Device Management Schemas
export const DeviceQuerySchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
});

export const RemoveDeviceSchema = z.object({
  userId: z.string().min(1, 'User ID is required'),
  deviceId: z.string().min(1, 'Device ID is required'),
});

// Fallback Authentication Schemas
export const FallbackAuthSchema = z.object({
  email: z.string().email('Invalid email format'),
  method: z.enum(
    ['email_code', 'password_reset', 'account_recovery', 'support_contact'],
    {
      errorMap: () => ({ message: 'Invalid fallback method' }),
    }
  ),
  deviceInfo: DeviceInfoSchema,
  ipAddress: z.string().optional(),
  reason: z.string().optional(),
});

export const FallbackMethodsQuerySchema = z.object({
  email: z.string().email('Invalid email format'),
});

// Response Schemas
export const PasswordlessAuthResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      challengeId: z.string().optional(),
      webAuthnOptions: z.any().optional(),
      magicLinkSent: z.boolean().optional(),
      fallbackMethods: z.array(z.string()).optional(),
      requiresRegistration: z.boolean().optional(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  correlationId: z.string().optional(),
});

export const MagicLinkResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      linkSent: z.boolean(),
      expiresAt: z.string(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const MagicLinkVerificationResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string().nullable(),
        emailVerified: z.string(),
      }),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const WebAuthnRegistrationResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      registrationOptions: z.any(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const WebAuthnRegistrationCompletionResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      credentialId: z.string(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const WebAuthnAuthenticationResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      user: z.object({
        id: z.string(),
        email: z.string(),
        name: z.string().nullable(),
        emailVerified: z.string(),
      }),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const BiometricAuthResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      biometricChallenge: z.any(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
  fallbackRequired: z.boolean().optional(),
});

export const DevicesResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      devices: z.array(
        z.object({
          id: z.string(),
          deviceName: z.string(),
          deviceType: z.string(),
          platform: z.string(),
          browser: z.string(),
          trusted: z.boolean(),
          registeredAt: z.string(),
          lastUsedAt: z.string(),
          riskScore: z.number().min(0).max(100),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const FallbackAuthResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      method: z.string(),
      challengeId: z.string(),
      nextSteps: z.array(z.string()),
      estimatedTime: z.string(),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

export const FallbackMethodsResponseSchema = z.object({
  success: z.boolean(),
  data: z
    .object({
      methods: z.array(z.string()),
      recommendations: z.array(z.string()),
    })
    .optional(),
  error: z.string().optional(),
  message: z.string().optional(),
});

// Type exports
export type InitiatePasswordlessAuth = z.infer<
  typeof InitiatePasswordlessAuthSchema
>;
export type MagicLinkRequest = z.infer<typeof MagicLinkRequestSchema>;
export type VerifyMagicLink = z.infer<typeof VerifyMagicLinkSchema>;
export type WebAuthnRegistration = z.infer<typeof WebAuthnRegistrationSchema>;
export type CompleteWebAuthnRegistration = z.infer<
  typeof CompleteWebAuthnRegistrationSchema
>;
export type WebAuthnAuthentication = z.infer<
  typeof WebAuthnAuthenticationSchema
>;
export type BiometricAuth = z.infer<typeof BiometricAuthSchema>;
export type DeviceQuery = z.infer<typeof DeviceQuerySchema>;
export type RemoveDevice = z.infer<typeof RemoveDeviceSchema>;
export type FallbackAuth = z.infer<typeof FallbackAuthSchema>;
export type FallbackMethodsQuery = z.infer<typeof FallbackMethodsQuerySchema>;
export type PasswordlessAuthResponse = z.infer<
  typeof PasswordlessAuthResponseSchema
>;
export type MagicLinkResponse = z.infer<typeof MagicLinkResponseSchema>;
export type MagicLinkVerificationResponse = z.infer<
  typeof MagicLinkVerificationResponseSchema
>;
export type WebAuthnRegistrationResponse = z.infer<
  typeof WebAuthnRegistrationResponseSchema
>;
export type WebAuthnRegistrationCompletionResponse = z.infer<
  typeof WebAuthnRegistrationCompletionResponseSchema
>;
export type WebAuthnAuthenticationResponse = z.infer<
  typeof WebAuthnAuthenticationResponseSchema
>;
export type BiometricAuthResponse = z.infer<typeof BiometricAuthResponseSchema>;
export type DevicesResponse = z.infer<typeof DevicesResponseSchema>;
export type FallbackAuthResponse = z.infer<typeof FallbackAuthResponseSchema>;
export type FallbackMethodsResponse = z.infer<
  typeof FallbackMethodsResponseSchema
>;
