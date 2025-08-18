/**
 * Passwordless Authentication Example
 * Demonstrates how to use the passwordless authentication system
 */

import { EmailMFAService, WebAuthnService } from '@company/auth';
import { Logger } from 'winston';
import { DeviceManagementService } from '../application/services/device-management.service';
import { FallbackAuthService } from '../application/services/fallback-auth.service';
import { MFAService } from '../application/services/mfa.service';
import { PasswordlessAuthService } from '../application/services/passwordless-auth.service';
import { DeviceInfo } from '../domain/entities/user';
import { MFAChallengeRepository } from '../infrastructure/database/repositories/mfa-challenge.repository';
import { PrismaUserRepository } from '../infrastructure/database/repositories/prisma-user-repository';

// Mock logger for example
const logger: Logger = {
  info: (message: string, meta?: any) =>
    console.log(`[INFO] ${message}`, meta || ''),
  error: (message: string, meta?: any) =>
    console.error(`[ERROR] ${message}`, meta || ''),
  warn: (message: string, meta?: any) =>
    console.warn(`[WARN] ${message}`, meta || ''),
  debug: (message: string, meta?: any) =>
    console.debug(`[DEBUG] ${message}`, meta || ''),
} as any;

// Example device information
const exampleDeviceInfo: DeviceInfo = {
  fingerprint: 'fp_1234567890abcdef',
  userAgent:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36',
  platform: 'Windows',
  browser: 'Chrome',
  version: '91.0.4472.124',
  isMobile: false,
  screenResolution: '1920x1080',
  timezone: 'America/New_York',
};

/**
 * Example: Complete Passwordless Authentication Flow
 */
async function demonstratePasswordlessAuthFlow() {
  console.log('\n=== Passwordless Authentication Flow Example ===\n');

  // Initialize services (in real app, these would be injected)
  const userRepository = new PrismaUserRepository({} as any, logger);
  const challengeRepository = new MFAChallengeRepository({} as any, logger);
  const webAuthnService = new WebAuthnService(
    {
      rpName: 'Enterprise Auth Demo',
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    },
    logger
  );
  const emailService = new EmailMFAService(
    {
      smtpHost: 'localhost',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'demo@example.com',
      smtpPassword: 'password',
      fromEmail: 'noreply@example.com',
      serviceName: 'Enterprise Auth Demo',
    },
    logger
  );

  const passwordlessAuthService = new PasswordlessAuthService(
    userRepository,
    challengeRepository,
    webAuthnService,
    emailService,
    logger
  );

  const fallbackAuthService = new FallbackAuthService(
    userRepository,
    challengeRepository,
    {} as MFAService, // Would be properly initialized
    emailService,
    logger
  );

  try {
    // Step 1: Initiate passwordless authentication
    console.log('1. Initiating passwordless authentication...');
    const authRequest = {
      email: 'user@example.com',
      deviceInfo: exampleDeviceInfo,
      origin: 'http://localhost:3000',
      ipAddress: '192.168.1.100',
    };

    const authResult =
      await passwordlessAuthService.initiatePasswordlessAuth(authRequest);
    console.log('Auth initiation result:', {
      success: authResult.success,
      challengeId: authResult.challengeId,
      webAuthnOptions: !!authResult.webAuthnOptions,
      magicLinkSent: authResult.magicLinkSent,
      fallbackMethods: authResult.fallbackMethods,
      requiresRegistration: authResult.requiresRegistration,
    });

    if (authResult.webAuthnOptions) {
      // Step 2a: WebAuthn Authentication Flow
      console.log('\n2a. WebAuthn authentication flow...');

      // In a real application, the client would:
      // 1. Call navigator.credentials.get() with the options
      // 2. Send the response back to the server

      const mockWebAuthnResponse = {
        id: 'credential-123',
        response: {
          authenticatorData: 'mock-auth-data',
          clientDataJSON: 'mock-client-data',
          signature: 'mock-signature',
        },
      };

      const webAuthnResult =
        await passwordlessAuthService.authenticateWithWebAuthn(
          authResult.challengeId!,
          mockWebAuthnResponse,
          exampleDeviceInfo
        );

      console.log('WebAuthn authentication result:', {
        success: webAuthnResult.success,
        userId: webAuthnResult.user?.id,
        error: webAuthnResult.error?.code,
      });
    }

    if (authResult.magicLinkSent) {
      // Step 2b: Magic Link Authentication Flow
      console.log('\n2b. Magic link authentication flow...');

      // In a real application, the user would click the magic link
      // which contains a token that gets verified
      const mockMagicToken = 'magic_token_123456789';

      const magicLinkResult = await passwordlessAuthService.verifyMagicLink(
        mockMagicToken,
        exampleDeviceInfo,
        '192.168.1.100'
      );

      console.log('Magic link verification result:', {
        success: magicLinkResult.success,
        userId: magicLinkResult.user?.id,
        error: magicLinkResult.error?.code,
      });
    }

    // Step 3: Fallback Authentication (if needed)
    if (authResult.fallbackMethods && authResult.fallbackMethods.length > 0) {
      console.log('\n3. Demonstrating fallback authentication...');

      const fallbackRequest = {
        email: 'user@example.com',
        method: 'email_code' as const,
        deviceInfo: exampleDeviceInfo,
        ipAddress: '192.168.1.100',
        reason: 'WebAuthn not available',
      };

      const fallbackResult =
        await fallbackAuthService.initiateFallbackAuth(fallbackRequest);
      console.log('Fallback authentication result:', {
        success: fallbackResult.success,
        method: fallbackResult.method,
        challengeId: fallbackResult.challengeId,
        nextSteps: fallbackResult.nextSteps,
        estimatedTime: fallbackResult.estimatedTime,
      });
    }
  } catch (error) {
    console.error('Error in passwordless auth flow:', error);
  }
}

/**
 * Example: WebAuthn Credential Registration
 */
async function demonstrateWebAuthnRegistration() {
  console.log('\n=== WebAuthn Credential Registration Example ===\n');

  // Initialize services
  const userRepository = new PrismaUserRepository({} as any, logger);
  const challengeRepository = new MFAChallengeRepository({} as any, logger);
  const webAuthnService = new WebAuthnService(
    {
      rpName: 'Enterprise Auth Demo',
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    },
    logger
  );
  const emailService = new EmailMFAService(
    {
      smtpHost: 'localhost',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'demo@example.com',
      smtpPassword: 'password',
      fromEmail: 'noreply@example.com',
    },
    logger
  );

  const passwordlessAuthService = new PasswordlessAuthService(
    userRepository,
    challengeRepository,
    webAuthnService,
    emailService,
    logger
  );

  try {
    // Step 1: Start WebAuthn registration
    console.log('1. Starting WebAuthn credential registration...');
    const registrationRequest = {
      userId: 'user-123',
      credentialName: 'My Security Key',
      deviceInfo: exampleDeviceInfo,
      origin: 'http://localhost:3000',
    };

    const registrationResult =
      await passwordlessAuthService.registerWebAuthnCredential(
        registrationRequest
      );
    console.log('Registration initiation result:', {
      success: registrationResult.success,
      hasOptions: !!registrationResult.registrationOptions,
      error: registrationResult.error?.code,
    });

    if (registrationResult.success && registrationResult.registrationOptions) {
      // Step 2: Complete WebAuthn registration
      console.log('\n2. Completing WebAuthn credential registration...');

      // In a real application, the client would:
      // 1. Call navigator.credentials.create() with the options
      // 2. Send the response back to the server

      const mockRegistrationResponse = {
        id: 'new-credential-123',
        response: {
          attestationObject: 'mock-attestation-object',
          clientDataJSON: 'mock-client-data-json',
        },
      };

      const completionResult =
        await passwordlessAuthService.completeWebAuthnRegistration(
          'challenge-id-from-step-1',
          mockRegistrationResponse,
          exampleDeviceInfo
        );

      console.log('Registration completion result:', {
        success: completionResult.success,
        credentialId: completionResult.credentialId,
        error: completionResult.error?.code,
      });
    }
  } catch (error) {
    console.error('Error in WebAuthn registration:', error);
  }
}

/**
 * Example: Device Management
 */
async function demonstrateDeviceManagement() {
  console.log('\n=== Device Management Example ===\n');

  // Initialize services
  const webAuthnService = new WebAuthnService(
    {
      rpName: 'Enterprise Auth Demo',
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    },
    logger
  );

  const deviceManagementService = new DeviceManagementService(
    webAuthnService,
    logger
  );

  try {
    const userId = 'user-123';

    // Step 1: Register a device
    console.log('1. Registering a device...');
    const deviceRegistrationRequest = {
      userId,
      deviceInfo: exampleDeviceInfo,
      deviceName: 'My Windows PC',
      ipAddress: '192.168.1.100',
      location: 'New York, NY',
      webAuthnCredentialId: 'credential-123',
    };

    const registrationResult = await deviceManagementService.registerDevice(
      deviceRegistrationRequest
    );
    console.log('Device registration result:', {
      success: registrationResult.success,
      deviceId: registrationResult.deviceId,
      trustScore: registrationResult.trustScore,
      error: registrationResult.error,
    });

    // Step 2: Get user's devices
    console.log('\n2. Getting user devices...');
    const devices = await deviceManagementService.getUserDevices(userId);
    console.log(
      'User devices:',
      devices.map((device) => ({
        id: device.id,
        name: device.deviceName,
        type: device.deviceType,
        trusted: device.trusted,
        riskScore: device.riskScore,
        lastUsed: device.lastUsedAt,
      }))
    );

    // Step 3: Assess device trust
    if (devices.length > 0 && devices[0]) {
      console.log('\n3. Assessing device trust...');
      const trustAssessment = await deviceManagementService.assessDeviceTrust(
        devices[0].id
      );
      console.log('Trust assessment:', {
        deviceId: trustAssessment.deviceId,
        trustScore: trustAssessment.trustScore,
        trusted: trustAssessment.trusted,
        riskFactors: trustAssessment.riskFactors,
        recommendations: trustAssessment.recommendations,
      });
    }

    // Step 4: Record authentication attempt
    if (devices.length > 0 && devices[0]) {
      console.log('\n4. Recording authentication attempt...');
      await deviceManagementService.recordAuthenticationAttempt({
        deviceId: devices[0].id,
        userId,
        success: true,
        timestamp: new Date(),
        ipAddress: '192.168.1.100',
        location: 'New York, NY',
        riskScore: 15,
      });
      console.log('Authentication attempt recorded successfully');
    }
  } catch (error) {
    console.error('Error in device management:', error);
  }
}

/**
 * Example: Biometric Authentication
 */
async function demonstrateBiometricAuth() {
  console.log('\n=== Biometric Authentication Example ===\n');

  // Initialize services
  const userRepository = new PrismaUserRepository({} as any, logger);
  const challengeRepository = new MFAChallengeRepository({} as any, logger);
  const webAuthnService = new WebAuthnService(
    {
      rpName: 'Enterprise Auth Demo',
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    },
    logger
  );
  const emailService = new EmailMFAService(
    {
      smtpHost: 'localhost',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'demo@example.com',
      smtpPassword: 'password',
      fromEmail: 'noreply@example.com',
    },
    logger
  );

  const passwordlessAuthService = new PasswordlessAuthService(
    userRepository,
    challengeRepository,
    webAuthnService,
    emailService,
    logger
  );

  try {
    // Step 1: Initiate biometric authentication
    console.log('1. Initiating biometric authentication...');
    const biometricRequest = {
      userId: 'user-123',
      biometricType: 'fingerprint' as const,
      deviceInfo: exampleDeviceInfo,
      origin: 'http://localhost:3000',
    };

    const biometricResult =
      await passwordlessAuthService.initiateBiometricAuth(biometricRequest);
    console.log('Biometric authentication result:', {
      success: biometricResult.success,
      hasBiometricChallenge: !!biometricResult.biometricChallenge,
      fallbackRequired: biometricResult.fallbackRequired,
      error: biometricResult.error?.code,
    });

    if (biometricResult.success && biometricResult.biometricChallenge) {
      console.log('Biometric challenge details:', {
        challengeId: biometricResult.biometricChallenge.challengeId,
        biometricType: biometricResult.biometricChallenge.biometricType,
        hasOptions: !!biometricResult.biometricChallenge.options,
      });
    }
  } catch (error) {
    console.error('Error in biometric authentication:', error);
  }
}

/**
 * Example: Magic Link Authentication
 */
async function demonstrateMagicLinkAuth() {
  console.log('\n=== Magic Link Authentication Example ===\n');

  // Initialize services
  const userRepository = new PrismaUserRepository({} as any, logger);
  const challengeRepository = new MFAChallengeRepository({} as any, logger);
  const webAuthnService = new WebAuthnService(
    {
      rpName: 'Enterprise Auth Demo',
      rpID: 'localhost',
      origin: 'http://localhost:3000',
    },
    logger
  );
  const emailService = new EmailMFAService(
    {
      smtpHost: 'localhost',
      smtpPort: 587,
      smtpSecure: false,
      smtpUser: 'demo@example.com',
      smtpPassword: 'password',
      fromEmail: 'noreply@example.com',
    },
    logger
  );

  const passwordlessAuthService = new PasswordlessAuthService(
    userRepository,
    challengeRepository,
    webAuthnService,
    emailService,
    logger
  );

  try {
    // Step 1: Send magic link
    console.log('1. Sending magic link...');
    const magicLinkRequest = {
      email: 'user@example.com',
      redirectUrl: 'http://localhost:3000/dashboard',
      deviceInfo: exampleDeviceInfo,
      ipAddress: '192.168.1.100',
    };

    const magicLinkResult =
      await passwordlessAuthService.sendMagicLink(magicLinkRequest);
    console.log('Magic link send result:', {
      success: magicLinkResult.success,
      linkSent: magicLinkResult.linkSent,
      expiresAt: magicLinkResult.expiresAt,
      error: magicLinkResult.error?.code,
    });

    // Step 2: Verify magic link (simulated)
    if (magicLinkResult.success) {
      console.log('\n2. Verifying magic link...');

      // In a real application, this token would come from the email link
      const mockMagicToken = 'magic_link_token_123456789';

      const verificationResult = await passwordlessAuthService.verifyMagicLink(
        mockMagicToken,
        exampleDeviceInfo,
        '192.168.1.100'
      );

      console.log('Magic link verification result:', {
        success: verificationResult.success,
        userId: verificationResult.user?.id,
        userEmail: verificationResult.user?.email,
        error: verificationResult.error?.code,
      });
    }
  } catch (error) {
    console.error('Error in magic link authentication:', error);
  }
}

/**
 * Run all examples
 */
async function runAllExamples() {
  console.log('🚀 Starting Passwordless Authentication Examples\n');

  await demonstratePasswordlessAuthFlow();
  await demonstrateWebAuthnRegistration();
  await demonstrateDeviceManagement();
  await demonstrateBiometricAuth();
  await demonstrateMagicLinkAuth();

  console.log('\n✅ All examples completed!');
}

// Export functions for use in other files
export {
  demonstrateBiometricAuth,
  demonstrateDeviceManagement,
  demonstrateMagicLinkAuth,
  demonstratePasswordlessAuthFlow,
  demonstrateWebAuthnRegistration,
  runAllExamples,
};

// Run examples if this file is executed directly
if (require.main === module) {
  runAllExamples().catch(console.error);
}
