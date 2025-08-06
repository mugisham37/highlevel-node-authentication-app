#!/usr/bin/env node

import { configManager } from './config-manager';
import { SecretsManager } from './secrets-manager';
import { EnvironmentProfile } from './types';

// Helper function to extract error message from unknown error
function getErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unknown error occurred';
}

// Helper function to validate environment profile
function validateEnvironmentProfile(profile: string): profile is EnvironmentProfile {
  return ['development', 'staging', 'production', 'test'].includes(profile);
}

interface CLICommand {
  name: string;
  description: string;
  handler: (args: string[]) => Promise<void>;
}

class ConfigCLI {
  private commands: CLICommand[] = [
    {
      name: 'init',
      description: 'Initialize configuration system',
      handler: this.handleInit.bind(this),
    },
    {
      name: 'get',
      description: 'Get configuration value (usage: get <section> [key])',
      handler: this.handleGet.bind(this),
    },
    {
      name: 'set',
      description: 'Set configuration value (usage: set <section.key> <value>)',
      handler: this.handleSet.bind(this),
    },
    {
      name: 'validate',
      description: 'Validate current configuration',
      handler: this.handleValidate.bind(this),
    },
    {
      name: 'export',
      description: 'Export configuration (usage: export <file>)',
      handler: this.handleExport.bind(this),
    },
    {
      name: 'import',
      description: 'Import configuration (usage: import <file>)',
      handler: this.handleImport.bind(this),
    },
    {
      name: 'secret',
      description:
        'Manage secrets (usage: secret <store|get|list|delete> [args...])',
      handler: this.handleSecret.bind(this),
    },
    {
      name: 'profile',
      description:
        'Manage environment profiles (usage: profile <list|switch> [profile])',
      handler: this.handleProfile.bind(this),
    },
    {
      name: 'backup',
      description: 'Create configuration backup',
      handler: this.handleBackup.bind(this),
    },
    {
      name: 'restore',
      description: 'Restore configuration from backup (usage: restore <file>)',
      handler: this.handleRestore.bind(this),
    },
    {
      name: 'help',
      description: 'Show help information',
      handler: this.handleHelp.bind(this),
    },
  ];

  async run(args: string[]): Promise<void> {
    const [command, ...commandArgs] = args;

    if (!command) {
      await this.handleHelp([]);
      return;
    }

    const cmd = this.commands.find((c) => c.name === command);
    if (!cmd) {
      console.error(`Unknown command: ${command}`);
      await this.handleHelp([]);
      process.exit(1);
    }

    try {
      await cmd.handler(commandArgs);
    } catch (error) {
      console.error(`Error executing command '${command}':`, getErrorMessage(error));
      process.exit(1);
    }
  }

  private async handleInit(_args: string[]): Promise<void> {
    console.log('Initializing configuration system...');

    try {
      await configManager.initialize({
        enableDynamicConfig: true,
      });

      console.log('✅ Configuration system initialized successfully');
      console.log(`Environment: ${configManager.getConfig().env}`);
      console.log(`Server: ${configManager.getServerUrl()}`);
    } catch (error) {
      console.error(
        '❌ Failed to initialize configuration system:',
        getErrorMessage(error)
      );
      throw error;
    }
  }

  private async handleGet(args: string[]): Promise<void> {
    const [section, key] = args;

    if (!section) {
      console.error('Usage: get <section> [key]');
      return;
    }

    await this.ensureInitialized();

    if (key) {
      const sectionConfig = configManager.getConfigSection(section as any);
      if (sectionConfig && typeof sectionConfig === 'object') {
        console.log(JSON.stringify(sectionConfig[key], null, 2));
      } else {
        console.log('Section or key not found');
      }
    } else {
      const sectionConfig = configManager.getConfigSection(section as any);
      console.log(JSON.stringify(sectionConfig, null, 2));
    }
  }

  private async handleSet(args: string[]): Promise<void> {
    const [keyPath, value] = args;

    if (!keyPath || value === undefined) {
      console.error('Usage: set <section.key> <value>');
      return;
    }

    await this.ensureInitialized();

    const [section, key] = keyPath.split('.');
    if (!section || !key) {
      console.error('Key path must be in format: section.key');
      return;
    }

    // Parse value as JSON if possible, otherwise use as string
    let parsedValue: any = value;
    try {
      parsedValue = JSON.parse(value);
    } catch {
      // Use as string if not valid JSON
    }

    const currentSection = configManager.getConfigSection(section as any) || {};
    const updatedSection = { ...currentSection, [key]: parsedValue };

    const result = await configManager.updateConfigSection(
      section as any,
      updatedSection,
      'cli-user'
    );

    if (result.valid) {
      console.log(`✅ Configuration updated: ${keyPath} = ${value}`);
    } else {
      console.error(
        '❌ Failed to update configuration:',
        result.errors.join(', ')
      );
    }
  }

  private async handleValidate(_args: string[]): Promise<void> {
    await this.ensureInitialized();

    console.log('Validating configuration...');

    // Get current configuration
    const config = configManager.getConfig();

    // Basic validation checks
    const issues: string[] = [];
    const warnings: string[] = [];

    // Check required fields for current environment
    if (config.env === 'production') {
      if (!config.jwt.secret || config.jwt.secret.length < 32) {
        issues.push('JWT secret must be at least 32 characters in production');
      }

      if (!config.database.url) {
        issues.push('Database URL is required in production');
      }
    }

    // Check for common misconfigurations
    if (config.security.rateLimit.global.max > 10000) {
      warnings.push(
        'Global rate limit is very high, consider reducing for better security'
      );
    }

    if (config.logging.level === 'debug' && config.env === 'production') {
      warnings.push('Debug logging is enabled in production environment');
    }

    // Display results
    if (issues.length === 0) {
      console.log('✅ Configuration validation passed');
    } else {
      console.log('❌ Configuration validation failed:');
      issues.forEach((issue) => console.log(`  - ${issue}`));
    }

    if (warnings.length > 0) {
      console.log('⚠️  Configuration warnings:');
      warnings.forEach((warning) => console.log(`  - ${warning}`));
    }

    console.log(`\nEnvironment: ${config.env}`);
    console.log(`Server: ${config.server.host}:${config.server.port}`);
    console.log(
      `Database: ${config.database.url ? 'Configured' : 'Not configured'}`
    );
    console.log(`Redis: ${config.redis.url}`);
  }

  private async handleExport(args: string[]): Promise<void> {
    const [outputFile] = args;

    if (!outputFile) {
      console.error('Usage: export <file>');
      return;
    }

    await this.ensureInitialized();

    const dynamicConfigManager = configManager.getDynamicConfigManager();
    if (dynamicConfigManager) {
      await dynamicConfigManager.exportConfig(outputFile);
      console.log(`✅ Configuration exported to: ${outputFile}`);
    } else {
      console.error('❌ Dynamic configuration is not enabled');
    }
  }

  private async handleImport(args: string[]): Promise<void> {
    const [inputFile] = args;

    if (!inputFile) {
      console.error('Usage: import <file>');
      return;
    }

    await this.ensureInitialized();

    const dynamicConfigManager = configManager.getDynamicConfigManager();
    if (dynamicConfigManager) {
      const result = await dynamicConfigManager.importConfig(
        inputFile,
        'cli-user'
      );

      if (result.valid) {
        console.log(`✅ Configuration imported from: ${inputFile}`);
      } else {
        console.error(
          '❌ Failed to import configuration:',
          result.errors.join(', ')
        );
      }
    } else {
      console.error('❌ Dynamic configuration is not enabled');
    }
  }

  private async handleSecret(args: string[]): Promise<void> {
    const [action, ...actionArgs] = args;

    if (!action) {
      console.error('Usage: secret <store|get|list|delete> [args...]');
      return;
    }

    await this.ensureInitialized();
    const secretsManager = configManager.getSecretsManager();

    switch (action) {
      case 'store':
        await this.handleSecretStore(secretsManager, actionArgs);
        break;
      case 'get':
        await this.handleSecretGet(secretsManager, actionArgs);
        break;
      case 'list':
        await this.handleSecretList(secretsManager);
        break;
      case 'delete':
        await this.handleSecretDelete(secretsManager, actionArgs);
        break;
      default:
        console.error(`Unknown secret action: ${action}`);
    }
  }

  private async handleSecretStore(
    secretsManager: SecretsManager,
    args: string[]
  ): Promise<void> {
    const [name, value, description] = args;

    if (!name || !value) {
      console.error('Usage: secret store <name> <value> [description]');
      return;
    }

    const secretOptions: {
      description?: string;
      tags?: string[];
    } = {
      tags: ['cli-created'],
    };

    if (description) {
      secretOptions.description = description;
    }

    const secretId = await secretsManager.storeSecret(name, value, secretOptions);

    console.log(`✅ Secret stored: ${name} (ID: ${secretId})`);
  }

  private async handleSecretGet(
    secretsManager: SecretsManager,
    args: string[]
  ): Promise<void> {
    const [name] = args;

    if (!name) {
      console.error('Usage: secret get <name>');
      return;
    }

    const value = await secretsManager.getSecret(name);
    if (value) {
      console.log(value);
    } else {
      console.log(`Secret not found: ${name}`);
    }
  }

  private async handleSecretList(
    secretsManager: SecretsManager
  ): Promise<void> {
    const secrets = await secretsManager.listSecrets();

    if (secrets.length === 0) {
      console.log('No secrets found');
      return;
    }

    console.log('Stored secrets:');
    secrets.forEach((secret) => {
      console.log(
        `  ${secret.name} (v${secret.version}) - ${secret.description || 'No description'}`
      );
      console.log(`    Created: ${secret.createdAt.toISOString()}`);
      console.log(`    Updated: ${secret.updatedAt.toISOString()}`);
      if (secret.tags.length > 0) {
        console.log(`    Tags: ${secret.tags.join(', ')}`);
      }
      console.log();
    });
  }

  private async handleSecretDelete(
    secretsManager: SecretsManager,
    args: string[]
  ): Promise<void> {
    const [name] = args;

    if (!name) {
      console.error('Usage: secret delete <name>');
      return;
    }

    const success = await secretsManager.deleteSecret(name);
    if (success) {
      console.log(`✅ Secret deleted: ${name}`);
    } else {
      console.log(`❌ Failed to delete secret: ${name}`);
    }
  }

  private async handleProfile(args: string[]): Promise<void> {
    const [action, profileName] = args;

    if (!action) {
      console.error('Usage: profile <list|switch> [profile]');
      return;
    }

    switch (action) {
      case 'list':
        console.log('Available profiles:');
        console.log('  - development (local development)');
        console.log('  - staging (pre-production testing)');
        console.log('  - production (production environment)');
        console.log('  - test (automated testing)');
        break;
      case 'switch':
        if (!profileName) {
          console.error('Usage: profile switch <profile>');
          return;
        }

        if (!validateEnvironmentProfile(profileName)) {
          console.error(`❌ Invalid profile: ${profileName}. Valid profiles are: development, staging, production, test`);
          return;
        }

        // Update NODE_ENV environment variable
        process.env.NODE_ENV = profileName;

        // Reload configuration
        await configManager.reload();

        console.log(`✅ Switched to profile: ${profileName}`);
        break;
      default:
        console.error(`Unknown profile action: ${action}`);
    }
  }

  private async handleBackup(_args: string[]): Promise<void> {
    await this.ensureInitialized();

    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = `config-backup-${timestamp}.json`;

    const dynamicConfigManager = configManager.getDynamicConfigManager();
    if (dynamicConfigManager) {
      await dynamicConfigManager.exportConfig(backupFile);
      console.log(`✅ Configuration backup created: ${backupFile}`);
    } else {
      console.error('❌ Dynamic configuration is not enabled');
    }
  }

  private async handleRestore(args: string[]): Promise<void> {
    const [backupFile] = args;

    if (!backupFile) {
      console.error('Usage: restore <file>');
      return;
    }

    await this.ensureInitialized();

    const dynamicConfigManager = configManager.getDynamicConfigManager();
    if (dynamicConfigManager) {
      const result = await dynamicConfigManager.importConfig(
        backupFile,
        'cli-restore'
      );

      if (result.valid) {
        console.log(`✅ Configuration restored from: ${backupFile}`);
      } else {
        console.error(
          '❌ Failed to restore configuration:',
          result.errors.join(', ')
        );
      }
    } else {
      console.error('❌ Dynamic configuration is not enabled');
    }
  }

  private async handleHelp(_args: string[]): Promise<void> {
    console.log('Enterprise Auth Configuration CLI\n');
    console.log('Available commands:\n');

    this.commands.forEach((cmd) => {
      console.log(`  ${cmd.name.padEnd(12)} ${cmd.description}`);
    });

    console.log('\nExamples:');
    console.log('  config-cli init');
    console.log('  config-cli get server');
    console.log('  config-cli set server.port 4000');
    console.log('  config-cli secret store JWT_SECRET "your-secret-key"');
    console.log('  config-cli validate');
    console.log('  config-cli export config-backup.json');
  }

  private async ensureInitialized(): Promise<void> {
    try {
      // Try to get config to check if initialized
      configManager.getConfig();
    } catch (error) {
      console.log('Initializing configuration system...');
      await configManager.initialize({
        enableDynamicConfig: true,
      });
    }
  }
}

// CLI entry point
if (require.main === module) {
  const cli = new ConfigCLI();
  const args = process.argv.slice(2);

  cli.run(args).catch((error) => {
    console.error('CLI error:', error);
    process.exit(1);
  });
}

export { ConfigCLI };
