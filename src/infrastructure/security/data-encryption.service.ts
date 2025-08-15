/**
 * Data Encryption Service
 * Provides comprehensive data encryption at rest and in transit
 */

import {
  createHash,
  randomBytes,
  scrypt,
  createCipheriv,
  createDecipheriv,
} from 'crypto';
import { promisify } from 'util';
import { logger } from '../logging/winston-logger';
import { EncryptionOptions, EncryptionResult } from './types';

const scryptAsync = promisify(scrypt);

export interface DataEncryptionConfig {
  masterKey: string;
  defaultAlgorithm: 'aes-256-gcm' | 'aes-256-cbc' | 'chacha20-poly1305';
  keyDerivationRounds: number;
  saltLength: number;
  ivLength: number;
  tagLength: number;
}

export interface FieldEncryptionConfig {
  fields: string[];
  algorithm?: string;
  keyId?: string;
}

export interface DatabaseEncryptionConfig {
  enabled: boolean;
  encryptedFields: Record<string, FieldEncryptionConfig>;
  keyRotationInterval: number; // days
  compressionEnabled: boolean;
}

export class DataEncryptionService {
  private readonly config: DataEncryptionConfig;
  private readonly keyCache = new Map<string, Buffer>();
  private readonly encryptionKeys = new Map<string, Buffer>();

  constructor(config?: Partial<DataEncryptionConfig>) {
    this.config = {
      masterKey: process.env['ENCRYPTION_MASTER_KEY'] || this.generateMasterKey(),
      defaultAlgorithm: 'aes-256-gcm',
      keyDerivationRounds: 100000,
      saltLength: 32,
      ivLength: 16,
      tagLength: 16,
      ...config,
    };

    this.validateConfig();
    this.initializeKeys();
  }

  /**
   * Encrypt data at rest
   */
  async encryptAtRest(
    data: string | Buffer,
    options?: Partial<EncryptionOptions>
  ): Promise<EncryptionResult> {
    try {
      const opts: EncryptionOptions = {
        algorithm: this.config.defaultAlgorithm,
        keyDerivation: 'scrypt',
        iterations: this.config.keyDerivationRounds,
        saltLength: this.config.saltLength,
        tagLength: this.config.tagLength,
        ...options,
      };

      const salt = randomBytes(opts.saltLength!);
      const iv = randomBytes(this.config.ivLength);

      // Derive key from master key and salt
      const key = await this.deriveKey(this.config.masterKey, salt, opts);

      // Convert data to buffer if string
      const dataBuffer =
        typeof data === 'string' ? Buffer.from(data, 'utf8') : data;

      let encrypted: Buffer;
      let tag: Buffer | undefined;

      if (opts.algorithm === 'aes-256-gcm') {
        const cipher = createCipheriv('aes-256-gcm', key, iv);
        encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
        tag = cipher.getAuthTag();
      } else if (opts.algorithm === 'aes-256-cbc') {
        const cipher = createCipheriv('aes-256-cbc', key, iv);
        encrypted = Buffer.concat([cipher.update(dataBuffer), cipher.final()]);
      } else {
        throw new Error(`Unsupported algorithm: ${opts.algorithm}`);
      }

      const result: EncryptionResult = {
        encrypted: encrypted.toString('base64'),
        iv: iv.toString('base64'),
        salt: salt.toString('base64'),
        algorithm: opts.algorithm!,
      };

      if (tag) {
        result.tag = tag.toString('base64');
      }

      logger.debug('Data encrypted at rest', {
        algorithm: opts.algorithm,
        dataSize: dataBuffer.length,
        encryptedSize: encrypted.length,
      });

      return result;
    } catch (error) {
      logger.error('Failed to encrypt data at rest', {
        error: (error as Error).message,
      });
      throw new Error('Encryption failed');
    }
  }

  /**
   * Decrypt data at rest
   */
  async decryptAtRest(encryptionResult: EncryptionResult): Promise<Buffer> {
    try {
      const salt = Buffer.from(encryptionResult.salt, 'base64');
      const iv = Buffer.from(encryptionResult.iv, 'base64');
      const encrypted = Buffer.from(encryptionResult.encrypted, 'base64');

      // Derive the same key
      const key = await this.deriveKey(this.config.masterKey, salt, {
        keyDerivation: 'scrypt',
        iterations: this.config.keyDerivationRounds,
      });

      let decrypted: Buffer;

      if (encryptionResult.algorithm === 'aes-256-gcm') {
        if (!encryptionResult.tag) {
          throw new Error('Authentication tag required for GCM mode');
        }

        const decipher = createDecipheriv('aes-256-gcm', key, iv);
        const tag = Buffer.from(encryptionResult.tag, 'base64');
        decipher.setAuthTag(tag);
        decrypted = Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]);
      } else if (encryptionResult.algorithm === 'aes-256-cbc') {
        const decipher = createDecipheriv('aes-256-cbc', key, iv);
        decrypted = Buffer.concat([
          decipher.update(encrypted),
          decipher.final(),
        ]);
      } else {
        throw new Error(`Unsupported algorithm: ${encryptionResult.algorithm}`);
      }

      logger.debug('Data decrypted at rest', {
        algorithm: encryptionResult.algorithm,
        encryptedSize: encrypted.length,
        decryptedSize: decrypted.length,
      });

      return decrypted;
    } catch (error) {
      logger.error('Failed to decrypt data at rest', {
        error: (error as Error).message,
      });
      throw new Error('Decryption failed');
    }
  }

  /**
   * Encrypt field-level data for database storage
   */
  async encryptField(
    fieldName: string,
    value: any,
    keyId?: string
  ): Promise<string> {
    if (value === null || value === undefined) {
      return value;
    }

    try {
      const stringValue =
        typeof value === 'string' ? value : JSON.stringify(value);
      const encryptionKey = keyId
        ? this.getEncryptionKey(keyId)
        : this.getDefaultEncryptionKey();

      const iv = randomBytes(this.config.ivLength);
      const cipher = createCipheriv(
        this.config.defaultAlgorithm,
        encryptionKey,
        iv
      );

      let encrypted = cipher.update(stringValue, 'utf8', 'base64');
      encrypted += cipher.final('base64');

      let result = `${iv.toString('base64')}:${encrypted}`;

      if (this.config.defaultAlgorithm === 'aes-256-gcm') {
        const tag = (cipher as any).getAuthTag();
        result += `:${tag.toString('base64')}`;
      }

      logger.debug('Field encrypted', { fieldName, keyId });
      return result;
    } catch (error) {
      logger.error('Failed to encrypt field', {
        fieldName,
        keyId,
        error: (error as Error).message,
      });
      throw new Error(`Field encryption failed: ${fieldName}`);
    }
  }

  /**
   * Decrypt field-level data from database
   */
  async decryptField(
    fieldName: string,
    encryptedValue: string,
    keyId?: string
  ): Promise<any> {
    if (!encryptedValue) {
      return encryptedValue;
    }

    try {
      const parts = encryptedValue.split(':');
      if (parts.length < 2 || !parts[0] || !parts[1]) {
        throw new Error('Invalid encrypted field format');
      }

      const iv = Buffer.from(parts[0], 'base64');
      const encrypted = parts[1];
      const encryptionKey = keyId
        ? this.getEncryptionKey(keyId)
        : this.getDefaultEncryptionKey();

      const decipher = createDecipheriv(
        this.config.defaultAlgorithm,
        encryptionKey,
        iv
      );

      if (this.config.defaultAlgorithm === 'aes-256-gcm' && parts[2]) {
        const tag = Buffer.from(parts[2], 'base64');
        (decipher as any).setAuthTag(tag);
      }

      let decrypted = decipher.update(encrypted, 'base64', 'utf8');
      decrypted += decipher.final('utf8');

      // Try to parse as JSON, fallback to string
      try {
        return JSON.parse(decrypted);
      } catch {
        return decrypted;
      }
    } catch (error) {
      logger.error('Failed to decrypt field', {
        fieldName,
        keyId,
        error: (error as Error).message,
      });
      throw new Error(`Field decryption failed: ${fieldName}`);
    }
  }

  /**
   * Encrypt data in transit (for API responses)
   */
  async encryptInTransit(
    data: any,
    _recipientPublicKey?: string
  ): Promise<{
    encryptedData: string;
    ephemeralPublicKey?: string;
    signature: string;
  }> {
    try {
      const jsonData = JSON.stringify(data);
      const encryptionResult = await this.encryptAtRest(jsonData);

      // Create a signature for integrity
      const signature = this.createSignature(encryptionResult.encrypted);

      return {
        encryptedData: JSON.stringify(encryptionResult),
        signature,
      };
    } catch (error) {
      logger.error('Failed to encrypt data in transit', {
        error: (error as Error).message,
      });
      throw new Error('Transit encryption failed');
    }
  }

  /**
   * Decrypt data in transit
   */
  async decryptInTransit(
    encryptedData: string,
    signature: string,
    _senderPublicKey?: string
  ): Promise<any> {
    try {
      // Verify signature first
      if (!this.verifySignature(encryptedData, signature)) {
        throw new Error('Invalid signature');
      }

      const encryptionResult: EncryptionResult = JSON.parse(encryptedData);
      const decryptedBuffer = await this.decryptAtRest(encryptionResult);

      return JSON.parse(decryptedBuffer.toString('utf8'));
    } catch (error) {
      logger.error('Failed to decrypt data in transit', {
        error: (error as Error).message,
      });
      throw new Error('Transit decryption failed');
    }
  }

  /**
   * Generate encryption key for specific purpose
   */
  generateEncryptionKey(purpose: string): string {
    const key = randomBytes(32);
    const keyId = `${purpose}_${Date.now()}_${randomBytes(8).toString('hex')}`;
    this.encryptionKeys.set(keyId, key);

    logger.info('Encryption key generated', { keyId, purpose });
    return keyId;
  }

  /**
   * Rotate encryption keys
   */
  async rotateKeys(): Promise<{
    rotated: string[];
    failed: string[];
  }> {
    const rotated: string[] = [];
    const failed: string[] = [];

    for (const [keyId, _] of this.encryptionKeys) {
      try {
        const newKey = randomBytes(32);
        this.encryptionKeys.set(keyId, newKey);
        rotated.push(keyId);

        logger.info('Encryption key rotated', { keyId });
      } catch (error) {
        failed.push(keyId);
        logger.error('Failed to rotate encryption key', {
          keyId,
          error: (error as Error).message,
        });
      }
    }

    return { rotated, failed };
  }

  /**
   * Secure key derivation
   */
  private async deriveKey(
    masterKey: string,
    salt: Buffer,
    options: Partial<EncryptionOptions>
  ): Promise<Buffer> {
    const keyDerivation = options.keyDerivation || 'scrypt';
    const iterations = options.iterations || this.config.keyDerivationRounds;

    if (keyDerivation === 'scrypt') {
      return (await scryptAsync(masterKey, salt, 32)) as Buffer;
    } else if (keyDerivation === 'pbkdf2') {
      const { pbkdf2 } = await import('crypto');
      const pbkdf2Async = promisify(pbkdf2);
      return await pbkdf2Async(masterKey, salt, iterations, 32, 'sha256');
    } else {
      throw new Error(`Unsupported key derivation: ${keyDerivation}`);
    }
  }

  /**
   * Get encryption key by ID
   */
  private getEncryptionKey(keyId: string): Buffer {
    const key = this.encryptionKeys.get(keyId);
    if (!key) {
      throw new Error(`Encryption key not found: ${keyId}`);
    }
    return key;
  }

  /**
   * Get default encryption key
   */
  private getDefaultEncryptionKey(): Buffer {
    const cacheKey = 'default';
    let key = this.keyCache.get(cacheKey);

    if (!key) {
      key = createHash('sha256').update(this.config.masterKey).digest();
      this.keyCache.set(cacheKey, key);
    }

    return key;
  }

  /**
   * Create signature for data integrity
   */
  private createSignature(data: string): string {
    return createHash('sha256')
      .update(data + this.config.masterKey)
      .digest('hex');
  }

  /**
   * Verify signature
   */
  private verifySignature(data: string, signature: string): boolean {
    const expectedSignature = this.createSignature(data);
    return signature === expectedSignature;
  }

  /**
   * Generate master key
   */
  private generateMasterKey(): string {
    const key = randomBytes(32).toString('hex');
    logger.warn('Generated new master key - store securely!', {
      keyLength: key.length,
    });
    return key;
  }

  /**
   * Initialize encryption keys
   */
  private initializeKeys(): void {
    // Generate default keys for common purposes
    this.generateEncryptionKey('user_data');
    this.generateEncryptionKey('session_data');
    this.generateEncryptionKey('audit_logs');
    this.generateEncryptionKey('pii_data');

    logger.info('Encryption keys initialized', {
      keyCount: this.encryptionKeys.size,
    });
  }

  /**
   * Validate configuration
   */
  private validateConfig(): void {
    if (!this.config.masterKey || this.config.masterKey.length < 32) {
      throw new Error('Master key must be at least 32 characters');
    }

    if (this.config.keyDerivationRounds < 10000) {
      logger.warn('Key derivation rounds below recommended minimum', {
        current: this.config.keyDerivationRounds,
        recommended: 100000,
      });
    }
  }

  /**
   * Get encryption statistics
   */
  getEncryptionStats(): {
    keysGenerated: number;
    defaultAlgorithm: string;
    keyDerivationRounds: number;
    cacheSize: number;
  } {
    return {
      keysGenerated: this.encryptionKeys.size,
      defaultAlgorithm: this.config.defaultAlgorithm,
      keyDerivationRounds: this.config.keyDerivationRounds,
      cacheSize: this.keyCache.size,
    };
  }

  /**
   * Clear sensitive data from memory
   */
  clearSensitiveData(): void {
    this.keyCache.clear();
    this.encryptionKeys.clear();
    logger.info('Sensitive encryption data cleared from memory');
  }

  /**
   * Health check
   */
  healthCheck(): {
    status: 'healthy' | 'degraded' | 'unhealthy';
    details: Record<string, any>;
  } {
    try {
      // Basic health check without async operations
      const hasKeys = this.encryptionKeys.size > 0;
      const hasMasterKey = !!this.config.masterKey;

      const isHealthy = hasKeys && hasMasterKey;

      return {
        status: isHealthy ? 'healthy' : 'unhealthy',
        details: {
          keysAvailable: this.encryptionKeys.size,
          algorithm: this.config.defaultAlgorithm,
          masterKeyConfigured: hasMasterKey,
          encryptionEnabled: true,
        },
      };
    } catch (error) {
      return {
        status: 'unhealthy',
        details: {
          error: (error as Error).message,
          keysAvailable: this.encryptionKeys.size,
        },
      };
    }
  }
}

// Export singleton instance
export const dataEncryptionService = new DataEncryptionService();
