/**
 * Secure ID Generator Service
 * Cryptographically secure ID generation using nanoid with customizable options
 */

import { nanoid, customAlphabet } from 'nanoid';
import { randomBytes } from 'crypto';
import { TokenGenerationOptions } from './types';

export class SecureIdGenerator {
  // Predefined secure alphabets
  private static readonly ALPHABETS = {
    // URL-safe characters (default nanoid alphabet)
    urlSafe: '_-0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',

    // Alphanumeric only (no special characters)
    alphanumeric:
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ',

    // Numbers only
    numeric: '0123456789',

    // Lowercase letters and numbers
    lowercase: '0123456789abcdefghijklmnopqrstuvwxyz',

    // Uppercase letters and numbers
    uppercase: '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ',

    // Base58 (Bitcoin-style, no confusing characters)
    base58: '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz',

    // Hex characters
    hex: '0123456789abcdef',

    // High entropy alphabet (includes more special characters)
    highEntropy:
      '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ!@#$%^&*()_+-=[]{}|;:,.<>?',
  };

  private static readonly DEFAULT_OPTIONS: Required<TokenGenerationOptions> = {
    length: 21, // Default nanoid length
    alphabet: SecureIdGenerator.ALPHABETS.urlSafe,
    prefix: '',
    includeTimestamp: false,
    entropy: 128, // bits of entropy
  };

  /**
   * Generate a secure ID with default settings
   */
  static generateId(length: number = 21): string {
    return nanoid(length);
  }

  /**
   * Generate a secure ID with custom options
   */
  static generateCustomId(
    options: Partial<TokenGenerationOptions> = {}
  ): string {
    const config = { ...this.DEFAULT_OPTIONS, ...options };

    // Validate options
    this.validateOptions(config);

    // Calculate required length for desired entropy
    const requiredLength = this.calculateRequiredLength(
      config.alphabet,
      config.entropy
    );
    const actualLength = Math.max(config.length, requiredLength);

    // Generate the ID
    const generator = customAlphabet(config.alphabet, actualLength);
    let id = generator();

    // Add timestamp if requested
    if (config.includeTimestamp) {
      const timestamp = Date.now().toString(36);
      id = `${timestamp}_${id}`;
    }

    // Add prefix if specified
    if (config.prefix) {
      id = `${config.prefix}_${id}`;
    }

    return id;
  }

  /**
   * Generate user ID
   */
  static generateUserId(): string {
    return this.generateCustomId({
      length: 16,
      alphabet: this.ALPHABETS.base58,
      prefix: 'usr',
      entropy: 96,
    });
  }

  /**
   * Generate session ID
   */
  static generateSessionId(): string {
    return this.generateCustomId({
      length: 32,
      alphabet: this.ALPHABETS.urlSafe,
      prefix: 'sess',
      entropy: 160,
    });
  }

  /**
   * Generate device ID
   */
  static generateDeviceId(): string {
    return this.generateCustomId({
      length: 24,
      alphabet: this.ALPHABETS.base58,
      prefix: 'dev',
      entropy: 128,
    });
  }

  /**
   * Generate API key
   */
  static generateApiKey(): string {
    return this.generateCustomId({
      length: 40,
      alphabet: this.ALPHABETS.base58,
      prefix: 'ak',
      entropy: 200,
    });
  }

  /**
   * Generate OAuth state parameter
   */
  static generateOAuthState(): string {
    return this.generateCustomId({
      length: 32,
      alphabet: this.ALPHABETS.urlSafe,
      entropy: 160,
    });
  }

  /**
   * Generate CSRF token
   */
  static generateCSRFToken(): string {
    return this.generateCustomId({
      length: 32,
      alphabet: this.ALPHABETS.urlSafe,
      entropy: 160,
    });
  }

  /**
   * Generate verification code (numeric)
   */
  static generateVerificationCode(length: number = 6): string {
    return this.generateCustomId({
      length,
      alphabet: this.ALPHABETS.numeric,
      entropy: length * Math.log2(10), // ~3.32 bits per digit
    });
  }

  /**
   * Generate backup codes
   */
  static generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      codes.push(
        this.generateCustomId({
          length: 8,
          alphabet: this.ALPHABETS.alphanumeric,
          entropy: 48,
        })
      );
    }
    return codes;
  }

  /**
   * Generate password reset token
   */
  static generateResetToken(): string {
    return this.generateCustomId({
      length: 48,
      alphabet: this.ALPHABETS.urlSafe,
      entropy: 240,
      includeTimestamp: true,
    });
  }

  /**
   * Generate invitation token
   */
  static generateInvitationToken(): string {
    return this.generateCustomId({
      length: 32,
      alphabet: this.ALPHABETS.base58,
      prefix: 'inv',
      entropy: 160,
    });
  }

  /**
   * Generate webhook secret
   */
  static generateWebhookSecret(): string {
    return this.generateCustomId({
      length: 64,
      alphabet: this.ALPHABETS.base58,
      entropy: 320,
    });
  }

  /**
   * Generate correlation ID for request tracing
   */
  static generateCorrelationId(): string {
    return this.generateCustomId({
      length: 16,
      alphabet: this.ALPHABETS.alphanumeric,
      includeTimestamp: true,
    });
  }

  /**
   * Generate secure random bytes as hex string
   */
  static generateRandomHex(bytes: number = 32): string {
    return randomBytes(bytes).toString('hex');
  }

  /**
   * Generate secure random bytes as base64 string
   */
  static generateRandomBase64(bytes: number = 32): string {
    return randomBytes(bytes).toString('base64url');
  }

  /**
   * Generate time-based unique ID (ULID-style)
   */
  static generateTimeBasedId(): string {
    const timestamp = Date.now();
    const timestampPart = timestamp.toString(36).padStart(8, '0');
    const randomPart = nanoid(16);
    return `${timestampPart}${randomPart}`;
  }

  /**
   * Generate sortable ID with timestamp prefix
   */
  static generateSortableId(): string {
    const timestamp = Date.now().toString(36);
    const randomPart = nanoid(16);
    return `${timestamp}_${randomPart}`;
  }

  /**
   * Validate ID format and security
   */
  static validateId(
    id: string,
    options: Partial<TokenGenerationOptions> = {}
  ): {
    valid: boolean;
    entropy: number;
    strength: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
    issues: string[];
  } {
    const issues: string[] = [];
    const config = { ...this.DEFAULT_OPTIONS, ...options };

    // Check length
    if (id.length < 8) {
      issues.push('ID is too short (minimum 8 characters)');
    }

    // Check character set
    const allowedChars = new Set(config.alphabet);
    const invalidChars = [...id].filter((char) => !allowedChars.has(char));
    if (invalidChars.length > 0) {
      issues.push(`ID contains invalid characters: ${invalidChars.join(', ')}`);
    }

    // Calculate entropy
    const uniqueChars = new Set(id).size;
    const alphabetSize = config.alphabet.length;
    const entropy = id.length * Math.log2(Math.min(uniqueChars, alphabetSize));

    // Determine strength
    let strength: 'weak' | 'fair' | 'good' | 'strong' | 'excellent';
    if (entropy < 32) strength = 'weak';
    else if (entropy < 64) strength = 'fair';
    else if (entropy < 128) strength = 'good';
    else if (entropy < 256) strength = 'strong';
    else strength = 'excellent';

    // Check for patterns
    if (this.hasRepeatingPattern(id)) {
      issues.push('ID contains repeating patterns');
    }

    if (this.hasSequentialPattern(id)) {
      issues.push('ID contains sequential patterns');
    }

    return {
      valid: issues.length === 0,
      entropy,
      strength,
      issues,
    };
  }

  /**
   * Calculate collision probability for given parameters
   */
  static calculateCollisionProbability(
    alphabetSize: number,
    idLength: number,
    numberOfIds: number
  ): number {
    const totalPossibilities = Math.pow(alphabetSize, idLength);

    // Using birthday paradox approximation
    const probability =
      1 - Math.exp(-Math.pow(numberOfIds, 2) / (2 * totalPossibilities));

    return Math.min(probability, 1);
  }

  /**
   * Get entropy information for different alphabets
   */
  static getAlphabetInfo(): Record<
    string,
    { size: number; bitsPerChar: number; description: string }
  > {
    const info: Record<
      string,
      { size: number; bitsPerChar: number; description: string }
    > = {};

    for (const [name, alphabet] of Object.entries(this.ALPHABETS)) {
      info[name] = {
        size: alphabet.length,
        bitsPerChar: Math.log2(alphabet.length),
        description: this.getAlphabetDescription(name),
      };
    }

    return info;
  }

  private static validateOptions(
    options: Required<TokenGenerationOptions>
  ): void {
    if (options.length < 1) {
      throw new Error('Length must be at least 1');
    }

    if (options.length > 1000) {
      throw new Error('Length cannot exceed 1000 characters');
    }

    if (options.alphabet.length < 2) {
      throw new Error('Alphabet must contain at least 2 characters');
    }

    if (new Set(options.alphabet).size !== options.alphabet.length) {
      throw new Error('Alphabet cannot contain duplicate characters');
    }

    if (options.entropy < 1) {
      throw new Error('Entropy must be at least 1 bit');
    }

    if (options.prefix && !/^[a-zA-Z][a-zA-Z0-9]*$/.test(options.prefix)) {
      throw new Error(
        'Prefix must start with a letter and contain only alphanumeric characters'
      );
    }
  }

  private static calculateRequiredLength(
    alphabet: string,
    targetEntropy: number
  ): number {
    const bitsPerChar = Math.log2(alphabet.length);
    return Math.ceil(targetEntropy / bitsPerChar);
  }

  private static hasRepeatingPattern(id: string): boolean {
    // Check for patterns like "aaa", "abab", "abcabc"
    for (
      let patternLength = 1;
      patternLength <= Math.floor(id.length / 3);
      patternLength++
    ) {
      for (let start = 0; start <= id.length - patternLength * 3; start++) {
        const pattern = id.substring(start, start + patternLength);
        const next1 = id.substring(
          start + patternLength,
          start + patternLength * 2
        );
        const next2 = id.substring(
          start + patternLength * 2,
          start + patternLength * 3
        );

        if (pattern === next1 && pattern === next2) {
          return true;
        }
      }
    }
    return false;
  }

  private static hasSequentialPattern(id: string): boolean {
    // Check for sequential patterns like "abc", "123", "xyz"
    const sequences = [
      'abcdefghijklmnopqrstuvwxyz',
      'ABCDEFGHIJKLMNOPQRSTUVWXYZ',
      '0123456789',
    ];

    for (const sequence of sequences) {
      for (let i = 0; i <= sequence.length - 3; i++) {
        const subseq = sequence.substring(i, i + 3);
        const reverseSubseq = subseq.split('').reverse().join('');

        if (id.includes(subseq) || id.includes(reverseSubseq)) {
          return true;
        }
      }
    }

    return false;
  }

  private static getAlphabetDescription(name: string): string {
    const descriptions: Record<string, string> = {
      urlSafe: 'URL-safe characters (letters, numbers, -, _)',
      alphanumeric: 'Letters and numbers only',
      numeric: 'Numbers only',
      lowercase: 'Lowercase letters and numbers',
      uppercase: 'Uppercase letters and numbers',
      base58: 'Bitcoin-style (no confusing characters)',
      hex: 'Hexadecimal characters',
      highEntropy: 'High entropy with special characters',
    };

    return descriptions[name] || 'Custom alphabet';
  }
}
