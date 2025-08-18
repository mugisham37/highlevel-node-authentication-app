import { describe, expect, it } from '@jest/globals';
import {
  AppError,
  createAuthError,
  createForbiddenError,
  createNotFoundError,
  createRateLimitError,
  createValidationError,
  ERROR_CODES,
} from '../../types/errors';

describe('Error Types', () => {
  describe('ERROR_CODES', () => {
    it('should have all required error codes', () => {
      expect(ERROR_CODES.INVALID_CREDENTIALS).toBe('INVALID_CREDENTIALS');
      expect(ERROR_CODES.ACCOUNT_LOCKED).toBe('ACCOUNT_LOCKED');
      expect(ERROR_CODES.EMAIL_NOT_VERIFIED).toBe('EMAIL_NOT_VERIFIED');
      expect(ERROR_CODES.MFA_REQUIRED).toBe('MFA_REQUIRED');
      expect(ERROR_CODES.INVALID_MFA_CODE).toBe('INVALID_MFA_CODE');
      expect(ERROR_CODES.INSUFFICIENT_PERMISSIONS).toBe('INSUFFICIENT_PERMISSIONS');
      expect(ERROR_CODES.RESOURCE_NOT_FOUND).toBe('RESOURCE_NOT_FOUND');
      expect(ERROR_CODES.INVALID_INPUT).toBe('INVALID_INPUT');
      expect(ERROR_CODES.DUPLICATE_EMAIL).toBe('DUPLICATE_EMAIL');
      expect(ERROR_CODES.WEAK_PASSWORD).toBe('WEAK_PASSWORD');
      expect(ERROR_CODES.RATE_LIMIT_EXCEEDED).toBe('RATE_LIMIT_EXCEEDED');
      expect(ERROR_CODES.DATABASE_ERROR).toBe('DATABASE_ERROR');
      expect(ERROR_CODES.EXTERNAL_SERVICE_ERROR).toBe('EXTERNAL_SERVICE_ERROR');
    });
  });

  describe('AppError', () => {
    it('should create an AppError with correct properties', () => {
      const error = new AppError({
        code: 'BAD_REQUEST',
        appCode: ERROR_CODES.INVALID_INPUT,
        message: 'Test error message',
      });

      expect(error.code).toBe('BAD_REQUEST');
      expect(error.appCode).toBe(ERROR_CODES.INVALID_INPUT);
      expect(error.message).toBe('Test error message');
    });

    it('should include cause when provided', () => {
      const cause = new Error('Original error');
      const error = new AppError({
        code: 'INTERNAL_SERVER_ERROR',
        appCode: ERROR_CODES.DATABASE_ERROR,
        message: 'Database operation failed',
        cause,
      });

      expect(error.cause).toBe(cause);
    });
  });

  describe('Error Helper Functions', () => {
    describe('createAuthError', () => {
      it('should create an authentication error', () => {
        const error = createAuthError(ERROR_CODES.INVALID_CREDENTIALS, 'Invalid login');

        expect(error.code).toBe('UNAUTHORIZED');
        expect(error.appCode).toBe(ERROR_CODES.INVALID_CREDENTIALS);
        expect(error.message).toBe('Invalid login');
      });
    });

    describe('createValidationError', () => {
      it('should create a validation error', () => {
        const error = createValidationError('Invalid input data');

        expect(error.code).toBe('BAD_REQUEST');
        expect(error.appCode).toBe(ERROR_CODES.INVALID_INPUT);
        expect(error.message).toBe('Invalid input data');
      });

      it('should include cause when provided', () => {
        const cause = new Error('Validation failed');
        const error = createValidationError('Invalid input data', cause);

        expect(error.cause).toBe(cause);
      });
    });

    describe('createNotFoundError', () => {
      it('should create a not found error', () => {
        const error = createNotFoundError('User');

        expect(error.code).toBe('NOT_FOUND');
        expect(error.appCode).toBe(ERROR_CODES.RESOURCE_NOT_FOUND);
        expect(error.message).toBe('User not found');
      });
    });

    describe('createForbiddenError', () => {
      it('should create a forbidden error with default message', () => {
        const error = createForbiddenError();

        expect(error.code).toBe('FORBIDDEN');
        expect(error.appCode).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS);
        expect(error.message).toBe('Insufficient permissions');
      });

      it('should create a forbidden error with custom message', () => {
        const error = createForbiddenError('Access denied');

        expect(error.code).toBe('FORBIDDEN');
        expect(error.appCode).toBe(ERROR_CODES.INSUFFICIENT_PERMISSIONS);
        expect(error.message).toBe('Access denied');
      });
    });

    describe('createRateLimitError', () => {
      it('should create a rate limit error', () => {
        const error = createRateLimitError();

        expect(error.code).toBe('TOO_MANY_REQUESTS');
        expect(error.appCode).toBe(ERROR_CODES.RATE_LIMIT_EXCEEDED);
        expect(error.message).toBe('Rate limit exceeded. Please try again later.');
      });
    });
  });
});
