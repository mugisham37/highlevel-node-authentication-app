/**
 * Password Value Object
 * Represents a password with validation and security rules
 */

import * as argon2 from 'argon2';

export class Password {
  private readonly _hashedValue: string;

  private constructor(hashedValue: string) {
    this._hashedValue = hashedValue;
  }

  /**
   * Create a Password from a plain text password
   */
  static async fromPlainText(plainText: string): Promise<Password> {
    this.validatePlainText(plainText);
    const hashedValue = await this.hashPassword(plainText);
    return new Password(hashedValue);
  }

  /**
   * Create a Password from an already hashed value
   */
  static fromHash(hashedValue: string): Password {
    if (!hashedValue || typeof hashedValue !== 'string') {
      throw new Error('Hashed password must be a non-empty string');
    }
    return new Password(hashedValue);
  }

  get hashedValue(): string {
    return this._hashedValue;
  }

  /**
   * Verify if a plain text password matches this hashed password
   */
  async verify(plainText: string): Promise<boolean> {
    try {
      return await argon2.verify(this._hashedValue, plainText);
    } catch (error) {
      return false;
    }
  }

  /**
   * Check if password needs rehashing (for security upgrades)
   */
  needsRehash(): boolean {
    try {
      return argon2.needsRehash(this._hashedValue);
    } catch (error) {
      return true; // If we can't determine, assume it needs rehashing
    }
  }

  private static validatePlainText(password: string): void {
    if (!password || typeof password !== 'string') {
      throw new Error('Password must be a non-empty string');
    }

    if (password.length < 8) {
      throw new Error('Password must be at least 8 characters long');
    }

    if (password.length > 128) {
      throw new Error('Password must be no more than 128 characters long');
    }

    // Check for at least one lowercase letter
    if (!/[a-z]/.test(password)) {
      throw new Error('Password must contain at least one lowercase letter');
    }

    // Check for at least one uppercase letter
    if (!/[A-Z]/.test(password)) {
      throw new Error('Password must contain at least one uppercase letter');
    }

    // Check for at least one digit
    if (!/\d/.test(password)) {
      throw new Error('Password must contain at least one digit');
    }

    // Check for at least one special character
    if (!/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(password)) {
      throw new Error('Password must contain at least one special character');
    }

    // Check for common weak passwords
    const commonPasswords = [
      'password',
      '12345678',
      'qwerty123',
      'admin123',
      'admin159',
      'password123',
      'welcome123',
      'testpass1!',
    ];

    if (commonPasswords.includes(password.toLowerCase())) {
      throw new Error('Password is too common and not allowed');
    }

    // Check for sequential characters
    if (this.hasSequentialChars(password)) {
      throw new Error('Password cannot contain sequential characters');
    }

    // Check for repeated characters
    if (this.hasRepeatedChars(password)) {
      throw new Error(
        'Password cannot contain more than 2 consecutive identical characters'
      );
    }
  }

  private static hasSequentialChars(password: string): boolean {
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
        if (
          lowerPassword.includes(subseq) ||
          lowerPassword.includes(subseq.split('').reverse().join(''))
        ) {
          return true;
        }
      }
    }

    return false;
  }

  private static hasRepeatedChars(password: string): boolean {
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

  private static async hashPassword(plainText: string): Promise<string> {
    try {
      return await argon2.hash(plainText, {
        type: argon2.argon2id,
        memoryCost: 2 ** 16, // 64 MB
        timeCost: 3,
        parallelism: 1,
        hashLength: 32,
      });
    } catch (error) {
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Calculate password strength score (0-100)
   */
  static calculateStrength(plainText: string): number {
    let score = 0;

    // Length bonus
    if (plainText.length >= 8) score += 10;
    if (plainText.length >= 12) score += 10;
    if (plainText.length >= 16) score += 10;

    // Character variety
    if (/[a-z]/.test(plainText)) score += 10;
    if (/[A-Z]/.test(plainText)) score += 10;
    if (/\d/.test(plainText)) score += 10;
    if (/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(plainText)) score += 15;

    // Complexity bonus
    const uniqueChars = new Set(plainText).size;
    if (uniqueChars >= plainText.length * 0.7) score += 15;

    // Penalty for common patterns
    if (this.hasSequentialChars(plainText)) score -= 20;
    if (this.hasRepeatedChars(plainText)) score -= 15;

    return Math.max(0, Math.min(100, score));
  }

  equals(other: Password): boolean {
    return this._hashedValue === other._hashedValue;
  }

  toJSON(): string {
    return '[PROTECTED]';
  }

  toString(): string {
    return '[PROTECTED]';
  }
}
