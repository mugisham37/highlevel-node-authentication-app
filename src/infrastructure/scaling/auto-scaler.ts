/**
 * Auto-Scaling Manager
 * Handles automatic scaling based on metrics and load patterns
 */

import { logger } from '../logging/winston-logger';
import { metricsManager } from '../monitoring/prometheus-metrics';
import { statelessManager } from './stateless-manager';

export interface AutoScalingConfig {
  enabled: boolean;
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
  targetRequestRate: number;
  targetResponseTime: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
  scaleUpThreshold: number;
  scaleDownThreshold: number;
  evaluationPeriod: number;
  dataPointsToAlarm: number;
}

export interface ScalingMetrics {
  cpuUtilization: number;
  memoryUtilization: number;
  requestRate: number;
  averageResponseTime: number;
  errorRate: number;
  activeConnections: number;
  queueLength: number;
  timestamp: Date;
}

export interface ScalingDecision {
  action: 'scale_up' | 'scale_down' | 'no_action';
  reason: string;
  currentInstances: number;
  targetInstances: number;
  metrics: ScalingMetrics;
  confidence: number;
}

export interface ScalingEvent {
  id: string;
  timestamp: Date;
  action: 'scale_up' | 'scale_down';
  fromInstances: number;
  toInstances: number;
  reason: string;
  metrics: ScalingMetrics;
  duration?: number;
  success: boolean;
  error?: string;
}

export class AutoScaler {
  private static instance: AutoScaler;
  private config: AutoScalingConfig;
  private metricsHistory: ScalingMetrics[] = [];
  private scalingHistory: ScalingEvent[] = [];
  private lastScaleAction: Date | null = null;
  private evaluationInterval: NodeJS.Timeout | null = null;
  private currentInstances: number = 1;
  private isScaling = false;

  private constructor() {
    this.config = this.loadConfig();
  }

  static getInstance(): AutoScaler {
    if (!AutoScaler.instance) {
      AutoScaler.instance = new AutoScaler();
    }
    return AutoScaler.instance;
  }

  /**
   * Load auto-scaling configuration
   */
  private loadConfig(): AutoScalingConfig {
    return {
      enabled: process.env.AUTO_SCALING_ENABLED === 'true',
      minInstances: parseInt(process.env.MIN_INSTANCES || '2', 10),
      maxInstances: parseInt(process.env.MAX_INSTANCES || '10', 10),
      targetCpuUtilization: parseInt(
        process.env.TARGET_CPU_UTILIZATION || '70',
        10
      ),
      targetMemoryUtilization: parseInt(
        process.env.TARGET_MEMORY_UTILIZATION || '80',
        10
      ),
      targetRequestRate: parseInt(
        process.env.TARGET_REQUEST_RATE || '1000',
        10
      ), // requests per minute
      targetResponseTime: parseInt(
        process.env.TARGET_RESPONSE_TIME || '200',
        10
      ), // milliseconds
      scaleUpCooldown: parseInt(process.env.SCALE_UP_COOLDOWN || '300', 10), // seconds
      scaleDownCooldown: parseInt(process.env.SCALE_DOWN_COOLDOWN || '600', 10), // seconds
      scaleUpThreshold: parseFloat(process.env.SCALE_UP_THRESHOLD || '0.8'), // 80% of target
      scaleDownThreshold: parseFloat(process.env.SCALE_DOWN_THRESHOLD || '0.5'), // 50% of target
      evaluationPeriod: parseInt(
        process.env.SCALING_EVALUATION_PERIOD || '60',
        10
      ), // seconds
      dataPointsToAlarm: parseInt(process.env.SCALING_DATA_POINTS || '3', 10),
    };
  }

  /**
   * Initialize auto-scaler
   */
  async initialize(): Promise<void> {
    if (!this.config.enabled) {
      logger.info('Auto-scaling is disabled');
      return;
    }

    logger.info('Initializing auto-scaler...', {
      minInstances: this.config.minInstances,
      maxInstances: this.config.maxInstances,
      targetCpuUtilization: this.config.targetCpuUtilization,
      targetMemoryUtilization: this.config.targetMemoryUtilization,
    });

    try {
      // Validate configuration
      this.validateConfig();

      // Get current instance count
      await this.updateCurrentInstanceCount();

      // Start evaluation interval
      this.startEvaluationInterval();

      logger.info('Auto-scaler initialized successfully', {
        currentInstances: this.currentInstances,
        evaluationPeriod: this.config.evaluationPeriod,
      });
    } catch (error) {
      logger.error('Failed to initialize auto-scaler', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      throw error;
    }
  }

  /**
   * Validate auto-scaling configuration
   */
  private validateConfig(): void {
    const errors: string[] = [];

    if (this.config.minInstances < 1) {
      errors.push('Minimum instances must be at least 1');
    }

    if (this.config.maxInstances < this.config.minInstances) {
      errors.push(
        'Maximum instances must be greater than or equal to minimum instances'
      );
    }

    if (
      this.config.targetCpuUtilization <= 0 ||
      this.config.targetCpuUtilization > 100
    ) {
      errors.push('Target CPU utilization must be between 1 and 100');
    }

    if (
      this.config.targetMemoryUtilization <= 0 ||
      this.config.targetMemoryUtilization > 100
    ) {
      errors.push('Target memory utilization must be between 1 and 100');
    }

    if (this.config.scaleUpCooldown < 60) {
      errors.push('Scale up cooldown must be at least 60 seconds');
    }

    if (this.config.scaleDownCooldown < 60) {
      errors.push('Scale down cooldown must be at least 60 seconds');
    }

    if (errors.length > 0) {
      throw new Error(
        `Auto-scaling configuration validation failed: ${errors.join(', ')}`
      );
    }
  }

  /**
   * Update current instance count
   */
  private async updateCurrentInstanceCount(): Promise<void> {
    try {
      const instances = await statelessManager.getActiveInstances();
      this.currentInstances = instances.length;

      logger.debug('Updated current instance count', {
        currentInstances: this.currentInstances,
        instances: instances.map((i) => i.id),
      });
    } catch (error) {
      logger.warn('Failed to update current instance count', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Start evaluation interval
   */
  private startEvaluationInterval(): void {
    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
    }

    this.evaluationInterval = setInterval(async () => {
      try {
        await this.evaluateScaling();
      } catch (error) {
        logger.error('Error during scaling evaluation', {
          error: error instanceof Error ? error.message : 'Unknown error',
        });
      }
    }, this.config.evaluationPeriod * 1000);

    logger.debug('Auto-scaling evaluation interval started', {
      period: this.config.evaluationPeriod,
    });
  }

  /**
   * Collect current metrics
   */
  private async collectMetrics(): Promise<ScalingMetrics> {
    const memUsage = process.memoryUsage();
    const cpuUsage = process.cpuUsage();

    // Get metrics from Prometheus metrics manager
    const httpMetrics = metricsManager.getHttpMetrics();
    const systemMetrics = metricsManager.getSystemMetrics();

    // Calculate CPU utilization (simplified)
    const cpuUtilization = Math.min(
      100,
      (cpuUsage.user + cpuUsage.system) / 1000000 / 10
    ); // Rough estimate

    // Calculate memory utilization
    const memoryUtilization = (memUsage.heapUsed / memUsage.heapTotal) * 100;

    // Calculate request rate (requests per minute)
    const requestRate = this.calculateRequestRate();

    // Calculate average response time
    const averageResponseTime = this.calculateAverageResponseTime();

    // Calculate error rate
    const errorRate = this.calculateErrorRate();

    const metrics: ScalingMetrics = {
      cpuUtilization,
      memoryUtilization,
      requestRate,
      averageResponseTime,
      errorRate,
      activeConnections: 0, // Would be populated from actual connection tracking
      queueLength: 0, // Would be populated from actual queue monitoring
      timestamp: new Date(),
    };

    // Store in history
    this.metricsHistory.push(metrics);

    // Keep only recent history
    const maxHistorySize = 100;
    if (this.metricsHistory.length > maxHistorySize) {
      this.metricsHistory = this.metricsHistory.slice(-maxHistorySize);
    }

    return metrics;
  }

  /**
   * Calculate request rate from metrics history
   */
  private calculateRequestRate(): number {
    if (this.metricsHistory.length < 2) {
      return 0;
    }

    const recent = this.metricsHistory.slice(-5); // Last 5 data points
    const totalRequests = recent.reduce(
      (sum, m) => sum + (m.requestRate || 0),
      0
    );
    return totalRequests / recent.length;
  }

  /**
   * Calculate average response time from metrics history
   */
  private calculateAverageResponseTime(): number {
    if (this.metricsHistory.length === 0) {
      return 0;
    }

    const recent = this.metricsHistory.slice(-5); // Last 5 data points
    const totalResponseTime = recent.reduce(
      (sum, m) => sum + (m.averageResponseTime || 0),
      0
    );
    return totalResponseTime / recent.length;
  }

  /**
   * Calculate error rate from metrics history
   */
  private calculateErrorRate(): number {
    if (this.metricsHistory.length === 0) {
      return 0;
    }

    const recent = this.metricsHistory.slice(-5); // Last 5 data points
    const totalErrorRate = recent.reduce(
      (sum, m) => sum + (m.errorRate || 0),
      0
    );
    return totalErrorRate / recent.length;
  }

  /**
   * Evaluate scaling decision
   */
  private async evaluateScaling(): Promise<void> {
    if (this.isScaling) {
      logger.debug('Scaling operation in progress, skipping evaluation');
      return;
    }

    // Update current instance count
    await this.updateCurrentInstanceCount();

    // Collect current metrics
    const metrics = await this.collectMetrics();

    // Make scaling decision
    const decision = this.makeScalingDecision(metrics);

    logger.debug('Scaling evaluation completed', {
      decision: decision.action,
      reason: decision.reason,
      currentInstances: decision.currentInstances,
      targetInstances: decision.targetInstances,
      confidence: decision.confidence,
      metrics: {
        cpu: metrics.cpuUtilization.toFixed(1),
        memory: metrics.memoryUtilization.toFixed(1),
        requestRate: metrics.requestRate.toFixed(0),
        responseTime: metrics.averageResponseTime.toFixed(0),
      },
    });

    // Execute scaling action if needed
    if (decision.action !== 'no_action') {
      await this.executeScalingAction(decision);
    }
  }

  /**
   * Make scaling decision based on metrics
   */
  private makeScalingDecision(metrics: ScalingMetrics): ScalingDecision {
    const reasons: string[] = [];
    let scaleUpScore = 0;
    let scaleDownScore = 0;

    // Check CPU utilization
    if (
      metrics.cpuUtilization >
      this.config.targetCpuUtilization * this.config.scaleUpThreshold
    ) {
      scaleUpScore += 1;
      reasons.push(
        `CPU utilization ${metrics.cpuUtilization.toFixed(1)}% > ${(this.config.targetCpuUtilization * this.config.scaleUpThreshold).toFixed(1)}%`
      );
    } else if (
      metrics.cpuUtilization <
      this.config.targetCpuUtilization * this.config.scaleDownThreshold
    ) {
      scaleDownScore += 1;
      reasons.push(
        `CPU utilization ${metrics.cpuUtilization.toFixed(1)}% < ${(this.config.targetCpuUtilization * this.config.scaleDownThreshold).toFixed(1)}%`
      );
    }

    // Check memory utilization
    if (
      metrics.memoryUtilization >
      this.config.targetMemoryUtilization * this.config.scaleUpThreshold
    ) {
      scaleUpScore += 1;
      reasons.push(
        `Memory utilization ${metrics.memoryUtilization.toFixed(1)}% > ${(this.config.targetMemoryUtilization * this.config.scaleUpThreshold).toFixed(1)}%`
      );
    } else if (
      metrics.memoryUtilization <
      this.config.targetMemoryUtilization * this.config.scaleDownThreshold
    ) {
      scaleDownScore += 1;
      reasons.push(
        `Memory utilization ${metrics.memoryUtilization.toFixed(1)}% < ${(this.config.targetMemoryUtilization * this.config.scaleDownThreshold).toFixed(1)}%`
      );
    }

    // Check response time
    if (
      metrics.averageResponseTime >
      this.config.targetResponseTime * this.config.scaleUpThreshold
    ) {
      scaleUpScore += 1;
      reasons.push(
        `Response time ${metrics.averageResponseTime.toFixed(0)}ms > ${(this.config.targetResponseTime * this.config.scaleUpThreshold).toFixed(0)}ms`
      );
    } else if (
      metrics.averageResponseTime <
      this.config.targetResponseTime * this.config.scaleDownThreshold
    ) {
      scaleDownScore += 1;
      reasons.push(
        `Response time ${metrics.averageResponseTime.toFixed(0)}ms < ${(this.config.targetResponseTime * this.config.scaleDownThreshold).toFixed(0)}ms`
      );
    }

    // Check request rate
    if (
      metrics.requestRate >
      this.config.targetRequestRate * this.config.scaleUpThreshold
    ) {
      scaleUpScore += 1;
      reasons.push(
        `Request rate ${metrics.requestRate.toFixed(0)}/min > ${(this.config.targetRequestRate * this.config.scaleUpThreshold).toFixed(0)}/min`
      );
    } else if (
      metrics.requestRate <
      this.config.targetRequestRate * this.config.scaleDownThreshold
    ) {
      scaleDownScore += 1;
      reasons.push(
        `Request rate ${metrics.requestRate.toFixed(0)}/min < ${(this.config.targetRequestRate * this.config.scaleDownThreshold).toFixed(0)}/min`
      );
    }

    // Check cooldown periods
    const now = new Date();
    if (this.lastScaleAction) {
      const timeSinceLastScale =
        (now.getTime() - this.lastScaleAction.getTime()) / 1000;

      if (
        scaleUpScore > 0 &&
        timeSinceLastScale < this.config.scaleUpCooldown
      ) {
        return {
          action: 'no_action',
          reason: `Scale up cooldown active (${Math.ceil(this.config.scaleUpCooldown - timeSinceLastScale)}s remaining)`,
          currentInstances: this.currentInstances,
          targetInstances: this.currentInstances,
          metrics,
          confidence: 0,
        };
      }

      if (
        scaleDownScore > 0 &&
        timeSinceLastScale < this.config.scaleDownCooldown
      ) {
        return {
          action: 'no_action',
          reason: `Scale down cooldown active (${Math.ceil(this.config.scaleDownCooldown - timeSinceLastScale)}s remaining)`,
          currentInstances: this.currentInstances,
          targetInstances: this.currentInstances,
          metrics,
          confidence: 0,
        };
      }
    }

    // Determine action
    let action: 'scale_up' | 'scale_down' | 'no_action' = 'no_action';
    let targetInstances = this.currentInstances;
    let confidence = 0;

    if (
      scaleUpScore >= this.config.dataPointsToAlarm &&
      this.currentInstances < this.config.maxInstances
    ) {
      action = 'scale_up';
      targetInstances = Math.min(
        this.config.maxInstances,
        this.currentInstances + 1
      );
      confidence = Math.min(1, scaleUpScore / this.config.dataPointsToAlarm);
    } else if (
      scaleDownScore >= this.config.dataPointsToAlarm &&
      this.currentInstances > this.config.minInstances
    ) {
      action = 'scale_down';
      targetInstances = Math.max(
        this.config.minInstances,
        this.currentInstances - 1
      );
      confidence = Math.min(1, scaleDownScore / this.config.dataPointsToAlarm);
    }

    return {
      action,
      reason: reasons.join(', ') || 'All metrics within target ranges',
      currentInstances: this.currentInstances,
      targetInstances,
      metrics,
      confidence,
    };
  }

  /**
   * Execute scaling action
   */
  private async executeScalingAction(decision: ScalingDecision): Promise<void> {
    if (decision.action === 'no_action') {
      return;
    }

    this.isScaling = true;
    const startTime = new Date();

    const scalingEvent: ScalingEvent = {
      id: require('crypto').randomBytes(8).toString('hex'),
      timestamp: startTime,
      action: decision.action,
      fromInstances: decision.currentInstances,
      toInstances: decision.targetInstances,
      reason: decision.reason,
      metrics: decision.metrics,
      success: false,
    };

    logger.info(`Executing scaling action: ${decision.action}`, {
      eventId: scalingEvent.id,
      fromInstances: scalingEvent.fromInstances,
      toInstances: scalingEvent.toInstances,
      reason: scalingEvent.reason,
      confidence: decision.confidence,
    });

    try {
      // Execute the actual scaling operation
      await this.performScalingOperation(decision);

      // Update success status
      scalingEvent.success = true;
      scalingEvent.duration = Date.now() - startTime.getTime();

      // Update last scale action time
      this.lastScaleAction = new Date();

      logger.info(`Scaling action completed successfully`, {
        eventId: scalingEvent.id,
        action: scalingEvent.action,
        duration: scalingEvent.duration,
      });
    } catch (error) {
      scalingEvent.success = false;
      scalingEvent.error =
        error instanceof Error ? error.message : 'Unknown error';
      scalingEvent.duration = Date.now() - startTime.getTime();

      logger.error(`Scaling action failed`, {
        eventId: scalingEvent.id,
        action: scalingEvent.action,
        error: scalingEvent.error,
        duration: scalingEvent.duration,
      });
    } finally {
      // Store scaling event
      this.scalingHistory.push(scalingEvent);

      // Keep only recent history
      const maxHistorySize = 50;
      if (this.scalingHistory.length > maxHistorySize) {
        this.scalingHistory = this.scalingHistory.slice(-maxHistorySize);
      }

      this.isScaling = false;
    }
  }

  /**
   * Perform the actual scaling operation
   */
  private async performScalingOperation(
    decision: ScalingDecision
  ): Promise<void> {
    // In a real implementation, this would:
    // 1. For cloud environments: Call cloud provider APIs (AWS Auto Scaling, GCP Instance Groups, etc.)
    // 2. For container environments: Update container orchestrator (Kubernetes, Docker Swarm, etc.)
    // 3. For bare metal: Start/stop application instances

    // For this implementation, we'll simulate the scaling operation
    logger.info('Simulating scaling operation', {
      action: decision.action,
      targetInstances: decision.targetInstances,
    });

    // Simulate API call delay
    await new Promise((resolve) => setTimeout(resolve, 2000));

    // Update current instance count
    this.currentInstances = decision.targetInstances;

    // In a real implementation, you would wait for instances to be ready
    // and update the load balancer configuration
  }

  /**
   * Get scaling statistics
   */
  getScalingStats(): {
    enabled: boolean;
    currentInstances: number;
    config: AutoScalingConfig;
    recentMetrics: ScalingMetrics[];
    recentEvents: ScalingEvent[];
    lastScaleAction: Date | null;
    isScaling: boolean;
  } {
    return {
      enabled: this.config.enabled,
      currentInstances: this.currentInstances,
      config: { ...this.config },
      recentMetrics: this.metricsHistory.slice(-10),
      recentEvents: this.scalingHistory.slice(-10),
      lastScaleAction: this.lastScaleAction,
      isScaling: this.isScaling,
    };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<AutoScalingConfig>): void {
    this.config = { ...this.config, ...updates };

    // Restart evaluation interval if period changed
    if (updates.evaluationPeriod) {
      this.startEvaluationInterval();
    }

    logger.info('Auto-scaling configuration updated', { updates });
  }

  /**
   * Manual scaling trigger
   */
  async manualScale(targetInstances: number, reason: string): Promise<void> {
    if (
      targetInstances < this.config.minInstances ||
      targetInstances > this.config.maxInstances
    ) {
      throw new Error(
        `Target instances must be between ${this.config.minInstances} and ${this.config.maxInstances}`
      );
    }

    if (this.isScaling) {
      throw new Error('Scaling operation already in progress');
    }

    const metrics = await this.collectMetrics();
    const action =
      targetInstances > this.currentInstances ? 'scale_up' : 'scale_down';

    const decision: ScalingDecision = {
      action,
      reason: `Manual scaling: ${reason}`,
      currentInstances: this.currentInstances,
      targetInstances,
      metrics,
      confidence: 1.0,
    };

    await this.executeScalingAction(decision);
  }

  /**
   * Shutdown auto-scaler
   */
  async shutdown(): Promise<void> {
    logger.info('Shutting down auto-scaler...');

    if (this.evaluationInterval) {
      clearInterval(this.evaluationInterval);
      this.evaluationInterval = null;
    }

    // Wait for any ongoing scaling operation to complete
    while (this.isScaling) {
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }

    logger.info('Auto-scaler shutdown complete');
  }
}

// Export singleton instance
export const autoScaler = AutoScaler.getInstance();
