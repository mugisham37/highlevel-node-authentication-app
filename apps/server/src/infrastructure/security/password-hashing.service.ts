/**
 * Password Hashing Service
 * Enterprise-grade password hashing using Argon2 with secure parameters
 */

import * as argon2 from 'argon2';
import { randomBytes } from 'crypto';
import { PasswordHashingOptions } from './types';

export class PasswordHashingService {
  private readonly defaultOptions: Required<PasswordHashingOptions> = {
    type: 'argon2id',
    memoryCost: 2 ** 16, // 64 MB
    timeCost: 3, // 3 iterations
    parallelism: 1, // Single thread for consistency
    hashLength: 32, // 32 bytes = 256 bits
    saltLength: 16, // 16 bytes = 128 bits
  };

  /**
   * Hash a password using Argon2 with secure parameters
   */
  async hashPassword(
    password: string,
    options?: Partial<PasswordHashingOptions>
  ): Promise<string> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (password.length > 1024) {
      throw new Error('Password is too long (max 1024 characters)');
    }

    const config = { ...this.defaultOptions, ...options };

    try {
      // Generate a cryptographically secure salt
      const salt = randomBytes(config.saltLength);

      const hash = await argon2.hash(password, {
        memoryCost: config.memoryCost,
        timeCost: config.timeCost,
        parallelism: config.parallelism,
        hashLength: config.hashLength,
        salt,
      });

      return hash;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      throw new Error(`Failed to hash password: ${errorMessage}`);
    }
  }

  /**
   * Verify a password against its hash
   */
  async verifyPassword(password: string, hash: string): Promise<boolean> {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (!hash || typeof hash !== 'string') {
      throw new Error('Hash must be a non-empty string');
    }

    try {
      return await argon2.verify(hash, password);
    } catch (error) {
      // Log the error but don't expose internal details
      console.error('Password verification error:', error);
      return false;
    }
  }

  /**
   * Check if a hash needs to be rehashed (for security upgrades)
   */
  needsRehash(
    hash: string,
    options?: Partial<PasswordHashingOptions>
  ): boolean {
    if (!hash || typeof hash !== 'string') {
      return true;
    }

    try {
      const config = { ...this.defaultOptions, ...options };

      // Check if the hash uses current parameters
      return argon2.needsRehash(hash, {
        memoryCost: config.memoryCost,
        timeCost: config.timeCost,
        parallelism: config.parallelism,
      });
    } catch (error) {
      // If we can't determine, assume it needs rehashing
      return true;
    }
  }

  /**
   * Get hash information for analysis
   */
  getHashInfo(hash: string): {
    type: string;
    memoryCost: number;
    timeCost: number;
    parallelism: number;
    hashLength: number;
    saltLength: number;
  } | null {
    try {
      // Parse Argon2 hash format: $argon2id$v=19$m=65536,t=3,p=1$salt$hash
      const parts = hash.split('$');
      if (parts.length !== 6) {
        return null;
      }

      const [, type, , params, salt, hashPart] = parts;
      if (!params || !salt || !hashPart) {
        return null;
      }

      const paramPairs = params.split(',');
      const paramMap = new Map<string, number>();

      for (const pair of paramPairs) {
        const [key, value] = pair.split('=');
        if (key && value) {
          paramMap.set(key, parseInt(value, 10));
        }
      }

      return {
        type: type || 'unknown',
        memoryCost: paramMap.get('m') || 0,
        timeCost: paramMap.get('t') || 0,
        parallelism: paramMap.get('p') || 0,
        hashLength: hashPart ? Buffer.from(hashPart, 'base64').length : 0,
        saltLength: salt ? Buffer.from(salt, 'base64').length : 0,
      };
    } catch (error) {
      return null;
    }
  }

  /**
   * Benchmark password hashing performance
   */
  async benchmarkHashing(
    password: string = 'test-password-123',
    iterations: number = 10
  ): Promise<{
    averageTime: number;
    minTime: number;
    maxTime: number;
    memoryUsage: number;
    hashesPerSecond: number;
  }> {
    const times: number[] = [];
    const memoryBefore = process.memoryUsage().heapUsed;

    for (let i = 0; i < iterations; i++) {
      const start = process.hrtime.bigint();
      await this.hashPassword(password);
      const end = process.hrtime.bigint();
      times.push(Number(end - start) / 1_000_000); // Convert to milliseconds
    }

    const memoryAfter = process.memoryUsage().heapUsed;
    const averageTime = times.reduce((a, b) => a + b, 0) / times.length;

    return {
      averageTime,
      minTime: Math.min(...times),
      maxTime: Math.max(...times),
      memoryUsage: memoryAfter - memoryBefore,
      hashesPerSecond: 1000 / averageTime,
    };
  }

  /**
   * Generate secure parameters based on target time
   */
  async calibrateParameters(
    targetTimeMs: number = 500,
    testPassword: string = 'test-password-123'
  ): Promise<PasswordHashingOptions> {
    let memoryCost = 2 ** 12; // Start with 4MB
    let timeCost = 1;

    // Increase memory cost until we reach target time
    while (memoryCost <= 2 ** 20) {
      // Max 1GB
      const start = process.hrtime.bigint();
      await this.hashPassword(testPassword, { memoryCost, timeCost });
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1_000_000;

      if (timeMs >= targetTimeMs) {
        break;
      }

      memoryCost *= 2;
    }

    // Fine-tune with time cost if needed
    while (timeCost <= 10) {
      const start = process.hrtime.bigint();
      await this.hashPassword(testPassword, { memoryCost, timeCost });
      const end = process.hrtime.bigint();
      const timeMs = Number(end - start) / 1_000_000;

      if (timeMs >= targetTimeMs) {
        break;
      }

      timeCost++;
    }

    return {
      type: 'argon2id',
      memoryCost,
      timeCost,
      parallelism: 1,
      hashLength: 32,
      saltLength: 16,
    };
  }

  /**
   * Validate password strength and return score
   */
  validatePasswordStrength(password: string): {
    score: number; // 0-100
    level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
    feedback: string[];
    isValid: boolean;
  } {
    const feedback: string[] = [];
    let score = 0;

    // Length scoring
    if (password.length >= 8) score += 10;
    if (password.length >= 12) score += 10;
    if (password.length >= 16) score += 10;
    if (password.length >= 20) score += 5;

    if (password.length < 8) {
      feedback.push('Password should be at least 8 characters long');
    }

    // Character variety
    if (/[a-z]/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add lowercase letters');
    }

    if (/[A-Z]/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add uppercase letters');
    }

    if (/\d/.test(password)) {
      score += 10;
    } else {
      feedback.push('Add numbers');
    }

    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      score += 15;
    } else {
      feedback.push('Add special characters');
    }

    // Complexity bonus
    const uniqueChars = new Set(password).size;
    const uniqueRatio = uniqueChars / password.length;
    if (uniqueRatio >= 0.7) score += 15;

    // Penalty for patterns
    if (this.hasSequentialChars(password)) {
      score -= 20;
      feedback.push('Avoid sequential characters (abc, 123)');
    }

    if (this.hasRepeatedChars(password)) {
      score -= 15;
      feedback.push('Avoid repeated characters (aaa, 111)');
    }

    // Dictionary check penalty
    if (this.isCommonPassword(password)) {
      score -= 30;
      feedback.push('Avoid common passwords');
    }

    score = Math.max(0, Math.min(100, score));

    let level: 'very-weak' | 'weak' | 'fair' | 'good' | 'strong';
    if (score < 20) level = 'very-weak';
    else if (score < 40) level = 'weak';
    else if (score < 60) level = 'fair';
    else if (score < 80) level = 'good';
    else level = 'strong';

    return {
      score,
      level,
      feedback,
      isValid: score >= 60 && feedback.length === 0,
    };
  }

  private hasSequentialChars(password: string): boolean {
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      '0123456789',
      'qwertyuiop',
      'asdfghjkl',
      'zxcvbnm',
    ];

    const lowerPassword = password.toLowerCase();

    for (const sequence of sequences) {
      for (let i = 0; i <= sequence.length - 3; i++) {
        const subseq = sequence.substring(i, i + 3);
        const reverseSubseq = subseq.split('').reverse().join('');
        if (
          lowerPassword.includes(subseq) ||
          lowerPassword.includes(reverseSubseq)
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private hasRepeatedChars(password: string): boolean {
    for (let i = 0; i < password.length - 2; i++) {
      if (
        password[i] === password[i + 1] &&
        password[i + 1] === password[i + 2]
      ) {
        return true;
      }
    }
    return false;
  }

  private isCommonPassword(password: string): boolean {
    const commonPasswords = [
      'password',
      '123456',
      '123456789',
      'qwerty',
      'abc123',
      'password123',
      'admin',
      'letmein',
      'welcome',
      'monkey',
      'dragon',
      'master',
      'hello',
      'freedom',
      'whatever',
      'qazwsx',
      'trustno1',
      'jordan23',
      'harley',
      'robert',
    ];

    return commonPasswords.includes(password.toLowerCase());
  }
}
