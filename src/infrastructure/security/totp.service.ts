/**
 * TOTP (Time-based One-Time Password) Service
 * Implements TOTP generation and verification using speakeasy
 */

import * as speakeasy from 'speakeasy';
import * as QRCode from 'qrcode';
import { Logger } from 'winston';

export interface TOTPSetup {
  secret: string;
  qrCodeUrl?: string;
  manualEntryKey: string;
  backupCodes?: string[];
}

export interface TOTPVerificationResult {
  valid: boolean;
  delta?: number;
  error?: string;
}

export class TOTPService {
  constructor(private readonly logger: Logger) {}

  /**
   * Generate a new TOTP secret and setup information
   */
  async generateSecret(
    userEmail: string,
    serviceName: string = 'Enterprise Auth',
    issuer: string = 'Enterprise Auth Backend'
  ): Promise<TOTPSetup> {
    try {
      this.logger.info('Generating TOTP secret', {
        userEmail,
        serviceName,
        issuer,
      });

      // Generate secret
      const secret = speakeasy.generateSecret({
        name: `${serviceName} (${userEmail})`,
        issuer: issuer,
        length: 32, // 256-bit secret for enhanced security
      });

      if (!secret.base32) {
        throw new Error('Failed to generate TOTP secret');
      }

      // Generate QR code URL
      const qrCodeUrl = await this.generateQRCode(secret.otpauth_url!);

      this.logger.info('TOTP secret generated successfully', {
        userEmail,
        hasQrCode: !!qrCodeUrl,
        secretLength: secret.base32.length,
      });

      return {
        secret: secret.base32,
        qrCodeUrl,
        manualEntryKey: secret.base32,
      };
    } catch (error) {
      this.logger.error('Failed to generate TOTP secret', {
        error: error instanceof Error ? error.message : 'Unknown error',
        userEmail,
      });
      throw new Error('Failed to generate TOTP secret');
    }
  }

  /**
   * Verify a TOTP token
   */
  async verifyToken(
    secret: string,
    token: string,
    window: number = 2
  ): Promise<TOTPVerificationResult> {
    try {
      if (!secret || !token) {
        return {
          valid: false,
          error: 'Secret and token are required',
        };
      }

      // Remove any spaces or formatting from token
      const cleanToken = token.replace(/\s/g, '');

      // Validate token format (should be 6 digits)
      if (!/^\d{6}$/.test(cleanToken)) {
        return {
          valid: false,
          error: 'Token must be 6 digits',
        };
      }

      this.logger.debug('Verifying TOTP token', {
        tokenLength: cleanToken.length,
        window,
      });

      // Verify token with time window
      const verification = speakeasy.totp.verify({
        secret: secret,
        encoding: 'base32',
        token: cleanToken,
        window: window, // Allow some time drift
        step: 30, // 30-second time step
      });

      if (verification) {
        this.logger.info('TOTP token verification successful', {
          delta: verification,
        });

        return {
          valid: true,
          delta: verification,
        };
      } else {
        this.logger.warn('TOTP token verification failed', {
          reason: 'Invalid token or expired',
        });

        return {
          valid: false,
          error: 'Invalid or expired token',
        };
      }
    } catch (error) {
      this.logger.error('TOTP token verification error', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      return {
        valid: false,
        error: 'Verification failed due to internal error',
      };
    }
  }

  /**
   * Generate current TOTP token (for testing purposes)
   */
  generateCurrentToken(secret: string): string {
    try {
      const token = speakeasy.totp({
        secret: secret,
        encoding: 'base32',
        step: 30,
      });

      return token;
    } catch (error) {
      this.logger.error('Failed to generate current TOTP token', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to generate TOTP token');
    }
  }

  /**
   * Get remaining time for current TOTP token
   */
  getRemainingTime(): number {
    const now = Math.floor(Date.now() / 1000);
    const step = 30;
    return step - (now % step);
  }

  /**
   * Validate TOTP secret format
   */
  validateSecret(secret: string): boolean {
    try {
      if (!secret || typeof secret !== 'string') {
        return false;
      }

      // Check if it's valid base32
      const base32Regex = /^[A-Z2-7]+=*$/;
      if (!base32Regex.test(secret.toUpperCase())) {
        return false;
      }

      // Try to generate a token to validate the secret
      speakeasy.totp({
        secret: secret,
        encoding: 'base32',
      });

      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Generate QR code data URL from OTP auth URL
   */
  private async generateQRCode(otpauthUrl: string): Promise<string> {
    try {
      const qrCodeDataUrl = await QRCode.toDataURL(otpauthUrl, {
        errorCorrectionLevel: 'M',
        type: 'image/png',
        quality: 0.92,
        margin: 1,
        color: {
          dark: '#000000',
          light: '#FFFFFF',
        },
        width: 256,
      });

      return qrCodeDataUrl;
    } catch (error) {
      this.logger.error('Failed to generate QR code', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw new Error('Failed to generate QR code');
    }
  }

  /**
   * Generate backup codes for TOTP recovery
   */
  generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];

    for (let i = 0; i < count; i++) {
      // Generate 8-character alphanumeric codes
      const code = this.generateSecureCode(8);
      codes.push(code);
    }

    this.logger.info('TOTP backup codes generated', {
      count: codes.length,
    });

    return codes;
  }

  /**
   * Verify backup code
   */
  verifyBackupCode(backupCodes: string[], providedCode: string): boolean {
    try {
      const cleanCode = providedCode.replace(/\s/g, '').toUpperCase();
      return backupCodes.some((code) => code.toUpperCase() === cleanCode);
    } catch (error) {
      this.logger.error('Failed to verify backup code', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return false;
    }
  }

  /**
   * Generate secure alphanumeric code
   */
  private generateSecureCode(length: number): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let result = '';

    for (let i = 0; i < length; i++) {
      const randomIndex = Math.floor(Math.random() * chars.length);
      result += chars[randomIndex];
    }

    return result;
  }

  /**
   * Get TOTP configuration for a user
   */
  getTOTPConfig(
    secret: string,
    userEmail: string,
    serviceName: string = 'Enterprise Auth'
  ): {
    secret: string;
    issuer: string;
    label: string;
    algorithm: string;
    digits: number;
    period: number;
  } {
    return {
      secret,
      issuer: 'Enterprise Auth Backend',
      label: `${serviceName} (${userEmail})`,
      algorithm: 'SHA1',
      digits: 6,
      period: 30,
    };
  }

  /**
   * Generate manual entry key with formatting
   */
  formatManualEntryKey(secret: string): string {
    // Format as groups of 4 characters for easier manual entry
    return secret.match(/.{1,4}/g)?.join(' ') || secret;
  }
}
