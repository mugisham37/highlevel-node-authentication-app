#!/usr/bin/env node

/**
 * Simple System Validation Script
 * Basic validation of system components without complex dependencies
 */

const fs = require('fs');
const path = require('path');

class SimpleValidator {
  constructor() {
    this.results = [];
  }

  addResult(component, status, message, details = {}) {
    this.results.push({ component, status, message, details });

    const statusIcon =
      status === 'pass' ? '✅' : status === 'warning' ? '⚠️' : '❌';
    console.log(`  ${statusIcon} ${component}: ${message}`);
  }

  async runValidation() {
    console.log(
      '🚀 Starting Enterprise Authentication Backend System Validation\n'
    );

    this.validateProjectStructure();
    this.validatePackageConfiguration();
    this.validateEnvironmentFiles();
    this.validateDockerConfiguration();
    this.validateDocumentation();
    this.validateDeploymentConfiguration();
    this.validateMonitoringConfiguration();

    this.printResults();
  }

  validateProjectStructure() {
    console.log('📁 Validating Project Structure...');

    const requiredDirectories = [
      'src',
      'src/application',
      'src/domain',
      'src/infrastructure',
      'src/presentation',
      'src/test',
      'config',
      'deployment',
      'docs',
      'scripts',
    ];

    for (const dir of requiredDirectories) {
      if (fs.existsSync(dir)) {
        this.addResult(`Directory: ${dir}`, 'pass', 'Directory exists');
      } else {
        this.addResult(`Directory: ${dir}`, 'fail', 'Directory missing');
      }
    }

    // Check for key files
    const requiredFiles = [
      'package.json',
      'tsconfig.json',
      'Dockerfile',
      'docker-compose.yml',
      '.env.example',
      'README.md',
    ];

    for (const file of requiredFiles) {
      if (fs.existsSync(file)) {
        this.addResult(`File: ${file}`, 'pass', 'File exists');
      } else {
        this.addResult(`File: ${file}`, 'fail', 'File missing');
      }
    }
  }

  validatePackageConfiguration() {
    console.log('📦 Validating Package Configuration...');

    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));

      // Check essential scripts
      const requiredScripts = ['build', 'start', 'dev', 'test'];
      for (const script of requiredScripts) {
        if (packageJson.scripts && packageJson.scripts[script]) {
          this.addResult(`Script: ${script}`, 'pass', 'Script defined');
        } else {
          this.addResult(`Script: ${script}`, 'fail', 'Script missing');
        }
      }

      // Check essential dependencies
      const requiredDeps = [
        'fastify',
        'prisma',
        'drizzle-orm',
        'redis',
        'jsonwebtoken',
      ];
      for (const dep of requiredDeps) {
        if (packageJson.dependencies && packageJson.dependencies[dep]) {
          this.addResult(`Dependency: ${dep}`, 'pass', 'Dependency installed');
        } else {
          this.addResult(
            `Dependency: ${dep}`,
            'warning',
            'Dependency not found'
          );
        }
      }
    } catch (error) {
      this.addResult(
        'Package.json',
        'fail',
        `Failed to parse: ${error.message}`
      );
    }
  }

  validateEnvironmentFiles() {
    console.log('🔧 Validating Environment Configuration...');

    if (fs.existsSync('.env.example')) {
      try {
        const envExample = fs.readFileSync('.env.example', 'utf8');
        const requiredEnvVars = [
          'NODE_ENV',
          'DATABASE_URL',
          'REDIS_URL',
          'JWT_SECRET',
          'JWT_REFRESH_SECRET',
        ];

        for (const envVar of requiredEnvVars) {
          if (envExample.includes(envVar)) {
            this.addResult(
              `Env Variable: ${envVar}`,
              'pass',
              'Variable documented'
            );
          } else {
            this.addResult(
              `Env Variable: ${envVar}`,
              'warning',
              'Variable not documented'
            );
          }
        }
      } catch (error) {
        this.addResult(
          'Environment Example',
          'fail',
          `Failed to read: ${error.message}`
        );
      }
    }

    if (fs.existsSync('.env')) {
      this.addResult('Environment File', 'pass', '.env file exists');
    } else {
      this.addResult(
        'Environment File',
        'warning',
        '.env file not found (expected for production)'
      );
    }
  }

  validateDockerConfiguration() {
    console.log('🐳 Validating Docker Configuration...');

    if (fs.existsSync('Dockerfile')) {
      try {
        const dockerfile = fs.readFileSync('Dockerfile', 'utf8');

        if (dockerfile.includes('FROM node:')) {
          this.addResult(
            'Dockerfile Base Image',
            'pass',
            'Node.js base image found'
          );
        } else {
          this.addResult(
            'Dockerfile Base Image',
            'warning',
            'Node.js base image not found'
          );
        }

        if (dockerfile.includes('EXPOSE')) {
          this.addResult('Dockerfile Port', 'pass', 'Port exposure configured');
        } else {
          this.addResult(
            'Dockerfile Port',
            'warning',
            'Port exposure not configured'
          );
        }
      } catch (error) {
        this.addResult(
          'Dockerfile',
          'fail',
          `Failed to read: ${error.message}`
        );
      }
    }

    if (fs.existsSync('docker-compose.yml')) {
      this.addResult('Docker Compose', 'pass', 'Docker Compose file exists');
    } else {
      this.addResult(
        'Docker Compose',
        'warning',
        'Docker Compose file not found'
      );
    }
  }

  validateDocumentation() {
    console.log('📚 Validating Documentation...');

    const docFiles = [
      'README.md',
      'docs/runbooks/operational-runbooks.md',
      'deployment/production/production-readiness-checklist.md',
    ];

    for (const docFile of docFiles) {
      if (fs.existsSync(docFile)) {
        this.addResult(
          `Documentation: ${path.basename(docFile)}`,
          'pass',
          'Documentation exists'
        );
      } else {
        this.addResult(
          `Documentation: ${path.basename(docFile)}`,
          'warning',
          'Documentation missing'
        );
      }
    }
  }

  validateDeploymentConfiguration() {
    console.log('🚀 Validating Deployment Configuration...');

    const deploymentFiles = [
      'deployment/production/docker-compose.prod.yml',
      'deployment/production/production-readiness-checklist.md',
    ];

    for (const deployFile of deploymentFiles) {
      if (fs.existsSync(deployFile)) {
        this.addResult(
          `Deployment: ${path.basename(deployFile)}`,
          'pass',
          'Deployment config exists'
        );
      } else {
        this.addResult(
          `Deployment: ${path.basename(deployFile)}`,
          'warning',
          'Deployment config missing'
        );
      }
    }
  }

  validateMonitoringConfiguration() {
    console.log('📊 Validating Monitoring Configuration...');

    const monitoringFiles = [
      'config/prometheus/rules/auth-backend-alerts.yml',
      'config/grafana/dashboards/auth-backend-overview.json',
    ];

    for (const monitorFile of monitoringFiles) {
      if (fs.existsSync(monitorFile)) {
        this.addResult(
          `Monitoring: ${path.basename(monitorFile)}`,
          'pass',
          'Monitoring config exists'
        );
      } else {
        this.addResult(
          `Monitoring: ${path.basename(monitorFile)}`,
          'warning',
          'Monitoring config missing'
        );
      }
    }
  }

  printResults() {
    console.log('\n📋 System Validation Results Summary\n');

    const passed = this.results.filter((r) => r.status === 'pass').length;
    const warnings = this.results.filter((r) => r.status === 'warning').length;
    const failed = this.results.filter((r) => r.status === 'fail').length;
    const total = this.results.length;

    console.log(`Total Tests: ${total}`);
    console.log(`✅ Passed: ${passed}`);
    console.log(`⚠️  Warnings: ${warnings}`);
    console.log(`❌ Failed: ${failed}`);
    console.log(`Success Rate: ${((passed / total) * 100).toFixed(1)}%\n`);

    if (failed > 0) {
      console.log('❌ Failed Tests:');
      this.results
        .filter((r) => r.status === 'fail')
        .forEach((result) => {
          console.log(`  - ${result.component}: ${result.message}`);
        });
      console.log();
    }

    if (warnings > 0) {
      console.log('⚠️  Warning Tests:');
      this.results
        .filter((r) => r.status === 'warning')
        .forEach((result) => {
          console.log(`  - ${result.component}: ${result.message}`);
        });
      console.log();
    }

    // Overall system status
    if (failed === 0 && warnings <= 5) {
      console.log(
        '🎉 System validation completed successfully! The system structure is ready for production deployment.'
      );
    } else if (failed === 0) {
      console.log(
        '⚠️  System validation completed with warnings. Review warning items before production deployment.'
      );
    } else {
      console.log(
        '❌ System validation failed. Critical issues must be resolved before production deployment.'
      );
      process.exit(1);
    }
  }
}

// Run validation
const validator = new SimpleValidator();
validator.runValidation().catch((error) => {
  console.error('System validation failed:', error);
  process.exit(1);
});
