import { z } from 'zod';
import { env, envSchema } from '../env';

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationWarning[];
}

export interface ValidationError {
  field: string;
  message: string;
  code: string;
  severity: 'error' | 'warning';
}

export interface ValidationWarning {
  field: string;
  message: string;
  recommendation?: string;
}

export class ConfigValidator {
  private static instance: ConfigValidator;

  private constructor() {}

  static getInstance(): ConfigValidator {
    if (!ConfigValidator.instance) {
      ConfigValidator.instance = new ConfigValidator();
    }
    return ConfigValidator.instance;
  }

  validateEnvironment(): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationWarning[] = [];

    try {
      // Validate using Zod schema
      envSchema.parse(process.env);
    } catch (error) {
      if (error instanceof z.ZodError) {
        error.errors.forEach(err => {
          errors.push({
            field: err.path.join('.'),
            message: err.message,
            code: err.code,
            severity: 'error',
          });
        });
      }
    }

    // Additional custom validations
    this.validateSecuritySettings(warnings);
    this.validateDatabaseSettings(warnings);
    this.validateProductionSettings(warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
    };
  }

  private validateSecuritySettings(warnings: ValidationWarning[]): void {
    // JWT Secret strength
    if (env.JWT_SECRET && env.JWT_SECRET.length < 64) {
      warnings.push({
        field: 'JWT_SECRET',
        message: 'JWT secret is shorter than recommended 64 characters',
        recommendation: 'Use a longer, more secure secret for production',
      });
    }

    // Bcrypt rounds
    if (env.BCRYPT_ROUNDS < 12) {
      warnings.push({
        field: 'BCRYPT_ROUNDS',
        message: 'Bcrypt rounds below recommended minimum of 12',
        recommendation: 'Increase to at least 12 for better security',
      });
    }

    // CORS settings in production
    if (env.NODE_ENV === 'production' && env.CORS_ORIGIN === '*') {
      warnings.push({
        field: 'CORS_ORIGIN',
        message: 'CORS origin set to wildcard in production',
        recommendation: 'Specify exact origins for production security',
      });
    }
  }

  private validateDatabaseSettings(warnings: ValidationWarning[]): void {
    // SSL in production
    if (env.NODE_ENV === 'production' && !env.DATABASE_SSL) {
      warnings.push({
        field: 'DATABASE_SSL',
        message: 'Database SSL disabled in production',
        recommendation: 'Enable SSL for production database connections',
      });
    }

    // Connection pool settings
    if (env.DATABASE_POOL_MAX < env.DATABASE_POOL_MIN) {
      warnings.push({
        field: 'DATABASE_POOL_MAX',
        message: 'Database pool max is less than min',
        recommendation: 'Ensure max pool size is greater than min',
      });
    }
  }

  private validateProductionSettings(warnings: ValidationWarning[]): void {
    if (env.NODE_ENV === 'production') {
      // Logging level
      if (env.LOG_LEVEL === 'debug') {
        warnings.push({
          field: 'LOG_LEVEL',
          message: 'Debug logging enabled in production',
          recommendation: 'Use info or warn level for production',
        });
      }

      // Metrics
      if (!env.METRICS_ENABLED) {
        warnings.push({
          field: 'METRICS_ENABLED',
          message: 'Metrics disabled in production',
          recommendation: 'Enable metrics for production monitoring',
        });
      }

      // Health checks
      if (!env.HEALTH_CHECK_ENABLED) {
        warnings.push({
          field: 'HEALTH_CHECK_ENABLED',
          message: 'Health checks disabled in production',
          recommendation: 'Enable health checks for production monitoring',
        });
      }
    }
  }

  validateDatabaseConnection(): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      // This would typically test actual database connection
      // For now, we'll validate the configuration
      try {
        new URL(env.DATABASE_URL);
      } catch (error) {
        errors.push({
          field: 'DATABASE_URL',
          message: 'Invalid database URL format',
          code: 'INVALID_URL',
          severity: 'error',
        });
      }

      resolve({
        isValid: errors.length === 0,
        errors,
        warnings,
      });
    });
  }

  validateRedisConnection(): Promise<ValidationResult> {
    return new Promise((resolve) => {
      const errors: ValidationError[] = [];
      const warnings: ValidationWarning[] = [];

      // This would typically test actual Redis connection
      // For now, we'll validate the configuration
      try {
        new URL(env.REDIS_URL);
      } catch (error) {
        errors.push({
          field: 'REDIS_URL',
          message: 'Invalid Redis URL format',
          code: 'INVALID_URL',
          severity: 'error',
        });
      }

      resolve({
        isValid: errors.length === 0,
        errors,
        warnings,
      });
    });
  }

  async validateAllConnections(): Promise<ValidationResult> {
    const dbResult = await this.validateDatabaseConnection();
    const redisResult = await this.validateRedisConnection();

    return {
      isValid: dbResult.isValid && redisResult.isValid,
      errors: [...dbResult.errors, ...redisResult.errors],
      warnings: [...dbResult.warnings, ...redisResult.warnings],
    };
  }

  generateConfigReport(): string {
    const envResult = this.validateEnvironment();
    
    let report = '=== Configuration Validation Report ===\n\n';
    
    if (envResult.isValid) {
      report += '✅ Environment configuration is valid\n\n';
    } else {
      report += '❌ Environment configuration has errors\n\n';
      
      if (envResult.errors.length > 0) {
        report += 'ERRORS:\n';
        envResult.errors.forEach(error => {
          report += `  - ${error.field}: ${error.message}\n`;
        });
        report += '\n';
      }
    }

    if (envResult.warnings.length > 0) {
      report += 'WARNINGS:\n';
      envResult.warnings.forEach(warning => {
        report += `  - ${warning.field}: ${warning.message}\n`;
        if (warning.recommendation) {
          report += `    Recommendation: ${warning.recommendation}\n`;
        }
      });
      report += '\n';
    }

    report += `Environment: ${env.NODE_ENV}\n`;
    report += `Port: ${env.PORT}\n`;
    report += `Database SSL: ${env.DATABASE_SSL ? 'Enabled' : 'Disabled'}\n`;
    report += `Metrics: ${env.METRICS_ENABLED ? 'Enabled' : 'Disabled'}\n`;
    report += `Health Checks: ${env.HEALTH_CHECK_ENABLED ? 'Enabled' : 'Disabled'}\n`;

    return report;
  }
}

// Export singleton instance
export const configValidator = ConfigValidator.getInstance();