/**
 * Scaling System Tests
 * Tests for load balancing and horizontal scaling functionality
 */

import {
  describe,
  it,
  expect,
  beforeEach,
  afterEach,
  vi,
  beforeAll,
} from 'vitest';
import { FastifyInstance } from 'fastify';
import { initializeConfig } from '../../../infrastructure/config/environment';
import { scalingSystem } from '../../../infrastructure/scaling';
import { statelessManager } from '../../../infrastructure/scaling/stateless-manager';
import { loadBalancerConfigManager } from '../../../infrastructure/scaling/load-balancer-config';
import { sessionAffinityManager } from '../../../infrastructure/scaling/session-affinity';
import { autoScaler } from '../../../infrastructure/scaling/auto-scaler';
import { gracefulShutdownManager } from '../../../infrastructure/scaling/graceful-shutdown';

// Mock Fastify server
const mockServer = {
  addHook: vi.fn(),
  get: vi.fn(),
  post: vi.fn(),
  server: {
    listening: true,
  },
  close: vi.fn(),
} as unknown as FastifyInstance;

// Mock Redis
vi.mock('ioredis', () => {
  return {
    default: vi.fn().mockImplementation(() => ({
      ping: vi.fn().mockResolvedValue('PONG'),
      setex: vi.fn().mockResolvedValue('OK'),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(1),
      sadd: vi.fn().mockResolvedValue(1),
      srem: vi.fn().mockResolvedValue(1),
      smembers: vi.fn().mockResolvedValue([]),
      disconnect: vi.fn().mockResolvedValue(undefined),
    })),
  };
});

describe('Scaling System', () => {
  beforeAll(async () => {
    // Initialize configuration for tests
    await initializeConfig();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(async () => {
    try {
      await scalingSystem.shutdown();
    } catch (error) {
      // Ignore shutdown errors in tests
    }
  });

  describe('initialization', () => {
    it('should initialize all scaling components', async () => {
      await scalingSystem.initialize(mockServer);

      const status = scalingSystem.getSystemStatus();
      expect(status.initialized).toBe(true);
      expect(status.components.statelessManager).toBe(true);
      expect(status.components.loadBalancerConfig).toBe(true);
      expect(status.components.sessionAffinity).toBe(true);
      expect(status.components.gracefulShutdown).toBe(true);
    });

    it('should setup session affinity middleware', async () => {
      await scalingSystem.initialize(mockServer);

      expect(mockServer.addHook).toHaveBeenCalledWith(
        'onRequest',
        expect.any(Function)
      );
    });

    it('should setup scaling endpoints', async () => {
      await scalingSystem.initialize(mockServer);

      expect(mockServer.get).toHaveBeenCalledWith(
        '/scaling/status',
        expect.any(Function)
      );
      expect(mockServer.get).toHaveBeenCalledWith(
        '/scaling/instances',
        expect.any(Function)
      );
      expect(mockServer.post).toHaveBeenCalledWith(
        '/scaling/manual',
        expect.any(Function)
      );
      expect(mockServer.post).toHaveBeenCalledWith(
        '/scaling/drain',
        expect.any(Function)
      );
    });
  });

  describe('stateless manager', () => {
    it('should generate unique instance information', () => {
      const instanceInfo = statelessManager.getInstanceInfo();

      expect(instanceInfo).toHaveProperty('id');
      expect(instanceInfo).toHaveProperty('hostname');
      expect(instanceInfo).toHaveProperty('port');
      expect(instanceInfo).toHaveProperty('startTime');
      expect(instanceInfo).toHaveProperty('version');
      expect(instanceInfo).toHaveProperty('environment');
      expect(instanceInfo.id).toMatch(/^.+-\d+-\d+$/);
    });

    it('should validate stateless configuration', async () => {
      // This should not throw for valid configuration
      await expect(statelessManager.initialize()).resolves.not.toThrow();
    });

    it('should check if application is stateless', () => {
      const isStateless = statelessManager.isStateless();
      expect(typeof isStateless).toBe('boolean');
    });

    it('should get active instances', async () => {
      const instances = await statelessManager.getActiveInstances();
      expect(Array.isArray(instances)).toBe(true);
      expect(instances.length).toBeGreaterThan(0);
    });
  });

  describe('load balancer configuration', () => {
    it('should generate nginx configuration', () => {
      const config = loadBalancerConfigManager.generateNginxConfig();

      expect(config).toContain('upstream auth_backend');
      expect(config).toContain('server');
      expect(config).toContain('location /');
      expect(config).toContain('proxy_pass http://auth_backend');
    });

    it('should generate HAProxy configuration', () => {
      const config = loadBalancerConfigManager.generateHAProxyConfig();

      expect(config).toContain('backend auth_backend');
      expect(config).toContain('frontend auth_frontend');
      expect(config).toContain('balance');
      expect(config).toContain('option httpchk');
    });

    it('should generate AWS ALB configuration', () => {
      const config = loadBalancerConfigManager.generateAWSALBConfig();

      expect(config).toHaveProperty('AWSTemplateFormatVersion');
      expect(config).toHaveProperty('Resources');
      expect(config.Resources).toHaveProperty('LoadBalancer');
      expect(config.Resources).toHaveProperty('TargetGroup');
    });

    it('should generate Docker Compose configuration', () => {
      const config = loadBalancerConfigManager.generateDockerComposeConfig();

      expect(config).toHaveProperty('version');
      expect(config).toHaveProperty('services');
      expect(config.services).toHaveProperty('nginx');
      expect(config.services).toHaveProperty('auth-app-1');
      expect(config.services).toHaveProperty('auth-app-2');
    });

    it('should validate configuration', () => {
      const validation = loadBalancerConfigManager.validateConfig();
      expect(validation).toHaveProperty('valid');
      expect(validation).toHaveProperty('errors');
      expect(Array.isArray(validation.errors)).toBe(true);
    });
  });

  describe('session affinity', () => {
    const mockRequest = {
      url: '/auth/oauth/google/authorize',
      method: 'GET',
      cookies: {},
      headers: {},
      ip: '127.0.0.1',
    } as any;

    const mockReply = {
      setCookie: vi.fn(),
      header: vi.fn(),
      clearCookie: vi.fn(),
      removeHeader: vi.fn(),
    } as any;

    it('should check if request requires affinity', () => {
      const result = sessionAffinityManager.requiresAffinity(mockRequest);
      expect(result).toHaveProperty('required');
      expect(typeof result.required).toBe('boolean');
    });

    it('should generate affinity ID', () => {
      const affinityId = sessionAffinityManager.generateAffinityId();
      expect(typeof affinityId).toBe('string');
      expect(affinityId.length).toBeGreaterThan(0);
    });

    it('should handle session affinity for OAuth requests', async () => {
      await sessionAffinityManager.handleAffinity(mockRequest, mockReply);

      // Should set affinity for OAuth requests
      const affinityCheck =
        sessionAffinityManager.requiresAffinity(mockRequest);
      if (affinityCheck.required) {
        expect(mockReply.setCookie).toHaveBeenCalled();
      }
    });

    it('should get affinity statistics', () => {
      const stats = sessionAffinityManager.getAffinityStats();
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('totalMappings');
      expect(stats).toHaveProperty('currentInstance');
      expect(stats).toHaveProperty('rules');
      expect(Array.isArray(stats.rules)).toBe(true);
    });
  });

  describe('auto-scaler', () => {
    it('should get scaling statistics', () => {
      const stats = autoScaler.getScalingStats();
      expect(stats).toHaveProperty('enabled');
      expect(stats).toHaveProperty('currentInstances');
      expect(stats).toHaveProperty('config');
      expect(stats).toHaveProperty('recentMetrics');
      expect(stats).toHaveProperty('recentEvents');
      expect(Array.isArray(stats.recentMetrics)).toBe(true);
      expect(Array.isArray(stats.recentEvents)).toBe(true);
    });

    it('should handle manual scaling', async () => {
      const targetInstances = 3;
      const reason = 'Test scaling';

      // This should not throw for valid parameters
      await expect(
        autoScaler.manualScale(targetInstances, reason)
      ).resolves.not.toThrow();
    });

    it('should validate scaling configuration', async () => {
      // Initialize should validate configuration
      await expect(autoScaler.initialize()).resolves.not.toThrow();
    });
  });

  describe('graceful shutdown', () => {
    it('should initialize graceful shutdown manager', async () => {
      await gracefulShutdownManager.initialize(mockServer);

      const status = gracefulShutdownManager.getShutdownStatus();
      expect(status).toHaveProperty('isShuttingDown');
      expect(status).toHaveProperty('isDraining');
      expect(status).toHaveProperty('activeConnections');
      expect(status).toHaveProperty('hooks');
      expect(Array.isArray(status.hooks)).toBe(true);
    });

    it('should setup health check endpoints', async () => {
      await gracefulShutdownManager.initialize(mockServer);

      expect(mockServer.get).toHaveBeenCalledWith(
        '/health/ready',
        expect.any(Function)
      );
      expect(mockServer.get).toHaveBeenCalledWith(
        '/health/live',
        expect.any(Function)
      );
      expect(mockServer.get).toHaveBeenCalledWith(
        '/health/startup',
        expect.any(Function)
      );
    });

    it('should get deployment configuration', () => {
      const config = gracefulShutdownManager.getDeploymentConfig();
      expect(config).toHaveProperty('strategy');
      expect(config).toHaveProperty('maxUnavailable');
      expect(config).toHaveProperty('maxSurge');
      expect(config).toHaveProperty('readinessProbe');
      expect(config).toHaveProperty('livenessProbe');
    });
  });

  describe('deployment manifests', () => {
    it('should generate deployment manifests', () => {
      const manifests = scalingSystem.generateDeploymentManifests();

      expect(manifests).toHaveProperty('kubernetes');
      expect(manifests).toHaveProperty('dockerCompose');
      expect(manifests).toHaveProperty('nginx');
      expect(manifests).toHaveProperty('haproxy');
      expect(manifests).toHaveProperty('awsCloudFormation');

      // Kubernetes manifest should have required fields
      expect(manifests.kubernetes).toHaveProperty('apiVersion');
      expect(manifests.kubernetes).toHaveProperty('kind');
      expect(manifests.kubernetes).toHaveProperty('metadata');
      expect(manifests.kubernetes).toHaveProperty('spec');
    });
  });

  describe('error handling', () => {
    it('should handle initialization errors gracefully', async () => {
      // Mock a failing component
      const originalInitialize = statelessManager.initialize;
      vi.spyOn(statelessManager, 'initialize').mockRejectedValueOnce(
        new Error('Initialization failed')
      );

      await expect(scalingSystem.initialize(mockServer)).rejects.toThrow(
        'Initialization failed'
      );

      // Restore original method
      statelessManager.initialize = originalInitialize;
    });

    it('should handle shutdown errors gracefully', async () => {
      await scalingSystem.initialize(mockServer);

      // Mock a failing shutdown
      vi.spyOn(autoScaler, 'shutdown').mockRejectedValueOnce(
        new Error('Shutdown failed')
      );

      await expect(scalingSystem.shutdown()).rejects.toThrow('Shutdown failed');
    });
  });

  describe('integration', () => {
    it('should coordinate all scaling components', async () => {
      await scalingSystem.initialize(mockServer);

      // Check that all components are working together
      const systemStatus = scalingSystem.getSystemStatus();
      expect(systemStatus.initialized).toBe(true);

      const instanceInfo = statelessManager.getInstanceInfo();
      expect(instanceInfo.id).toBeDefined();

      const affinityStats = sessionAffinityManager.getAffinityStats();
      expect(affinityStats.currentInstance).toBe(instanceInfo.id);

      const scalingStats = autoScaler.getScalingStats();
      expect(scalingStats.currentInstances).toBeGreaterThan(0);
    });

    it('should handle background processes', async () => {
      await scalingSystem.initialize(mockServer);

      const systemStatus = scalingSystem.getSystemStatus();
      expect(systemStatus.backgroundProcesses.heartbeat).toBe(true);
      expect(systemStatus.backgroundProcesses.cleanup).toBe(true);
    });
  });
});

describe('Load Balancer Configuration Edge Cases', () => {
  beforeAll(async () => {
    await initializeConfig();
  });

  it('should handle empty upstream instances', () => {
    // Test with no additional instances configured
    process.env.ADDITIONAL_INSTANCES = '';

    const config = loadBalancerConfigManager.generateNginxConfig();
    expect(config).toContain('upstream auth_backend');
    expect(config).toContain('server localhost:3000'); // Should have at least current instance
  });

  it('should handle SSL configuration', () => {
    // Update config to enable SSL
    loadBalancerConfigManager.updateConfig({
      ssl: {
        enabled: true,
        certificatePath: '/etc/ssl/certs/test.crt',
        privateKeyPath: '/etc/ssl/private/test.key',
        redirectHttp: true,
        cipherSuites: ['ECDHE-RSA-AES128-GCM-SHA256'],
        protocols: ['TLSv1.2', 'TLSv1.3'],
      },
    });

    const config = loadBalancerConfigManager.generateNginxConfig();
    expect(config).toContain('listen 443 ssl');
    expect(config).toContain('ssl_certificate');
    expect(config).toContain('return 301 https://');
  });
});

describe('Session Affinity Edge Cases', () => {
  beforeAll(async () => {
    await initializeConfig();
  });

  it('should handle requests that do not require affinity', () => {
    const mockRequest = {
      url: '/api/users',
      method: 'GET',
      cookies: {},
      headers: {},
      ip: '127.0.0.1',
    } as any;

    const result = sessionAffinityManager.requiresAffinity(mockRequest);
    expect(result.required).toBe(false);
  });

  it('should handle different affinity methods', () => {
    const mockRequest = {
      url: '/test',
      method: 'GET',
      cookies: { 'lb-session': 'test-affinity-id' },
      headers: { 'x-session-affinity': 'header-affinity-id' },
      ip: '192.168.1.100',
    } as any;

    // Test cookie method
    const cookieId = sessionAffinityManager.getAffinityId(
      mockRequest,
      'cookie'
    );
    expect(cookieId).toBe('test-affinity-id');

    // Test header method
    const headerId = sessionAffinityManager.getAffinityId(
      mockRequest,
      'header'
    );
    expect(headerId).toBe('header-affinity-id');

    // Test IP method
    const ipId = sessionAffinityManager.getAffinityId(mockRequest, 'ip');
    expect(typeof ipId).toBe('string');
    expect(ipId?.length).toBe(8); // MD5 hash substring
  });
});

describe('Auto-Scaler Edge Cases', () => {
  beforeAll(async () => {
    await initializeConfig();
  });

  it('should handle scaling limits', async () => {
    // Test scaling beyond maximum instances
    await expect(
      autoScaler.manualScale(100, 'Test max limit')
    ).rejects.toThrow();

    // Test scaling below minimum instances
    await expect(autoScaler.manualScale(0, 'Test min limit')).rejects.toThrow();
  });

  it('should handle concurrent scaling operations', async () => {
    // Start a scaling operation
    const scalingPromise = autoScaler.manualScale(3, 'First scaling');

    // Try to start another scaling operation
    await expect(autoScaler.manualScale(4, 'Second scaling')).rejects.toThrow(
      'Scaling operation already in progress'
    );

    // Wait for first operation to complete
    await scalingPromise;
  });
});
