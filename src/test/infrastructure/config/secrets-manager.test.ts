import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import * as fs from 'fs/promises';
import * as path from 'path';
import { SecretsManager } from '../../../infrastructure/config/secrets-manager';

describe('SecretsManager', () => {
  let secretsManager: SecretsManager;
  let testSecretsPath: string;

  beforeEach(async () => {
    // Create a temporary directory for test secrets
    testSecretsPath = path.join(__dirname, 'test-secrets');
    await fs.mkdir(testSecretsPath, { recursive: true });

    secretsManager = new SecretsManager(
      testSecretsPath,
      'test-master-password'
    );
  });

  afterEach(async () => {
    // Clean up test secrets directory
    try {
      await fs.rm(testSecretsPath, { recursive: true, force: true });
    } catch (error) {
      // Ignore cleanup errors
    }
  });

  describe('secret storage and retrieval', () => {
    it('should store and retrieve a secret', async () => {
      const secretName = 'test-secret';
      const secretValue = 'super-secret-value';

      const secretId = await secretsManager.storeSecret(
        secretName,
        secretValue,
        {
          description: 'Test secret',
          tags: ['test'],
        }
      );

      expect(secretId).toBeDefined();
      expect(typeof secretId).toBe('string');

      const retrievedValue = await secretsManager.getSecret(secretName);
      expect(retrievedValue).toBe(secretValue);
    });

    it('should return null for non-existent secret', async () => {
      const retrievedValue = await secretsManager.getSecret(
        'non-existent-secret'
      );
      expect(retrievedValue).toBeNull();
    });

    it('should update existing secret with new version', async () => {
      const secretName = 'versioned-secret';
      const originalValue = 'original-value';
      const updatedValue = 'updated-value';

      // Store original secret
      await secretsManager.storeSecret(secretName, originalValue);

      // Update secret
      await secretsManager.storeSecret(secretName, updatedValue);

      const retrievedValue = await secretsManager.getSecret(secretName);
      expect(retrievedValue).toBe(updatedValue);

      // Check that version was incremented
      const secrets = await secretsManager.listSecrets();
      const secret = secrets.find((s) => s.name === secretName);
      expect(secret?.version).toBe(2);
    });
  });

  describe('secret listing and metadata', () => {
    it('should list stored secrets', async () => {
      await secretsManager.storeSecret('secret1', 'value1', {
        description: 'First secret',
        tags: ['tag1'],
      });

      await secretsManager.storeSecret('secret2', 'value2', {
        description: 'Second secret',
        tags: ['tag2'],
      });

      const secrets = await secretsManager.listSecrets();
      expect(secrets).toHaveLength(2);

      const secret1 = secrets.find((s) => s.name === 'secret1');
      expect(secret1).toBeDefined();
      expect(secret1?.description).toBe('First secret');
      expect(secret1?.tags).toContain('tag1');
      expect(secret1?.version).toBe(1);
    });

    it('should return empty list when no secrets exist', async () => {
      const secrets = await secretsManager.listSecrets();
      expect(secrets).toHaveLength(0);
    });
  });

  describe('secret deletion', () => {
    it('should delete existing secret', async () => {
      const secretName = 'deletable-secret';
      await secretsManager.storeSecret(secretName, 'value-to-delete');

      const deleteResult = await secretsManager.deleteSecret(secretName);
      expect(deleteResult).toBe(true);

      const retrievedValue = await secretsManager.getSecret(secretName);
      expect(retrievedValue).toBeNull();
    });

    it('should return false when deleting non-existent secret', async () => {
      const deleteResult = await secretsManager.deleteSecret(
        'non-existent-secret'
      );
      expect(deleteResult).toBe(false);
    });
  });

  describe('secret rotation', () => {
    it('should rotate existing secret', async () => {
      const secretName = 'rotatable-secret';
      const originalValue = 'original-value';
      const rotatedValue = 'rotated-value';

      await secretsManager.storeSecret(secretName, originalValue);

      const rotatedSecretId = await secretsManager.rotateSecret(
        secretName,
        rotatedValue
      );
      expect(rotatedSecretId).toBeDefined();

      const retrievedValue = await secretsManager.getSecret(secretName);
      expect(retrievedValue).toBe(rotatedValue);

      // Check that version was incremented
      const secrets = await secretsManager.listSecrets();
      const secret = secrets.find((s) => s.name === secretName);
      expect(secret?.version).toBe(2);
      expect(secret?.tags).toContain('rotated');
    });

    it('should throw error when rotating non-existent secret', async () => {
      await expect(
        secretsManager.rotateSecret('non-existent-secret', 'new-value')
      ).rejects.toThrow('Secret non-existent-secret not found');
    });
  });

  describe('cache management', () => {
    it('should cache retrieved secrets', async () => {
      const secretName = 'cached-secret';
      const secretValue = 'cached-value';

      await secretsManager.storeSecret(secretName, secretValue);

      // First retrieval (from file)
      const value1 = await secretsManager.getSecret(secretName);
      expect(value1).toBe(secretValue);

      // Second retrieval (from cache)
      const value2 = await secretsManager.getSecret(secretName);
      expect(value2).toBe(secretValue);
    });

    it('should clear cache', async () => {
      const secretName = 'clearable-secret';
      const secretValue = 'clearable-value';

      await secretsManager.storeSecret(secretName, secretValue);
      await secretsManager.getSecret(secretName); // Load into cache

      secretsManager.clearCache();

      // Should still be able to retrieve from file
      const retrievedValue = await secretsManager.getSecret(secretName);
      expect(retrievedValue).toBe(secretValue);
    });
  });

  describe('import and export', () => {
    it('should export secrets metadata', async () => {
      await secretsManager.storeSecret('export-secret1', 'value1');
      await secretsManager.storeSecret('export-secret2', 'value2');

      const exportPath = path.join(testSecretsPath, 'export.json');
      await secretsManager.exportSecrets(exportPath, false);

      const exportData = JSON.parse(await fs.readFile(exportPath, 'utf8'));
      expect(exportData.secrets).toHaveLength(2);
      expect(exportData.secrets[0].name).toBeDefined();
      expect(exportData.secrets[0].value).toBeUndefined();
    });

    it('should import secrets', async () => {
      // Create import data
      const importData = {
        exportedAt: new Date().toISOString(),
        version: '1.0',
        secrets: [
          {
            name: 'imported-secret1',
            value: 'imported-value1',
            description: 'Imported secret 1',
            tags: ['imported'],
          },
          {
            name: 'imported-secret2',
            value: 'imported-value2',
            description: 'Imported secret 2',
            tags: ['imported'],
          },
        ],
      };

      const importPath = path.join(testSecretsPath, 'import.json');
      await fs.writeFile(importPath, JSON.stringify(importData));

      const importedCount = await secretsManager.importSecrets(importPath);
      expect(importedCount).toBe(2);

      const value1 = await secretsManager.getSecret('imported-secret1');
      expect(value1).toBe('imported-value1');

      const value2 = await secretsManager.getSecret('imported-secret2');
      expect(value2).toBe('imported-value2');
    });
  });

  describe('configuration value retrieval', () => {
    it('should get value from environment variable first', async () => {
      process.env.TEST_CONFIG_VALUE = 'env-value';

      const value = await secretsManager.getConfigValue(
        'TEST_CONFIG_VALUE',
        'default-value'
      );
      expect(value).toBe('env-value');

      delete process.env.TEST_CONFIG_VALUE;
    });

    it('should get value from secret if env var not available', async () => {
      await secretsManager.storeSecret('TEST_SECRET_VALUE', 'secret-value');

      const value = await secretsManager.getConfigValue(
        'TEST_SECRET_VALUE',
        'default-value'
      );
      expect(value).toBe('secret-value');
    });

    it('should return default value if neither env var nor secret available', async () => {
      const value = await secretsManager.getConfigValue(
        'NON_EXISTENT_VALUE',
        'default-value'
      );
      expect(value).toBe('default-value');
    });

    it('should return undefined if no default provided', async () => {
      const value = await secretsManager.getConfigValue('NON_EXISTENT_VALUE');
      expect(value).toBeUndefined();
    });
  });

  describe('rotation policy', () => {
    it('should check for secrets needing rotation', async () => {
      const pastDate = new Date();
      pastDate.setDate(pastDate.getDate() - 10); // 10 days ago

      await secretsManager.storeSecret('rotation-secret', 'value', {
        rotationPolicy: {
          enabled: true,
          intervalDays: 7,
          lastRotated: pastDate,
        },
      });

      const needsRotation = await secretsManager.checkRotationNeeded();
      expect(needsRotation).toHaveLength(1);
      expect(needsRotation[0].name).toBe('rotation-secret');
    });

    it('should not flag secrets that do not need rotation', async () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 1); // 1 day ago

      await secretsManager.storeSecret('recent-secret', 'value', {
        rotationPolicy: {
          enabled: true,
          intervalDays: 7,
          lastRotated: recentDate,
        },
      });

      const needsRotation = await secretsManager.checkRotationNeeded();
      expect(needsRotation).toHaveLength(0);
    });
  });
});
