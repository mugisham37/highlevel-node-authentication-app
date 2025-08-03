/**
 * JWT Token Value Object
 * Represents a JWT token with validation and utility methods
 */

import * as jwt from 'jsonwebtoken';

export interface JWTPayload {
  sub: string; // Subject (user ID)
  iat: number; // Issued at
  exp: number; // Expiration time
  iss?: string; // Issuer
  aud?: string; // Audience
  jti?: string; // JWT ID
  scope?: string; // Token scope
  type?: 'access' | 'refresh' | 'reset' | 'verification';
  sessionId?: string;
  deviceId?: string;
  riskScore?: number;
}

export class JWTToken {
  private readonly _token: string;
  private readonly _payload: JWTPayload;

  private constructor(token: string, payload: JWTPayload) {
    this._token = token;
    this._payload = payload;
  }

  /**
   * Create a new JWT token
   */
  static create(
    payload: Omit<JWTPayload, 'iat' | 'exp'>,
    secret: string,
    options: {
      expiresIn: string | number;
      issuer?: string;
      audience?: string;
      jwtid?: string;
    }
  ): JWTToken {
    if (!secret || typeof secret !== 'string') {
      throw new Error('JWT secret must be a non-empty string');
    }

    if (!payload.sub) {
      throw new Error('JWT payload must include subject (sub)');
    }

    const now = Math.floor(Date.now() / 1000);
    const fullPayload: JWTPayload = {
      ...payload,
      iat: now,
      exp: this.calculateExpiration(now, options.expiresIn),
      iss: options.issuer,
      aud: options.audience,
      jti: options.jwtid,
    };

    try {
      const token = jwt.sign(fullPayload, secret, {
        algorithm: 'HS256',
        noTimestamp: true, // We set iat manually
      });

      return new JWTToken(token, fullPayload);
    } catch (error) {
      throw new Error(`Failed to create JWT token: ${error.message}`);
    }
  }

  /**
   * Parse and validate an existing JWT token
   */
  static parse(token: string, secret: string): JWTToken {
    if (!token || typeof token !== 'string') {
      throw new Error('Token must be a non-empty string');
    }

    if (!secret || typeof secret !== 'string') {
      throw new Error('JWT secret must be a non-empty string');
    }

    try {
      const payload = jwt.verify(token, secret, {
        algorithms: ['HS256'],
      }) as JWTPayload;

      return new JWTToken(token, payload);
    } catch (error) {
      if (error instanceof jwt.TokenExpiredError) {
        throw new Error('Token has expired');
      } else if (error instanceof jwt.JsonWebTokenError) {
        throw new Error('Invalid token');
      } else if (error instanceof jwt.NotBeforeError) {
        throw new Error('Token not active yet');
      } else {
        throw new Error(`Token validation failed: ${error.message}`);
      }
    }
  }

  /**
   * Parse token without verification (for inspection only)
   */
  static parseUnsafe(token: string): { header: any; payload: JWTPayload } {
    try {
      const decoded = jwt.decode(token, { complete: true });
      if (!decoded) {
        throw new Error('Invalid token format');
      }
      return {
        header: decoded.header,
        payload: decoded.payload as JWTPayload,
      };
    } catch (error) {
      throw new Error(`Failed to parse token: ${error.message}`);
    }
  }

  get token(): string {
    return this._token;
  }

  get payload(): JWTPayload {
    return { ...this._payload };
  }

  get subject(): string {
    return this._payload.sub;
  }

  get issuedAt(): Date {
    return new Date(this._payload.iat * 1000);
  }

  get expiresAt(): Date {
    return new Date(this._payload.exp * 1000);
  }

  get issuer(): string | undefined {
    return this._payload.iss;
  }

  get audience(): string | undefined {
    return this._payload.aud;
  }

  get jwtId(): string | undefined {
    return this._payload.jti;
  }

  get scope(): string | undefined {
    return this._payload.scope;
  }

  get type(): string | undefined {
    return this._payload.type;
  }

  get sessionId(): string | undefined {
    return this._payload.sessionId;
  }

  get deviceId(): string | undefined {
    return this._payload.deviceId;
  }

  get riskScore(): number | undefined {
    return this._payload.riskScore;
  }

  /**
   * Check if token is expired
   */
  isExpired(): boolean {
    const now = Math.floor(Date.now() / 1000);
    return this._payload.exp <= now;
  }

  /**
   * Check if token expires within the given seconds
   */
  expiresWithin(seconds: number): boolean {
    const now = Math.floor(Date.now() / 1000);
    return this._payload.exp <= now + seconds;
  }

  /**
   * Get remaining time until expiration in seconds
   */
  getRemainingTime(): number {
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, this._payload.exp - now);
  }

  /**
   * Check if token is of a specific type
   */
  isType(type: string): boolean {
    return this._payload.type === type;
  }

  /**
   * Check if token has a specific scope
   */
  hasScope(scope: string): boolean {
    if (!this._payload.scope) return false;
    const scopes = this._payload.scope.split(' ');
    return scopes.includes(scope);
  }

  /**
   * Validate token against business rules
   */
  validate(): void {
    if (this.isExpired()) {
      throw new Error('Token has expired');
    }

    // Validate token age (not too old even if not expired)
    const maxAge = 24 * 60 * 60; // 24 hours in seconds
    const age = Math.floor(Date.now() / 1000) - this._payload.iat;
    if (age > maxAge) {
      throw new Error('Token is too old');
    }

    // Validate subject
    if (!this._payload.sub || this._payload.sub.length === 0) {
      throw new Error('Token must have a valid subject');
    }

    // Validate risk score if present
    if (this._payload.riskScore !== undefined) {
      if (this._payload.riskScore < 0 || this._payload.riskScore > 100) {
        throw new Error('Invalid risk score in token');
      }
    }
  }

  private static calculateExpiration(
    issuedAt: number,
    expiresIn: string | number
  ): number {
    if (typeof expiresIn === 'number') {
      return issuedAt + expiresIn;
    }

    // Parse string format like "1h", "30m", "7d"
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) {
      throw new Error(
        'Invalid expiresIn format. Use format like "1h", "30m", "7d"'
      );
    }

    const value = parseInt(match[1], 10);
    const unit = match[2];

    let seconds: number;
    switch (unit) {
      case 's':
        seconds = value;
        break;
      case 'm':
        seconds = value * 60;
        break;
      case 'h':
        seconds = value * 60 * 60;
        break;
      case 'd':
        seconds = value * 24 * 60 * 60;
        break;
      default:
        throw new Error('Invalid time unit. Use s, m, h, or d');
    }

    return issuedAt + seconds;
  }

  equals(other: JWTToken): boolean {
    return this._token === other._token;
  }

  toString(): string {
    return this._token;
  }

  toJSON(): string {
    return this._token;
  }

  /**
   * Get token header information
   */
  getHeader(): any {
    try {
      const decoded = jwt.decode(this._token, { complete: true });
      return decoded?.header;
    } catch (error) {
      throw new Error('Failed to decode token header');
    }
  }

  /**
   * Create a refresh token from this access token
   */
  createRefreshToken(
    secret: string,
    expiresIn: string | number = '7d'
  ): JWTToken {
    return JWTToken.create(
      {
        sub: this._payload.sub,
        type: 'refresh',
        sessionId: this._payload.sessionId,
        deviceId: this._payload.deviceId,
        scope: 'refresh',
      },
      secret,
      { expiresIn }
    );
  }
}
