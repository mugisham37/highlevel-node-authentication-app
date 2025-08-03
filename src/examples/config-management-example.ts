#!/usr/bin/env tsx

/**
 * Configuration Management System Example
 *
 * This example demonstrates the comprehensive configuration management system
 * including secrets management, dynamic configuration updates, and environment profiles.
 */

import {
  configManager,
  SecretsManager,
  createSecretsManager,
} from '../infrastructure/config';
import { logger } from '../infrastructure/logging/winston-logger';

async function demonstrateConfigurationSystem() {
  console.log('🔧 Configuration Management System Demo\n');

  try {
    // 1. Initialize the configuration system
    console.log('1. Initializing configuration system...');
    await configManager.initialize({
      secretsPath: '.demo-secrets',
      enableDynamicConfig: true,
    });
    console.log('✅ Configuration system initialized\n');

    // 2. Display current configuration
    console.log('2. Current configuration:');
    const config = configManager.getConfig();
    console.log(`   Environment: ${config.env}`);
    console.log(`   Server: ${config.server.host}:${config.server.port}`);
    console.log(`   Database: ${config.database.url || 'Not configured'}`);
    console.log(`   Redis: ${config.redis.url}`);
    console.log(`   Logging Level: ${config.logging.level}\n`);

    // 3. Demonstrate secrets management
    console.log('3. Secrets Management:');
    const secretsManager = configManager.getSecretsManager();

    // Store some example secrets
    await secretsManager.storeSecret('API_KEY', 'sk-1234567890abcdef', {
      description: 'External API key',
      tags: ['api', 'external'],
      rotationPolicy: {
        enabled: true,
        intervalDays: 30,
      },
    });

    await secretsManager.storeSecret(
      'DATABASE_PASSWORD',
      'super-secure-password',
      {
        description: 'Database connection password',
        tags: ['database', 'critical'],
      }
    );

    // List stored secrets
    const secrets = await secretsManager.listSecrets();
    console.log(`   Stored ${secrets.length} secrets:`);
    secrets.forEach((secret) => {
      console.log(
        `   - ${secret.name} (v${secret.version}) - ${secret.description}`
      );
    });
    console.log();

    // 4. Demonstrate dynamic configuration updates
    console.log('4. Dynamic Configuration Updates:');

    // Update server configuration
    const updateResult = await configManager.updateConfigSection('server', {
      host: 'localhost',
      port: 4000,
      cors: {
        origin: ['http://localhost:3000', 'http://localhost:3001'],
        credentials: true,
      },
      helmet: {
        contentSecurityPolicy: true,
        crossOriginEmbedderPolicy: false,
      },
    });

    if (updateResult.valid) {
      console.log('   ✅ Server configuration updated successfully');
      const updatedConfig = configManager.getConfig();
      console.log(`   New server port: ${updatedConfig.server.port}`);
    } else {
      console.log('   ❌ Configuration update failed:', updateResult.errors);
    }
    console.log();

    // 5. Demonstrate configuration validation
    console.log('5. Configuration Validation:');

    // Try to set an invalid configuration
    const invalidUpdateResult = await configManager.updateConfigSection(
      'server',
      {
        host: 'localhost',
        port: 70000, // Invalid port number
        cors: { origin: true, credentials: true },
        helmet: {
          contentSecurityPolicy: true,
          crossOriginEmbedderPolicy: false,
        },
      }
    );

    if (!invalidUpdateResult.valid) {
      console.log('   ✅ Validation correctly rejected invalid configuration:');
      invalidUpdateResult.errors.forEach((error) => {
        console.log(`   - ${error}`);
      });
    }
    console.log();

    // 6. Demonstrate environment-specific configurations
    console.log('6. Environment Profiles:');
    console.log('   Available profiles:');
    console.log('   - development: Local development with debug features');
    console.log('   - staging: Pre-production testing environment');
    console.log(
      '   - production: Production environment with security hardening'
    );
    console.log('   - test: Automated testing environment');
    console.log(`   Current profile: ${config.env}\n`);

    // 7. Demonstrate configuration export/import
    console.log('7. Configuration Export/Import:');
    const dynamicConfigManager = configManager.getDynamicConfigManager();

    if (dynamicConfigManager) {
      // Export configuration
      const exportPath = 'config-export-demo.json';
      await dynamicConfigManager.exportConfig(exportPath);
      console.log(`   ✅ Configuration exported to: ${exportPath}`);

      // Show configuration history
      const history = await dynamicConfigManager.getConfigHistory(3);
      console.log(`   Configuration history (last ${history.length} changes):`);
      history.forEach((entry, index) => {
        console.log(`   ${index + 1}. ${entry.timestamp.toISOString()}`);
      });
    }
    console.log();

    // 8. Demonstrate utility methods
    console.log('8. Utility Methods:');
    console.log(`   Is Development: ${configManager.isDevelopment()}`);
    console.log(`   Is Production: ${configManager.isProduction()}`);
    console.log(`   Is Test: ${configManager.isTest()}`);
    console.log(`   Server URL: ${configManager.getServerUrl()}`);
    console.log(
      `   Database URL: ${configManager.getDatabaseUrl() || 'Not configured'}`
    );
    console.log(`   Redis URL: ${configManager.getRedisUrl()}\n`);

    // 9. Demonstrate secret rotation check
    console.log('9. Secret Rotation Management:');
    const needsRotation = await secretsManager.checkRotationNeeded();
    if (needsRotation.length > 0) {
      console.log('   Secrets needing rotation:');
      needsRotation.forEach((secret) => {
        console.log(
          `   - ${secret.name} (last rotated: ${secret.rotationPolicy?.lastRotated || secret.createdAt})`
        );
      });
    } else {
      console.log('   ✅ No secrets need rotation at this time');
    }
    console.log();

    // 10. Demonstrate configuration change events
    console.log('10. Configuration Change Events:');
    const changeListener = (changeEvent: any) => {
      console.log(
        `   📢 Configuration changed: ${changeEvent.section} by ${changeEvent.source}`
      );
    };

    if (dynamicConfigManager) {
      dynamicConfigManager.on('configChange', changeListener);

      // Make a change to trigger the event
      await configManager.updateConfigSection('logging', {
        level: 'debug',
        format: 'simple',
        file: {
          enabled: true,
          path: 'logs/demo.log',
          maxSize: '10m',
          maxFiles: 5,
        },
        console: {
          enabled: true,
          colorize: true,
        },
        audit: {
          enabled: true,
          path: 'logs/audit.log',
          maxSize: '100m',
          maxFiles: 10,
        },
      });

      // Remove listener
      dynamicConfigManager.off('configChange', changeListener);
    }

    console.log(
      '\n🎉 Configuration management system demo completed successfully!'
    );
    console.log('\nNext steps:');
    console.log(
      '- Use the CLI tool: tsx src/infrastructure/config/cli.ts help'
    );
    console.log(
      '- Check the exported configuration file: config-export-demo.json'
    );
    console.log('- Explore the secrets in: .demo-secrets/');
  } catch (error) {
    console.error('❌ Demo failed:', error);
  } finally {
    // Cleanup
    await configManager.shutdown();
  }
}

// Advanced example: Custom secrets manager with encryption
async function demonstrateAdvancedSecretsManagement() {
  console.log('\n🔐 Advanced Secrets Management Demo\n');

  try {
    // Create a custom secrets manager with specific encryption settings
    const customSecretsManager = new SecretsManager(
      '.advanced-secrets',
      'custom-master-key'
    );

    // Store secrets with different policies
    await customSecretsManager.storeSecret(
      'PRODUCTION_DB_PASSWORD',
      'prod-db-pass-123',
      {
        description: 'Production database password',
        tags: ['production', 'database', 'critical'],
        rotationPolicy: {
          enabled: true,
          intervalDays: 7, // Weekly rotation
        },
      }
    );

    await customSecretsManager.storeSecret(
      'JWT_SIGNING_KEY',
      'jwt-key-abcdef123456',
      {
        description: 'JWT token signing key',
        tags: ['jwt', 'authentication', 'critical'],
        rotationPolicy: {
          enabled: true,
          intervalDays: 30, // Monthly rotation
        },
      }
    );

    await customSecretsManager.storeSecret(
      'THIRD_PARTY_API_KEY',
      'api-key-xyz789',
      {
        description: 'Third-party service API key',
        tags: ['api', 'external'],
        rotationPolicy: {
          enabled: false, // Manual rotation only
        },
      }
    );

    // Demonstrate secret versioning
    console.log('1. Secret Versioning:');
    const originalValue =
      await customSecretsManager.getSecret('JWT_SIGNING_KEY');
    console.log(`   Original JWT key: ${originalValue?.substring(0, 10)}...`);

    // Rotate the secret
    await customSecretsManager.rotateSecret(
      'JWT_SIGNING_KEY',
      'new-jwt-key-fedcba654321'
    );
    const rotatedValue =
      await customSecretsManager.getSecret('JWT_SIGNING_KEY');
    console.log(`   Rotated JWT key: ${rotatedValue?.substring(0, 10)}...`);

    // Check version
    const secrets = await customSecretsManager.listSecrets();
    const jwtSecret = secrets.find((s) => s.name === 'JWT_SIGNING_KEY');
    console.log(`   Current version: ${jwtSecret?.version}\n`);

    // Demonstrate export/import with encryption
    console.log('2. Secure Export/Import:');
    await customSecretsManager.exportSecrets('secrets-backup.json', false);
    console.log('   ✅ Secrets metadata exported (values encrypted)\n');

    // Demonstrate configuration value resolution
    console.log('3. Configuration Value Resolution:');

    // Set an environment variable
    process.env.TEST_ENV_VAR = 'env-value';

    const envValue = await customSecretsManager.getConfigValue('TEST_ENV_VAR');
    console.log(`   Environment variable: ${envValue}`);

    const secretValue =
      await customSecretsManager.getConfigValue('JWT_SIGNING_KEY');
    console.log(`   Secret value: ${secretValue?.substring(0, 10)}...`);

    const defaultValue = await customSecretsManager.getConfigValue(
      'NON_EXISTENT',
      'default-value'
    );
    console.log(`   Default value: ${defaultValue}\n`);

    // Cleanup
    delete process.env.TEST_ENV_VAR;

    console.log('🎉 Advanced secrets management demo completed!');
  } catch (error) {
    console.error('❌ Advanced demo failed:', error);
  }
}

// Run the demonstrations
async function main() {
  await demonstrateConfigurationSystem();
  await demonstrateAdvancedSecretsManagement();
}

if (require.main === module) {
  main().catch(console.error);
}

export { demonstrateConfigurationSystem, demonstrateAdvancedSecretsManagement };
