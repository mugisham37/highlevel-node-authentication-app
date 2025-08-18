import winston from 'winston';

export interface LogMetrics {
  totalLogs: number;
  logsByLevel: Record<string, number>;
  logsByService: Record<string, number>;
  errorsPerMinute: number;
  averageLogSize: number;
  lastLogTime: Date | null;
}

export interface LogMetricsOptions {
  trackSize?: boolean;
  trackTiming?: boolean;
  windowSizeMinutes?: number;
}

/**
 * Log metrics collector
 */
export class LogMetricsCollector {
  private metrics: LogMetrics = {
    totalLogs: 0,
    logsByLevel: {},
    logsByService: {},
    errorsPerMinute: 0,
    averageLogSize: 0,
    lastLogTime: null
  };

  private errorTimestamps: Date[] = [];
  private logSizes: number[] = [];
  private options: Required<LogMetricsOptions>;

  constructor(options: LogMetricsOptions = {}) {
    this.options = {
      trackSize: true,
      trackTiming: true,
      windowSizeMinutes: 5,
      ...options
    };

    // Clean up old error timestamps periodically
    setInterval(() => {
      this.cleanupOldTimestamps();
    }, 60000); // Every minute
  }

  /**
   * Record a log entry
   */
  recordLog(info: any): void {
    this.metrics.totalLogs++;
    this.metrics.lastLogTime = new Date();

    // Track by level
    const level = info.level || 'unknown';
    this.metrics.logsByLevel[level] = (this.metrics.logsByLevel[level] || 0) + 1;

    // Track by service
    if (info.service) {
      this.metrics.logsByService[info.service] = (this.metrics.logsByService[info.service] || 0) + 1;
    }

    // Track errors
    if (level === 'error') {
      this.errorTimestamps.push(new Date());
    }

    // Track log size
    if (this.options.trackSize) {
      const logSize = JSON.stringify(info).length;
      this.logSizes.push(logSize);
      
      // Keep only recent sizes for average calculation
      if (this.logSizes.length > 1000) {
        this.logSizes = this.logSizes.slice(-500);
      }
      
      this.metrics.averageLogSize = this.logSizes.reduce((a, b) => a + b, 0) / this.logSizes.length;
    }

    // Update errors per minute
    this.updateErrorsPerMinute();
  }

  /**
   * Get current metrics
   */
  getMetrics(): LogMetrics {
    return { ...this.metrics };
  }

  /**
   * Reset metrics
   */
  resetMetrics(): void {
    this.metrics = {
      totalLogs: 0,
      logsByLevel: {},
      logsByService: {},
      errorsPerMinute: 0,
      averageLogSize: 0,
      lastLogTime: null
    };
    this.errorTimestamps = [];
    this.logSizes = [];
  }

  /**
   * Get metrics summary
   */
  getMetricsSummary(): string {
    const metrics = this.getMetrics();
    const topServices = Object.entries(metrics.logsByService)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5);

    return `
Log Metrics Summary:
- Total Logs: ${metrics.totalLogs}
- Errors/min: ${metrics.errorsPerMinute.toFixed(2)}
- Avg Log Size: ${metrics.averageLogSize.toFixed(0)} bytes
- Last Log: ${metrics.lastLogTime?.toISOString() || 'Never'}
- By Level: ${JSON.stringify(metrics.logsByLevel)}
- Top Services: ${topServices.map(([service, count]) => `${service}(${count})`).join(', ')}
    `.trim();
  }

  private updateErrorsPerMinute(): void {
    const now = new Date();
    const windowMs = this.options.windowSizeMinutes * 60 * 1000;
    const recentErrors = this.errorTimestamps.filter(
      timestamp => now.getTime() - timestamp.getTime() <= windowMs
    );
    
    this.metrics.errorsPerMinute = recentErrors.length / this.options.windowSizeMinutes;
  }

  private cleanupOldTimestamps(): void {
    const now = new Date();
    const windowMs = this.options.windowSizeMinutes * 60 * 1000;
    
    this.errorTimestamps = this.errorTimestamps.filter(
      timestamp => now.getTime() - timestamp.getTime() <= windowMs
    );
  }
}

/**
 * Winston transport for collecting metrics
 */
export class MetricsTransport extends winston.Transport {
  private collector: LogMetricsCollector;

  constructor(options: LogMetricsOptions = {}) {
    super();
    this.collector = new LogMetricsCollector(options);
  }

  log(info: any, callback: () => void): void {
    setImmediate(() => {
      this.emit('logged', info);
    });

    this.collector.recordLog(info);
    callback();
  }

  getMetrics(): LogMetrics {
    return this.collector.getMetrics();
  }

  getMetricsSummary(): string {
    return this.collector.getMetricsSummary();
  }

  resetMetrics(): void {
    this.collector.resetMetrics();
  }
}