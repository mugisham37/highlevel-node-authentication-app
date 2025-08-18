import { describe, expect, it } from 'vitest';
import {
    createLevelFilter,
    createSamplingFilter,
    createSensitiveDataFilter,
    createServiceFilter
} from '../filters/sensitive-data.filter';

describe('Filters', () => {
  describe('createSensitiveDataFilter', () => {
    it('should redact sensitive data from message', () => {
      const filter = createSensitiveDataFilter();
      const info = {
        level: 'info',
        message: 'User password is secret123 and email is user@example.com',
        timestamp: '2023-01-01T00:00:00.000Z'
      };

      const filtered = filter.transform(info);
      expect(filtered.message).toContain('[REDACTED]');
      expect(filtered.message).not.toContain('secret123');
      expect(filtered.message).not.toContain('user@example.com');
    });

    it('should redact sensitive fields from metadata', () => {
      const filter = createSensitiveDataFilter();
      const info = {
        level: 'info',
        message: 'Login attempt',
        password: 'secret123',
        token: 'abc123',
        email: 'user@example.com',
        timestamp: '2023-01-01T00:00:00.000Z'
      };

      const filtered = filter.transform(info);
      expect(filtered.password).toBe('[REDACTED]');
      expect(filtered.token).toBe('[REDACTED]');
      expect(filtered.email).toBe('user@example.com'); // Email not in default sensitive fields
    });

    it('should handle nested objects', () => {
      const filter = createSensitiveDataFilter();
      const info = {
        level: 'info',
        message: 'User data',
        user: {
          name: 'John',
          password: 'secret123',
          profile: {
            token: 'abc123'
          }
        },
        timestamp: '2023-01-01T00:00:00.000Z'
      };

      const filtered = filter.transform(info);
      expect(filtered.user.name).toBe('John');
      expect(filtered.user.password).toBe('[REDACTED]');
      expect(filtered.user.profile.token).toBe('[REDACTED]');
    });

    it('should use custom patterns and fields', () => {
      const filter = createSensitiveDataFilter({
        patterns: [/custom-\d+/g],
        fields: ['customField'],
        replacement: '[HIDDEN]'
      });

      const info = {
        level: 'info',
        message: 'Data custom-123 found',
        customField: 'sensitive',
        timestamp: '2023-01-01T00:00:00.000Z'
      };

      const filtered = filter.transform(info);
      expect(filtered.message).toContain('[HIDDEN]');
      expect(filtered.customField).toBe('[HIDDEN]');
    });
  });

  describe('createLevelFilter', () => {
    it('should allow specified levels', () => {
      const filter = createLevelFilter(['error', 'warn']);
      
      const errorInfo = { level: 'error', message: 'Error message' };
      const warnInfo = { level: 'warn', message: 'Warning message' };
      const infoInfo = { level: 'info', message: 'Info message' };

      expect(filter.transform(errorInfo)).toBeTruthy();
      expect(filter.transform(warnInfo)).toBeTruthy();
      expect(filter.transform(infoInfo)).toBe(false);
    });
  });

  describe('createServiceFilter', () => {
    it('should allow specified services', () => {
      const filter = createServiceFilter(['auth', 'api']);
      
      const authInfo = { level: 'info', message: 'Auth message', service: 'auth' };
      const apiInfo = { level: 'info', message: 'API message', service: 'api' };
      const dbInfo = { level: 'info', message: 'DB message', service: 'database' };
      const noServiceInfo = { level: 'info', message: 'No service' };

      expect(filter.transform(authInfo)).toBeTruthy();
      expect(filter.transform(apiInfo)).toBeTruthy();
      expect(filter.transform(dbInfo)).toBe(false);
      expect(filter.transform(noServiceInfo)).toBeTruthy(); // No service field passes through
    });
  });

  describe('createSamplingFilter', () => {
    it('should sample every nth message', () => {
      const filter = createSamplingFilter(3); // Every 3rd message
      
      const info = { level: 'info', message: 'Test message' };
      
      // First two should be filtered out
      expect(filter.transform({ ...info })).toBe(false);
      expect(filter.transform({ ...info })).toBe(false);
      
      // Third should pass through
      expect(filter.transform({ ...info })).toBeTruthy();
      
      // Next two should be filtered out again
      expect(filter.transform({ ...info })).toBe(false);
      expect(filter.transform({ ...info })).toBe(false);
      
      // Sixth should pass through
      expect(filter.transform({ ...info })).toBeTruthy();
    });
  });
});