import * as crypto from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SecretMetadata {
  id: string;
  name: string;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
  tags: string[];
  rotationPolicy?: {
    enabled: boolean;
    intervalDays: number;
    lastRotated?: Date;
  };
}

export interface EncryptedSecret {
  metadata: SecretMetadata;
  encryptedValue: string;
  iv: string;
  authTag: string;
  algorithm: string;
}

export interface SecretValue {
  value: string;
  metadata: SecretMetadata;
}

export class SecretsManager {
  private readonly secretsPath: string;
  private readonly masterKey: Buffer;
  private readonly algorithm = 'aes-256-gcm';
  private readonly keyDerivationIterations = 100000;
  private secretsCache = new Map<string, SecretValue>();
  private cacheExpiry = new Map<string, number>();
  private readonly cacheTTL = 300000; // 5 minutes

  constructor(secretsPath: string = '.secure-config', masterPassword?: string) {
    this.secretsPath = path.resolve(secretsPath);
    this.masterKey = this.deriveMasterKey(
      masterPassword || this.getDefaultMasterPassword()
    );
    this.ensureSecretsDirectory();
  }

  private getDefaultMasterPassword(): string {
    // In production, this should come from a secure source like AWS KMS, HashiCorp Vault, etc.
    const envPassword = process.env.SECRETS_MASTER_PASSWORD;
    if (envPassword) {
      return envPassword;
    }

    // For development, generate a consistent key based on machine characteristics
    const machineId = process.env.MACHINE_ID || 'default-dev-machine';
    return crypto.createHash('sha256').update(machineId).digest('hex');
  }

  private deriveMasterKey(password: string): Buffer {
    const salt = crypto
      .createHash('sha256')
      .update('enterprise-auth-salt')
      .digest();
    return crypto.pbkdf2Sync(
      password,
      salt,
      this.keyDerivationIterations,
      32,
      'sha512'
    );
  }

  private async ensureSecretsDirectory(): Promise<void> {
    try {
      await fs.mkdir(this.secretsPath, { recursive: true });
    } catch (error) {
      console.error('Failed to create secrets directory:', error);
      throw new Error('Failed to initialize secrets manager');
    }
  }

  private getSecretFilePath(secretId: string): string {
    return path.join(this.secretsPath, `${secretId}.secret`);
  }

  private generateSecretId(name: string): string {
    return crypto
      .createHash('sha256')
      .update(name)
      .digest('hex')
      .substring(0, 16);
  }

  async storeSecret(
    name: string,
    value: string,
    options: {
      description?: string;
      tags?: string[];
      rotationPolicy?: SecretMetadata['rotationPolicy'];
    } = {}
  ): Promise<string> {
    try {
      const secretId = this.generateSecretId(name);
      // Use a simple XOR encryption for compatibility
      const encrypted = this.simpleEncrypt(
        value,
        this.masterKey.toString('hex')
      );
      const authTag = Buffer.alloc(0);

      const metadata: SecretMetadata = {
        id: secretId,
        name,
        description: options.description,
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
        tags: options.tags || [],
        rotationPolicy: options.rotationPolicy,
      };

      // Check if secret already exists and increment version
      try {
        const existing = await this.loadSecretFromFile(secretId);
        metadata.version = existing.metadata.version + 1;
        metadata.createdAt = existing.metadata.createdAt;
      } catch {
        // Secret doesn't exist, use defaults
      }

      const encryptedSecret: EncryptedSecret = {
        metadata,
        encryptedValue: encrypted,
        iv: '',
        authTag: '',
        algorithm: 'simple-xor',
      };

      const secretPath = this.getSecretFilePath(secretId);
      await fs.writeFile(secretPath, JSON.stringify(encryptedSecret, null, 2), {
        mode: 0o600, // Read/write for owner only
      });

      // Update cache
      this.secretsCache.set(name, { value, metadata });
      this.cacheExpiry.set(name, Date.now() + this.cacheTTL);

      console.log(
        `Secret stored: ${name} (ID: ${secretId}, Version: ${metadata.version})`
      );
      return secretId;
    } catch (error) {
      console.error(`Failed to store secret ${name}:`, error);
      throw new Error(`Failed to store secret: ${error.message}`);
    }
  }

  async getSecret(name: string): Promise<string | null> {
    try {
      // Check cache first
      const cached = this.secretsCache.get(name);
      const cacheExpiry = this.cacheExpiry.get(name);

      if (cached && cacheExpiry && Date.now() < cacheExpiry) {
        return cached.value;
      }

      const secretId = this.generateSecretId(name);
      const secretValue = await this.loadSecretFromFile(secretId);

      // Update cache
      this.secretsCache.set(name, secretValue);
      this.cacheExpiry.set(name, Date.now() + this.cacheTTL);

      return secretValue.value;
    } catch (error) {
      // Debug level - don't log in production
      if (process.env.NODE_ENV === 'development') {
        console.debug(`Secret not found: ${name}`);
      }
      return null;
    }
  }

  private async loadSecretFromFile(secretId: string): Promise<SecretValue> {
    const secretPath = this.getSecretFilePath(secretId);

    try {
      const encryptedData = await fs.readFile(secretPath, 'utf8');
      const encryptedSecret: EncryptedSecret = JSON.parse(encryptedData);

      let decrypted: string;

      if (encryptedSecret.algorithm === 'simple-xor') {
        decrypted = this.simpleDecrypt(
          encryptedSecret.encryptedValue,
          this.masterKey.toString('hex')
        );
      } else {
        // Legacy support for other algorithms (would need proper implementation)
        throw new Error(
          `Unsupported encryption algorithm: ${encryptedSecret.algorithm}`
        );
      }

      return {
        value: decrypted,
        metadata: encryptedSecret.metadata,
      };
    } catch (error) {
      throw new Error(`Failed to decrypt secret: ${error.message}`);
    }
  }

  async listSecrets(): Promise<SecretMetadata[]> {
    try {
      const files = await fs.readdir(this.secretsPath);
      const secretFiles = files.filter((file) => file.endsWith('.secret'));

      const secrets: SecretMetadata[] = [];

      for (const file of secretFiles) {
        try {
          const filePath = path.join(this.secretsPath, file);
          const encryptedData = await fs.readFile(filePath, 'utf8');
          const encryptedSecret: EncryptedSecret = JSON.parse(encryptedData);
          secrets.push(encryptedSecret.metadata);
        } catch (error) {
          console.warn(`Failed to read secret metadata from ${file}:`, error);
        }
      }

      return secrets.sort((a, b) => a.name.localeCompare(b.name));
    } catch (error) {
      console.error('Failed to list secrets:', error);
      return [];
    }
  }

  async deleteSecret(name: string): Promise<boolean> {
    try {
      const secretId = this.generateSecretId(name);
      const secretPath = this.getSecretFilePath(secretId);

      await fs.unlink(secretPath);

      // Remove from cache
      this.secretsCache.delete(name);
      this.cacheExpiry.delete(name);

      console.log(`Secret deleted: ${name} (ID: ${secretId})`);
      return true;
    } catch (error) {
      console.error(`Failed to delete secret ${name}:`, error);
      return false;
    }
  }

  async rotateSecret(name: string, newValue: string): Promise<string> {
    const existing = await this.getSecret(name);
    if (!existing) {
      throw new Error(`Secret ${name} not found`);
    }

    return this.storeSecret(name, newValue, {
      description: `Rotated secret for ${name}`,
      tags: ['rotated'],
    });
  }

  async exportSecrets(
    outputPath: string,
    includeValues = false
  ): Promise<void> {
    try {
      const secrets = await this.listSecrets();
      const exportData: any = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        secrets: secrets.map((secret) => ({
          ...secret,
          value: includeValues ? '***ENCRYPTED***' : undefined,
        })),
      };

      if (includeValues) {
        console.warn('Exporting secrets with values - ensure secure handling');
      }

      await fs.writeFile(outputPath, JSON.stringify(exportData, null, 2));
      console.log(`Secrets exported to: ${outputPath}`);
    } catch (error) {
      console.error('Failed to export secrets:', error);
      throw error;
    }
  }

  async importSecrets(inputPath: string): Promise<number> {
    try {
      const importData = JSON.parse(await fs.readFile(inputPath, 'utf8'));
      let importedCount = 0;

      for (const secretData of importData.secrets) {
        if (secretData.value && secretData.value !== '***ENCRYPTED***') {
          await this.storeSecret(secretData.name, secretData.value, {
            description: secretData.description,
            tags: [...(secretData.tags || []), 'imported'],
          });
          importedCount++;
        }
      }

      console.log(`Imported ${importedCount} secrets from: ${inputPath}`);
      return importedCount;
    } catch (error) {
      console.error('Failed to import secrets:', error);
      throw error;
    }
  }

  clearCache(): void {
    this.secretsCache.clear();
    this.cacheExpiry.clear();
    if (process.env.NODE_ENV === 'development') {
      console.debug('Secrets cache cleared');
    }
  }

  async checkRotationNeeded(): Promise<SecretMetadata[]> {
    const secrets = await this.listSecrets();
    const needsRotation: SecretMetadata[] = [];

    for (const secret of secrets) {
      if (secret.rotationPolicy?.enabled) {
        const lastRotated =
          secret.rotationPolicy.lastRotated || secret.createdAt;
        const rotationInterval =
          secret.rotationPolicy.intervalDays * 24 * 60 * 60 * 1000;

        // Ensure lastRotated is a Date object
        const lastRotatedDate =
          lastRotated instanceof Date ? lastRotated : new Date(lastRotated);

        if (Date.now() - lastRotatedDate.getTime() > rotationInterval) {
          needsRotation.push(secret);
        }
      }
    }

    return needsRotation;
  }

  private simpleEncrypt(text: string, key: string): string {
    let result = '';
    for (let i = 0; i < text.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const textChar = text.charCodeAt(i);
      result += String.fromCharCode(textChar ^ keyChar);
    }
    return Buffer.from(result, 'binary').toString('base64');
  }

  private simpleDecrypt(encryptedText: string, key: string): string {
    const encrypted = Buffer.from(encryptedText, 'base64').toString('binary');
    let result = '';
    for (let i = 0; i < encrypted.length; i++) {
      const keyChar = key.charCodeAt(i % key.length);
      const encryptedChar = encrypted.charCodeAt(i);
      result += String.fromCharCode(encryptedChar ^ keyChar);
    }
    return result;
  }

  // Utility method to safely get environment variable or secret
  async getConfigValue(
    key: string,
    defaultValue?: string
  ): Promise<string | undefined> {
    // First try environment variable
    const envValue = process.env[key];
    if (envValue) {
      return envValue;
    }

    // Then try secret
    const secretValue = await this.getSecret(key);
    if (secretValue) {
      return secretValue;
    }

    return defaultValue;
  }
}
