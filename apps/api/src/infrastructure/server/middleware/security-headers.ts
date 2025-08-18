/**
 * Enhanced Security Headers Middleware
 * Advanced security headers configuration with CSP and additional protections
 */

import { FastifyPluginAsync, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../logging/winston-logger';

export interface SecurityHeadersConfig {
  enableCSP?: boolean;
  enableHSTS?: boolean;
  enableXFrameOptions?: boolean;
  enableXContentTypeOptions?: boolean;
  enableReferrerPolicy?: boolean;
  enablePermissionsPolicy?: boolean;
  enableCOEP?: boolean;
  enableCOOP?: boolean;
  cspDirectives?: CSPDirectives;
  hstsMaxAge?: number;
  hstsIncludeSubDomains?: boolean;
  hstsPreload?: boolean;
  customHeaders?: Record<string, string>;
  reportUri?: string;
  reportOnly?: boolean;
}

export interface CSPDirectives {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  connectSrc?: string[];
  fontSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  frameSrc?: string[];
  childSrc?: string[];
  workerSrc?: string[];
  manifestSrc?: string[];
  prefetchSrc?: string[];
  formAction?: string[];
  frameAncestors?: string[];
  baseUri?: string[];
  upgradeInsecureRequests?: boolean;
  blockAllMixedContent?: boolean;
  requireTrustedTypesFor?: string[];
  trustedTypes?: string[];
}

export class SecurityHeadersMiddleware {
  private static readonly DEFAULT_CONFIG: Required<SecurityHeadersConfig> = {
    enableCSP: true,
    enableHSTS: true,
    enableXFrameOptions: true,
    enableXContentTypeOptions: true,
    enableReferrerPolicy: true,
    enablePermissionsPolicy: true,
    enableCOEP: false, // Can break some applications
    enableCOOP: true,
    cspDirectives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"], // Adjust based on needs
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:'],
      connectSrc: ["'self'"],
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
      childSrc: ["'self'"],
      workerSrc: ["'self'"],
      manifestSrc: ["'self'"],
      prefetchSrc: ["'self'"],
      formAction: ["'self'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
      upgradeInsecureRequests: true,
      blockAllMixedContent: true,
      requireTrustedTypesFor: [],
      trustedTypes: [],
    },
    hstsMaxAge: 31536000, // 1 year
    hstsIncludeSubDomains: true,
    hstsPreload: true,
    customHeaders: {},
    reportUri: '',
    reportOnly: false,
  };

  private readonly config: Required<SecurityHeadersConfig>;
  private readonly cspViolations: Array<{
    timestamp: Date;
    violation: any;
    userAgent: string;
    ip: string;
  }> = [];

  constructor(config: SecurityHeadersConfig = {}) {
    this.config = { ...SecurityHeadersMiddleware.DEFAULT_CONFIG, ...config };
  }

  /**
   * Create Fastify plugin for security headers
   */
  static createPlugin(config: SecurityHeadersConfig = {}): FastifyPluginAsync {
    const middleware = new SecurityHeadersMiddleware(config);

    return async (fastify) => {
      // Add security headers to all responses
      fastify.addHook('onSend', async (request, reply, payload) => {
        await middleware.addSecurityHeaders(request, reply);
        return payload;
      });

      // Add CSP violation reporting endpoint if report URI is configured
      if (middleware.config.reportUri) {
        fastify.post('/csp-report', async (request, reply) => {
          await middleware.handleCSPViolation(request, reply);
        });
      }
    };
  }

  /**
   * Add security headers to response
   */
  async addSecurityHeaders(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      // Content Security Policy
      if (this.config.enableCSP) {
        const cspHeader = this.buildCSPHeader(request);
        const headerName = this.config.reportOnly
          ? 'Content-Security-Policy-Report-Only'
          : 'Content-Security-Policy';
        reply.header(headerName, cspHeader);
      }

      // HTTP Strict Transport Security
      if (this.config.enableHSTS && this.isHTTPS(request)) {
        let hstsValue = `max-age=${this.config.hstsMaxAge}`;
        if (this.config.hstsIncludeSubDomains) {
          hstsValue += '; includeSubDomains';
        }
        if (this.config.hstsPreload) {
          hstsValue += '; preload';
        }
        reply.header('Strict-Transport-Security', hstsValue);
      }

      // X-Frame-Options
      if (this.config.enableXFrameOptions) {
        reply.header('X-Frame-Options', 'DENY');
      }

      // X-Content-Type-Options
      if (this.config.enableXContentTypeOptions) {
        reply.header('X-Content-Type-Options', 'nosniff');
      }

      // Referrer Policy
      if (this.config.enableReferrerPolicy) {
        reply.header('Referrer-Policy', 'strict-origin-when-cross-origin');
      }

      // Permissions Policy (formerly Feature Policy)
      if (this.config.enablePermissionsPolicy) {
        const permissionsPolicy = this.buildPermissionsPolicyHeader();
        reply.header('Permissions-Policy', permissionsPolicy);
      }

      // Cross-Origin Embedder Policy
      if (this.config.enableCOEP) {
        reply.header('Cross-Origin-Embedder-Policy', 'require-corp');
      }

      // Cross-Origin Opener Policy
      if (this.config.enableCOOP) {
        reply.header('Cross-Origin-Opener-Policy', 'same-origin');
      }

      // Additional security headers
      reply.header('X-DNS-Prefetch-Control', 'off');
      reply.header('X-Download-Options', 'noopen');
      reply.header('X-Permitted-Cross-Domain-Policies', 'none');
      reply.header('X-XSS-Protection', '0'); // Disabled as CSP is more effective

      // Custom headers
      for (const [name, value] of Object.entries(this.config.customHeaders)) {
        reply.header(name, value);
      }

      // Security-specific headers for API responses
      if (this.isAPIEndpoint(request)) {
        reply.header(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, proxy-revalidate'
        );
        reply.header('Pragma', 'no-cache');
        reply.header('Expires', '0');
        reply.header('Surrogate-Control', 'no-store');
      }

      // Authentication-specific headers
      if (this.isAuthEndpoint(request)) {
        reply.header('Clear-Site-Data', '"cache", "cookies", "storage"');
        reply.header(
          'Cache-Control',
          'no-store, no-cache, must-revalidate, max-age=0'
        );
      }
    } catch (error) {
      logger.error('Error adding security headers', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }

  /**
   * Build Content Security Policy header
   */
  private buildCSPHeader(request: FastifyRequest): string {
    const directives: string[] = [];
    const csp = this.config.cspDirectives;

    // Add each directive
    if (csp.defaultSrc) {
      directives.push(`default-src ${csp.defaultSrc.join(' ')}`);
    }

    if (csp.scriptSrc) {
      let scriptSrc = csp.scriptSrc.join(' ');

      // Add nonce for inline scripts if needed
      if (this.needsScriptNonce(request)) {
        const nonce = this.generateNonce();
        scriptSrc += ` 'nonce-${nonce}'`;
        // Store nonce for use in templates
        (request as any).cspNonce = nonce;
      }

      directives.push(`script-src ${scriptSrc}`);
    }

    if (csp.styleSrc) {
      directives.push(`style-src ${csp.styleSrc.join(' ')}`);
    }

    if (csp.imgSrc) {
      directives.push(`img-src ${csp.imgSrc.join(' ')}`);
    }

    if (csp.connectSrc) {
      // Add current origin to connect-src for API calls
      const connectSrc = [...csp.connectSrc];
      if (!connectSrc.includes("'self'")) {
        connectSrc.push("'self'");
      }
      directives.push(`connect-src ${connectSrc.join(' ')}`);
    }

    if (csp.fontSrc) {
      directives.push(`font-src ${csp.fontSrc.join(' ')}`);
    }

    if (csp.objectSrc) {
      directives.push(`object-src ${csp.objectSrc.join(' ')}`);
    }

    if (csp.mediaSrc) {
      directives.push(`media-src ${csp.mediaSrc.join(' ')}`);
    }

    if (csp.frameSrc) {
      directives.push(`frame-src ${csp.frameSrc.join(' ')}`);
    }

    if (csp.childSrc) {
      directives.push(`child-src ${csp.childSrc.join(' ')}`);
    }

    if (csp.workerSrc) {
      directives.push(`worker-src ${csp.workerSrc.join(' ')}`);
    }

    if (csp.manifestSrc) {
      directives.push(`manifest-src ${csp.manifestSrc.join(' ')}`);
    }

    if (csp.prefetchSrc) {
      directives.push(`prefetch-src ${csp.prefetchSrc.join(' ')}`);
    }

    if (csp.formAction) {
      directives.push(`form-action ${csp.formAction.join(' ')}`);
    }

    if (csp.frameAncestors) {
      directives.push(`frame-ancestors ${csp.frameAncestors.join(' ')}`);
    }

    if (csp.baseUri) {
      directives.push(`base-uri ${csp.baseUri.join(' ')}`);
    }

    // Boolean directives
    if (csp.upgradeInsecureRequests) {
      directives.push('upgrade-insecure-requests');
    }

    if (csp.blockAllMixedContent) {
      directives.push('block-all-mixed-content');
    }

    if (csp.requireTrustedTypesFor && csp.requireTrustedTypesFor.length > 0) {
      directives.push(
        `require-trusted-types-for ${csp.requireTrustedTypesFor.join(' ')}`
      );
    }

    if (csp.trustedTypes && csp.trustedTypes.length > 0) {
      directives.push(`trusted-types ${csp.trustedTypes.join(' ')}`);
    }

    // Add report-uri if configured
    if (this.config.reportUri) {
      directives.push(`report-uri ${this.config.reportUri}`);
    }

    return directives.join('; ');
  }

  /**
   * Build Permissions Policy header
   */
  private buildPermissionsPolicyHeader(): string {
    const policies = [
      'accelerometer=()',
      'ambient-light-sensor=()',
      'autoplay=()',
      'battery=()',
      'camera=()',
      'cross-origin-isolated=()',
      'display-capture=()',
      'document-domain=()',
      'encrypted-media=()',
      'execution-while-not-rendered=()',
      'execution-while-out-of-viewport=()',
      'fullscreen=()',
      'geolocation=()',
      'gyroscope=()',
      'keyboard-map=()',
      'magnetometer=()',
      'microphone=()',
      'midi=()',
      'navigation-override=()',
      'payment=()',
      'picture-in-picture=()',
      'publickey-credentials-get=()',
      'screen-wake-lock=()',
      'sync-xhr=()',
      'usb=()',
      'web-share=()',
      'xr-spatial-tracking=()',
    ];

    return policies.join(', ');
  }

  /**
   * Handle CSP violation reports
   */
  async handleCSPViolation(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    try {
      const violation = request.body as any;

      // Store violation for analysis
      this.cspViolations.push({
        timestamp: new Date(),
        violation,
        userAgent: request.headers['user-agent'] || 'unknown',
        ip: request.ip || 'unknown',
      });

      // Keep only recent violations (last 1000)
      if (this.cspViolations.length > 1000) {
        this.cspViolations.shift();
      }

      // Log violation
      logger.warn('CSP violation reported', {
        correlationId: request.correlationId,
        violation: {
          documentUri: violation['csp-report']?.['document-uri'],
          violatedDirective: violation['csp-report']?.['violated-directive'],
          blockedUri: violation['csp-report']?.['blocked-uri'],
          lineNumber: violation['csp-report']?.['line-number'],
          columnNumber: violation['csp-report']?.['column-number'],
          sourceFile: violation['csp-report']?.['source-file'],
        },
        userAgent: request.headers['user-agent'],
        ip: request.ip,
      });

      // Check for potential attacks
      if (this.isPotentialAttack(violation)) {
        logger.error('Potential CSP attack detected', {
          correlationId: request.correlationId,
          violation,
          ip: request.ip,
          userAgent: request.headers['user-agent'],
        });
      }

      reply.status(204).send();
    } catch (error) {
      logger.error('Error handling CSP violation', {
        correlationId: request.correlationId,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.status(400).send({
        code: 'CSP_REPORT_ERROR',
        error: 'Bad Request',
        message: 'Invalid CSP violation report',
        statusCode: 400,
      });
    }
  }

  /**
   * Check if request needs script nonce
   */
  private needsScriptNonce(request: FastifyRequest): boolean {
    // Add nonce for documentation pages or admin interfaces
    const path = request.url.toLowerCase();
    return path.includes('/docs') || path.includes('/admin');
  }

  /**
   * Generate cryptographically secure nonce
   */
  private generateNonce(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('base64');
  }

  /**
   * Check if request is HTTPS
   */
  private isHTTPS(request: FastifyRequest): boolean {
    return (
      request.protocol === 'https' ||
      request.headers['x-forwarded-proto'] === 'https' ||
      env.NODE_ENV === 'production'
    ); // Assume HTTPS in production
  }

  /**
   * Check if request is to API endpoint
   */
  private isAPIEndpoint(request: FastifyRequest): boolean {
    const path = request.url.toLowerCase();
    return (
      path.startsWith('/api/') ||
      path.startsWith('/auth/') ||
      path.includes('/users/') ||
      path.includes('/admin/')
    );
  }

  /**
   * Check if request is to authentication endpoint
   */
  private isAuthEndpoint(request: FastifyRequest): boolean {
    const path = request.url.toLowerCase();
    return (
      path.includes('/auth/login') ||
      path.includes('/auth/logout') ||
      path.includes('/auth/register')
    );
  }

  /**
   * Check if CSP violation indicates potential attack
   */
  private isPotentialAttack(violation: any): boolean {
    const report = violation['csp-report'];
    if (!report) return false;

    const blockedUri = report['blocked-uri'] || '';
    const violatedDirective = report['violated-directive'] || '';

    // Check for common attack patterns
    const suspiciousPatterns = [
      'javascript:',
      'data:text/html',
      'vbscript:',
      'eval',
      'inline',
    ];

    return suspiciousPatterns.some(
      (pattern) =>
        blockedUri.includes(pattern) || violatedDirective.includes(pattern)
    );
  }

  /**
   * Get CSP violation statistics
   */
  getCSPStats(): {
    totalViolations: number;
    recentViolations: number;
    topViolatedDirectives: Array<{ directive: string; count: number }>;
    topBlockedUris: Array<{ uri: string; count: number }>;
    potentialAttacks: number;
  } {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const recentViolations = this.cspViolations.filter(
      (v) => v.timestamp > oneDayAgo
    );

    // Count violated directives
    const directiveCounts = new Map<string, number>();
    const uriCounts = new Map<string, number>();
    let potentialAttacks = 0;

    this.cspViolations.forEach(({ violation }) => {
      const report = violation['csp-report'];
      if (report) {
        const directive = report['violated-directive'] || 'unknown';
        const uri = report['blocked-uri'] || 'unknown';

        directiveCounts.set(
          directive,
          (directiveCounts.get(directive) || 0) + 1
        );
        uriCounts.set(uri, (uriCounts.get(uri) || 0) + 1);

        if (this.isPotentialAttack(violation)) {
          potentialAttacks++;
        }
      }
    });

    const topViolatedDirectives = Array.from(directiveCounts.entries())
      .map(([directive, count]) => ({ directive, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    const topBlockedUris = Array.from(uriCounts.entries())
      .map(([uri, count]) => ({ uri, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    return {
      totalViolations: this.cspViolations.length,
      recentViolations: recentViolations.length,
      topViolatedDirectives,
      topBlockedUris,
      potentialAttacks,
    };
  }
}

// Export pre-configured security headers
export const standardSecurityHeaders = SecurityHeadersMiddleware.createPlugin({
  enableCSP: true,
  enableHSTS: true,
  reportOnly: false,
});

export const strictSecurityHeaders = SecurityHeadersMiddleware.createPlugin({
  enableCSP: true,
  enableHSTS: true,
  enableCOEP: true,
  enableCOOP: true,
  cspDirectives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'", 'data:'],
    connectSrc: ["'self'"],
    fontSrc: ["'self'"],
    objectSrc: ["'none'"],
    mediaSrc: ["'none'"],
    frameSrc: ["'none'"],
    childSrc: ["'none'"],
    workerSrc: ["'self'"],
    manifestSrc: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"],
    baseUri: ["'self'"],
    upgradeInsecureRequests: true,
    blockAllMixedContent: true,
  },
  reportOnly: false,
});

export const developmentSecurityHeaders =
  SecurityHeadersMiddleware.createPlugin({
    enableCSP: true,
    enableHSTS: false, // Often not needed in development
    cspDirectives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'"], // More permissive for development
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:', 'https:', 'http:'],
      connectSrc: ["'self'", 'ws:', 'wss:'], // Allow WebSocket for hot reload
      fontSrc: ["'self'", 'https:', 'data:'],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      baseUri: ["'self'"],
    },
    reportOnly: true, // Use report-only mode in development
  });
