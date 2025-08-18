import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { ConfigValidator } from '../validation/config-validator';

const originalEnv = process.env;

beforeEach(() => {
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = originalEnv;
});

describe('ConfigValidator', () => {
  let validator: ConfigValidator;

  beforeEach(() => {
    validator = ConfigValidator.getInstance();
  });

  it('should be a singleton', () => {
    const validator2 = ConfigValidator.getInstance();
    expect(validator).toBe(validator2);
  });

  it('should validate valid environment configuration', () => {
    // Set valid environment
    process.env.NODE_ENV = 'development';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
    process.env.BCRYPT_ROUNDS = '12';

    const result = validator.validateEnvironment();
    expect(result.isValid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect security warnings', () => {
    // Set environment with security issues
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'short'; // Too short
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.BCRYPT_ROUNDS = '10'; // Too low
    process.env.CORS_ORIGIN = '*'; // Wildcard in production
    process.env.DATABASE_SSL = 'false'; // SSL disabled in production

    const result = validator.validateEnvironment();
    expect(result.warnings.length).toBeGreaterThan(0);
    
    // Check for specific warnings
    const warningFields = result.warnings.map(w => w.field);
    expect(warningFields).toContain('BCRYPT_ROUNDS');
    expect(warningFields).toContain('CORS_ORIGIN');
    expect(warningFields).toContain('DATABASE_SSL');
  });

  it('should validate database connection configuration', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    
    const result = await validator.validateDatabaseConnection();
    expect(result.isValid).toBe(true);
  });

  it('should detect invalid database URL', async () => {
    process.env.DATABASE_URL = 'invalid-url';
    
    const result = await validator.validateDatabaseConnection();
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('DATABASE_URL');
  });

  it('should validate Redis connection configuration', async () => {
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    const result = await validator.validateRedisConnection();
    expect(result.isValid).toBe(true);
  });

  it('should detect invalid Redis URL', async () => {
    process.env.REDIS_URL = 'invalid-redis-url';
    
    const result = await validator.validateRedisConnection();
    expect(result.isValid).toBe(false);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].field).toBe('REDIS_URL');
  });

  it('should validate all connections', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    
    const result = await validator.validateAllConnections();
    expect(result.isValid).toBe(true);
  });

  it('should generate configuration report', () => {
    // Set valid environment
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
    process.env.DATABASE_SSL = 'false';
    process.env.METRICS_ENABLED = 'true';
    process.env.HEALTH_CHECK_ENABLED = 'true';

    const report = validator.generateConfigReport();
    
    expect(report).toContain('Configuration Validation Report');
    expect(report).toContain('Environment: development');
    expect(report).toContain('Port: 3000');
    expect(report).toContain('Database SSL: Disabled');
    expect(report).toContain('Metrics: Enabled');
    expect(report).toContain('Health Checks: Enabled');
  });

  it('should detect production-specific warnings', () => {
    // Set production environment with development settings
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(64);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(64);
    process.env.LOG_LEVEL = 'debug'; // Debug in production
    process.env.METRICS_ENABLED = 'false'; // Metrics disabled
    process.env.HEALTH_CHECK_ENABLED = 'false'; // Health checks disabled

    const result = validator.validateEnvironment();
    
    const warningFields = result.warnings.map(w => w.field);
    expect(warningFields).toContain('LOG_LEVEL');
    expect(warningFields).toContain('METRICS_ENABLED');
    expect(warningFields).toContain('HEALTH_CHECK_ENABLED');
  });
});