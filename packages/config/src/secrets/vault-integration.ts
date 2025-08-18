
export interface SecretProvider {
  getSecret(key: string): Promise<string | null>;
  setSecret(key: string, value: string): Promise<void>;
  deleteSecret(key: string): Promise<void>;
  listSecrets(): Promise<string[]>;
}

export interface VaultConfig {
  endpoint: string;
  token: string;
  namespace?: string;
  mountPath?: string;
}

export interface AWSSecretsManagerConfig {
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  sessionToken?: string;
}

// HashiCorp Vault integration
export class VaultSecretProvider implements SecretProvider {
  private config: VaultConfig;

  constructor(config: VaultConfig) {
    this.config = config;
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      const response = await fetch(
        `${this.config.endpoint}/v1/${this.config.mountPath || 'secret'}/data/${key}`,
        {
          headers: {
            'X-Vault-Token': this.config.token,
            'X-Vault-Namespace': this.config.namespace || '',
          },
        }
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Vault API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data?.data?.value || null;
    } catch (error) {
      console.error('Error retrieving secret from Vault:', error);
      throw error;
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.endpoint}/v1/${this.config.mountPath || 'secret'}/data/${key}`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Vault-Token': this.config.token,
            'X-Vault-Namespace': this.config.namespace || '',
          },
          body: JSON.stringify({
            data: { value },
          }),
        }
      );

      if (!response.ok) {
        throw new Error(`Vault API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error storing secret in Vault:', error);
      throw error;
    }
  }

  async deleteSecret(key: string): Promise<void> {
    try {
      const response = await fetch(
        `${this.config.endpoint}/v1/${this.config.mountPath || 'secret'}/metadata/${key}`,
        {
          method: 'DELETE',
          headers: {
            'X-Vault-Token': this.config.token,
            'X-Vault-Namespace': this.config.namespace || '',
          },
        }
      );

      if (!response.ok && response.status !== 404) {
        throw new Error(`Vault API error: ${response.statusText}`);
      }
    } catch (error) {
      console.error('Error deleting secret from Vault:', error);
      throw error;
    }
  }

  async listSecrets(): Promise<string[]> {
    try {
      const response = await fetch(
        `${this.config.endpoint}/v1/${this.config.mountPath || 'secret'}/metadata?list=true`,
        {
          headers: {
            'X-Vault-Token': this.config.token,
            'X-Vault-Namespace': this.config.namespace || '',
          },
        }
      );

      if (!response.ok) {
        throw new Error(`Vault API error: ${response.statusText}`);
      }

      const data = await response.json();
      return data.data?.keys || [];
    } catch (error) {
      console.error('Error listing secrets from Vault:', error);
      throw error;
    }
  }
}

// AWS Secrets Manager integration
export class AWSSecretsManagerProvider implements SecretProvider {
  private config: AWSSecretsManagerConfig;

  constructor(config: AWSSecretsManagerConfig) {
    this.config = config;
  }

  async getSecret(key: string): Promise<string | null> {
    try {
      // This would typically use AWS SDK
      // For now, we'll provide a mock implementation
      console.warn('AWS Secrets Manager integration requires AWS SDK implementation');
      return null;
    } catch (error) {
      console.error('Error retrieving secret from AWS Secrets Manager:', error);
      throw error;
    }
  }

  async setSecret(key: string, value: string): Promise<void> {
    try {
      // This would typically use AWS SDK
      console.warn('AWS Secrets Manager integration requires AWS SDK implementation');
    } catch (error) {
      console.error('Error storing secret in AWS Secrets Manager:', error);
      throw error;
    }
  }

  async deleteSecret(key: string): Promise<void> {
    try {
      // This would typically use AWS SDK
      console.warn('AWS Secrets Manager integration requires AWS SDK implementation');
    } catch (error) {
      console.error('Error deleting secret from AWS Secrets Manager:', error);
      throw error;
    }
  }

  async listSecrets(): Promise<string[]> {
    try {
      // This would typically use AWS SDK
      console.warn('AWS Secrets Manager integration requires AWS SDK implementation');
      return [];
    } catch (error) {
      console.error('Error listing secrets from AWS Secrets Manager:', error);
      throw error;
    }
  }
}

// Environment-based secret provider (fallback)
export class EnvironmentSecretProvider implements SecretProvider {
  async getSecret(key: string): Promise<string | null> {
    return process.env[key] || null;
  }

  async setSecret(key: string, value: string): Promise<void> {
    process.env[key] = value;
  }

  async deleteSecret(key: string): Promise<void> {
    delete process.env[key];
  }

  async listSecrets(): Promise<string[]> {
    return Object.keys(process.env);
  }
}

// Secret manager factory
export class SecretManager {
  private provider: SecretProvider;

  constructor(provider?: SecretProvider) {
    this.provider = provider || this.createDefaultProvider();
  }

  private createDefaultProvider(): SecretProvider {
    // Determine provider based on environment configuration
    const vaultEndpoint = process.env.VAULT_ENDPOINT;
    const vaultToken = process.env.VAULT_TOKEN;
    
    if (vaultEndpoint && vaultToken) {
      return new VaultSecretProvider({
        endpoint: vaultEndpoint,
        token: vaultToken,
        namespace: process.env.VAULT_NAMESPACE,
        mountPath: process.env.VAULT_MOUNT_PATH,
      });
    }

    const awsRegion = process.env.AWS_REGION;
    if (awsRegion) {
      return new AWSSecretsManagerProvider({
        region: awsRegion,
        accessKeyId: process.env.AWS_ACCESS_KEY_ID,
        secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
        sessionToken: process.env.AWS_SESSION_TOKEN,
      });
    }

    // Fallback to environment variables
    return new EnvironmentSecretProvider();
  }

  async getSecret(key: string): Promise<string | null> {
    return this.provider.getSecret(key);
  }

  async setSecret(key: string, value: string): Promise<void> {
    return this.provider.setSecret(key, value);
  }

  async deleteSecret(key: string): Promise<void> {
    return this.provider.deleteSecret(key);
  }

  async listSecrets(): Promise<string[]> {
    return this.provider.listSecrets();
  }

  // Utility methods for common secrets
  async getDatabasePassword(): Promise<string | null> {
    return this.getSecret('DATABASE_PASSWORD');
  }

  async getJwtSecret(): Promise<string | null> {
    return this.getSecret('JWT_SECRET');
  }

  async getRedisPassword(): Promise<string | null> {
    return this.getSecret('REDIS_PASSWORD');
  }

  async getSmtpPassword(): Promise<string | null> {
    return this.getSecret('SMTP_PASSWORD');
  }

  async getOAuthClientSecret(provider: string): Promise<string | null> {
    return this.getSecret(`${provider.toUpperCase()}_CLIENT_SECRET`);
  }
}

// Export singleton instance
export const secretManager = new SecretManager();