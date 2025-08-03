/**
 * PKCE (Proof Key for Code Exchange) Service
 * Implements RFC 7636 for secure OAuth2 flows
 */

import { createHash, randomBytes } from 'crypto';

export interface PKCEChallenge {
  codeVerifier: string;
  codeChallenge: string;
  codeChallengeMethod: 'S256';
}

export class PKCEService {
  /**
   * Generate PKCE challenge pair
   */
  generateChallenge(): PKCEChallenge {
    const codeVerifier = this.generateCodeVerifier();
    const codeChallenge = this.generateCodeChallenge(codeVerifier);

    return {
      codeVerifier,
      codeChallenge,
      codeChallengeMethod: 'S256',
    };
  }

  /**
   * Verify PKCE challenge
   */
  verifyChallenge(
    codeVerifier: string,
    codeChallenge: string,
    method: string = 'S256'
  ): boolean {
    if (method !== 'S256') {
      throw new Error('Only S256 code challenge method is supported');
    }

    const expectedChallenge = this.generateCodeChallenge(codeVerifier);
    return expectedChallenge === codeChallenge;
  }

  /**
   * Generate cryptographically secure code verifier
   * RFC 7636: 43-128 characters, URL-safe without padding
   */
  private generateCodeVerifier(): string {
    const buffer = randomBytes(32); // 32 bytes = 256 bits
    return buffer
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Generate code challenge from verifier using SHA256
   */
  private generateCodeChallenge(codeVerifier: string): string {
    const hash = createHash('sha256');
    hash.update(codeVerifier);
    return hash
      .digest('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=/g, '');
  }

  /**
   * Validate code verifier format
   */
  validateCodeVerifier(codeVerifier: string): boolean {
    // RFC 7636: 43-128 characters, [A-Z] / [a-z] / [0-9] / "-" / "." / "_" / "~"
    const pattern = /^[A-Za-z0-9\-._~]{43,128}$/;
    return pattern.test(codeVerifier);
  }

  /**
   * Validate code challenge format
   */
  validateCodeChallenge(codeChallenge: string): boolean {
    // Base64url encoded SHA256 hash (43 characters without padding)
    const pattern = /^[A-Za-z0-9\-_]{43}$/;
    return pattern.test(codeChallenge);
  }
}
