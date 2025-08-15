/**
 * Scaling and Load Balancing Module
 * Integrates all scaling components for horizontal scaling and load balancing
 */

export * from './stateless-manager';
export * from './load-balancer-config';
export { SessionAffinityManager } from './session-affinity';
export * from './auto-scaler';
export * from './graceful-shutdown';

import { FastifyInstance } from 'fastify';
import { logger } from '../logging/winston-logger';
import { statelessManager } from './stateless-manager';
import { loadBalancerConfigManager } from './load-balancer-config';
import { sessionAffinityManager } from './session-affinity';
import { autoScaler } from './auto-scaler';
import { gracefulShutdownManager } from './graceful-shutdown';

/**
 * Scaling System Manager
 * Coordinates all scaling components
 */
export class ScalingSystem {
  private static instance: ScalingSystem;
  private initialized = false;
  private heartbeatInterval: NodeJS.Timeout | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): ScalingSystem {
    if (!ScalingSystem.instance) {
      ScalingSystem.instance = new ScalingSystem();
    }
    return ScalingSystem.instance;
  }

  /**
   * Initialize scaling system
   */
  async initialize(server: FastifyInstance): Promise<void> {
    if (this.initialized) {
      return;
    }

    logger.info('Initializing scaling system...');

    try {
      // Initialize stateless manager
      await statelessManager.initialize();

      // Initialize graceful shutdown manager
      await gracefulShutdownManager.initialize(server);

      // Initialize auto-scaler
      await autoScaler.initialize();

      // Setup session affinity middleware
      await this.setupSessionAffinityMiddleware(server);

      // Setup scaling endpoints
      this.setupScalingEndpoints(server);

      // Start background processes
      this.startBackgroundProcesses();

      this.initialized = true;
      logger.info('Scaling system initialized successfully');
    } catch (error) {
      logger.error('Failed to initialize scaling system', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Setup session affinity middleware
   */
  private async setupSessionAffinityMiddleware(
    server: FastifyInstance
  ): Promise<void> {
    // Register session affinity middleware
    server.addHook('onRequest', async (request, reply) => {
      await sessionAffinityManager.handleAffinity(request, reply);
    });

    logger.info('Session affinity middleware configured');
  }

  /**
   * Setup scaling endpoints
   */
  private setupScalingEndpoints(server: FastifyInstance): void {
    // Scaling status endpoint
    server.get('/scaling/status', async (_request, reply) => {
      const status = {
        stateless: {
          enabled: statelessManager.isStateless(),
          instanceInfo: statelessManager.getInstanceInfo(),
          config: statelessManager.getConfig(),
        },
        loadBalancer: {
          config: loadBalancerConfigManager.getConfig(),
        },
        sessionAffinity: sessionAffinityManager.getAffinityStats(),
        autoScaling: autoScaler.getScalingStats(),
        gracefulShutdown: gracefulShutdownManager.getShutdownStatus(),
      };

      reply.send(status);
    });

    // Active instances endpoint
    server.get('/scaling/instances', async (_request, reply) => {
      const instances = await statelessManager.getActiveInstances();
      reply.send({
        total: instances.length,
        instances,
        current: statelessManager.getInstanceInfo(),
      });
    });

    // Load balancer configuration endpoints
    server.get('/scaling/load-balancer/nginx', async (_request, reply) => {
      const config = loadBalancerConfigManager.generateNginxConfig();
      reply.type('text/plain').send(config);
    });

    server.get('/scaling/load-balancer/haproxy', async (_request, reply) => {
      const config = loadBalancerConfigManager.generateHAProxyConfig();
      reply.type('text/plain').send(config);
    });

    server.get('/scaling/load-balancer/aws-alb', async (_request, reply) => {
      const config = loadBalancerConfigManager.generateAWSALBConfig();
      reply.send(config);
    });

    server.get(
      '/scaling/load-balancer/docker-compose',
      async (_request, reply) => {
        const config = loadBalancerConfigManager.generateDockerComposeConfig();
        reply.send(config);
      }
    );

    // Manual scaling endpoint (for testing/emergency)
    server.post('/scaling/manual', async (request, reply) => {
      const { targetInstances, reason } = request.body as any;

      if (!targetInstances || !reason) {
        reply.status(400).send({
          error: 'Bad Request',
          message: 'targetInstances and reason are required',
        });
        return;
      }

      try {
        await autoScaler.manualScale(targetInstances, reason);
        reply.send({
          success: true,
          message: `Manual scaling to ${targetInstances} instances initiated`,
          reason,
        });
      } catch (error) {
        reply.status(400).send({
          error: 'Scaling Failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    // Drain mode endpoint (for zero-downtime deployments)
    server.post('/scaling/drain', async (_request, reply) => {
      try {
        // Send SIGUSR2 to self to initiate drain mode
        process.kill(process.pid, 'SIGUSR2');

        reply.send({
          success: true,
          message: 'Drain mode initiated',
          instanceId: statelessManager.getInstanceInfo().id,
        });
      } catch (error) {
        reply.status(500).send({
          error: 'Drain Failed',
          message: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    });

    logger.info('Scaling endpoints configured');
  }

  /**
   * Start background processes
   */
  private startBackgroundProcesses(): void {
    // Start heartbeat for instance registration
    this.heartbeatInterval = statelessManager.startHeartbeat(30000); // Every 30 seconds

    // Start cleanup for session affinity mappings
    this.cleanupInterval = sessionAffinityManager.startCleanupInterval(300000); // Every 5 minutes

    logger.info('Background processes started', {
      heartbeatInterval: 30000,
      cleanupInterval: 300000,
    });
  }

  /**
   * Generate deployment manifests
   */
  generateDeploymentManifests(): {
    kubernetes: object;
    dockerCompose: object;
    nginx: string;
    haproxy: string;
    awsCloudFormation: object;
  } {
    const deploymentConfig = gracefulShutdownManager.getDeploymentConfig();
    const loadBalancerConfig = loadBalancerConfigManager.getConfig();

    return {
      kubernetes: this.generateKubernetesManifest(
        deploymentConfig,
        loadBalancerConfig
      ),
      dockerCompose: loadBalancerConfigManager.generateDockerComposeConfig(),
      nginx: loadBalancerConfigManager.generateNginxConfig(),
      haproxy: loadBalancerConfigManager.generateHAProxyConfig(),
      awsCloudFormation: loadBalancerConfigManager.generateAWSALBConfig(),
    };
  }

  /**
   * Generate Kubernetes deployment manifest
   */
  private generateKubernetesManifest(
    deploymentConfig: any,
    loadBalancerConfig: any
  ): object {
    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: 'enterprise-auth-backend',
        labels: {
          app: 'enterprise-auth-backend',
          version: process.env['npm_package_version'] || '1.0.0',
        },
      },
      spec: {
        replicas: loadBalancerConfig.scaling.minInstances,
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxUnavailable: deploymentConfig.maxUnavailable,
            maxSurge: deploymentConfig.maxSurge,
          },
        },
        selector: {
          matchLabels: {
            app: 'enterprise-auth-backend',
          },
        },
        template: {
          metadata: {
            labels: {
              app: 'enterprise-auth-backend',
            },
          },
          spec: {
            containers: [
              {
                name: 'auth-backend',
                image: 'enterprise-auth-backend:latest',
                ports: [
                  {
                    containerPort: 3000,
                    name: 'http',
                  },
                ],
                env: [
                  {
                    name: 'NODE_ENV',
                    value: 'production',
                  },
                  {
                    name: 'SERVER_PORT',
                    value: '3000',
                  },
                  {
                    name: 'GRACEFUL_SHUTDOWN_ENABLED',
                    value: 'true',
                  },
                ],
                readinessProbe: {
                  httpGet: {
                    path: deploymentConfig.readinessProbe.path,
                    port: 3000,
                  },
                  initialDelaySeconds:
                    deploymentConfig.readinessProbe.initialDelaySeconds,
                  periodSeconds: deploymentConfig.readinessProbe.periodSeconds,
                  timeoutSeconds:
                    deploymentConfig.readinessProbe.timeoutSeconds,
                  failureThreshold:
                    deploymentConfig.readinessProbe.failureThreshold,
                },
                livenessProbe: {
                  httpGet: {
                    path: deploymentConfig.livenessProbe.path,
                    port: 3000,
                  },
                  initialDelaySeconds:
                    deploymentConfig.livenessProbe.initialDelaySeconds,
                  periodSeconds: deploymentConfig.livenessProbe.periodSeconds,
                  timeoutSeconds: deploymentConfig.livenessProbe.timeoutSeconds,
                  failureThreshold:
                    deploymentConfig.livenessProbe.failureThreshold,
                },
                resources: {
                  requests: {
                    memory: '256Mi',
                    cpu: '250m',
                  },
                  limits: {
                    memory: '512Mi',
                    cpu: '500m',
                  },
                },
              },
            ],
            terminationGracePeriodSeconds: 60,
          },
        },
      },
    };
  }

  /**
   * Get scaling system status
   */
  getSystemStatus(): {
    initialized: boolean;
    components: {
      statelessManager: boolean;
      loadBalancerConfig: boolean;
      sessionAffinity: boolean;
      autoScaler: boolean;
      gracefulShutdown: boolean;
    };
    backgroundProcesses: {
      heartbeat: boolean;
      cleanup: boolean;
    };
  } {
    return {
      initialized: this.initialized,
      components: {
        statelessManager: true, // Always available
        loadBalancerConfig: true, // Always available
        sessionAffinity: true, // Always available
        autoScaler: autoScaler.getScalingStats().enabled,
        gracefulShutdown: true, // Always available
      },
      backgroundProcesses: {
        heartbeat: this.heartbeatInterval !== null,
        cleanup: this.cleanupInterval !== null,
      },
    };
  }

  /**
   * Shutdown scaling system
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) {
      return;
    }

    logger.info('Shutting down scaling system...');

    try {
      // Stop background processes
      if (this.heartbeatInterval) {
        clearInterval(this.heartbeatInterval);
        this.heartbeatInterval = null;
      }

      if (this.cleanupInterval) {
        clearInterval(this.cleanupInterval);
        this.cleanupInterval = null;
      }

      // Shutdown auto-scaler
      await autoScaler.shutdown();

      // Shutdown stateless manager
      await statelessManager.shutdown();

      this.initialized = false;
      logger.info('Scaling system shutdown complete');
    } catch (error) {
      logger.error('Error during scaling system shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }
}

// Export singleton instance
export const scalingSystem = ScalingSystem.getInstance();
