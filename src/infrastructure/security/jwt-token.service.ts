/**
 * JWT Token Service
 * Handles JWT token generation, verification, and management
 */

import jwt from 'jsonwebtoken';
import { randomBytes } from 'crypto';

export interface JWTPayload {
  sub: string;
  aud: string;
  iss?: string;
  exp?: number;
  iat?: number;
  nbf?: number;
  jti?: string;
  scope?: string;
  client_id?: string;
  token_type?: string;
  [key: string]: any;
}

export interface TokenOptions {
  expiresIn?: string | number;
  audience?: string;
  issuer?: string;
  subject?: string;
  jwtid?: string;
  notBefore?: string | number;
}

export class JWTTokenService {
  private readonly secretKey: string;
  private readonly defaultIssuer: string;

  constructor(secretKey?: string, defaultIssuer?: string) {
    this.secretKey =
      secretKey || process.env.JWT_SECRET || this.generateSecretKey();
    this.defaultIssuer =
      defaultIssuer || process.env.JWT_ISSUER || 'auth-service';
  }

  /**
   * Generate a JWT token
   */
  async generateToken(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'jti'>,
    expiresIn: string | number = '1h',
    options?: TokenOptions
  ): Promise<string> {
    const now = Math.floor(Date.now() / 1000);

    const tokenPayload: JWTPayload = {
      ...payload,
      iss: options?.issuer || this.defaultIssuer,
      iat: now,
      jti: options?.jwtid || this.generateJTI(),
    };

    if (options?.audience) {
      tokenPayload.aud = options.audience;
    }

    if (options?.subject) {
      tokenPayload.sub = options.subject;
    }

    if (options?.notBefore) {
      tokenPayload.nbf =
        typeof options.notBefore === 'string'
          ? Math.floor(Date.now() / 1000) +
            this.parseTimeToSeconds(options.notBefore)
          : options.notBefore;
    }

    const jwtOptions: jwt.SignOptions = {
      expiresIn,
      algorithm: 'HS256',
    };

    return new Promise((resolve, reject) => {
      jwt.sign(tokenPayload, this.secretKey, jwtOptions, (err, token) => {
        if (err) {
          reject(new Error(`Failed to generate JWT token: ${err.message}`));
        } else {
          resolve(token!);
        }
      });
    });
  }

  /**
   * Verify and decode a JWT token
   */
  async verifyToken(
    token: string,
    options?: jwt.VerifyOptions
  ): Promise<JWTPayload> {
    return new Promise((resolve, reject) => {
      const verifyOptions: jwt.VerifyOptions = {
        algorithms: ['HS256'],
        issuer: this.defaultIssuer,
        ...options,
      };

      jwt.verify(token, this.secretKey, verifyOptions, (err, decoded) => {
        if (err) {
          reject(new Error(`JWT verification failed: ${err.message}`));
        } else {
          resolve(decoded as JWTPayload);
        }
      });
    });
  }

  /**
   * Decode JWT token without verification (for debugging)
   */
  decodeToken(token: string): JWTPayload | null {
    try {
      const decoded = jwt.decode(token);
      return decoded as JWTPayload;
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  isTokenExpired(token: string): boolean {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      return decoded.exp < Math.floor(Date.now() / 1000);
    } catch {
      return true;
    }
  }

  /**
   * Get token expiration time
   */
  getTokenExpiration(token: string): Date | null {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return null;
      }
      return new Date(decoded.exp * 1000);
    } catch {
      return null;
    }
  }

  /**
   * Get remaining token lifetime in seconds
   */
  getRemainingTokenTime(token: string): number {
    try {
      const decoded = this.decodeToken(token);
      if (!decoded || !decoded.exp) {
        return 0;
      }
      return Math.max(0, decoded.exp - Math.floor(Date.now() / 1000));
    } catch {
      return 0;
    }
  }

  /**
   * Refresh a token (generate new token with same payload but extended expiration)
   */
  async refreshToken(
    token: string,
    newExpiresIn: string | number = '1h'
  ): Promise<string> {
    try {
      // Verify the token first (but allow expired tokens for refresh)
      const decoded = await this.verifyToken(token, { ignoreExpiration: true });

      // Remove JWT-specific claims
      const { iat, exp, nbf, jti, ...payload } = decoded;

      // Generate new token with same payload
      return await this.generateToken(payload, newExpiresIn);
    } catch (error) {
      throw new Error(
        `Failed to refresh token: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  /**
   * Generate access and refresh token pair
   */
  async generateTokenPair(
    payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'jti' | 'token_type'>,
    accessTokenExpiry: string | number = '15m',
    refreshTokenExpiry: string | number = '7d'
  ): Promise<{ accessToken: string; refreshToken: string }> {
    const accessToken = await this.generateToken(
      { ...payload, token_type: 'access' },
      accessTokenExpiry
    );

    const refreshToken = await this.generateToken(
      { ...payload, token_type: 'refresh' },
      refreshTokenExpiry
    );

    return { accessToken, refreshToken };
  }

  /**
   * Validate token format without verification
   */
  isValidTokenFormat(token: string): boolean {
    if (!token || typeof token !== 'string') {
      return false;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      return false;
    }

    try {
      // Try to decode each part
      JSON.parse(Buffer.from(parts[0], 'base64url').toString());
      JSON.parse(Buffer.from(parts[1], 'base64url').toString());
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Extract claims from token without verification
   */
  extractClaims(token: string): Partial<JWTPayload> | null {
    try {
      const decoded = this.decodeToken(token);
      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Generate a secure secret key
   */
  private generateSecretKey(): string {
    return randomBytes(64).toString('hex');
  }

  /**
   * Generate a unique JWT ID
   */
  private generateJTI(): string {
    return randomBytes(16).toString('hex');
  }

  /**
   * Parse time string to seconds
   */
  private parseTimeToSeconds(time: string): number {
    const units: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
      w: 604800,
    };

    const match = time.match(/^(\d+)([smhdw])$/);
    if (!match) {
      throw new Error(`Invalid time format: ${time}`);
    }

    const [, value, unit] = match;
    return parseInt(value, 10) * units[unit];
  }
}
