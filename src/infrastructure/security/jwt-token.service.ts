/**
 * JWT Token Service
 * Enterprise-grade JWT token management with signing, verification, and refresh capabilities
 */

import * as jwt from 'jsonwebtoken';
import { randomBytes, createHash } from 'crypto';
import { JWTSigningOptions, TokenValidationResult } from './types';

export interface JWTPayload {
  sub: string; // Subject (user ID)
  iat: number; // Issued at
  exp: number; // Expiration time
  iss?: string; // Issuer
  aud?: string; // Audience
  jti?: string; // JWT ID
  nbf?: number; // Not before
  scope?: string; // Token scope
  type?: 'access' | 'refresh' | 'reset' | 'verification' | 'mfa';
  sessionId?: string;
  deviceId?: string;
  riskScore?: number;
  permissions?: string[];
  roles?: string[];
  metadata?: Record<string, any>;
}

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  refreshExpiresIn: number;
  scope?: string;
}

export class JWTTokenService {
  private readonly defaultSigningOptions: Partial<JWTSigningOptions> = {
    algorithm: 'HS256',
    issuer: 'enterprise-auth-backend',
    audience: 'enterprise-auth-client',
  };

  constructor(
    private readonly accessTokenSecret: string,
    private readonly refreshTokenSecret: string,
    private readonly signingOptions: Partial<JWTSigningOptions> = {}
  ) {
    if (!accessTokenSecret || !refreshTokenSecret) {
      throw new Error('JWT secrets must be provided');
    }

    if (accessTokenSecret === refreshTokenSecret) {
      throw new Error('Access and refresh token secrets must be different');
    }

    // Validate secret strength
    this.validateSecretStrength(accessTokenSecret, 'access token');
    this.validateSecretStrength(refreshTokenSecret, 'refresh token');
  }

  /**
   * Create an access token
   */
  createAccessToken(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti' | 'type'>,
    options: Partial<JWTSigningOptions> = {}
  ): string {
    const tokenOptions = {
      ...this.defaultSigningOptions,
      ...this.signingOptions,
      ...options,
      expiresIn: options.expiresIn || '15m', // Default 15 minutes
    };

    const fullPayload: JWTPayload = {
      ...payload,
      type: 'access',
      jti: this.generateJTI(),
      iat: Math.floor(Date.now() / 1000),
    };

    try {
      const signOptions: jwt.SignOptions = {
        algorithm: tokenOptions.algorithm,
        expiresIn: tokenOptions.expiresIn,
        issuer: tokenOptions.issuer,
        audience: tokenOptions.audience,
      };

      // Only add notBefore if it's defined
      if (tokenOptions.notBefore !== undefined) {
        signOptions.notBefore = tokenOptions.notBefore;
      }

      // Only add keyid if it's defined
      if (tokenOptions.keyid !== undefined) {
        signOptions.keyid = tokenOptions.keyid;
      }

      return jwt.sign(fullPayload, this.accessTokenSecret, signOptions);
    } catch (error) {
      throw new Error(`Failed to create access token: ${error.message}`);
    }
  }

  /**
   * Create a refresh token
   */
  createRefreshToken(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti' | 'type'>,
    options: Partial<JWTSigningOptions> = {}
  ): string {
    const tokenOptions = {
      ...this.defaultSigningOptions,
      ...this.signingOptions,
      ...options,
      expiresIn: options.expiresIn || '7d', // Default 7 days
    };

    const fullPayload: JWTPayload = {
      sub: payload.sub,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      type: 'refresh',
      jti: this.generateJTI(),
      iat: Math.floor(Date.now() / 1000),
      scope: 'refresh',
    };

    try {
      const signOptions: jwt.SignOptions = {
        algorithm: tokenOptions.algorithm,
        expiresIn: tokenOptions.expiresIn,
        issuer: tokenOptions.issuer,
        audience: tokenOptions.audience,
      };

      // Only add notBefore if it's defined
      if (tokenOptions.notBefore !== undefined) {
        signOptions.notBefore = tokenOptions.notBefore;
      }

      // Only add keyid if it's defined
      if (tokenOptions.keyid !== undefined) {
        signOptions.keyid = tokenOptions.keyid;
      }

      return jwt.sign(fullPayload, this.refreshTokenSecret, signOptions);
    } catch (error) {
      throw new Error(`Failed to create refresh token: ${error.message}`);
    }
  }

  /**
   * Create a token pair (access + refresh)
   */
  createTokenPair(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti' | 'type'>,
    accessTokenOptions: Partial<JWTSigningOptions> = {},
    refreshTokenOptions: Partial<JWTSigningOptions> = {}
  ): TokenPair {
    const accessToken = this.createAccessToken(payload, accessTokenOptions);
    const refreshToken = this.createRefreshToken(payload, refreshTokenOptions);

    const accessExpiresIn = this.parseExpirationTime(
      accessTokenOptions.expiresIn || '15m'
    );
    const refreshExpiresIn = this.parseExpirationTime(
      refreshTokenOptions.expiresIn || '7d'
    );

    return {
      accessToken,
      refreshToken,
      tokenType: 'Bearer',
      expiresIn: accessExpiresIn,
      refreshExpiresIn: refreshExpiresIn,
      scope: payload.scope,
    };
  }

  /**
   * Verify and decode an access token
   */
  verifyAccessToken(token: string): TokenValidationResult {
    return this.verifyToken(token, this.accessTokenSecret, 'access');
  }

  /**
   * Verify and decode a refresh token
   */
  verifyRefreshToken(token: string): TokenValidationResult {
    return this.verifyToken(token, this.refreshTokenSecret, 'refresh');
  }

  /**
   * Refresh an access token using a refresh token
   */
  refreshAccessToken(
    refreshToken: string,
    newPayload?: Partial<JWTPayload>
  ): TokenPair {
    const refreshResult = this.verifyRefreshToken(refreshToken);

    if (!refreshResult.valid || !refreshResult.payload) {
      throw new Error('Invalid refresh token');
    }

    const payload = refreshResult.payload as JWTPayload;

    if (payload.type !== 'refresh') {
      throw new Error('Token is not a refresh token');
    }

    // Create new token pair with updated payload
    const updatedPayload = {
      sub: payload.sub,
      sessionId: payload.sessionId,
      deviceId: payload.deviceId,
      riskScore: payload.riskScore,
      permissions: payload.permissions,
      roles: payload.roles,
      ...newPayload,
    };

    return this.createTokenPair(updatedPayload);
  }

  /**
   * Create a special purpose token (reset, verification, MFA)
   */
  createSpecialToken(
    type: 'reset' | 'verification' | 'mfa',
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'jti' | 'type'>,
    expiresIn: string = '1h'
  ): string {
    const fullPayload: JWTPayload = {
      ...payload,
      type,
      jti: this.generateJTI(),
      iat: Math.floor(Date.now() / 1000),
    };

    try {
      const signOptions: jwt.SignOptions = {
        algorithm: this.defaultSigningOptions.algorithm,
        expiresIn,
        issuer: this.defaultSigningOptions.issuer,
        audience: this.defaultSigningOptions.audience,
      };

      return jwt.sign(fullPayload, this.accessTokenSecret, signOptions);
    } catch (error) {
      throw new Error(`Failed to create ${type} token: ${error.message}`);
    }
  }

  /**
   * Verify a special purpose token
   */
  verifySpecialToken(
    token: string,
    expectedType: 'reset' | 'verification' | 'mfa'
  ): TokenValidationResult {
    const result = this.verifyToken(
      token,
      this.accessTokenSecret,
      expectedType
    );

    if (result.valid && result.payload) {
      const payload = result.payload as JWTPayload;
      if (payload.type !== expectedType) {
        return {
          valid: false,
          error: `Token type mismatch. Expected ${expectedType}, got ${payload.type}`,
        };
      }
    }

    return result;
  }

  /**
   * Decode token without verification (for inspection)
   */
  decodeToken(token: string): { header: any; payload: JWTPayload } | null {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded) {
        return null;
      }
      return {
        header: decoded.header,
        payload: decoded.payload as JWTPayload,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired without full verification
   */
  isTokenExpired(token: string): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded) {
      return true;
    }

    const now = Math.floor(Date.now() / 1000);
    return decoded.payload.exp <= now;
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    const decoded = this.decodeToken(token);
    if (!decoded) {
      return null;
    }

    return new Date(decoded.payload.exp * 1000);
  }

  /**
   * Get remaining token lifetime in seconds
   */
  getTokenRemainingTime(token: string): number {
    const decoded = this.decodeToken(token);
    if (!decoded) {
      return 0;
    }

    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, decoded.payload.exp - now);
  }

  /**
   * Blacklist a token by storing its JTI
   */
  async blacklistToken(
    token: string,
    storage: Set<string> | Map<string, any>
  ): Promise<void> {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.payload.jti) {
      throw new Error('Invalid token or missing JTI');
    }

    if (storage instanceof Set) {
      storage.add(decoded.payload.jti);
    } else if (storage instanceof Map) {
      storage.set(decoded.payload.jti, {
        blacklistedAt: new Date(),
        expiresAt: new Date(decoded.payload.exp * 1000),
      });
    }
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(
    token: string,
    storage: Set<string> | Map<string, any>
  ): boolean {
    const decoded = this.decodeToken(token);
    if (!decoded || !decoded.payload.jti) {
      return true; // Consider invalid tokens as blacklisted
    }

    if (storage instanceof Set) {
      return storage.has(decoded.payload.jti);
    } else if (storage instanceof Map) {
      return storage.has(decoded.payload.jti);
    }

    return false;
  }

  private verifyToken(
    token: string,
    secret: string,
    expectedType?: string
  ): TokenValidationResult {
    if (!token || typeof token !== 'string') {
      return { valid: false, error: 'Token must be a non-empty string' };
    }

    try {
      const payload = jwt.verify(token, secret, {
        algorithms: [this.defaultSigningOptions.algorithm as jwt.Algorithm],
        issuer: this.defaultSigningOptions.issuer,
        audience: this.defaultSigningOptions.audience,
      }) as JWTPayload;

      // Additional validation
      if (expectedType && payload.type !== expectedType) {
        return {
          valid: false,
          error: `Token type mismatch. Expected ${expectedType}, got ${payload.type}`,
        };
      }

      return { valid: true, payload };
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        return { valid: false, error: 'Token has expired', expired: true };
      } else if (error instanceof jwt.JsonWebTokenError) {
        return { valid: false, error: 'Invalid token signature' };
      } else if (error instanceof jwt.NotBeforeError) {
        return { valid: false, error: 'Token not active yet', notBefore: true };
      } else {
        return {
          valid: false,
          error: `Token validation failed: ${error.message}`,
        };
      }
    }
  }

  private generateJTI(): string {
    // Generate a unique JWT ID using timestamp + random bytes
    const timestamp = Date.now().toString(36);
    const randomPart = randomBytes(8).toString('hex');
    return `${timestamp}-${randomPart}`;
  }

  private parseExpirationTime(expiresIn: string | number): number {
    if (typeof expiresIn === 'number') {
      return expiresIn;
    }

    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error('Invalid expiresIn format');
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 60 * 60;
      case 'd':
        return value * 24 * 60 * 60;
      default:
        throw new Error('Invalid time unit');
    }
  }

  private validateSecretStrength(secret: string, type: string): void {
    if (secret.length < 32) {
      throw new Error(`${type} secret must be at least 32 characters long`);
    }

    // Check for sufficient entropy
    const uniqueChars = new Set(secret).size;
    if (uniqueChars < 16) {
      throw new Error(`${type} secret has insufficient entropy`);
    }

    // Check for common weak patterns
    const weakPatterns = [
      /^(.)\1+$/, // All same character
      /^(..)\1+$/, // Repeated pairs
      /^(abc|123|qwe)/i, // Sequential start
    ];

    for (const pattern of weakPatterns) {
      if (pattern.test(secret)) {
        throw new Error(`${type} secret contains weak patterns`);
      }
    }
  }

  /**
   * Generate cryptographically secure JWT secrets
   */
  static generateSecrets(): {
    accessTokenSecret: string;
    refreshTokenSecret: string;
  } {
    return {
      accessTokenSecret: randomBytes(64).toString('hex'),
      refreshTokenSecret: randomBytes(64).toString('hex'),
    };
  }

  /**
   * Create token fingerprint for additional security
   */
  createTokenFingerprint(token: string): string {
    return createHash('sha256').update(token).digest('hex').substring(0, 16);
  }
}
