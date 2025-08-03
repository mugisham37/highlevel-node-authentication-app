/**
 * Load Balancer Configuration Tests
 * Unit tests for load balancer configuration generation
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// Mock the config manager to avoid initialization issues
vi.mock('../../../infrastructure/config/config-manager', () => ({
  configManager: {
    getConfig: vi.fn().mockReturnValue({
      redis: {
        host: 'localhost',
        port: 6379,
      },
    }),
  },
}));

describe('Load Balancer Configuration', () => {
  let LoadBalancerConfigManager: any;
  let loadBalancerConfigManager: any;

  beforeEach(async () => {
    // Set environment variables for testing
    process.env.SERVER_HOST = 'localhost';
    process.env.SERVER_PORT = '3000';
    process.env.DOMAIN_NAME = 'auth.example.com';
    process.env.NODE_ENV = 'test';

    // Import after setting environment variables
    const module = await import(
      '../../../infrastructure/scaling/load-balancer-config'
    );
    LoadBalancerConfigManager = module.LoadBalancerConfigManager;
    loadBalancerConfigManager = module.loadBalancerConfigManager;
  });

  describe('Nginx Configuration', () => {
    it('should generate basic nginx configuration', () => {
      const config = loadBalancerConfigManager.generateNginxConfig();

      expect(config).toContain('upstream auth_backend');
      expect(config).toContain('server localhost:3000');
      expect(config).toContain('location /');
      expect(config).toContain('proxy_pass http://auth_backend');
      expect(config).toContain('server_name auth.example.com');
    });

    it('should include health check configuration', () => {
      const config = loadBalancerConfigManager.generateNginxConfig();

      expect(config).toContain('location /health');
      expect(config).toContain('proxy_pass http://auth_health/health');
      expect(config).toContain('listen 8080');
    });

    it('should include SSL configuration when enabled', () => {
      loadBalancerConfigManager.updateConfig({
        ssl: {
          enabled: true,
          certificatePath: '/etc/ssl/certs/test.crt',
          privateKeyPath: '/etc/ssl/private/test.key',
          redirectHttp: true,
        },
      });

      const config = loadBalancerConfigManager.generateNginxConfig();

      expect(config).toContain('listen 443 ssl');
      expect(config).toContain('ssl_certificate /etc/ssl/certs/test.crt');
      expect(config).toContain('ssl_certificate_key /etc/ssl/private/test.key');
      expect(config).toContain('return 301 https://');
    });

    it('should include security headers', () => {
      const config = loadBalancerConfigManager.generateNginxConfig();

      expect(config).toContain('X-Frame-Options DENY');
      expect(config).toContain('X-Content-Type-Options nosniff');
      expect(config).toContain('X-XSS-Protection');
      expect(config).toContain('Referrer-Policy');
    });
  });

  describe('HAProxy Configuration', () => {
    it('should generate basic HAProxy configuration', () => {
      const config = loadBalancerConfigManager.generateHAProxyConfig();

      expect(config).toContain('backend auth_backend');
      expect(config).toContain('frontend auth_frontend');
      expect(config).toContain('server auth1 localhost:3000');
      expect(config).toContain('balance roundrobin');
      expect(config).toContain('option httpchk GET /health');
    });

    it('should include health check configuration', () => {
      const config = loadBalancerConfigManager.generateHAProxyConfig();

      expect(config).toContain('option httpchk GET /health');
      expect(config).toContain('http-check expect status 200');
      expect(config).toContain('check inter');
      expect(config).toContain('fall 3 rise 2');
    });

    it('should include session affinity when enabled', () => {
      loadBalancerConfigManager.updateConfig({
        sessionAffinity: {
          enabled: true,
          method: 'cookie',
          cookieName: 'lb-session',
        },
      });

      const config = loadBalancerConfigManager.generateHAProxyConfig();

      expect(config).toContain('cookie lb-session');
      expect(config).toContain('balance source');
      expect(config).toContain('cookie auth1');
    });

    it('should include SSL configuration when enabled', () => {
      loadBalancerConfigManager.updateConfig({
        ssl: {
          enabled: true,
          certificatePath: '/etc/ssl/certs/auth.pem',
          redirectHttp: true,
        },
      });

      const config = loadBalancerConfigManager.generateHAProxyConfig();

      expect(config).toContain('bind *:443 ssl crt /etc/ssl/certs/auth.pem');
      expect(config).toContain('redirect scheme https if !{ ssl_fc }');
    });
  });

  describe('AWS ALB Configuration', () => {
    it('should generate CloudFormation template', () => {
      const config = loadBalancerConfigManager.generateAWSALBConfig();

      expect(config).toHaveProperty('AWSTemplateFormatVersion', '2010-09-09');
      expect(config).toHaveProperty('Description');
      expect(config).toHaveProperty('Parameters');
      expect(config).toHaveProperty('Resources');
      expect(config).toHaveProperty('Outputs');
    });

    it('should include load balancer resource', () => {
      const config = loadBalancerConfigManager.generateAWSALBConfig() as any;

      expect(config.Resources).toHaveProperty('LoadBalancer');
      expect(config.Resources.LoadBalancer.Type).toBe(
        'AWS::ElasticLoadBalancingV2::LoadBalancer'
      );
      expect(config.Resources.LoadBalancer.Properties.Type).toBe('application');
    });

    it('should include target group resource', () => {
      const config = loadBalancerConfigManager.generateAWSALBConfig() as any;

      expect(config.Resources).toHaveProperty('TargetGroup');
      expect(config.Resources.TargetGroup.Type).toBe(
        'AWS::ElasticLoadBalancingV2::TargetGroup'
      );
      expect(config.Resources.TargetGroup.Properties.HealthCheckPath).toBe(
        '/health'
      );
    });

    it('should include HTTP listener', () => {
      const config = loadBalancerConfigManager.generateAWSALBConfig() as any;

      expect(config.Resources).toHaveProperty('HTTPListener');
      expect(config.Resources.HTTPListener.Type).toBe(
        'AWS::ElasticLoadBalancingV2::Listener'
      );
      expect(config.Resources.HTTPListener.Properties.Port).toBe(80);
    });

    it('should include HTTPS listener when SSL is enabled', () => {
      loadBalancerConfigManager.updateConfig({
        ssl: {
          enabled: true,
        },
      });

      const config = loadBalancerConfigManager.generateAWSALBConfig() as any;

      expect(config.Resources).toHaveProperty('HTTPSListener');
      expect(config.Resources.HTTPSListener.Type).toBe(
        'AWS::ElasticLoadBalancingV2::Listener'
      );
      expect(config.Resources.HTTPSListener.Properties.Port).toBe(443);
      expect(config.Resources.HTTPSListener.Properties.Protocol).toBe('HTTPS');
    });
  });

  describe('Docker Compose Configuration', () => {
    it('should generate docker-compose configuration', () => {
      const config =
        loadBalancerConfigManager.generateDockerComposeConfig() as any;

      expect(config).toHaveProperty('version', '3.8');
      expect(config).toHaveProperty('services');
      expect(config).toHaveProperty('networks');
    });

    it('should include nginx service', () => {
      const config =
        loadBalancerConfigManager.generateDockerComposeConfig() as any;

      expect(config.services).toHaveProperty('nginx');
      expect(config.services.nginx.image).toBe('nginx:alpine');
      expect(config.services.nginx.ports).toContain('80:80');
    });

    it('should include application services', () => {
      const config =
        loadBalancerConfigManager.generateDockerComposeConfig() as any;

      expect(config.services).toHaveProperty('auth-app-1');
      expect(config.services).toHaveProperty('auth-app-2');
      expect(config.services['auth-app-1'].environment.INSTANCE_ID).toBe(
        'auth-app-1'
      );
      expect(config.services['auth-app-2'].environment.INSTANCE_ID).toBe(
        'auth-app-2'
      );
    });

    it('should include SSL ports when enabled', () => {
      loadBalancerConfigManager.updateConfig({
        ssl: {
          enabled: true,
        },
      });

      const config =
        loadBalancerConfigManager.generateDockerComposeConfig() as any;

      expect(config.services.nginx.ports).toContain('443:443');
    });
  });

  describe('Configuration Validation', () => {
    it('should validate valid configuration', () => {
      const validation = loadBalancerConfigManager.validateConfig();

      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
      expect(Array.isArray(validation.errors)).toBe(true);
    });

    it('should detect invalid health check interval', () => {
      loadBalancerConfigManager.updateConfig({
        healthCheck: {
          interval: 1000, // Less than 5 seconds
          timeout: 5000,
          healthyThreshold: 2,
          unhealthyThreshold: 3,
          path: '/health',
          protocol: 'http',
        },
      });

      const validation = loadBalancerConfigManager.validateConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Health check interval must be at least 5 seconds'
      );
    });

    it('should detect invalid timeout configuration', () => {
      loadBalancerConfigManager.updateConfig({
        healthCheck: {
          interval: 10000,
          timeout: 15000, // Greater than interval
          healthyThreshold: 2,
          unhealthyThreshold: 3,
          path: '/health',
          protocol: 'http',
        },
      });

      const validation = loadBalancerConfigManager.validateConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Health check timeout must be less than interval'
      );
    });

    it('should detect invalid scaling configuration', () => {
      loadBalancerConfigManager.updateConfig({
        scaling: {
          minInstances: 0, // Invalid minimum
          maxInstances: 5,
          targetCpuUtilization: 70,
          targetMemoryUtilization: 80,
          scaleUpCooldown: 300,
          scaleDownCooldown: 600,
        },
      });

      const validation = loadBalancerConfigManager.validateConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'Minimum instances must be at least 1'
      );
    });

    it('should detect missing SSL configuration', () => {
      loadBalancerConfigManager.updateConfig({
        ssl: {
          enabled: true,
          certificatePath: undefined,
          privateKeyPath: undefined,
          redirectHttp: true,
        },
      });

      const validation = loadBalancerConfigManager.validateConfig();

      expect(validation.valid).toBe(false);
      expect(validation.errors).toContain(
        'SSL certificate and private key paths are required when SSL is enabled'
      );
    });
  });

  describe('Configuration Updates', () => {
    it('should update configuration', () => {
      const originalConfig = loadBalancerConfigManager.getConfig();

      loadBalancerConfigManager.updateConfig({
        healthCheck: {
          ...originalConfig.healthCheck,
          interval: 60000,
        },
      });

      const updatedConfig = loadBalancerConfigManager.getConfig();
      expect(updatedConfig.healthCheck.interval).toBe(60000);
    });

    it('should preserve other configuration when updating', () => {
      const originalConfig = loadBalancerConfigManager.getConfig();

      loadBalancerConfigManager.updateConfig({
        healthCheck: {
          ...originalConfig.healthCheck,
          interval: 45000,
        },
      });

      const updatedConfig = loadBalancerConfigManager.getConfig();
      expect(updatedConfig.healthCheck.interval).toBe(45000);
      expect(updatedConfig.healthCheck.path).toBe(
        originalConfig.healthCheck.path
      );
      expect(updatedConfig.sessionAffinity).toEqual(
        originalConfig.sessionAffinity
      );
    });
  });

  describe('Multiple Instances', () => {
    it('should handle additional instances from environment', () => {
      process.env.ADDITIONAL_INSTANCES =
        'app1.example.com:3000,app2.example.com:3000';

      // Create new instance to pick up environment changes
      const newManager = new LoadBalancerConfigManager();
      const config = newManager.generateNginxConfig();

      expect(config).toContain('server app1.example.com:3000');
      expect(config).toContain('server app2.example.com:3000');

      // Clean up
      delete process.env.ADDITIONAL_INSTANCES;
    });

    it('should handle empty additional instances', () => {
      process.env.ADDITIONAL_INSTANCES = '';

      const newManager = new LoadBalancerConfigManager();
      const config = newManager.generateNginxConfig();

      // Should still have the default localhost instance
      expect(config).toContain('server localhost:3000');
    });
  });
});
