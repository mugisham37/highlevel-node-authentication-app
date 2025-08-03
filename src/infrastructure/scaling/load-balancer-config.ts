/**
 * Load Balancer Configuration
 * Provides configuration for various load balancers (Nginx, HAProxy, AWS ALB, etc.)
 */

import { logger } from '../logging/winston-logger';
import { statelessManager } from './stateless-manager';

export interface LoadBalancerConfig {
  type: 'nginx' | 'haproxy' | 'aws-alb' | 'gcp-lb' | 'azure-lb';
  healthCheck: HealthCheckConfig;
  sessionAffinity: SessionAffinityConfig;
  scaling: ScalingConfig;
  ssl: SSLConfig;
}

export interface HealthCheckConfig {
  path: string;
  interval: number;
  timeout: number;
  healthyThreshold: number;
  unhealthyThreshold: number;
  port?: number;
  protocol: 'http' | 'https' | 'tcp';
  expectedStatus?: number[];
  expectedBody?: string;
  headers?: Record<string, string>;
}

export interface SessionAffinityConfig {
  enabled: boolean;
  method: 'cookie' | 'ip' | 'header';
  cookieName?: string;
  headerName?: string;
  duration?: number;
}

export interface ScalingConfig {
  minInstances: number;
  maxInstances: number;
  targetCpuUtilization: number;
  targetMemoryUtilization: number;
  scaleUpCooldown: number;
  scaleDownCooldown: number;
}

export interface SSLConfig {
  enabled: boolean;
  certificatePath?: string;
  privateKeyPath?: string;
  cipherSuites?: string[];
  protocols?: string[];
  redirectHttp: boolean;
}

export class LoadBalancerConfigManager {
  private static instance: LoadBalancerConfigManager;
  private config: LoadBalancerConfig;

  private constructor() {
    this.config = this.generateDefaultConfig();
  }

  static getInstance(): LoadBalancerConfigManager {
    if (!LoadBalancerConfigManager.instance) {
      LoadBalancerConfigManager.instance = new LoadBalancerConfigManager();
    }
    return LoadBalancerConfigManager.instance;
  }

  /**
   * Generate default load balancer configuration
   */
  private generateDefaultConfig(): LoadBalancerConfig {
    return {
      type: (process.env.LOAD_BALANCER_TYPE as any) || 'nginx',
      healthCheck: {
        path: '/health',
        interval: 30000, // 30 seconds
        timeout: 5000, // 5 seconds
        healthyThreshold: 2,
        unhealthyThreshold: 3,
        port: parseInt(process.env.SERVER_PORT || '3000', 10),
        protocol: 'http',
        expectedStatus: [200],
        headers: {
          'User-Agent': 'LoadBalancer-HealthCheck/1.0',
        },
      },
      sessionAffinity: {
        enabled: process.env.ENABLE_STICKY_SESSIONS === 'true',
        method: 'cookie',
        cookieName: 'lb-session',
        duration: 3600, // 1 hour
      },
      scaling: {
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
        scaleUpCooldown: parseInt(process.env.SCALE_UP_COOLDOWN || '300', 10), // 5 minutes
        scaleDownCooldown: parseInt(
          process.env.SCALE_DOWN_COOLDOWN || '600',
          10
        ), // 10 minutes
      },
      ssl: {
        enabled: process.env.SSL_ENABLED === 'true',
        certificatePath: process.env.SSL_CERT_PATH,
        privateKeyPath: process.env.SSL_KEY_PATH,
        cipherSuites: [
          'ECDHE-RSA-AES128-GCM-SHA256',
          'ECDHE-RSA-AES256-GCM-SHA384',
          'ECDHE-RSA-AES128-SHA256',
          'ECDHE-RSA-AES256-SHA384',
        ],
        protocols: ['TLSv1.2', 'TLSv1.3'],
        redirectHttp: true,
      },
    };
  }

  /**
   * Generate Nginx configuration
   */
  generateNginxConfig(): string {
    const instances = this.getUpstreamInstances();
    const config = this.config;

    return `
# Nginx Load Balancer Configuration for Enterprise Auth Backend
upstream auth_backend {
    ${config.sessionAffinity.enabled ? `ip_hash;` : ''}
    ${instances
      .map(
        (instance) =>
          `server ${instance.hostname}:${instance.port} max_fails=${config.healthCheck.unhealthyThreshold} fail_timeout=${config.healthCheck.timeout / 1000}s;`
      )
      .join('\n    ')}
    
    keepalive 32;
}

# Health check configuration
upstream auth_health {
    ${instances
      .map((instance) => `server ${instance.hostname}:${instance.port};`)
      .join('\n    ')}
}

server {
    listen 80;
    server_name ${process.env.DOMAIN_NAME || 'auth.example.com'};
    
    ${
      config.ssl.enabled && config.ssl.redirectHttp
        ? `
    return 301 https://$server_name$request_uri;
    `
        : ''
    }
    
    ${
      !config.ssl.enabled
        ? `
    location / {
        proxy_pass http://auth_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
    `
        : ''
    }
}

${
  config.ssl.enabled
    ? `
server {
    listen 443 ssl http2;
    server_name ${process.env.DOMAIN_NAME || 'auth.example.com'};
    
    # SSL Configuration
    ssl_certificate ${config.ssl.certificatePath || '/etc/ssl/certs/auth.crt'};
    ssl_certificate_key ${config.ssl.privateKeyPath || '/etc/ssl/private/auth.key'};
    ssl_protocols ${config.ssl.protocols?.join(' ') || 'TLSv1.2 TLSv1.3'};
    ssl_ciphers ${config.ssl.cipherSuites?.join(':') || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384'};
    ssl_prefer_server_ciphers off;
    ssl_session_cache shared:SSL:10m;
    ssl_session_timeout 10m;
    
    # Security headers
    add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
    add_header X-Frame-Options DENY always;
    add_header X-Content-Type-Options nosniff always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header Referrer-Policy "strict-origin-when-cross-origin" always;
    
    location / {
        proxy_pass http://auth_backend;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
        
        # Timeouts
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
        
        # Buffer settings
        proxy_buffering on;
        proxy_buffer_size 128k;
        proxy_buffers 4 256k;
        proxy_busy_buffers_size 256k;
    }
}
`
    : ''
}

# Health check endpoint
server {
    listen 8080;
    server_name localhost;
    
    location /health {
        access_log off;
        proxy_pass http://auth_health/health;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        
        # Health check specific timeouts
        proxy_connect_timeout ${config.healthCheck.timeout / 1000}s;
        proxy_send_timeout ${config.healthCheck.timeout / 1000}s;
        proxy_read_timeout ${config.healthCheck.timeout / 1000}s;
    }
    
    location /nginx-status {
        stub_status on;
        access_log off;
        allow 127.0.0.1;
        allow 10.0.0.0/8;
        allow 172.16.0.0/12;
        allow 192.168.0.0/16;
        deny all;
    }
}
`.trim();
  }

  /**
   * Generate HAProxy configuration
   */
  generateHAProxyConfig(): string {
    const instances = this.getUpstreamInstances();
    const config = this.config;

    return `
# HAProxy Load Balancer Configuration for Enterprise Auth Backend
global
    daemon
    chroot /var/lib/haproxy
    stats socket /run/haproxy/admin.sock mode 660 level admin
    stats timeout 30s
    user haproxy
    group haproxy
    
    # SSL Configuration
    ${
      config.ssl.enabled
        ? `
    ssl-default-bind-ciphers ${config.ssl.cipherSuites?.join(':') || 'ECDHE-RSA-AES128-GCM-SHA256:ECDHE-RSA-AES256-GCM-SHA384'}
    ssl-default-bind-options ssl-min-ver TLSv1.2 no-sslv3
    `
        : ''
    }

defaults
    mode http
    timeout connect ${config.healthCheck.timeout}ms
    timeout client 30s
    timeout server 30s
    option httplog
    option dontlognull
    option http-server-close
    option forwardfor except 127.0.0.0/8
    option redispatch
    retries 3
    
    # Health check defaults
    option httpchk GET ${config.healthCheck.path}
    http-check expect status ${config.healthCheck.expectedStatus?.[0] || 200}

frontend auth_frontend
    bind *:80
    ${config.ssl.enabled ? `bind *:443 ssl crt /etc/ssl/certs/auth.pem` : ''}
    
    ${
      config.ssl.enabled && config.ssl.redirectHttp
        ? `
    redirect scheme https if !{ ssl_fc }
    `
        : ''
    }
    
    # Security headers
    http-response set-header Strict-Transport-Security "max-age=31536000; includeSubDomains"
    http-response set-header X-Frame-Options DENY
    http-response set-header X-Content-Type-Options nosniff
    http-response set-header X-XSS-Protection "1; mode=block"
    http-response set-header Referrer-Policy "strict-origin-when-cross-origin"
    
    # Session affinity
    ${
      config.sessionAffinity.enabled &&
      config.sessionAffinity.method === 'cookie'
        ? `
    cookie ${config.sessionAffinity.cookieName} insert indirect nocache
    `
        : ''
    }
    
    default_backend auth_backend

backend auth_backend
    balance ${config.sessionAffinity.enabled ? 'source' : 'roundrobin'}
    
    # Health check configuration
    option httpchk GET ${config.healthCheck.path}
    http-check expect status ${config.healthCheck.expectedStatus?.[0] || 200}
    
    ${instances
      .map(
        (instance, index) =>
          `server auth${index + 1} ${instance.hostname}:${instance.port} check inter ${config.healthCheck.interval}ms fall ${config.healthCheck.unhealthyThreshold} rise ${config.healthCheck.healthyThreshold}${config.sessionAffinity.enabled && config.sessionAffinity.method === 'cookie' ? ` cookie auth${index + 1}` : ''}`
      )
      .join('\n    ')}

# Statistics interface
frontend stats
    bind *:8404
    stats enable
    stats uri /stats
    stats refresh 30s
    stats admin if TRUE
    
    # Restrict access
    acl allowed_ips src 127.0.0.1 10.0.0.0/8 172.16.0.0/12 192.168.0.0/16
    http-request deny unless allowed_ips

# Health check endpoint
frontend health_check
    bind *:8080
    default_backend health_backend

backend health_backend
    option httpchk GET ${config.healthCheck.path}
    http-check expect status ${config.healthCheck.expectedStatus?.[0] || 200}
    
    ${instances
      .map(
        (instance, index) =>
          `server health${index + 1} ${instance.hostname}:${instance.port} check inter ${config.healthCheck.interval}ms`
      )
      .join('\n    ')}
`.trim();
  }

  /**
   * Generate AWS Application Load Balancer configuration (CloudFormation)
   */
  generateAWSALBConfig(): object {
    const config = this.config;

    return {
      AWSTemplateFormatVersion: '2010-09-09',
      Description: 'AWS Application Load Balancer for Enterprise Auth Backend',

      Parameters: {
        VpcId: {
          Type: 'AWS::EC2::VPC::Id',
          Description: 'VPC ID for the load balancer',
        },
        SubnetIds: {
          Type: 'List<AWS::EC2::Subnet::Id>',
          Description: 'Subnet IDs for the load balancer',
        },
        CertificateArn: {
          Type: 'String',
          Description: 'SSL Certificate ARN',
          Default: '',
        },
      },

      Resources: {
        LoadBalancer: {
          Type: 'AWS::ElasticLoadBalancingV2::LoadBalancer',
          Properties: {
            Name: 'enterprise-auth-alb',
            Scheme: 'internet-facing',
            Type: 'application',
            Subnets: { Ref: 'SubnetIds' },
            SecurityGroups: [{ Ref: 'LoadBalancerSecurityGroup' }],
            Tags: [
              { Key: 'Name', Value: 'enterprise-auth-alb' },
              {
                Key: 'Environment',
                Value: process.env.NODE_ENV || 'development',
              },
            ],
          },
        },

        LoadBalancerSecurityGroup: {
          Type: 'AWS::EC2::SecurityGroup',
          Properties: {
            GroupDescription:
              'Security group for Enterprise Auth Load Balancer',
            VpcId: { Ref: 'VpcId' },
            SecurityGroupIngress: [
              {
                IpProtocol: 'tcp',
                FromPort: 80,
                ToPort: 80,
                CidrIp: '0.0.0.0/0',
              },
              ...(config.ssl.enabled
                ? [
                    {
                      IpProtocol: 'tcp',
                      FromPort: 443,
                      ToPort: 443,
                      CidrIp: '0.0.0.0/0',
                    },
                  ]
                : []),
            ],
          },
        },

        TargetGroup: {
          Type: 'AWS::ElasticLoadBalancingV2::TargetGroup',
          Properties: {
            Name: 'enterprise-auth-targets',
            Port: parseInt(process.env.SERVER_PORT || '3000', 10),
            Protocol: 'HTTP',
            VpcId: { Ref: 'VpcId' },
            HealthCheckPath: config.healthCheck.path,
            HealthCheckProtocol: 'HTTP',
            HealthCheckIntervalSeconds: Math.floor(
              config.healthCheck.interval / 1000
            ),
            HealthCheckTimeoutSeconds: Math.floor(
              config.healthCheck.timeout / 1000
            ),
            HealthyThresholdCount: config.healthCheck.healthyThreshold,
            UnhealthyThresholdCount: config.healthCheck.unhealthyThreshold,
            TargetType: 'instance',
            Tags: [{ Key: 'Name', Value: 'enterprise-auth-targets' }],
          },
        },

        HTTPListener: {
          Type: 'AWS::ElasticLoadBalancingV2::Listener',
          Properties: {
            DefaultActions:
              config.ssl.enabled && config.ssl.redirectHttp
                ? [
                    {
                      Type: 'redirect',
                      RedirectConfig: {
                        Protocol: 'HTTPS',
                        Port: '443',
                        StatusCode: 'HTTP_301',
                      },
                    },
                  ]
                : [
                    {
                      Type: 'forward',
                      TargetGroupArn: { Ref: 'TargetGroup' },
                    },
                  ],
            LoadBalancerArn: { Ref: 'LoadBalancer' },
            Port: 80,
            Protocol: 'HTTP',
          },
        },

        ...(config.ssl.enabled
          ? {
              HTTPSListener: {
                Type: 'AWS::ElasticLoadBalancingV2::Listener',
                Properties: {
                  DefaultActions: [
                    {
                      Type: 'forward',
                      TargetGroupArn: { Ref: 'TargetGroup' },
                    },
                  ],
                  LoadBalancerArn: { Ref: 'LoadBalancer' },
                  Port: 443,
                  Protocol: 'HTTPS',
                  Certificates: [{ CertificateArn: { Ref: 'CertificateArn' } }],
                  SslPolicy: 'ELBSecurityPolicy-TLS-1-2-2017-01',
                },
              },
            }
          : {}),
      },

      Outputs: {
        LoadBalancerDNS: {
          Description: 'DNS name of the load balancer',
          Value: { 'Fn::GetAtt': ['LoadBalancer', 'DNSName'] },
        },
        TargetGroupArn: {
          Description: 'ARN of the target group',
          Value: { Ref: 'TargetGroup' },
        },
      },
    };
  }

  /**
   * Get upstream instances for load balancer configuration
   */
  private getUpstreamInstances(): Array<{ hostname: string; port: number }> {
    // In a real implementation, this would fetch from service discovery
    // For now, return current instance and any configured additional instances
    const instances = [
      {
        hostname: process.env.SERVER_HOST || 'localhost',
        port: parseInt(process.env.SERVER_PORT || '3000', 10),
      },
    ];

    // Add additional instances from environment
    const additionalInstances = process.env.ADDITIONAL_INSTANCES;
    if (additionalInstances) {
      const instanceList = additionalInstances.split(',');
      for (const instance of instanceList) {
        const [hostname, port] = instance.trim().split(':');
        if (hostname && port) {
          instances.push({
            hostname,
            port: parseInt(port, 10),
          });
        }
      }
    }

    return instances;
  }

  /**
   * Generate Docker Compose configuration with load balancer
   */
  generateDockerComposeConfig(): object {
    const config = this.config;

    return {
      version: '3.8',
      services: {
        nginx: {
          image: 'nginx:alpine',
          container_name: 'auth-load-balancer',
          ports: [
            '80:80',
            ...(config.ssl.enabled ? ['443:443'] : []),
            '8080:8080', // Health check port
          ],
          volumes: [
            './config/nginx/nginx.conf:/etc/nginx/nginx.conf:ro',
            ...(config.ssl.enabled ? ['./config/ssl:/etc/ssl:ro'] : []),
          ],
          depends_on: ['auth-app-1', 'auth-app-2'],
          networks: ['auth-network'],
          healthcheck: {
            test: ['CMD', 'curl', '-f', 'http://localhost:8080/health'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
          },
        },

        'auth-app-1': {
          build: {
            context: '.',
            dockerfile: 'Dockerfile',
          },
          container_name: 'auth-app-1',
          environment: {
            NODE_ENV: process.env.NODE_ENV || 'production',
            SERVER_PORT: '3000',
            INSTANCE_ID: 'auth-app-1',
          },
          networks: ['auth-network'],
          depends_on: ['postgres', 'redis'],
          healthcheck: {
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
          },
        },

        'auth-app-2': {
          build: {
            context: '.',
            dockerfile: 'Dockerfile',
          },
          container_name: 'auth-app-2',
          environment: {
            NODE_ENV: process.env.NODE_ENV || 'production',
            SERVER_PORT: '3000',
            INSTANCE_ID: 'auth-app-2',
          },
          networks: ['auth-network'],
          depends_on: ['postgres', 'redis'],
          healthcheck: {
            test: ['CMD', 'curl', '-f', 'http://localhost:3000/health'],
            interval: '30s',
            timeout: '10s',
            retries: 3,
          },
        },
      },

      networks: {
        'auth-network': {
          driver: 'bridge',
        },
      },
    };
  }

  /**
   * Get current configuration
   */
  getConfig(): LoadBalancerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<LoadBalancerConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Load balancer configuration updated', { updates });
  }

  /**
   * Validate configuration
   */
  validateConfig(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    // Validate health check configuration
    if (this.config.healthCheck.interval < 5000) {
      errors.push('Health check interval must be at least 5 seconds');
    }

    if (this.config.healthCheck.timeout >= this.config.healthCheck.interval) {
      errors.push('Health check timeout must be less than interval');
    }

    // Validate scaling configuration
    if (this.config.scaling.minInstances < 1) {
      errors.push('Minimum instances must be at least 1');
    }

    if (this.config.scaling.maxInstances < this.config.scaling.minInstances) {
      errors.push(
        'Maximum instances must be greater than or equal to minimum instances'
      );
    }

    // Validate SSL configuration
    if (this.config.ssl.enabled) {
      if (!this.config.ssl.certificatePath || !this.config.ssl.privateKeyPath) {
        errors.push(
          'SSL certificate and private key paths are required when SSL is enabled'
        );
      }
    }

    return {
      valid: errors.length === 0,
      errors,
    };
  }
}

// Export singleton instance
export const loadBalancerConfigManager =
  LoadBalancerConfigManager.getInstance();
