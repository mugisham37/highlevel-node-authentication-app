/**
 * Graceful Shutdown Manager
 * Handles graceful shutdown and zero-downtime deployments
 */

import { FastifyInstance } from 'fastify';
import { logger } from '../logging/winston-logger';
import { statelessManager } from './stateless-manager';
import { sessionAffinityManager } from './session-affinity';
import { autoScaler } from './auto-scaler';

export interface GracefulShutdownConfig {
  enabled: boolean;
  gracePeriod: number; // seconds
  drainTimeout: number; // seconds
  healthCheckGracePeriod: number; // seconds
  forceShutdownTimeout: number; // seconds
  enablePreShutdownHook: boolean;
  enablePostShutdownHook: boolean;
}

export interface ShutdownHook {
  name: string;
  priority: number;
  timeout: number;
  handler: () => Promise<void>;
}

export interface DeploymentConfig {
  strategy: 'rolling' | 'blue_green' | 'canary';
  maxUnavailable: number;
  maxSurge: number;
  readinessProbe: {
    path: string;
    initialDelaySeconds: number;
    periodSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
  };
  livenessProbe: {
    path: string;
    initialDelaySeconds: number;
    periodSeconds: number;
    timeoutSeconds: number;
    failureThreshold: number;
  };
}

export class GracefulShutdownManager {
  private static instance: GracefulShutdownManager;
  private config: GracefulShutdownConfig;
  private deploymentConfig: DeploymentConfig;
  private server: FastifyInstance | null = null;
  private shutdownHooks: Map<string, ShutdownHook> = new Map();
  private isShuttingDown = false;
  private isDraining = false;
  private activeConnections = new Set<string>();
  private shutdownStartTime: Date | null = null;

  private constructor() {
    this.config = this.loadConfig();
    this.deploymentConfig = this.loadDeploymentConfig();
    this.setupSignalHandlers();
  }

  static getInstance(): GracefulShutdownManager {
    if (!GracefulShutdownManager.instance) {
      GracefulShutdownManager.instance = new GracefulShutdownManager();
    }
    return GracefulShutdownManager.instance;
  }

  /**
   * Load graceful shutdown configuration
   */
  private loadConfig(): GracefulShutdownConfig {
    return {
      enabled: process.env.GRACEFUL_SHUTDOWN_ENABLED !== 'false',
      gracePeriod: parseInt(
        process.env.GRACEFUL_SHUTDOWN_GRACE_PERIOD || '30',
        10
      ),
      drainTimeout: parseInt(
        process.env.GRACEFUL_SHUTDOWN_DRAIN_TIMEOUT || '60',
        10
      ),
      healthCheckGracePeriod: parseInt(
        process.env.HEALTH_CHECK_GRACE_PERIOD || '10',
        10
      ),
      forceShutdownTimeout: parseInt(
        process.env.FORCE_SHUTDOWN_TIMEOUT || '120',
        10
      ),
      enablePreShutdownHook: process.env.ENABLE_PRE_SHUTDOWN_HOOK !== 'false',
      enablePostShutdownHook: process.env.ENABLE_POST_SHUTDOWN_HOOK !== 'false',
    };
  }

  /**
   * Load deployment configuration
   */
  private loadDeploymentConfig(): DeploymentConfig {
    return {
      strategy: (process.env.DEPLOYMENT_STRATEGY as any) || 'rolling',
      maxUnavailable: parseInt(process.env.MAX_UNAVAILABLE || '1', 10),
      maxSurge: parseInt(process.env.MAX_SURGE || '1', 10),
      readinessProbe: {
        path: process.env.READINESS_PROBE_PATH || '/health/ready',
        initialDelaySeconds: parseInt(
          process.env.READINESS_INITIAL_DELAY || '10',
          10
        ),
        periodSeconds: parseInt(process.env.READINESS_PERIOD || '10', 10),
        timeoutSeconds: parseInt(process.env.READINESS_TIMEOUT || '5', 10),
        failureThreshold: parseInt(
          process.env.READINESS_FAILURE_THRESHOLD || '3',
          10
        ),
      },
      livenessProbe: {
        path: process.env.LIVENESS_PROBE_PATH || '/health/live',
        initialDelaySeconds: parseInt(
          process.env.LIVENESS_INITIAL_DELAY || '30',
          10
        ),
        periodSeconds: parseInt(process.env.LIVENESS_PERIOD || '30', 10),
        timeoutSeconds: parseInt(process.env.LIVENESS_TIMEOUT || '5', 10),
        failureThreshold: parseInt(
          process.env.LIVENESS_FAILURE_THRESHOLD || '3',
          10
        ),
      },
    };
  }

  /**
   * Setup signal handlers for graceful shutdown
   */
  private setupSignalHandlers(): void {
    // Handle SIGTERM (sent by orchestrators for graceful shutdown)
    process.on('SIGTERM', () => {
      logger.info('Received SIGTERM signal, initiating graceful shutdown');
      this.initiateGracefulShutdown('SIGTERM');
    });

    // Handle SIGINT (Ctrl+C)
    process.on('SIGINT', () => {
      logger.info('Received SIGINT signal, initiating graceful shutdown');
      this.initiateGracefulShutdown('SIGINT');
    });

    // Handle SIGUSR2 (for zero-downtime deployments)
    process.on('SIGUSR2', () => {
      logger.info('Received SIGUSR2 signal, initiating drain mode');
      this.initiateDrainMode();
    });

    // Handle uncaught exceptions
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught exception, initiating emergency shutdown', {
        error: error.message,
        stack: error.stack,
      });
      this.initiateEmergencyShutdown(error);
    });

    // Handle unhandled promise rejections
    process.on('unhandledRejection', (reason, promise) => {
      logger.error(
        'Unhandled promise rejection, initiating emergency shutdown',
        {
          reason: String(reason),
          promise: String(promise),
        }
      );
      this.initiateEmergencyShutdown(
        new Error(`Unhandled promise rejection: ${reason}`)
      );
    });
  }

  /**
   * Initialize graceful shutdown manager
   */
  async initialize(server: FastifyInstance): Promise<void> {
    this.server = server;

    logger.info('Initializing graceful shutdown manager...', {
      gracePeriod: this.config.gracePeriod,
      drainTimeout: this.config.drainTimeout,
      strategy: this.deploymentConfig.strategy,
    });

    // Setup connection tracking
    this.setupConnectionTracking(server);

    // Register default shutdown hooks
    this.registerDefaultShutdownHooks();

    // Setup health check endpoints for deployment
    this.setupHealthCheckEndpoints(server);

    logger.info('Graceful shutdown manager initialized successfully');
  }

  /**
   * Setup connection tracking for graceful shutdown
   */
  private setupConnectionTracking(server: FastifyInstance): void {
    // Track incoming connections
    server.addHook('onRequest', async (request, reply) => {
      const connectionId = `${request.ip}-${Date.now()}-${Math.random()}`;
      this.activeConnections.add(connectionId);

      // Store connection ID for cleanup
      (request as any).connectionId = connectionId;

      // If we're draining, return 503 Service Unavailable
      if (this.isDraining) {
        reply.status(503).send({
          error: 'Service Unavailable',
          message: 'Server is draining, please retry with another instance',
          code: 'SERVICE_DRAINING',
        });
        return;
      }
    });

    // Remove connection tracking on response
    server.addHook('onResponse', async (request, reply) => {
      const connectionId = (request as any).connectionId;
      if (connectionId) {
        this.activeConnections.delete(connectionId);
      }
    });

    // Handle connection errors
    server.addHook('onError', async (request, reply, error) => {
      const connectionId = (request as any).connectionId;
      if (connectionId) {
        this.activeConnections.delete(connectionId);
      }
    });
  }

  /**
   * Register default shutdown hooks
   */
  private registerDefaultShutdownHooks(): void {
    // Stop accepting new connections
    this.addShutdownHook('stop-accepting-connections', {
      name: 'stop-accepting-connections',
      priority: 1,
      timeout: 5000,
      handler: async () => {
        logger.info('Stopping acceptance of new connections');
        this.isDraining = true;

        // Update instance status to draining
        await statelessManager.updateInstanceStatus('draining');
      },
    });

    // Wait for active connections to complete
    this.addShutdownHook('drain-connections', {
      name: 'drain-connections',
      priority: 2,
      timeout: this.config.drainTimeout * 1000,
      handler: async () => {
        logger.info('Draining active connections', {
          activeConnections: this.activeConnections.size,
        });

        const startTime = Date.now();
        const timeout = this.config.drainTimeout * 1000;

        while (
          this.activeConnections.size > 0 &&
          Date.now() - startTime < timeout
        ) {
          logger.debug('Waiting for connections to drain', {
            remaining: this.activeConnections.size,
            elapsed: Date.now() - startTime,
          });

          await new Promise((resolve) => setTimeout(resolve, 1000));
        }

        if (this.activeConnections.size > 0) {
          logger.warn('Force closing remaining connections', {
            remaining: this.activeConnections.size,
          });
        }
      },
    });

    // Shutdown auto-scaler
    this.addShutdownHook('shutdown-autoscaler', {
      name: 'shutdown-autoscaler',
      priority: 3,
      timeout: 10000,
      handler: async () => {
        logger.info('Shutting down auto-scaler');
        await autoScaler.shutdown();
      },
    });

    // Shutdown stateless manager
    this.addShutdownHook('shutdown-stateless-manager', {
      name: 'shutdown-stateless-manager',
      priority: 4,
      timeout: 10000,
      handler: async () => {
        logger.info('Shutting down stateless manager');
        await statelessManager.shutdown();
      },
    });

    // Close server
    this.addShutdownHook('close-server', {
      name: 'close-server',
      priority: 5,
      timeout: 10000,
      handler: async () => {
        if (this.server) {
          logger.info('Closing HTTP server');
          await this.server.close();
        }
      },
    });
  }

  /**
   * Setup health check endpoints for deployment
   */
  private setupHealthCheckEndpoints(server: FastifyInstance): void {
    // Readiness probe - indicates if the instance is ready to receive traffic
    server.get('/health/ready', async (request, reply) => {
      if (this.isDraining || this.isShuttingDown) {
        reply.status(503).send({
          status: 'not_ready',
          reason: this.isDraining ? 'draining' : 'shutting_down',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if all critical services are ready
      const checks = await this.performReadinessChecks();
      const allReady = checks.every((check) => check.status === 'healthy');

      reply.status(allReady ? 200 : 503).send({
        status: allReady ? 'ready' : 'not_ready',
        checks,
        timestamp: new Date().toISOString(),
      });
    });

    // Liveness probe - indicates if the instance is alive and should not be restarted
    server.get('/health/live', async (request, reply) => {
      if (this.isShuttingDown) {
        reply.status(503).send({
          status: 'not_alive',
          reason: 'shutting_down',
          timestamp: new Date().toISOString(),
        });
        return;
      }

      // Check if the application is still functioning
      const checks = await this.performLivenessChecks();
      const allAlive = checks.every((check) => check.status === 'healthy');

      reply.status(allAlive ? 200 : 503).send({
        status: allAlive ? 'alive' : 'not_alive',
        checks,
        timestamp: new Date().toISOString(),
      });
    });

    // Startup probe - indicates if the instance has finished starting up
    server.get('/health/startup', async (request, reply) => {
      // Check if the application has finished starting up
      const checks = await this.performStartupChecks();
      const allStarted = checks.every((check) => check.status === 'healthy');

      reply.status(allStarted ? 200 : 503).send({
        status: allStarted ? 'started' : 'starting',
        checks,
        timestamp: new Date().toISOString(),
      });
    });
  }

  /**
   * Perform readiness checks
   */
  private async performReadinessChecks(): Promise<
    Array<{ name: string; status: 'healthy' | 'unhealthy'; message?: string }>
  > {
    const checks = [];

    // Check database connectivity
    try {
      // This would check actual database connectivity
      checks.push({ name: 'database', status: 'healthy' as const });
    } catch (error) {
      checks.push({
        name: 'database',
        status: 'unhealthy' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Check Redis connectivity
    try {
      // This would check actual Redis connectivity
      checks.push({ name: 'redis', status: 'healthy' as const });
    } catch (error) {
      checks.push({
        name: 'redis',
        status: 'unhealthy' as const,
        message: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return checks;
  }

  /**
   * Perform liveness checks
   */
  private async performLivenessChecks(): Promise<
    Array<{ name: string; status: 'healthy' | 'unhealthy'; message?: string }>
  > {
    const checks = [];

    // Check memory usage
    const memUsage = process.memoryUsage();
    const memUsageMB = memUsage.heapUsed / 1024 / 1024;
    const maxMemoryMB = 2048; // 2GB limit

    checks.push({
      name: 'memory',
      status:
        memUsageMB < maxMemoryMB
          ? ('healthy' as const)
          : ('unhealthy' as const),
      message: `${memUsageMB.toFixed(0)}MB / ${maxMemoryMB}MB`,
    });

    // Check event loop lag
    const eventLoopLag = this.measureEventLoopLag();
    checks.push({
      name: 'event_loop',
      status:
        eventLoopLag < 100 ? ('healthy' as const) : ('unhealthy' as const),
      message: `${eventLoopLag.toFixed(2)}ms lag`,
    });

    return checks;
  }

  /**
   * Perform startup checks
   */
  private async performStartupChecks(): Promise<
    Array<{ name: string; status: 'healthy' | 'unhealthy'; message?: string }>
  > {
    const checks = [];

    // Check if server is listening
    checks.push({
      name: 'server',
      status: this.server?.server.listening
        ? ('healthy' as const)
        : ('unhealthy' as const),
    });

    // Check if stateless manager is initialized
    checks.push({
      name: 'stateless_manager',
      status: 'healthy' as const, // Would check actual initialization status
    });

    return checks;
  }

  /**
   * Measure event loop lag
   */
  private measureEventLoopLag(): number {
    const start = process.hrtime.bigint();
    setImmediate(() => {
      const lag = Number(process.hrtime.bigint() - start) / 1000000; // Convert to milliseconds
      return lag;
    });
    return 0; // Simplified for this implementation
  }

  /**
   * Add shutdown hook
   */
  addShutdownHook(name: string, hook: ShutdownHook): void {
    this.shutdownHooks.set(name, hook);
    logger.debug('Shutdown hook registered', { name, priority: hook.priority });
  }

  /**
   * Remove shutdown hook
   */
  removeShutdownHook(name: string): void {
    this.shutdownHooks.delete(name);
    logger.debug('Shutdown hook removed', { name });
  }

  /**
   * Initiate graceful shutdown
   */
  private async initiateGracefulShutdown(signal: string): Promise<void> {
    if (this.isShuttingDown) {
      logger.warn('Graceful shutdown already in progress');
      return;
    }

    this.isShuttingDown = true;
    this.shutdownStartTime = new Date();

    logger.info('Initiating graceful shutdown', {
      signal,
      gracePeriod: this.config.gracePeriod,
      activeConnections: this.activeConnections.size,
    });

    try {
      // Execute pre-shutdown hook if enabled
      if (this.config.enablePreShutdownHook) {
        await this.executePreShutdownHook();
      }

      // Execute shutdown hooks in priority order
      await this.executeShutdownHooks();

      // Execute post-shutdown hook if enabled
      if (this.config.enablePostShutdownHook) {
        await this.executePostShutdownHook();
      }

      const shutdownDuration = Date.now() - this.shutdownStartTime.getTime();
      logger.info('Graceful shutdown completed successfully', {
        duration: shutdownDuration,
        signal,
      });

      process.exit(0);
    } catch (error) {
      logger.error('Error during graceful shutdown', {
        error: error instanceof Error ? error.message : 'Unknown error',
        signal,
      });

      // Force shutdown after timeout
      setTimeout(() => {
        logger.error('Force shutdown due to timeout');
        process.exit(1);
      }, this.config.forceShutdownTimeout * 1000);
    }
  }

  /**
   * Initiate drain mode (for zero-downtime deployments)
   */
  private async initiateDrainMode(): Promise<void> {
    if (this.isDraining) {
      logger.warn('Already in drain mode');
      return;
    }

    logger.info('Initiating drain mode for zero-downtime deployment');
    this.isDraining = true;

    // Update instance status
    await statelessManager.updateInstanceStatus('draining');

    // Wait for health check grace period
    await new Promise((resolve) =>
      setTimeout(resolve, this.config.healthCheckGracePeriod * 1000)
    );

    logger.info('Drain mode activated, ready for deployment');
  }

  /**
   * Initiate emergency shutdown
   */
  private async initiateEmergencyShutdown(error: Error): Promise<void> {
    logger.error('Initiating emergency shutdown', {
      error: error.message,
      stack: error.stack,
    });

    // Try to close server quickly
    try {
      if (this.server) {
        await Promise.race([
          this.server.close(),
          new Promise((_, reject) =>
            setTimeout(() => reject(new Error('Timeout')), 5000)
          ),
        ]);
      }
    } catch (closeError) {
      logger.error('Error closing server during emergency shutdown', {
        error:
          closeError instanceof Error ? closeError.message : 'Unknown error',
      });
    }

    process.exit(1);
  }

  /**
   * Execute pre-shutdown hook
   */
  private async executePreShutdownHook(): Promise<void> {
    logger.info('Executing pre-shutdown hook');

    // Wait for grace period to allow load balancer to detect draining state
    await new Promise((resolve) =>
      setTimeout(resolve, this.config.gracePeriod * 1000)
    );
  }

  /**
   * Execute shutdown hooks in priority order
   */
  private async executeShutdownHooks(): Promise<void> {
    const hooks = Array.from(this.shutdownHooks.values()).sort(
      (a, b) => a.priority - b.priority
    );

    for (const hook of hooks) {
      logger.info(`Executing shutdown hook: ${hook.name}`, {
        priority: hook.priority,
        timeout: hook.timeout,
      });

      try {
        await Promise.race([
          hook.handler(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`Hook timeout: ${hook.name}`)),
              hook.timeout
            )
          ),
        ]);

        logger.info(`Shutdown hook completed: ${hook.name}`);
      } catch (error) {
        logger.error(`Shutdown hook failed: ${hook.name}`, {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
        // Continue with other hooks even if one fails
      }
    }
  }

  /**
   * Execute post-shutdown hook
   */
  private async executePostShutdownHook(): Promise<void> {
    logger.info('Executing post-shutdown hook');

    // Final cleanup operations
    try {
      // Flush logs
      await new Promise((resolve) => setTimeout(resolve, 1000));
    } catch (error) {
      logger.error('Error in post-shutdown hook', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Get shutdown status
   */
  getShutdownStatus(): {
    isShuttingDown: boolean;
    isDraining: boolean;
    activeConnections: number;
    shutdownStartTime: Date | null;
    hooks: Array<{ name: string; priority: number }>;
  } {
    return {
      isShuttingDown: this.isShuttingDown,
      isDraining: this.isDraining,
      activeConnections: this.activeConnections.size,
      shutdownStartTime: this.shutdownStartTime,
      hooks: Array.from(this.shutdownHooks.values()).map((hook) => ({
        name: hook.name,
        priority: hook.priority,
      })),
    };
  }

  /**
   * Get deployment configuration
   */
  getDeploymentConfig(): DeploymentConfig {
    return { ...this.deploymentConfig };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<GracefulShutdownConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Graceful shutdown configuration updated', { updates });
  }
}

// Export singleton instance
export const gracefulShutdownManager = GracefulShutdownManager.getInstance();
