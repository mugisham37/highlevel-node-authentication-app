import { env } from '../env';

export interface MonitoringConfig {
  metrics: {
    enabled: boolean;
    port: number;
    path: string;
    collectDefaultMetrics: boolean;
    prefix: string;
  };
  healthCheck: {
    enabled: boolean;
    path: string;
    timeout: number;
    interval: number;
  };
  tracing: {
    enabled: boolean;
    serviceName: string;
    serviceVersion: string;
    endpoint?: string;
    sampleRate: number;
  };
  logging: {
    level: string;
    format: string;
    transports: string[];
    filePath?: string;
    maxFiles?: number;
    maxSize?: string;
  };
  alerts: {
    enabled: boolean;
    webhookUrl?: string;
    channels: string[];
    thresholds: {
      errorRate: number;
      responseTime: number;
      memoryUsage: number;
      cpuUsage: number;
    };
  };
}

export interface PrometheusConfig {
  enabled: boolean;
  port: number;
  path: string;
  collectDefaultMetrics: boolean;
  prefix: string;
  buckets: number[];
  percentiles: number[];
}

export interface GrafanaConfig {
  enabled: boolean;
  dashboardsPath: string;
  datasources: {
    prometheus: {
      url: string;
      access: string;
    };
    loki?: {
      url: string;
      access: string;
    };
  };
}

export class MonitoringConfigManager {
  private static instance: MonitoringConfigManager;

  private constructor() {}

  static getInstance(): MonitoringConfigManager {
    if (!MonitoringConfigManager.instance) {
      MonitoringConfigManager.instance = new MonitoringConfigManager();
    }
    return MonitoringConfigManager.instance;
  }

  getMonitoringConfig(): MonitoringConfig {
    return {
      metrics: {
        enabled: env.METRICS_ENABLED,
        port: env.METRICS_PORT,
        path: '/metrics',
        collectDefaultMetrics: true,
        prefix: 'app_',
      },
      healthCheck: {
        enabled: env.HEALTH_CHECK_ENABLED,
        path: '/health',
        timeout: 5000,
        interval: 30000,
      },
      tracing: {
        enabled: env.NODE_ENV === 'production',
        serviceName: 'authentication-api',
        serviceVersion: process.env.APP_VERSION || '1.0.0',
        endpoint: process.env.JAEGER_ENDPOINT,
        sampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
      },
      logging: {
        level: env.LOG_LEVEL,
        format: env.LOG_FORMAT,
        transports: ['console', 'file'],
        filePath: env.LOG_FILE_PATH,
        maxFiles: 5,
        maxSize: '10m',
      },
      alerts: {
        enabled: env.NODE_ENV === 'production',
        webhookUrl: process.env.ALERT_WEBHOOK_URL,
        channels: ['email', 'slack'],
        thresholds: {
          errorRate: 0.05, // 5%
          responseTime: 1000, // 1 second
          memoryUsage: 0.85, // 85%
          cpuUsage: 0.80, // 80%
        },
      },
    };
  }

  getPrometheusConfig(): PrometheusConfig {
    return {
      enabled: env.METRICS_ENABLED,
      port: env.METRICS_PORT,
      path: '/metrics',
      collectDefaultMetrics: true,
      prefix: 'auth_api_',
      buckets: [0.1, 0.3, 0.5, 0.7, 1, 3, 5, 7, 10],
      percentiles: [0.5, 0.9, 0.95, 0.99],
    };
  }

  getGrafanaConfig(): GrafanaConfig {
    return {
      enabled: env.NODE_ENV === 'production',
      dashboardsPath: './monitoring/dashboards',
      datasources: {
        prometheus: {
          url: process.env.PROMETHEUS_URL || 'http://localhost:9090',
          access: 'proxy',
        },
        loki: process.env.LOKI_URL ? {
          url: process.env.LOKI_URL,
          access: 'proxy',
        } : undefined,
      },
    };
  }

  getHealthCheckConfig() {
    return {
      enabled: env.HEALTH_CHECK_ENABLED,
      path: '/health',
      timeout: 5000,
      checks: {
        database: true,
        redis: true,
        external_apis: false,
      },
    };
  }

  getMetricsConfig() {
    return {
      enabled: env.METRICS_ENABLED,
      port: env.METRICS_PORT,
      path: '/metrics',
      collectDefaultMetrics: true,
      customMetrics: {
        httpRequests: true,
        httpDuration: true,
        activeConnections: true,
        authenticationAttempts: true,
        cacheHitRate: true,
        databaseConnections: true,
      },
    };
  }

  getTracingConfig() {
    return {
      enabled: env.NODE_ENV === 'production',
      serviceName: 'authentication-api',
      serviceVersion: process.env.APP_VERSION || '1.0.0',
      jaeger: {
        endpoint: process.env.JAEGER_ENDPOINT,
        agentHost: process.env.JAEGER_AGENT_HOST || 'localhost',
        agentPort: parseInt(process.env.JAEGER_AGENT_PORT || '6832'),
      },
      sampleRate: env.NODE_ENV === 'production' ? 0.1 : 1.0,
      tags: {
        environment: env.NODE_ENV,
        version: process.env.APP_VERSION || '1.0.0',
      },
    };
  }

  getAlertingConfig() {
    return {
      enabled: env.NODE_ENV === 'production',
      providers: {
        webhook: {
          enabled: !!process.env.ALERT_WEBHOOK_URL,
          url: process.env.ALERT_WEBHOOK_URL,
        },
        email: {
          enabled: !!process.env.ALERT_EMAIL_TO,
          to: process.env.ALERT_EMAIL_TO?.split(',') || [],
          from: process.env.ALERT_EMAIL_FROM,
        },
        slack: {
          enabled: !!process.env.SLACK_WEBHOOK_URL,
          webhookUrl: process.env.SLACK_WEBHOOK_URL,
          channel: process.env.SLACK_CHANNEL || '#alerts',
        },
      },
      rules: {
        highErrorRate: {
          threshold: 0.05,
          duration: '5m',
          severity: 'critical',
        },
        highResponseTime: {
          threshold: 1000,
          duration: '2m',
          severity: 'warning',
        },
        highMemoryUsage: {
          threshold: 0.85,
          duration: '5m',
          severity: 'warning',
        },
        databaseConnectionFailure: {
          threshold: 1,
          duration: '1m',
          severity: 'critical',
        },
      },
    };
  }

  // Environment-specific configurations
  getDevelopmentConfig(): Partial<MonitoringConfig> {
    return {
      metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics',
        collectDefaultMetrics: true,
        prefix: 'dev_',
      },
      tracing: {
        enabled: true,
        serviceName: 'auth-api-dev',
        serviceVersion: 'dev',
        sampleRate: 1.0,
      },
      alerts: {
        enabled: false,
        webhookUrl: undefined,
        channels: [],
        thresholds: {
          errorRate: 0.1,
          responseTime: 2000,
          memoryUsage: 0.9,
          cpuUsage: 0.9,
        },
      },
    };
  }

  getProductionConfig(): Partial<MonitoringConfig> {
    return {
      metrics: {
        enabled: true,
        port: 9090,
        path: '/metrics',
        collectDefaultMetrics: true,
        prefix: 'prod_',
      },
      tracing: {
        enabled: true,
        serviceName: 'auth-api-prod',
        serviceVersion: process.env.APP_VERSION || '1.0.0',
        sampleRate: 0.1,
      },
      alerts: {
        enabled: true,
        webhookUrl: process.env.ALERT_WEBHOOK_URL,
        channels: ['email', 'slack', 'webhook'],
        thresholds: {
          errorRate: 0.01,
          responseTime: 500,
          memoryUsage: 0.8,
          cpuUsage: 0.75,
        },
      },
    };
  }

  getConfigForEnvironment(): MonitoringConfig {
    const baseConfig = this.getMonitoringConfig();
    
    switch (env.NODE_ENV) {
      case 'development':
        return { ...baseConfig, ...this.getDevelopmentConfig() };
      case 'production':
        return { ...baseConfig, ...this.getProductionConfig() };
      default:
        return baseConfig;
    }
  }
}

// Export singleton instance
export const monitoringConfig = MonitoringConfigManager.getInstance();