import { env } from '../env';

export interface FeatureFlag {
  name: string;
  enabled: boolean;
  description?: string;
  rolloutPercentage?: number;
  conditions?: FeatureFlagCondition[];
}

export interface FeatureFlagCondition {
  type: 'user' | 'environment' | 'date' | 'custom';
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'in';
  value: any;
}

export class FeatureFlagManager {
  private flags: Map<string, FeatureFlag> = new Map();

  constructor() {
    this.initializeDefaultFlags();
  }

  private initializeDefaultFlags(): void {
    // Initialize flags from environment variables
    this.setFlag('registration', {
      name: 'registration',
      enabled: env.FEATURE_REGISTRATION_ENABLED,
      description: 'Enable user registration',
    });

    this.setFlag('password_reset', {
      name: 'password_reset',
      enabled: env.FEATURE_PASSWORD_RESET_ENABLED,
      description: 'Enable password reset functionality',
    });

    this.setFlag('mfa', {
      name: 'mfa',
      enabled: env.FEATURE_MFA_ENABLED,
      description: 'Enable multi-factor authentication',
    });

    this.setFlag('oauth', {
      name: 'oauth',
      enabled: env.FEATURE_OAUTH_ENABLED,
      description: 'Enable OAuth authentication',
    });

    // Additional feature flags
    this.setFlag('email_verification', {
      name: 'email_verification',
      enabled: true,
      description: 'Require email verification for new accounts',
    });

    this.setFlag('session_management', {
      name: 'session_management',
      enabled: true,
      description: 'Enable advanced session management',
    });

    this.setFlag('audit_logging', {
      name: 'audit_logging',
      enabled: env.NODE_ENV === 'production',
      description: 'Enable comprehensive audit logging',
    });

    this.setFlag('rate_limiting', {
      name: 'rate_limiting',
      enabled: true,
      description: 'Enable API rate limiting',
    });

    this.setFlag('websocket_support', {
      name: 'websocket_support',
      enabled: false,
      description: 'Enable WebSocket connections',
    });

    this.setFlag('api_versioning', {
      name: 'api_versioning',
      enabled: true,
      description: 'Enable API versioning support',
    });
  }

  setFlag(name: string, flag: FeatureFlag): void {
    this.flags.set(name, flag);
  }

  getFlag(name: string): FeatureFlag | undefined {
    return this.flags.get(name);
  }

  isEnabled(name: string, context?: any): boolean {
    const flag = this.flags.get(name);
    if (!flag) {
      return false;
    }

    if (!flag.enabled) {
      return false;
    }

    // Check rollout percentage
    if (flag.rolloutPercentage !== undefined) {
      const hash = this.hashString(name + (context?.userId || ''));
      const percentage = (hash % 100) + 1;
      if (percentage > flag.rolloutPercentage) {
        return false;
      }
    }

    // Check conditions
    if (flag.conditions && flag.conditions.length > 0) {
      return this.evaluateConditions(flag.conditions, context);
    }

    return true;
  }

  private evaluateConditions(conditions: FeatureFlagCondition[], context: any): boolean {
    return conditions.every(condition => this.evaluateCondition(condition, context));
  }

  private evaluateCondition(condition: FeatureFlagCondition, context: any): boolean {
    let contextValue: any;

    switch (condition.type) {
      case 'user':
        contextValue = context?.user;
        break;
      case 'environment':
        contextValue = env.NODE_ENV;
        break;
      case 'date':
        contextValue = new Date();
        break;
      case 'custom':
        contextValue = context?.[condition.type];
        break;
      default:
        return false;
    }

    return this.evaluateOperator(contextValue, condition.operator, condition.value);
  }

  private evaluateOperator(contextValue: any, operator: string, expectedValue: any): boolean {
    switch (operator) {
      case 'equals':
        return contextValue === expectedValue;
      case 'contains':
        return Array.isArray(contextValue) 
          ? contextValue.includes(expectedValue)
          : String(contextValue).includes(String(expectedValue));
      case 'greater_than':
        return contextValue > expectedValue;
      case 'less_than':
        return contextValue < expectedValue;
      case 'in':
        return Array.isArray(expectedValue) && expectedValue.includes(contextValue);
      default:
        return false;
    }
  }

  private hashString(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }

  getAllFlags(): FeatureFlag[] {
    return Array.from(this.flags.values());
  }

  updateFlag(name: string, updates: Partial<FeatureFlag>): boolean {
    const flag = this.flags.get(name);
    if (!flag) {
      return false;
    }

    this.flags.set(name, { ...flag, ...updates });
    return true;
  }

  removeFlag(name: string): boolean {
    return this.flags.delete(name);
  }

  // Utility methods for common feature checks
  isRegistrationEnabled(): boolean {
    return this.isEnabled('registration');
  }

  isPasswordResetEnabled(): boolean {
    return this.isEnabled('password_reset');
  }

  isMfaEnabled(): boolean {
    return this.isEnabled('mfa');
  }

  isOAuthEnabled(): boolean {
    return this.isEnabled('oauth');
  }

  isEmailVerificationEnabled(): boolean {
    return this.isEnabled('email_verification');
  }

  isSessionManagementEnabled(): boolean {
    return this.isEnabled('session_management');
  }

  isAuditLoggingEnabled(): boolean {
    return this.isEnabled('audit_logging');
  }

  isRateLimitingEnabled(): boolean {
    return this.isEnabled('rate_limiting');
  }

  isWebSocketSupportEnabled(): boolean {
    return this.isEnabled('websocket_support');
  }

  isApiVersioningEnabled(): boolean {
    return this.isEnabled('api_versioning');
  }
}

// Export singleton instance
export const featureFlags = new FeatureFlagManager();