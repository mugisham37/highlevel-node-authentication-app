import { describe, expect, it } from 'vitest';
import {
    AuthenticationError,
    ErrorFactory,
    NotFoundError,
    ValidationError
} from '../errors';

describe('Errors', () => {
  describe('AuthenticationError', () => {
    it('should create authentication error with correct properties', () => {
      const error = new AuthenticationError('Invalid credentials', 'req-123');
      
      expect(error.code).toBe('AUTHENTICATION_FAILED');
      expect(error.statusCode).toBe(401);
      expect(error.message).toBe('Invalid credentials');
      expect(error.requestId).toBe('req-123');
      expect(error.timestamp).toBeDefined();
    });

    it('should serialize to JSON correctly', () => {
      const error = new AuthenticationError('Test error');
      const json = error.toJSON();
      
      expect(json.name).toBe('AuthenticationError');
      expect(json.code).toBe('AUTHENTICATION_FAILED');
      expect(json.message).toBe('Test error');
      expect(json.statusCode).toBe(401);
      expect(json.timestamp).toBeDefined();
    });
  });

  describe('ValidationError', () => {
    it('should create validation error with field and details', () => {
      const details = { min: 8, actual: 5 };
      const error = new ValidationError('Password too short', 'password', details);
      
      expect(error.code).toBe('VALIDATION_FAILED');
      expect(error.statusCode).toBe(400);
      expect(error.field).toBe('password');
      expect(error.details).toEqual(details);
    });
  });

  describe('ErrorFactory', () => {
    it('should create authentication errors', () => {
      const error = ErrorFactory.authentication('Test message', 'req-123');
      
      expect(error).toBeInstanceOf(AuthenticationError);
      expect(error.message).toBe('Test message');
      expect(error.requestId).toBe('req-123');
    });

    it('should create validation errors', () => {
      const error = ErrorFactory.validation('Invalid input', 'email', { format: 'email' });
      
      expect(error).toBeInstanceOf(ValidationError);
      expect(error.field).toBe('email');
      expect(error.details).toEqual({ format: 'email' });
    });

    it('should create not found errors', () => {
      const error = ErrorFactory.notFound('User not found');
      
      expect(error).toBeInstanceOf(NotFoundError);
      expect(error.message).toBe('User not found');
    });
  });
});