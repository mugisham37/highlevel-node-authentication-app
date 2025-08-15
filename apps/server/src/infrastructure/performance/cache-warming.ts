/**
 * Cache Warming System for Frequently Accessed Data
 * Provides intelligent cache warming strategies and preloading mechanisms
 */

import { MultiLayerCache } from '../cache/multi-layer-cache';
import { DatabaseConnectionManager } from '../database/connection-manager';
import { performanceTracker } from '../monitoring/performance-tracker';
import { metricsManager } from '../monitoring/prometheus-metrics';
import { logger } from '../logging/winston-logger';
import { correlationIdManager } from '../tracing/correlation-id';
import { EventEmitter } from 'events';

export interface WarmingStrategy {
  name: string;
  priority: number; // 1 = highest priority
  schedule: string; // Cron-like schedule or interval
  enabled: boolean;
  execute(): Promise<void>;
}

export interface WarmingJob {
  id: string;
  name: string;
  strategy: string;
  cacheKey: string;
  dataLoader: () => Promise<any>;
  options: {
    ttl?: number;
    tags?: string[];
    priority?: number;
    dependencies?: string[]; // Other cache keys this depends on
    conditions?: () => Promise<boolean>; // Conditions to check before warming
  };
  schedule: {
    interval?: number; // Milliseconds
    cron?: string; // Cron expression
    immediate?: boolean; // Run immediately on startup
  };
  metrics: {
    executionCount: number;
    successCount: number;
    failureCount: number;
    averageDuration: number;
    lastExecution?: Date;
    lastSuccess?: Date;
    lastFailure?: Date;
  };
}

export interface WarmingConfig {
  enabled: boolean;
  maxConcurrentJobs: number;
  jobTimeout: number; // Milliseconds
  retryAttempts: number;
  retryDelay: number; // Milliseconds
  healthCheckInterval: number; // Milliseconds
  cleanupInterval: number; // Milliseconds
}

export class CacheWarmingSystem extends EventEmitter {
  private jobs = new Map<string, WarmingJob>();
  private activeJobs = new Set<string>();
  private scheduledJobs = new Map<string, NodeJS.Timeout>();
  private healthCheckTimer?: NodeJS.Timeout;
  private cleanupTimer?: NodeJS.Timeout;
  private isRunning = false;

  constructor(
    private cache: MultiLayerCache,
    private dbManager: DatabaseConnectionManager,
    private config: WarmingConfig
  ) {
    super();
    this.setupDefaultStrategies();
  }

  /**
   * Start the cache warming system
   */
  start(): void {
    if (this.isRunning) {
      return;
    }

    this.isRunning = true;
    this.startHealthChecks();
    this.startCleanupProcess();
    this.scheduleAllJobs();

    logger.info('Cache warming system started', {
      totalJobs: this.jobs.size,
      maxConcurrentJobs: this.config.maxConcurrentJobs,
    });

    this.emit('system_started');
  }

  /**
   * Stop the cache warming system
   */
  stop(): void {
    if (!this.isRunning) {
      return;
    }

    this.isRunning = false;
    this.clearAllSchedules();

    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
    }

    if (this.cleanupTimer) {
      clearInterval(this.cleanupTimer);
    }

    logger.info('Cache warming system stopped');
    this.emit('system_stopped');
  }

  /**
   * Register a warming job
   */
  registerJob(job: Omit<WarmingJob, 'id' | 'metrics'>): string {
    const jobId = this.generateJobId();

    const fullJob: WarmingJob = {
      ...job,
      id: jobId,
      metrics: {
        executionCount: 0,
        successCount: 0,
        failureCount: 0,
        averageDuration: 0,
      },
    };

    this.jobs.set(jobId, fullJob);

    if (this.isRunning) {
      this.scheduleJob(fullJob);
    }

    logger.info('Cache warming job registered', {
      jobId,
      jobName: job.name,
      strategy: job.strategy,
      cacheKey: job.cacheKey,
    });

    this.emit('job_registered', fullJob);
    return jobId;
  }

  /**
   * Unregister a warming job
   */
  unregisterJob(jobId: string): boolean {
    const job = this.jobs.get(jobId);
    if (!job) {
      return false;
    }

    this.clearJobSchedule(jobId);
    this.jobs.delete(jobId);

    logger.info('Cache warming job unregistered', {
      jobId,
      jobName: job.name,
    });

    this.emit('job_unregistered', job);
    return true;
  }

  /**
   * Execute a specific warming job immediately
   */
  async executeJob(jobId: string): Promise<void> {
    const job = this.jobs.get(jobId);
    if (!job) {
      throw new Error(`Warming job ${jobId} not found`);
    }

    if (this.activeJobs.has(jobId)) {
      logger.warn('Job already running, skipping execution', {
        jobId,
        jobName: job.name,
      });
      return;
    }

    await this.runJob(job);
  }

  /**
   * Execute all jobs of a specific strategy
   */
  async executeStrategy(strategyName: string): Promise<void> {
    const strategyJobs = Array.from(this.jobs.values()).filter(
      (job) => job.strategy === strategyName
    );

    if (strategyJobs.length === 0) {
      logger.warn('No jobs found for strategy', { strategyName });
      return;
    }

    const promises = strategyJobs.map((job) => this.runJob(job));
    await Promise.allSettled(promises);
  }

  /**
   * Warm cache for frequently accessed authentication data
   */
  async warmAuthenticationData(): Promise<void> {
    const metricId = performanceTracker.startTracking(
      'warm_auth_data',
      'cache_warming'
    );

    try {
      // Warm user sessions
      await this.warmUserSessions();

      // Warm OAuth provider configurations
      await this.warmOAuthProviders();

      // Warm role and permission data
      await this.warmRolePermissions();

      // Warm MFA configurations
      await this.warmMFAConfigurations();

      performanceTracker.stopTracking(metricId, 'success');

      logger.info('Authentication data warming completed');
    } catch (error) {
      performanceTracker.stopTracking(metricId, 'error', error as Error);
      throw error;
    }
  }

  /**
   * Warm cache for user sessions
   */
  private async warmUserSessions(): Promise<void> {
    const cacheKey = 'warm:active_sessions';

    try {
      const activeSessions = await this.dbManager.executeQuery(
        async () => {
          // This would use Drizzle for performance
          return []; // Placeholder - would fetch active sessions
        },
        { preferReplica: true }
      );

      await this.cache.set(cacheKey, activeSessions, {
        ttl: 300, // 5 minutes
        tags: ['sessions', 'auth'],
      });

      logger.debug('User sessions warmed', {
        sessionCount: activeSessions.length,
        cacheKey,
      });
    } catch (error) {
      logger.error('Failed to warm user sessions', {
        error: (error as Error).message,
        cacheKey,
      });
    }
  }

  /**
   * Warm OAuth provider configurations
   */
  private async warmOAuthProviders(): Promise<void> {
    const cacheKey = 'warm:oauth_providers';

    try {
      const providers = await this.dbManager.executeQuery(
        async () => {
          // This would fetch OAuth provider configurations
          return []; // Placeholder
        },
        { preferReplica: true }
      );

      await this.cache.set(cacheKey, providers, {
        ttl: 3600, // 1 hour
        tags: ['oauth', 'config'],
      });

      logger.debug('OAuth providers warmed', {
        providerCount: providers.length,
        cacheKey,
      });
    } catch (error) {
      logger.error('Failed to warm OAuth providers', {
        error: (error as Error).message,
        cacheKey,
      });
    }
  }

  /**
   * Warm role and permission data
   */
  private async warmRolePermissions(): Promise<void> {
    const cacheKey = 'warm:role_permissions';

    try {
      const rolePermissions = await this.dbManager.executeQuery(
        async () => {
          // This would fetch role and permission mappings
          return []; // Placeholder
        },
        { preferReplica: true }
      );

      await this.cache.set(cacheKey, rolePermissions, {
        ttl: 1800, // 30 minutes
        tags: ['roles', 'permissions', 'auth'],
      });

      logger.debug('Role permissions warmed', {
        mappingCount: rolePermissions.length,
        cacheKey,
      });
    } catch (error) {
      logger.error('Failed to warm role permissions', {
        error: (error as Error).message,
        cacheKey,
      });
    }
  }

  /**
   * Warm MFA configurations
   */
  private async warmMFAConfigurations(): Promise<void> {
    const cacheKey = 'warm:mfa_configs';

    try {
      const mfaConfigs = await this.dbManager.executeQuery(
        async () => {
          // This would fetch MFA configurations
          return []; // Placeholder
        },
        { preferReplica: true }
      );

      await this.cache.set(cacheKey, mfaConfigs, {
        ttl: 900, // 15 minutes
        tags: ['mfa', 'config', 'auth'],
      });

      logger.debug('MFA configurations warmed', {
        configCount: mfaConfigs.length,
        cacheKey,
      });
    } catch (error) {
      logger.error('Failed to warm MFA configurations', {
        error: (error as Error).message,
        cacheKey,
      });
    }
  }

  /**
   * Run a specific warming job
   */
  private async runJob(job: WarmingJob): Promise<void> {
    if (this.activeJobs.size >= this.config.maxConcurrentJobs) {
      logger.warn('Maximum concurrent jobs reached, skipping job', {
        jobId: job.id,
        jobName: job.name,
        activeJobs: this.activeJobs.size,
      });
      return;
    }

    this.activeJobs.add(job.id);

    const metricId = performanceTracker.startTracking(
      'warming_job',
      'cache_warming',
      { jobId: job.id, jobName: job.name }
    );

    const startTime = Date.now();

    try {
      // Check conditions if specified
      if (job.options.conditions) {
        const shouldRun = await job.options.conditions();
        if (!shouldRun) {
          logger.debug('Job conditions not met, skipping', {
            jobId: job.id,
            jobName: job.name,
          });
          return;
        }
      }

      // Check dependencies
      if (job.options.dependencies) {
        const dependenciesMet = await this.checkDependencies(
          job.options.dependencies
        );
        if (!dependenciesMet) {
          logger.warn('Job dependencies not met, skipping', {
            jobId: job.id,
            jobName: job.name,
            dependencies: job.options.dependencies,
          });
          return;
        }
      }

      // Execute with timeout
      const data = await Promise.race([
        job.dataLoader(),
        this.createTimeoutPromise(this.config.jobTimeout),
      ]);

      // Cache the result
      await this.cache.set(job.cacheKey, data, {
        ttl: job.options.ttl || 300, // Default 5 minutes
        tags: job.options.tags || [],
      });

      const duration = Date.now() - startTime;
      this.updateJobMetrics(job, true, duration);

      performanceTracker.stopTracking(metricId, 'success', undefined, {
        duration,
        cacheKey: job.cacheKey,
      });

      metricsManager.recordCacheOperation('set', 'redis', 'success', duration);

      logger.debug('Warming job completed successfully', {
        jobId: job.id,
        jobName: job.name,
        duration,
        cacheKey: job.cacheKey,
      });

      this.emit('job_completed', job, data);
    } catch (error) {
      const duration = Date.now() - startTime;
      this.updateJobMetrics(job, false, duration);

      performanceTracker.stopTracking(metricId, 'error', error as Error);
      metricsManager.recordCacheOperation('set', 'redis', 'error', duration);

      logger.error('Warming job failed', {
        jobId: job.id,
        jobName: job.name,
        error: (error as Error).message,
        duration,
      });

      this.emit('job_failed', job, error);

      // Retry if configured
      if (this.config.retryAttempts > 0) {
        setTimeout(() => {
          this.retryJob(job, 1);
        }, this.config.retryDelay);
      }
    } finally {
      this.activeJobs.delete(job.id);
    }
  }

  /**
   * Retry a failed job
   */
  private async retryJob(job: WarmingJob, attempt: number): Promise<void> {
    if (attempt > this.config.retryAttempts) {
      logger.error('Job retry attempts exhausted', {
        jobId: job.id,
        jobName: job.name,
        attempts: attempt - 1,
      });
      return;
    }

    logger.info('Retrying warming job', {
      jobId: job.id,
      jobName: job.name,
      attempt,
      maxAttempts: this.config.retryAttempts,
    });

    try {
      await this.runJob(job);
    } catch (error) {
      setTimeout(() => {
        this.retryJob(job, attempt + 1);
      }, this.config.retryDelay * attempt); // Exponential backoff
    }
  }

  /**
   * Check if job dependencies are met
   */
  private async checkDependencies(dependencies: string[]): Promise<boolean> {
    for (const dependency of dependencies) {
      const exists = await this.cache.has(dependency);
      if (!exists) {
        return false;
      }
    }
    return true;
  }

  /**
   * Update job execution metrics
   */
  private updateJobMetrics(
    job: WarmingJob,
    success: boolean,
    duration: number
  ): void {
    job.metrics.executionCount++;

    if (success) {
      job.metrics.successCount++;
      job.metrics.lastSuccess = new Date();
    } else {
      job.metrics.failureCount++;
      job.metrics.lastFailure = new Date();
    }

    job.metrics.lastExecution = new Date();

    // Update average duration (exponential moving average)
    if (job.metrics.averageDuration === 0) {
      job.metrics.averageDuration = duration;
    } else {
      job.metrics.averageDuration =
        job.metrics.averageDuration * 0.8 + duration * 0.2;
    }
  }

  /**
   * Schedule all registered jobs
   */
  private scheduleAllJobs(): void {
    for (const job of this.jobs.values()) {
      this.scheduleJob(job);
    }
  }

  /**
   * Schedule a specific job
   */
  private scheduleJob(job: WarmingJob): void {
    // Execute immediately if configured
    if (job.schedule.immediate) {
      setImmediate(() => this.runJob(job));
    }

    // Schedule recurring execution
    if (job.schedule.interval) {
      const timer = setInterval(() => {
        this.runJob(job).catch((error) => {
          logger.error('Scheduled job execution failed', {
            jobId: job.id,
            jobName: job.name,
            error: (error as Error).message,
          });
        });
      }, job.schedule.interval);

      this.scheduledJobs.set(job.id, timer);
    }

    // TODO: Implement cron scheduling if needed
    if (job.schedule.cron) {
      logger.warn('Cron scheduling not yet implemented', {
        jobId: job.id,
        cronExpression: job.schedule.cron,
      });
    }
  }

  /**
   * Clear schedule for a specific job
   */
  private clearJobSchedule(jobId: string): void {
    const timer = this.scheduledJobs.get(jobId);
    if (timer) {
      clearInterval(timer);
      this.scheduledJobs.delete(jobId);
    }
  }

  /**
   * Clear all job schedules
   */
  private clearAllSchedules(): void {
    for (const timer of this.scheduledJobs.values()) {
      clearInterval(timer);
    }
    this.scheduledJobs.clear();
  }

  /**
   * Start health check process
   */
  private startHealthChecks(): void {
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.config.healthCheckInterval);
  }

  /**
   * Start cleanup process
   */
  private startCleanupProcess(): void {
    this.cleanupTimer = setInterval(() => {
      this.performCleanup();
    }, this.config.cleanupInterval);
  }

  /**
   * Perform system health check
   */
  private performHealthCheck(): void {
    const totalJobs = this.jobs.size;
    const activeJobs = this.activeJobs.size;
    const scheduledJobs = this.scheduledJobs.size;

    const jobMetrics = Array.from(this.jobs.values()).map((job) => ({
      id: job.id,
      name: job.name,
      successRate:
        job.metrics.executionCount > 0
          ? job.metrics.successCount / job.metrics.executionCount
          : 0,
      averageDuration: job.metrics.averageDuration,
      lastExecution: job.metrics.lastExecution,
    }));

    logger.debug('Cache warming system health check', {
      totalJobs,
      activeJobs,
      scheduledJobs,
      jobMetrics,
      correlationId: correlationIdManager.getCorrelationId(),
    });

    this.emit('health_check', {
      totalJobs,
      activeJobs,
      scheduledJobs,
      jobMetrics,
    });
  }

  /**
   * Perform system cleanup
   */
  private performCleanup(): void {
    // Clean up completed jobs with poor performance
    const jobsToRemove: string[] = [];

    for (const [jobId, job] of this.jobs.entries()) {
      const successRate =
        job.metrics.executionCount > 0
          ? job.metrics.successCount / job.metrics.executionCount
          : 0;

      // Remove jobs with consistently poor performance
      if (job.metrics.executionCount > 10 && successRate < 0.1) {
        jobsToRemove.push(jobId);
      }
    }

    for (const jobId of jobsToRemove) {
      logger.warn('Removing poorly performing warming job', {
        jobId,
        jobName: this.jobs.get(jobId)?.name,
      });
      this.unregisterJob(jobId);
    }

    if (jobsToRemove.length > 0) {
      logger.info('Cleanup completed', {
        removedJobs: jobsToRemove.length,
      });
    }
  }

  /**
   * Setup default warming strategies
   */
  private setupDefaultStrategies(): void {
    // Register default authentication data warming job
    this.registerJob({
      name: 'Authentication Data Warming',
      strategy: 'authentication',
      cacheKey: 'warm:auth_data',
      dataLoader: () => this.warmAuthenticationData(),
      options: {
        ttl: 600, // 10 minutes
        tags: ['auth', 'warm'],
        priority: 1,
      },
      schedule: {
        interval: 300000, // Every 5 minutes
        immediate: true,
      },
    });
  }

  /**
   * Create timeout promise
   */
  private createTimeoutPromise(timeout: number): Promise<never> {
    return new Promise((_, reject) => {
      setTimeout(() => reject(new Error('Job timeout')), timeout);
    });
  }

  /**
   * Generate unique job ID
   */
  private generateJobId(): string {
    return `warm_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get all job metrics
   */
  getJobMetrics(): WarmingJob[] {
    return Array.from(this.jobs.values());
  }

  /**
   * Get system status
   */
  getSystemStatus() {
    return {
      isRunning: this.isRunning,
      totalJobs: this.jobs.size,
      activeJobs: this.activeJobs.size,
      scheduledJobs: this.scheduledJobs.size,
      config: this.config,
    };
  }
}
