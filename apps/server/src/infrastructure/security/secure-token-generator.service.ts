/**
 * Secure Token Generator Service
 * Secure random token generation for various authentication flows
 */

import { randomBytes, createHash, createHmac, scryptSync } from 'crypto';
import { SecureRandomOptions } from './types';

export interface TokenOptions {
  length?: number;
  encoding?: 'hex' | 'base64' | 'base64url' | 'ascii';
  alphabet?: string;
  prefix?: string;
  suffix?: string;
  includeChecksum?: boolean;
  expiresIn?: number; // seconds
}

export interface TimestampedToken {
  token: string;
  timestamp: number;
  expiresAt?: number;
  checksum?: string;
}

export class SecureTokenGenerator {
  private static readonly DEFAULT_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  private static readonly URL_SAFE_ALPHABET =
    'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  private static readonly NUMERIC_ALPHABET = '0123456789';

  /**
   * Generate a secure random token with specified options
   */
  static generateToken(options: TokenOptions = {}): string {
    const {
      length = 32,
      encoding = 'hex',
      alphabet,
      prefix = '',
      suffix = '',
      includeChecksum = false,
    } = options;

    let token: string;

    if (alphabet) {
      // Use custom alphabet
      token = this.generateWithAlphabet(length, alphabet);
    } else {
      // Use built-in encoding
      token = this.generateWithEncoding(length, encoding);
    }

    // Add prefix and suffix
    if (prefix) token = `${prefix}${token}`;
    if (suffix) token = `${token}${suffix}`;

    // Add checksum if requested
    if (includeChecksum) {
      const checksum = this.calculateChecksum(token);
      token = `${token}${checksum}`;
    }

    return token;
  }

  /**
   * Generate a timestamped token that includes creation time
   */
  static generateTimestampedToken(
    options: TokenOptions = {}
  ): TimestampedToken {
    const timestamp = Date.now();
    const baseToken = this.generateToken(options);

    // Encode timestamp into token
    const timestampHex = timestamp.toString(16).padStart(12, '0');
    const token = `${timestampHex}_${baseToken}`;

    const result: TimestampedToken = {
      token,
      timestamp,
    };

    if (options.expiresIn) {
      result.expiresAt = timestamp + options.expiresIn * 1000;
    }

    if (options.includeChecksum) {
      result.checksum = this.calculateChecksum(token);
    }

    return result;
  }

  /**
   * Generate a password reset token
   */
  static generatePasswordResetToken(): string {
    return this.generateToken({
      length: 48,
      encoding: 'base64url',
      includeChecksum: true,
    });
  }

  /**
   * Generate an email verification token
   */
  static generateEmailVerificationToken(): string {
    return this.generateToken({
      length: 32,
      encoding: 'base64url',
      includeChecksum: true,
    });
  }

  /**
   * Generate a magic link token
   */
  static generateMagicLinkToken(): string {
    return this.generateTimestampedToken({
      length: 40,
      encoding: 'base64url',
      includeChecksum: true,
      expiresIn: 900, // 15 minutes
    }).token;
  }

  /**
   * Generate an API key
   */
  static generateApiKey(prefix: string = 'ak'): string {
    return this.generateToken({
      length: 40,
      alphabet: this.URL_SAFE_ALPHABET,
      prefix: `${prefix}_`,
      includeChecksum: true,
    });
  }

  /**
   * Generate a webhook secret
   */
  static generateWebhookSecret(): string {
    return this.generateToken({
      length: 64,
      encoding: 'base64url',
    });
  }

  /**
   * Generate a CSRF token
   */
  static generateCSRFToken(): string {
    return this.generateToken({
      length: 32,
      encoding: 'base64url',
    });
  }

  /**
   * Generate an OAuth state parameter
   */
  static generateOAuthState(): string {
    return this.generateToken({
      length: 32,
      alphabet: this.URL_SAFE_ALPHABET,
    });
  }

  /**
   * Generate a PKCE code verifier
   */
  static generatePKCECodeVerifier(): string {
    return this.generateToken({
      length: 128,
      alphabet: this.URL_SAFE_ALPHABET,
    });
  }

  /**
   * Generate a PKCE code challenge from verifier
   */
  static generatePKCECodeChallenge(verifier: string): string {
    return createHash('sha256').update(verifier).digest('base64url');
  }

  /**
   * Generate a session token
   */
  static generateSessionToken(): string {
    return this.generateToken({
      length: 48,
      encoding: 'base64url',
      includeChecksum: true,
    });
  }

  /**
   * Generate a refresh token
   */
  static generateRefreshToken(): string {
    return this.generateToken({
      length: 64,
      encoding: 'base64url',
      includeChecksum: true,
    });
  }

  /**
   * Generate a one-time password (OTP)
   */
  static generateOTP(length: number = 6): string {
    return this.generateToken({
      length,
      alphabet: this.NUMERIC_ALPHABET,
    });
  }

  /**
   * Generate backup codes for MFA
   */
  static generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(
        this.generateToken({
          length: 8,
          alphabet: this.DEFAULT_ALPHABET,
        })
      );
    }
    return codes;
  }

  /**
   * Generate a secure random salt
   */
  static generateSalt(length: number = 16): string {
    return randomBytes(length).toString('hex');
  }

  /**
   * Generate a secure random IV (Initialization Vector)
   */
  static generateIV(length: number = 16): Buffer {
    return randomBytes(length);
  }

  /**
   * Generate a secure random key
   */
  static generateKey(length: number = 32): Buffer {
    return randomBytes(length);
  }

  /**
   * Generate a derived key using PBKDF2
   */
  static generateDerivedKey(
    password: string,
    salt: string,
    _iterations: number = 100000,
    keyLength: number = 32
  ): Buffer {
    return scryptSync(password, salt, keyLength);
  }

  /**
   * Generate an HMAC token
   */
  static generateHMACToken(
    data: string,
    secret: string,
    algorithm: string = 'sha256'
  ): string {
    return createHmac(algorithm, secret).update(data).digest('hex');
  }

  /**
   * Generate a signed token with HMAC
   */
  static generateSignedToken(
    payload: string,
    secret: string,
    options: TokenOptions = {}
  ): string {
    const token = this.generateToken(options);
    const data = `${payload}.${token}`;
    const signature = this.generateHMACToken(data, secret);
    return `${data}.${signature}`;
  }

  /**
   * Verify a signed token
   */
  static verifySignedToken(
    signedToken: string,
    secret: string
  ): { valid: boolean; payload?: string; token?: string } {
    const parts = signedToken.split('.');
    if (parts.length !== 3) {
      return { valid: false };
    }

    const [payload, token, signature] = parts;
    const data = `${payload}.${token}`;
    const expectedSignature = this.generateHMACToken(data, secret);

    if (signature !== expectedSignature) {
      return { valid: false };
    }

    return { 
      valid: true, 
      ...(payload && { payload }), 
      ...(token && { token }) 
    };
  }

  /**
   * Generate a time-based token that expires
   */
  static generateExpiringToken(
    expiresInSeconds: number,
    options: TokenOptions = {}
  ): { token: string; expiresAt: number } {
    const expiresAt = Date.now() + expiresInSeconds * 1000;
    const expirationHex = expiresAt.toString(16).padStart(12, '0');
    const randomPart = this.generateToken(options);
    const token = `${expirationHex}_${randomPart}`;

    return { token, expiresAt };
  }

  /**
   * Check if a time-based token is expired
   */
  static isTokenExpired(token: string): boolean {
    try {
      const parts = token.split('_');
      if (parts.length < 2) return true;

      const expirationHex = parts[0];
      if (!expirationHex) return true;
      const expiresAt = parseInt(expirationHex, 16);

      return Date.now() > expiresAt;
    } catch (error) {
      return true; // Consider invalid tokens as expired
    }
  }

  /**
   * Extract timestamp from timestamped token
   */
  static extractTimestamp(token: string): number | null {
    try {
      const parts = token.split('_');
      if (parts.length < 2 || !parts[0]) return null;

      const timestampHex = parts[0];
      return parseInt(timestampHex, 16);
    } catch (error) {
      return null;
    }
  }

  /**
   * Validate token format and checksum
   */
  static validateToken(token: string): {
    valid: boolean;
    hasChecksum: boolean;
    checksumValid?: boolean;
    timestamp?: number;
    expired?: boolean;
  } {
    const result: {
      valid: boolean;
      hasChecksum: boolean;
      checksumValid?: boolean;
      timestamp?: number;
      expired?: boolean;
    } = {
      valid: false,
      hasChecksum: false,
    };

    if (!token || typeof token !== 'string') {
      return result;
    }

    // Check for timestamp
    const timestamp = this.extractTimestamp(token);
    if (timestamp) {
      result.timestamp = timestamp;
      result.expired = this.isTokenExpired(token);
    }

    // Basic format validation
    if (token.length < 8) {
      return result;
    }

    // Check for checksum (last 8 characters if hex)
    if (token.length > 16 && /^[a-f0-9]+$/i.test(token.slice(-8))) {
      result.hasChecksum = true;
      const tokenWithoutChecksum = token.slice(0, -8);
      const expectedChecksum = this.calculateChecksum(tokenWithoutChecksum);
      result.checksumValid = token.slice(-8) === expectedChecksum;
    }

    result.valid =
      !result.expired && (!result.hasChecksum || !!result.checksumValid);
    return result;
  }

  /**
   * Generate secure random bytes with specified options
   */
  static generateSecureRandom(options: SecureRandomOptions): string {
    const { length, encoding = 'hex', alphabet } = options;

    if (alphabet) {
      return this.generateWithAlphabet(length, alphabet);
    }

    const bytes = randomBytes(Math.ceil(length * 0.75)); // Adjust for base64 expansion

    switch (encoding) {
      case 'hex':
        return bytes.toString('hex').substring(0, length);
      case 'base64':
        return bytes.toString('base64').substring(0, length);
      case 'base64url':
        return bytes.toString('base64url').substring(0, length);
      case 'ascii':
        return bytes.toString('ascii').substring(0, length);
      default:
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
  }

  private static generateWithEncoding(
    length: number,
    encoding: string
  ): string {
    const bytes = randomBytes(Math.ceil(length * 0.75));

    switch (encoding) {
      case 'hex':
        return bytes.toString('hex').substring(0, length);
      case 'base64':
        return bytes.toString('base64').substring(0, length);
      case 'base64url':
        return bytes.toString('base64url').substring(0, length);
      case 'ascii':
        return bytes.toString('ascii').substring(0, length);
      default:
        throw new Error(`Unsupported encoding: ${encoding}`);
    }
  }

  private static generateWithAlphabet(
    length: number,
    alphabet: string
  ): string {
    if (!alphabet || alphabet.length === 0) {
      throw new Error('Alphabet cannot be empty');
    }

    const bytes = randomBytes(length);
    let result = '';

    for (let i = 0; i < length; i++) {
      const byteValue = bytes[i];
      if (byteValue === undefined) {
        throw new Error('Invalid byte array');
      }
      result += alphabet[byteValue % alphabet.length];
    }

    return result;
  }

  private static calculateChecksum(data: string): string {
    return createHash('sha256').update(data).digest('hex').substring(0, 8);
  }

  /**
   * Generate a cryptographically secure nonce
   */
  static generateNonce(length: number = 16): string {
    return this.generateToken({
      length,
      encoding: 'base64url',
    });
  }

  /**
   * Generate a challenge for challenge-response authentication
   */
  static generateChallenge(): string {
    return this.generateToken({
      length: 32,
      encoding: 'base64url',
    });
  }

  /**
   * Generate a device binding token
   */
  static generateDeviceBindingToken(deviceId: string, secret: string): string {
    const timestamp = Date.now().toString();
    const data = `${deviceId}:${timestamp}`;
    const signature = this.generateHMACToken(data, secret);
    return Buffer.from(`${data}:${signature}`).toString('base64url');
  }

  /**
   * Verify a device binding token
   */
  static verifyDeviceBindingToken(
    token: string,
    expectedDeviceId: string,
    secret: string,
    maxAge: number = 3600000 // 1 hour in milliseconds
  ): boolean {
    try {
      const decoded = Buffer.from(token, 'base64url').toString();
      const [deviceId, timestamp, signature] = decoded.split(':');

      if (deviceId !== expectedDeviceId || !timestamp) {
        return false;
      }

      const age = Date.now() - parseInt(timestamp, 10);
      if (age > maxAge) {
        return false;
      }

      const data = `${deviceId}:${timestamp}`;
      const expectedSignature = this.generateHMACToken(data, secret);

      return signature === expectedSignature;
    } catch (error) {
      return false;
    }
  }
}
