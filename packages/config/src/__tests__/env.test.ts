import { afterEach, beforeEach, describe, expect, it } from 'vitest';

// Mock process.env before importing
const originalEnv = process.env;

beforeEach(() => {
  // Reset process.env
  process.env = { ...originalEnv };
});

afterEach(() => {
  // Restore original process.env
  process.env = originalEnv;
});

describe('Environment Configuration', () => {
  it('should validate valid environment variables', async () => {
    // Set valid environment variables
    process.env.NODE_ENV = 'development';
    process.env.PORT = '3000';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    // Dynamically import to get fresh env parsing
    const { envSchema } = await import('../env');
    
    expect(() => envSchema.parse(process.env)).not.toThrow();
  });

  it('should fail validation with invalid environment variables', async () => {
    // Set invalid environment variables
    process.env.NODE_ENV = 'invalid';
    process.env.PORT = 'not-a-number';
    process.env.DATABASE_URL = 'invalid-url';

    const { envSchema } = await import('../env');
    
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('should use default values for optional variables', async () => {
    // Set only required variables
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    const { envSchema } = await import('../env');
    const result = envSchema.parse(process.env);

    expect(result.NODE_ENV).toBe('development');
    expect(result.PORT).toBe(3000);
    expect(result.HOST).toBe('localhost');
    expect(result.BCRYPT_ROUNDS).toBe(12);
  });

  it('should validate JWT secret length', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'short'; // Too short
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    const { envSchema } = await import('../env');
    
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('should validate database URL format', async () => {
    process.env.DATABASE_URL = 'not-a-valid-url';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    const { envSchema } = await import('../env');
    
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('should validate port ranges', async () => {
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);
    process.env.PORT = '70000'; // Too high

    const { envSchema } = await import('../env');
    
    expect(() => envSchema.parse(process.env)).toThrow();
  });

  it('should provide helper functions', async () => {
    process.env.NODE_ENV = 'production';
    process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';
    process.env.REDIS_URL = 'redis://localhost:6379';
    process.env.JWT_SECRET = 'a'.repeat(32);
    process.env.JWT_REFRESH_SECRET = 'b'.repeat(32);

    // Clear module cache to get fresh imports
    delete require.cache[require.resolve('../env')];
    
    const { 
      isDevelopment, 
      isProduction, 
      isStaging,
      getDatabaseConfig,
      getRedisConfig,
      getJwtConfig 
    } = await import('../env');

    expect(isDevelopment).toBe(false);
    expect(isProduction).toBe(true);
    expect(isStaging).toBe(false);

    const dbConfig = getDatabaseConfig();
    expect(dbConfig.url).toBe('postgresql://user:pass@localhost:5432/db');

    const redisConfig = getRedisConfig();
    expect(redisConfig.url).toBe('redis://localhost:6379');

    const jwtConfig = getJwtConfig();
    expect(jwtConfig.secret).toBe('a'.repeat(32));
  });
});