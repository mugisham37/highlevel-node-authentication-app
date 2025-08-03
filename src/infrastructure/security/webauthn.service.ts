/**
 * WebAuthn Service
 * Implements WebAuthn/FIDO2 support for hardware key authentication
 */

import {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
  VerifiedRegistrationResponse,
  VerifiedAuthenticationResponse,
} from '@simplewebauthn/server';
import type {
  RegistrationResponseJSON,
  AuthenticationResponseJSON,
  AuthenticatorDevice,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
} from '@simplewebauthn/types';
import { Logger } from 'winston';

export interface WebAuthnConfig {
  rpName: string;
  rpID: string;
  origin: string;
  expectedOrigin?: string[];
}

export interface WebAuthnCredential {
  id: string;
  userId: string;
  credentialId: string;
  publicKey: string;
  counter: number;
  name: string;
  createdAt: Date;
  lastUsed?: Date;
  deviceType?: string;
  backedUp?: boolean;
  transports?: string[];
}

export interface WebAuthnRegistrationRequest {
  userId: string;
  credentialName: string;
  challenge: string;
  origin: string;
}

export interface WebAuthnRegistrationResult {
  success: boolean;
  credentialId?: string;
  error?: string;
  details?: any;
}

export interface WebAuthnAuthenticationRequest {
  userId: string;
  credentialId: string;
  authenticatorData: string;
  clientDataJSON: string;
  signature: string;
  challenge?: string;
}

export interface WebAuthnAuthenticationResult {
  success: boolean;
  credentialId?: string;
  counter?: number;
  error?: string;
  details?: any;
}

export interface WebAuthnRegistrationOptions {
  challenge: string;
  rp: {
    name: string;
    id: string;
  };
  user: {
    id: string;
    name: string;
    displayName: string;
  };
  pubKeyCredParams: Array<{
    alg: number;
    type: 'public-key';
  }>;
  authenticatorSelection?: {
    authenticatorAttachment?: 'platform' | 'cross-platform';
    userVerification?: 'required' | 'preferred' | 'discouraged';
    residentKey?: 'required' | 'preferred' | 'discouraged';
  };
  attestation?: 'none' | 'indirect' | 'direct' | 'enterprise';
  excludeCredentials?: Array<{
    id: string;
    type: 'public-key';
    transports?: string[];
  }>;
  timeout?: number;
}

export class WebAuthnService {
  private config: WebAuthnConfig;
  private credentials: Map<string, WebAuthnCredential[]> = new Map();

  constructor(
    config: WebAuthnConfig,
    private logger: Logger
  ) {
    this.config = config;
  }

  /**
   * Generate registration options for WebAuthn credential creation
   */
  async generateRegistrationOptions(
    userId: string,
    userEmail: string,
    userName?: string
  ): Promise<{
    options: PublicKeyCredentialCreationOptionsJSON;
    challenge: string;
  }> {
    try {
      this.logger.info('Generating WebAuthn registration options', {
        userId,
        userEmail: this.maskEmail(userEmail),
      });

      // Get existing credentials to exclude them
      const existingCredentials = await this.getUserCredentials(userId);
      const excludeCredentials = existingCredentials.map((cred) => ({
        id: cred.credentialId,
        type: 'public-key' as const,
        transports: cred.transports as AuthenticatorTransport[],
      }));

      const options = await generateRegistrationOptions({
        rpName: this.config.rpName,
        rpID: this.config.rpID,
        userID: userId,
        userName: userEmail,
        userDisplayName: userName || userEmail,
        timeout: 60000, // 1 minute
        attestationType: 'none',
        excludeCredentials,
        authenticatorSelection: {
          authenticatorAttachment: 'cross-platform',
          userVerification: 'preferred',
          residentKey: 'preferred',
        },
        supportedAlgorithmIDs: [-7, -257], // ES256 and RS256
      });

      this.logger.info('WebAuthn registration options generated', {
        userId,
        challenge: options.challenge.substring(0, 10) + '...',
        timeout: options.timeout,
        excludeCredentialsCount: excludeCredentials.length,
      });

      return {
        options,
        challenge: options.challenge,
      };
    } catch (error) {
      this.logger.error('Failed to generate WebAuthn registration options', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to generate registration options');
    }
  }

  /**
   * Verify WebAuthn registration response
   */
  async verifyRegistrationResponse(
    userId: string,
    credentialName: string,
    response: RegistrationResponseJSON,
    expectedChallenge: string,
    expectedOrigin?: string
  ): Promise<WebAuthnRegistrationResult> {
    try {
      this.logger.info('Verifying WebAuthn registration response', {
        userId,
        credentialName,
        credentialId: response.id,
        expectedOrigin,
      });

      const verification = await verifyRegistrationResponse({
        response,
        expectedChallenge,
        expectedOrigin: expectedOrigin || this.config.origin,
        expectedRPID: this.config.rpID,
        requireUserVerification: false,
      });

      if (!verification.verified || !verification.registrationInfo) {
        this.logger.warn('WebAuthn registration verification failed', {
          userId,
          credentialId: response.id,
          verified: verification.verified,
        });

        return {
          success: false,
          error: 'Registration verification failed',
        };
      }

      const {
        credentialID,
        credentialPublicKey,
        counter,
        credentialDeviceType,
        credentialBackedUp,
      } = verification.registrationInfo;

      // Store the credential
      const credential: WebAuthnCredential = {
        id: this.generateCredentialId(),
        userId,
        credentialId: Buffer.from(credentialID).toString('base64url'),
        publicKey: Buffer.from(credentialPublicKey).toString('base64'),
        counter,
        name: credentialName,
        createdAt: new Date(),
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        transports: response.response.transports,
      };

      await this.storeCredential(credential);

      this.logger.info('WebAuthn registration successful', {
        userId,
        credentialId: credential.credentialId,
        credentialName,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
      });

      return {
        success: true,
        credentialId: credential.credentialId,
      };
    } catch (error) {
      this.logger.error('WebAuthn registration verification error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        credentialName,
      });

      return {
        success: false,
        error: 'Registration verification failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Generate authentication options for WebAuthn credential verification
   */
  async generateAuthenticationOptions(userId?: string): Promise<{
    options: PublicKeyCredentialRequestOptionsJSON;
    challenge: string;
  }> {
    try {
      this.logger.info('Generating WebAuthn authentication options', {
        userId,
      });

      let allowCredentials: Array<{
        id: string;
        type: 'public-key';
        transports?: AuthenticatorTransport[];
      }> = [];

      if (userId) {
        // Get user's credentials
        const userCredentials = await this.getUserCredentials(userId);
        allowCredentials = userCredentials.map((cred) => ({
          id: cred.credentialId,
          type: 'public-key' as const,
          transports: cred.transports as AuthenticatorTransport[],
        }));
      }

      const options = await generateAuthenticationOptions({
        timeout: 60000, // 1 minute
        allowCredentials:
          allowCredentials.length > 0 ? allowCredentials : undefined,
        userVerification: 'preferred',
        rpID: this.config.rpID,
      });

      this.logger.info('WebAuthn authentication options generated', {
        userId,
        challenge: options.challenge.substring(0, 10) + '...',
        allowCredentialsCount: allowCredentials.length,
      });

      return {
        options,
        challenge: options.challenge,
      };
    } catch (error) {
      this.logger.error('Failed to generate WebAuthn authentication options', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      throw new Error('Failed to generate authentication options');
    }
  }

  /**
   * Verify WebAuthn authentication response
   */
  async verifyAuthenticationResponse(
    response: AuthenticationResponseJSON,
    expectedChallenge: string,
    expectedOrigin?: string
  ): Promise<WebAuthnAuthenticationResult> {
    try {
      this.logger.info('Verifying WebAuthn authentication response', {
        credentialId: response.id,
        expectedOrigin,
      });

      // Find the credential
      const credential = await this.getCredentialById(response.id);
      if (!credential) {
        this.logger.warn('WebAuthn credential not found', {
          credentialId: response.id,
        });

        return {
          success: false,
          error: 'Credential not found',
        };
      }

      const authenticator: AuthenticatorDevice = {
        credentialID: Buffer.from(credential.credentialId, 'base64url'),
        credentialPublicKey: Buffer.from(credential.publicKey, 'base64'),
        counter: credential.counter,
        transports: credential.transports as AuthenticatorTransport[],
      };

      const verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: expectedOrigin || this.config.origin,
        expectedRPID: this.config.rpID,
        authenticator,
        requireUserVerification: false,
      });

      if (!verification.verified) {
        this.logger.warn('WebAuthn authentication verification failed', {
          credentialId: response.id,
          userId: credential.userId,
        });

        return {
          success: false,
          error: 'Authentication verification failed',
        };
      }

      // Update credential counter and last used timestamp
      await this.updateCredentialCounter(
        credential.id,
        verification.authenticationInfo.newCounter
      );

      this.logger.info('WebAuthn authentication successful', {
        credentialId: response.id,
        userId: credential.userId,
        newCounter: verification.authenticationInfo.newCounter,
      });

      return {
        success: true,
        credentialId: credential.credentialId,
        counter: verification.authenticationInfo.newCounter,
      };
    } catch (error) {
      this.logger.error('WebAuthn authentication verification error', {
        error: error instanceof Error ? error.message : 'Unknown error',
        credentialId: response.id,
      });

      return {
        success: false,
        error: 'Authentication verification failed',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Register a new WebAuthn credential
   */
  async registerCredential(
    request: WebAuthnRegistrationRequest
  ): Promise<WebAuthnRegistrationResult> {
    try {
      this.logger.info('Registering WebAuthn credential', {
        userId: request.userId,
        credentialName: request.credentialName,
        origin: request.origin,
      });

      // This is a simplified implementation
      // In a real scenario, you would handle the full registration flow
      const credentialId = this.generateCredentialId();

      const credential: WebAuthnCredential = {
        id: credentialId,
        userId: request.userId,
        credentialId: credentialId,
        publicKey: 'placeholder-public-key', // Would be actual public key
        counter: 0,
        name: request.credentialName,
        createdAt: new Date(),
      };

      await this.storeCredential(credential);

      return {
        success: true,
        credentialId,
      };
    } catch (error) {
      this.logger.error('WebAuthn credential registration failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId: request.userId,
      });

      return {
        success: false,
        error: 'Failed to register credential',
        details: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Get user's WebAuthn credentials
   */
  async getUserCredentials(userId: string): Promise<WebAuthnCredential[]> {
    try {
      const credentials = this.credentials.get(userId) || [];

      this.logger.debug('Retrieved user WebAuthn credentials', {
        userId,
        count: credentials.length,
      });

      return credentials;
    } catch (error) {
      this.logger.error('Failed to get user WebAuthn credentials', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return [];
    }
  }

  /**
   * Get credential by ID
   */
  async getCredentialById(
    credentialId: string
  ): Promise<WebAuthnCredential | null> {
    try {
      for (const [userId, credentials] of this.credentials.entries()) {
        const credential = credentials.find(
          (c) => c.credentialId === credentialId
        );
        if (credential) {
          return credential;
        }
      }
      return null;
    } catch (error) {
      this.logger.error('Failed to get WebAuthn credential by ID', {
        error: error instanceof Error ? error.message : 'Unknown error',
        credentialId,
      });
      return null;
    }
  }

  /**
   * Remove a WebAuthn credential
   */
  async removeCredential(
    userId: string,
    credentialId: string
  ): Promise<boolean> {
    try {
      const credentials = this.credentials.get(userId) || [];
      const index = credentials.findIndex(
        (c) => c.credentialId === credentialId
      );

      if (index === -1) {
        return false;
      }

      credentials.splice(index, 1);
      this.credentials.set(userId, credentials);

      this.logger.info('WebAuthn credential removed', {
        userId,
        credentialId,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to remove WebAuthn credential', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        credentialId,
      });
      return false;
    }
  }

  /**
   * Remove all credentials for a user
   */
  async removeAllCredentials(userId: string): Promise<number> {
    try {
      const credentials = this.credentials.get(userId) || [];
      const count = credentials.length;

      this.credentials.delete(userId);

      this.logger.info('All WebAuthn credentials removed for user', {
        userId,
        count,
      });

      return count;
    } catch (error) {
      this.logger.error('Failed to remove all WebAuthn credentials', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
      });
      return 0;
    }
  }

  /**
   * Update credential name
   */
  async updateCredentialName(
    userId: string,
    credentialId: string,
    newName: string
  ): Promise<boolean> {
    try {
      const credentials = this.credentials.get(userId) || [];
      const credential = credentials.find(
        (c) => c.credentialId === credentialId
      );

      if (!credential) {
        return false;
      }

      credential.name = newName;

      this.logger.info('WebAuthn credential name updated', {
        userId,
        credentialId,
        newName,
      });

      return true;
    } catch (error) {
      this.logger.error('Failed to update WebAuthn credential name', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userId,
        credentialId,
      });
      return false;
    }
  }

  /**
   * Store credential (in-memory for this implementation)
   */
  private async storeCredential(credential: WebAuthnCredential): Promise<void> {
    const userCredentials = this.credentials.get(credential.userId) || [];
    userCredentials.push(credential);
    this.credentials.set(credential.userId, userCredentials);
  }

  /**
   * Update credential counter
   */
  private async updateCredentialCounter(
    credentialId: string,
    newCounter: number
  ): Promise<void> {
    for (const [userId, credentials] of this.credentials.entries()) {
      const credential = credentials.find((c) => c.id === credentialId);
      if (credential) {
        credential.counter = newCounter;
        credential.lastUsed = new Date();
        break;
      }
    }
  }

  /**
   * Generate unique credential ID
   */
  private generateCredentialId(): string {
    return `cred_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Mask email for logging
   */
  private maskEmail(email: string): string {
    const [localPart, domain] = email.split('@');
    if (!domain) return email;

    const maskedLocal =
      localPart.length > 2
        ? localPart[0] +
          '*'.repeat(localPart.length - 2) +
          localPart[localPart.length - 1]
        : '*'.repeat(localPart.length);

    return `${maskedLocal}@${domain}`;
  }

  /**
   * Get WebAuthn service health status
   */
  async getServiceHealth(): Promise<{
    healthy: boolean;
    credentialsCount: number;
    error?: string;
  }> {
    try {
      let totalCredentials = 0;
      for (const credentials of this.credentials.values()) {
        totalCredentials += credentials.length;
      }

      return {
        healthy: true,
        credentialsCount: totalCredentials,
      };
    } catch (error) {
      this.logger.error('WebAuthn service health check failed', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        healthy: false,
        credentialsCount: 0,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}
