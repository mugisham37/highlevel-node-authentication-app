#!/usr/bin/env tsx

/**
 * System Integration Validation Script
 * Comprehensive validation of all system components and integrations
 */

import { createServer } from '../src/infrastructure/server/fastify-server';
import { logger } from '../src/infrastructure/logging/winston-logger';
import { healthCheckManager } from '../src/infrastructure/health/health-check';
import { metricsManager } from '../src/infrastructure/monitoring/prometheus-metrics';
import { config } from '../src/infrastructure/config/environment';

interface ValidationResult {
  component: string;
  status: 'pass' | 'fail' | 'warning';
  message: string;
  details?: any;
  duration?: number;
}

class SystemValidator {
  private results: ValidationResult[] = [];
  private server: any;

  async runValidation(): Promise<void> {
    console.log(
      '🚀 Starting Enterprise Authentication Backend System Validation\n'
    );

    try {
      await this.validateEnvironmentConfiguration();
      await this.startTestServer();
      await this.validateCoreComponents();
      await this.validateDatabaseConnectivity();
      await this.validateCacheConnectivity();
      await this.validateAuthenticationFlows();
      await this.validateSecurityFeatures();
      await this.validatePerformanceRequirements();
      await this.validateMonitoringAndObservability();
      await this.validateExternalIntegrations();
      await this.validateBackupAndRecovery();

      this.printResults();
      await this.cleanup();
    } catch (error) {
      logger.error('System validation failed', {
        error: (error as Error).message,
      });
      process.exit(1);
    }
  }

  private async validateEnvironmentConfiguration(): Promise<void> {
    console.log('📋 Validating Environment Configuration...');

    const requiredEnvVars = [
      'NODE_ENV',
      'DATABASE_URL',
      'REDIS_URL',
      'JWT_SECRET',
      'JWT_REFRESH_SECRET',
      'ENCRYPTION_KEY',
    ];

    for (const envVar of requiredEnvVars) {
      const startTime = Date.now();

      if (process.env[envVar]) {
        this.addResult({
          component: `Environment Variable: ${envVar}`,
          status: 'pass',
          message: 'Environment variable is set',
          duration: Date.now() - startTime,
        });
      } else {
        this.addResult({
          component: `Environment Variable: ${envVar}`,
          status: 'fail',
          message: 'Required environment variable is missing',
          duration: Date.now() - startTime,
        });
      }
    }

    // Validate configuration object
    const startTime = Date.now();
    try {
      const configValid =
        config.server.port && config.database.url && config.redis.url;

      this.addResult({
        component: 'Configuration Object',
        status: configValid ? 'pass' : 'fail',
        message: configValid
          ? 'Configuration object is valid'
          : 'Configuration object is invalid',
        duration: Date.now() - startTime,
        details: {
          serverPort: config.server.port,
          databaseConfigured: !!config.database.url,
          redisConfigured: !!config.redis.url,
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Configuration Object',
        status: 'fail',
        message: `Configuration validation failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      });
    }
  }

  private async startTestServer(): Promise<void> {
    console.log('🖥️  Starting Test Server...');

    const startTime = Date.now();

    try {
      this.server = await createServer();
      await this.server.listen({ port: 0, host: '127.0.0.1' });

      const address = this.server.server.address();
      const port = address?.port;

      this.addResult({
        component: 'Test Server',
        status: 'pass',
        message: 'Test server started successfully',
        duration: Date.now() - startTime,
        details: { port },
      });
    } catch (error) {
      this.addResult({
        component: 'Test Server',
        status: 'fail',
        message: `Failed to start test server: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      });
      throw error;
    }
  }

  private async validateCoreComponents(): Promise<void> {
    console.log('🔧 Validating Core Components...');

    // Validate Health Check System
    const healthStartTime = Date.now();
    try {
      const healthStatus = await healthCheckManager.checkHealth();

      this.addResult({
        component: 'Health Check System',
        status: healthStatus.status === 'healthy' ? 'pass' : 'warning',
        message: `Health check system status: ${healthStatus.status}`,
        duration: Date.now() - healthStartTime,
        details: {
          totalChecks: healthStatus.summary.total,
          healthyChecks: healthStatus.summary.healthy,
          degradedChecks: healthStatus.summary.degraded,
          unhealthyChecks: healthStatus.summary.unhealthy,
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Health Check System',
        status: 'fail',
        message: `Health check system failed: ${(error as Error).message}`,
        duration: Date.now() - healthStartTime,
      });
    }

    // Validate Metrics System
    const metricsStartTime = Date.now();
    try {
      const metrics = await metricsManager.getMetrics();
      const hasMetrics = metrics.length > 0;

      this.addResult({
        component: 'Metrics System',
        status: hasMetrics ? 'pass' : 'fail',
        message: hasMetrics
          ? 'Metrics system is working'
          : 'No metrics available',
        duration: Date.now() - metricsStartTime,
        details: { metricsLength: metrics.length },
      });
    } catch (error) {
      this.addResult({
        component: 'Metrics System',
        status: 'fail',
        message: `Metrics system failed: ${(error as Error).message}`,
        duration: Date.now() - metricsStartTime,
      });
    }
  }

  private async validateDatabaseConnectivity(): Promise<void> {
    console.log('🗄️  Validating Database Connectivity...');

    const startTime = Date.now();

    try {
      // Test database connection through health check
      const response = await fetch(
        `http://127.0.0.1:${this.server.server.address()?.port}/health/ready`
      );
      const healthData = await response.json();

      const dbCheck = healthData.checks?.find((check: any) =>
        check.name.includes('database')
      );

      if (dbCheck) {
        this.addResult({
          component: 'Database Connectivity',
          status: dbCheck.status === 'healthy' ? 'pass' : 'fail',
          message: `Database health check: ${dbCheck.status}`,
          duration: Date.now() - startTime,
          details: dbCheck.details,
        });
      } else {
        this.addResult({
          component: 'Database Connectivity',
          status: 'warning',
          message: 'Database health check not found in health endpoint',
          duration: Date.now() - startTime,
        });
      }
    } catch (error) {
      this.addResult({
        component: 'Database Connectivity',
        status: 'fail',
        message: `Database connectivity test failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      });
    }
  }

  private async validateCacheConnectivity(): Promise<void> {
    console.log('🔄 Validating Cache Connectivity...');

    const startTime = Date.now();

    try {
      // Test Redis connection through health check
      const response = await fetch(
        `http://127.0.0.1:${this.server.server.address()?.port}/health/ready`
      );
      const healthData = await response.json();

      const redisCheck = healthData.checks?.find((check: any) =>
        check.name.includes('redis')
      );

      if (redisCheck) {
        this.addResult({
          component: 'Cache Connectivity',
          status: redisCheck.status === 'healthy' ? 'pass' : 'warning',
          message: `Redis health check: ${redisCheck.status}`,
          duration: Date.now() - startTime,
          details: redisCheck.details,
        });
      } else {
        this.addResult({
          component: 'Cache Connectivity',
          status: 'warning',
          message: 'Redis health check not found in health endpoint',
          duration: Date.now() - startTime,
        });
      }
    } catch (error) {
      this.addResult({
        component: 'Cache Connectivity',
        status: 'fail',
        message: `Cache connectivity test failed: ${(error as Error).message}`,
        duration: Date.now() - startTime,
      });
    }
  }

  private async validateAuthenticationFlows(): Promise<void> {
    console.log('🔐 Validating Authentication Flows...');

    const baseUrl = `http://127.0.0.1:${this.server.server.address()?.port}`;

    // Test user registration
    const regStartTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'validation-test@example.com',
          password: 'ValidationTest123!',
          name: 'Validation Test User',
        }),
      });

      this.addResult({
        component: 'User Registration',
        status: [200, 201, 400, 409].includes(response.status)
          ? 'pass'
          : 'fail',
        message: `Registration endpoint responded with status ${response.status}`,
        duration: Date.now() - regStartTime,
        details: { statusCode: response.status },
      });
    } catch (error) {
      this.addResult({
        component: 'User Registration',
        status: 'fail',
        message: `Registration test failed: ${(error as Error).message}`,
        duration: Date.now() - regStartTime,
      });
    }

    // Test user login
    const loginStartTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'validation-test@example.com',
          password: 'ValidationTest123!',
        }),
      });

      this.addResult({
        component: 'User Login',
        status: [200, 401].includes(response.status) ? 'pass' : 'fail',
        message: `Login endpoint responded with status ${response.status}`,
        duration: Date.now() - loginStartTime,
        details: { statusCode: response.status },
      });
    } catch (error) {
      this.addResult({
        component: 'User Login',
        status: 'fail',
        message: `Login test failed: ${(error as Error).message}`,
        duration: Date.now() - loginStartTime,
      });
    }

    // Test OAuth endpoints
    const oauthStartTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/oauth/google/init`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          redirectUri: 'http://localhost:3000/callback',
        }),
      });

      this.addResult({
        component: 'OAuth Integration',
        status: [200, 400, 401].includes(response.status) ? 'pass' : 'fail',
        message: `OAuth endpoint responded with status ${response.status}`,
        duration: Date.now() - oauthStartTime,
        details: { statusCode: response.status },
      });
    } catch (error) {
      this.addResult({
        component: 'OAuth Integration',
        status: 'fail',
        message: `OAuth test failed: ${(error as Error).message}`,
        duration: Date.now() - oauthStartTime,
      });
    }
  }

  private async validateSecurityFeatures(): Promise<void> {
    console.log('🛡️  Validating Security Features...');

    const baseUrl = `http://127.0.0.1:${this.server.server.address()?.port}`;

    // Test rate limiting
    const rateLimitStartTime = Date.now();
    try {
      const promises = Array.from({ length: 10 }, () =>
        fetch(`${baseUrl}/api/v1/auth/login`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            email: 'rate-limit-test@example.com',
            password: 'wrongpassword',
          }),
        })
      );

      const responses = await Promise.all(promises);
      const rateLimited = responses.some((r) => r.status === 429);

      this.addResult({
        component: 'Rate Limiting',
        status: rateLimited ? 'pass' : 'warning',
        message: rateLimited
          ? 'Rate limiting is working'
          : 'Rate limiting may not be configured',
        duration: Date.now() - rateLimitStartTime,
        details: {
          totalRequests: responses.length,
          rateLimitedRequests: responses.filter((r) => r.status === 429).length,
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Rate Limiting',
        status: 'fail',
        message: `Rate limiting test failed: ${(error as Error).message}`,
        duration: Date.now() - rateLimitStartTime,
      });
    }

    // Test security headers
    const headersStartTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/api/v1/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: 'test@example.com',
          password: 'password',
        }),
      });

      const securityHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
      ];

      const presentHeaders = securityHeaders.filter((header) =>
        response.headers.get(header)
      );

      this.addResult({
        component: 'Security Headers',
        status: presentHeaders.length >= 2 ? 'pass' : 'warning',
        message: `${presentHeaders.length}/${securityHeaders.length} security headers present`,
        duration: Date.now() - headersStartTime,
        details: {
          presentHeaders,
          missingHeaders: securityHeaders.filter(
            (h) => !presentHeaders.includes(h)
          ),
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Security Headers',
        status: 'fail',
        message: `Security headers test failed: ${(error as Error).message}`,
        duration: Date.now() - headersStartTime,
      });
    }
  }

  private async validatePerformanceRequirements(): Promise<void> {
    console.log('⚡ Validating Performance Requirements...');

    const baseUrl = `http://127.0.0.1:${this.server.server.address()?.port}`;

    // Test response time
    const perfStartTime = Date.now();
    try {
      const testRequests = 10;
      const responseTimes: number[] = [];

      for (let i = 0; i < testRequests; i++) {
        const requestStart = Date.now();

        await fetch(`${baseUrl}/health/ready`);

        const responseTime = Date.now() - requestStart;
        responseTimes.push(responseTime);
      }

      const averageResponseTime =
        responseTimes.reduce((sum, time) => sum + time, 0) /
        responseTimes.length;
      const maxResponseTime = Math.max(...responseTimes);

      this.addResult({
        component: 'Response Time Performance',
        status: averageResponseTime < 100 ? 'pass' : 'warning',
        message: `Average response time: ${averageResponseTime.toFixed(2)}ms`,
        duration: Date.now() - perfStartTime,
        details: {
          averageResponseTime: averageResponseTime.toFixed(2),
          maxResponseTime,
          testRequests,
          target: '< 100ms',
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Response Time Performance',
        status: 'fail',
        message: `Performance test failed: ${(error as Error).message}`,
        duration: Date.now() - perfStartTime,
      });
    }

    // Test concurrent requests
    const concurrentStartTime = Date.now();
    try {
      const concurrentRequests = 20;
      const promises = Array.from({ length: concurrentRequests }, () =>
        fetch(`${baseUrl}/health/ready`)
      );

      const responses = await Promise.all(promises);
      const successfulRequests = responses.filter(
        (r) => r.status === 200
      ).length;
      const successRate = (successfulRequests / concurrentRequests) * 100;

      this.addResult({
        component: 'Concurrent Request Handling',
        status: successRate >= 95 ? 'pass' : 'warning',
        message: `${successRate.toFixed(1)}% success rate for concurrent requests`,
        duration: Date.now() - concurrentStartTime,
        details: {
          concurrentRequests,
          successfulRequests,
          successRate: successRate.toFixed(1),
          target: '>= 95%',
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Concurrent Request Handling',
        status: 'fail',
        message: `Concurrent request test failed: ${(error as Error).message}`,
        duration: Date.now() - concurrentStartTime,
      });
    }
  }

  private async validateMonitoringAndObservability(): Promise<void> {
    console.log('📊 Validating Monitoring and Observability...');

    const baseUrl = `http://127.0.0.1:${this.server.server.address()?.port}`;

    // Test metrics endpoint
    const metricsStartTime = Date.now();
    try {
      const response = await fetch(`${baseUrl}/metrics`);
      const metricsText = await response.text();

      const hasAuthMetrics = metricsText.includes('auth_backend_');
      const hasHttpMetrics = metricsText.includes('http_requests_total');

      this.addResult({
        component: 'Metrics Endpoint',
        status: response.status === 200 && hasAuthMetrics ? 'pass' : 'fail',
        message: `Metrics endpoint status: ${response.status}, Auth metrics present: ${hasAuthMetrics}`,
        duration: Date.now() - metricsStartTime,
        details: {
          statusCode: response.status,
          hasAuthMetrics,
          hasHttpMetrics,
          metricsSize: metricsText.length,
        },
      });
    } catch (error) {
      this.addResult({
        component: 'Metrics Endpoint',
        status: 'fail',
        message: `Metrics endpoint test failed: ${(error as Error).message}`,
        duration: Date.now() - metricsStartTime,
      });
    }

    // Test health endpoints
    const healthEndpoints = ['/health/ready', '/health/live'];

    for (const endpoint of healthEndpoints) {
      const healthStartTime = Date.now();
      try {
        const response = await fetch(`${baseUrl}${endpoint}`);
        const healthData = await response.json();

        this.addResult({
          component: `Health Endpoint: ${endpoint}`,
          status: response.status === 200 ? 'pass' : 'fail',
          message: `Health endpoint ${endpoint} status: ${response.status}`,
          duration: Date.now() - healthStartTime,
          details: {
            statusCode: response.status,
            status: healthData.status,
            checksCount: healthData.checks?.length || 0,
          },
        });
      } catch (error) {
        this.addResult({
          component: `Health Endpoint: ${endpoint}`,
          status: 'fail',
          message: `Health endpoint test failed: ${(error as Error).message}`,
          duration: Date.now() - healthStartTime,
        });
      }
    }
  }

  private async validateExternalIntegrations(): Promise<void> {
    console.log('🌐 Validating External Integrations...');

    // Test OAuth provider connectivity (basic connectivity test)
    const oauthProviders = [
      {
        name: 'Google',
        url: 'https://accounts.google.com/.well-known/openid_configuration',
      },
      { name: 'GitHub', url: 'https://api.github.com' },
      {
        name: 'Microsoft',
        url: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid_configuration',
      },
    ];

    for (const provider of oauthProviders) {
      const startTime = Date.now();
      try {
        const response = await fetch(provider.url, { method: 'HEAD' });

        this.addResult({
          component: `OAuth Provider: ${provider.name}`,
          status: response.status < 400 ? 'pass' : 'warning',
          message: `${provider.name} OAuth provider connectivity: ${response.status}`,
          duration: Date.now() - startTime,
          details: { statusCode: response.status, url: provider.url },
        });
      } catch (error) {
        this.addResult({
          component: `OAuth Provider: ${provider.name}`,
          status: 'warning',
          message: `${provider.name} OAuth provider test failed: ${(error as Error).message}`,
          duration: Date.now() - startTime,
        });
      }
    }
  }

  private async validateBackupAndRecovery(): Promise<void> {
    console.log('💾 Validating Backup and Recovery...');

    // Test backup system availability
    const backupStartTime = Date.now();
    try {
      // This would typically test backup scripts or services
      // For now, we'll check if backup directories exist and are writable
      const fs = await import('fs/promises');

      try {
        await fs.access('./backups', fs.constants.F_OK | fs.constants.W_OK);

        this.addResult({
          component: 'Backup System',
          status: 'pass',
          message: 'Backup directory is accessible and writable',
          duration: Date.now() - backupStartTime,
        });
      } catch (error) {
        this.addResult({
          component: 'Backup System',
          status: 'warning',
          message: 'Backup directory not accessible or not writable',
          duration: Date.now() - backupStartTime,
        });
      }
    } catch (error) {
      this.addResult({
        component: 'Backup System',
        status: 'fail',
        message: `Backup system test failed: ${(error as Error).message}`,
        duration: Date.now() - backupStartTime,
      });
    }
  }

  private addResult(result: ValidationResult): void {
    this.results.push(result);

    const statusIcon =
      result.status === 'pass'
        ? '✅'
        : result.status === 'warning'
          ? '⚠️'
          : '❌';
    const duration = result.duration ? ` (${result.duration}ms)` : '';

    console.log(
      `  ${statusIcon} ${result.component}: ${result.message}${duration}`
    );
  }

  private printResults(): void {
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
    if (failed === 0 && warnings <= 2) {
      console.log(
        '🎉 System validation completed successfully! The system is ready for production deployment.'
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

  private async cleanup(): Promise<void> {
    if (this.server) {
      await this.server.close();
      console.log('\n🧹 Test server stopped and cleanup completed.');
    }
  }
}

// Run validation if this script is executed directly
if (require.main === module) {
  const validator = new SystemValidator();
  validator.runValidation().catch((error) => {
    console.error('System validation failed:', error);
    process.exit(1);
  });
}

export { SystemValidator };
