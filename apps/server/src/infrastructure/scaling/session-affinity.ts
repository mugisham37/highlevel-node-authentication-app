/**
 * Session Affinity Manager
 * Handles session affinity (sticky sessions) for OAuth flows and other stateful operations
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../logging/winston-logger';
import { statelessManager } from './stateless-manager';

export interface SessionAffinityConfig {
  enabled: boolean;
  method: 'cookie' | 'header' | 'ip' | 'jwt';
  cookieName: string;
  headerName: string;
  duration: number;
  secure: boolean;
  httpOnly: boolean;
  sameSite: 'strict' | 'lax' | 'none';
  domain: string | undefined;
  path: string;
}

export interface AffinityRule {
  pattern: string | RegExp;
  method: 'cookie' | 'header' | 'ip' | 'jwt';
  duration?: number;
  required: boolean;
}

export class SessionAffinityManager {
  private static instance: SessionAffinityManager;
  private config: SessionAffinityConfig;
  private rules: Map<string, AffinityRule> = new Map();
  private instanceMapping: Map<string, string> = new Map();

  private constructor() {
    this.config = this.loadConfig();
    this.setupDefaultRules();
  }

  static getInstance(): SessionAffinityManager {
    if (!SessionAffinityManager.instance) {
      SessionAffinityManager.instance = new SessionAffinityManager();
    }
    return SessionAffinityManager.instance;
  }

  /**
   * Load session affinity configuration
   */
  private loadConfig(): SessionAffinityConfig {
    return {
      enabled: process.env['ENABLE_SESSION_AFFINITY'] === 'true',
      method: (process.env['AFFINITY_METHOD'] as any) || 'cookie',
      cookieName: process.env['AFFINITY_COOKIE_NAME'] || 'lb-session',
      headerName: process.env['AFFINITY_HEADER_NAME'] || 'X-Session-Affinity',
      duration: parseInt(process.env['AFFINITY_DURATION'] || '3600', 10), // 1 hour
      secure: process.env.NODE_ENV === 'production',
      httpOnly: true,
      sameSite: 'lax',
      domain: process.env['COOKIE_DOMAIN'],
      path: '/',
    };
  }

  /**
   * Setup default affinity rules for OAuth flows
   */
  private setupDefaultRules(): void {
    // OAuth authorization flows require session affinity
    this.addRule('oauth-auth', {
      pattern: /^\/auth\/oauth\/[^\/]+\/(authorize|callback)/,
      method: 'cookie',
      duration: 600, // 10 minutes for OAuth flow
      required: true,
    });

    // OAuth token exchange
    this.addRule('oauth-token', {
      pattern: /^\/auth\/oauth\/[^\/]+\/token/,
      method: 'cookie',
      duration: 300, // 5 minutes
      required: true,
    });

    // WebAuthn flows (require session affinity for challenge/response)
    this.addRule('webauthn', {
      pattern: /^\/auth\/webauthn\/(register|authenticate)/,
      method: 'cookie',
      duration: 300, // 5 minutes
      required: true,
    });

    // MFA flows
    this.addRule('mfa', {
      pattern: /^\/auth\/mfa\/(setup|verify|challenge)/,
      method: 'cookie',
      duration: 600, // 10 minutes
      required: true,
    });

    // Password reset flows
    this.addRule('password-reset', {
      pattern: /^\/auth\/password\/(reset|confirm)/,
      method: 'cookie',
      duration: 1800, // 30 minutes
      required: false,
    });

    logger.info('Session affinity rules configured', {
      totalRules: this.rules.size,
      enabled: this.config.enabled,
    });
  }

  /**
   * Add affinity rule
   */
  addRule(name: string, rule: AffinityRule): void {
    this.rules.set(name, rule);
    logger.debug('Session affinity rule added', { name, rule });
  }

  /**
   * Remove affinity rule
   */
  removeRule(name: string): void {
    this.rules.delete(name);
    logger.debug('Session affinity rule removed', { name });
  }

  /**
   * Check if request requires session affinity
   */
  requiresAffinity(request: FastifyRequest): {
    required: boolean;
    rule?: AffinityRule;
    ruleName?: string;
  } {
    if (!this.config.enabled) {
      return { required: false };
    }

    const url = request.url;
    const method = request.method;

    for (const [ruleName, rule] of this.rules.entries()) {
      let matches = false;

      if (typeof rule.pattern === 'string') {
        matches = url.includes(rule.pattern);
      } else if (rule.pattern instanceof RegExp) {
        matches = rule.pattern.test(url);
      }

      if (matches) {
        logger.debug('Session affinity rule matched', {
          ruleName,
          url,
          method,
          required: rule.required,
        });

        return {
          required: rule.required,
          rule,
          ruleName,
        };
      }
    }

    return { required: false };
  }

  /**
   * Get session affinity identifier from request
   */
  getAffinityId(
    request: FastifyRequest,
    method?: 'cookie' | 'header' | 'ip' | 'jwt'
  ): string | null {
    const affinityMethod = method || this.config.method;

    switch (affinityMethod) {
      case 'cookie':
        return this.getAffinityFromCookie(request);

      case 'header':
        return this.getAffinityFromHeader(request);

      case 'ip':
        return this.getAffinityFromIP(request);

      case 'jwt':
        return this.getAffinityFromJWT(request);

      default:
        logger.warn('Unknown affinity method', { method: affinityMethod });
        return null;
    }
  }

  /**
   * Get affinity ID from cookie
   */
  private getAffinityFromCookie(request: FastifyRequest): string | null {
    const cookies = request.cookies;
    return cookies?.[this.config.cookieName] || null;
  }

  /**
   * Get affinity ID from header
   */
  private getAffinityFromHeader(request: FastifyRequest): string | null {
    return (
      (request.headers[this.config.headerName.toLowerCase()] as string) || null
    );
  }

  /**
   * Get affinity ID from IP address
   */
  private getAffinityFromIP(request: FastifyRequest): string | null {
    const ip = request.ip;
    if (!ip) return null;

    // Create a consistent hash from IP address
    const crypto = require('crypto');
    return crypto.createHash('md5').update(ip).digest('hex').substring(0, 8);
  }

  /**
   * Get affinity ID from JWT token
   */
  private getAffinityFromJWT(request: FastifyRequest): string | null {
    const authorization = request.headers.authorization;
    if (!authorization || !authorization.startsWith('Bearer ')) {
      return null;
    }

    try {
      const token = authorization.substring(7);
      const jwt = require('jsonwebtoken');
      const decoded = jwt.decode(token) as any;

      if (decoded && decoded.sub) {
        // Use user ID as affinity identifier
        const crypto = require('crypto');
        return crypto
          .createHash('md5')
          .update(decoded.sub)
          .digest('hex')
          .substring(0, 8);
      }
    } catch (error) {
      logger.debug('Failed to decode JWT for affinity', {
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    return null;
  }

  /**
   * Set session affinity on response
   */
  setAffinity(
    reply: FastifyReply,
    affinityId: string,
    method?: 'cookie' | 'header' | 'ip' | 'jwt',
    duration?: number
  ): void {
    if (!this.config.enabled) {
      return;
    }

    const affinityMethod = method || this.config.method;
    const affinityDuration = duration || this.config.duration;

    switch (affinityMethod) {
      case 'cookie':
        this.setAffinityCookie(reply, affinityId, affinityDuration);
        break;

      case 'header':
        this.setAffinityHeader(reply, affinityId);
        break;

      case 'ip':
      case 'jwt':
        // IP and JWT affinity don't require setting response values
        break;

      default:
        logger.warn('Unknown affinity method for setting', {
          method: affinityMethod,
        });
    }

    // Store instance mapping
    const instanceInfo = statelessManager.getInstanceInfo();
    this.instanceMapping.set(affinityId, instanceInfo.id);

    logger.debug('Session affinity set', {
      affinityId,
      method: affinityMethod,
      duration: affinityDuration,
      instanceId: instanceInfo.id,
    });
  }

  /**
   * Set affinity cookie
   */
  private setAffinityCookie(
    reply: FastifyReply,
    affinityId: string,
    duration: number
  ): void {
    const cookieOptions: {
      maxAge?: number;
      secure?: boolean;
      httpOnly?: boolean;
      sameSite?: 'strict' | 'lax' | 'none';
      domain?: string;
      path?: string;
    } = {
      maxAge: duration * 1000, // Convert to milliseconds
      secure: this.config.secure,
      httpOnly: this.config.httpOnly,
      sameSite: this.config.sameSite,
      path: this.config.path,
    };

    if (this.config.domain) {
      cookieOptions.domain = this.config.domain;
    }

    reply.setCookie(this.config.cookieName, affinityId, cookieOptions);
  }

  /**
   * Set affinity header
   */
  private setAffinityHeader(reply: FastifyReply, affinityId: string): void {
    reply.header(this.config.headerName, affinityId);
  }

  /**
   * Generate new affinity ID
   */
  generateAffinityId(): string {
    const crypto = require('crypto');
    return crypto.randomBytes(16).toString('hex');
  }

  /**
   * Handle session affinity for request
   */
  async handleAffinity(
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> {
    const affinityCheck = this.requiresAffinity(request);

    if (!affinityCheck.required) {
      return;
    }

    const { rule, ruleName } = affinityCheck;
    if (!rule) return;

    // Get existing affinity ID
    let affinityId = this.getAffinityId(request, rule.method);

    // Generate new affinity ID if none exists
    if (!affinityId) {
      affinityId = this.generateAffinityId();
      logger.debug('Generated new affinity ID', {
        affinityId,
        ruleName,
        url: request.url,
      });
    }

    // Set affinity on response
    this.setAffinity(reply, affinityId, rule.method, rule.duration);

    // Add affinity information to request context
    (request as any).sessionAffinity = {
      id: affinityId,
      rule: ruleName,
      method: rule.method,
      required: rule.required,
    };
  }

  /**
   * Clear session affinity
   */
  clearAffinity(reply: FastifyReply, method?: 'cookie' | 'header'): void {
    const affinityMethod = method || this.config.method;

    switch (affinityMethod) {
      case 'cookie':
        const clearOptions: { domain?: string; path?: string } = {
          path: this.config.path,
        };
        if (this.config.domain) {
          clearOptions.domain = this.config.domain;
        }
        reply.clearCookie(this.config.cookieName, clearOptions);
        break;

      case 'header':
        reply.removeHeader(this.config.headerName);
        break;
    }

    logger.debug('Session affinity cleared', { method: affinityMethod });
  }

  /**
   * Get instance for affinity ID
   */
  getInstanceForAffinity(affinityId: string): string | null {
    return this.instanceMapping.get(affinityId) || null;
  }

  /**
   * Check if current instance should handle request
   */
  shouldHandleRequest(affinityId: string): boolean {
    const instanceInfo = statelessManager.getInstanceInfo();
    const targetInstance = this.getInstanceForAffinity(affinityId);

    if (!targetInstance) {
      // No specific instance assigned, can handle
      return true;
    }

    return targetInstance === instanceInfo.id;
  }

  /**
   * Get affinity statistics
   */
  getAffinityStats(): {
    enabled: boolean;
    totalMappings: number;
    currentInstance: string;
    rules: Array<{
      name: string;
      pattern: string;
      method: string;
      required: boolean;
    }>;
  } {
    const instanceInfo = statelessManager.getInstanceInfo();

    return {
      enabled: this.config.enabled,
      totalMappings: this.instanceMapping.size,
      currentInstance: instanceInfo.id,
      rules: Array.from(this.rules.entries()).map(([name, rule]) => ({
        name,
        pattern: rule.pattern.toString(),
        method: rule.method,
        required: rule.required,
      })),
    };
  }

  /**
   * Cleanup expired affinity mappings
   */
  cleanupExpiredMappings(): void {
    // In a real implementation, this would check expiration times
    // For now, we'll implement a simple cleanup based on mapping age
    const maxMappings = 10000;

    if (this.instanceMapping.size > maxMappings) {
      const entries = Array.from(this.instanceMapping.entries());
      const toDelete = entries.slice(0, entries.length - maxMappings);

      for (const [affinityId] of toDelete) {
        this.instanceMapping.delete(affinityId);
      }

      logger.info('Cleaned up expired affinity mappings', {
        deleted: toDelete.length,
        remaining: this.instanceMapping.size,
      });
    }
  }

  /**
   * Update configuration
   */
  updateConfig(updates: Partial<SessionAffinityConfig>): void {
    this.config = { ...this.config, ...updates };
    logger.info('Session affinity configuration updated', { updates });
  }

  /**
   * Get current configuration
   */
  getConfig(): SessionAffinityConfig {
    return { ...this.config };
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval(intervalMs: number = 300000): NodeJS.Timeout {
    return setInterval(() => {
      this.cleanupExpiredMappings();
    }, intervalMs);
  }
}

// Export singleton instance
export const sessionAffinityManager = SessionAffinityManager.getInstance();
