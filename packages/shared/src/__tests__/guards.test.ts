import { describe, expect, it } from 'vitest';
import { Permission, UserRole } from '../enums';
import {
    hasPermission,
    hasRole,
    isAdmin,
    isArray,
    isBoolean,
    isEmail,
    isNumber,
    isObject,
    isString,
    isUuid
} from '../guards';
import { AuthUser } from '../interfaces';

describe('Guards', () => {
  describe('Type Guards', () => {
    it('should correctly identify strings', () => {
      expect(isString('hello')).toBe(true);
      expect(isString('')).toBe(true);
      expect(isString(123)).toBe(false);
      expect(isString(null)).toBe(false);
    });

    it('should correctly identify numbers', () => {
      expect(isNumber(123)).toBe(true);
      expect(isNumber(0)).toBe(true);
      expect(isNumber('123')).toBe(false);
      expect(isNumber(NaN)).toBe(false);
    });

    it('should correctly identify booleans', () => {
      expect(isBoolean(true)).toBe(true);
      expect(isBoolean(false)).toBe(true);
      expect(isBoolean(1)).toBe(false);
      expect(isBoolean('true')).toBe(false);
    });

    it('should correctly identify objects', () => {
      expect(isObject({})).toBe(true);
      expect(isObject({ key: 'value' })).toBe(true);
      expect(isObject([])).toBe(false);
      expect(isObject(null)).toBe(false);
    });

    it('should correctly identify arrays', () => {
      expect(isArray([])).toBe(true);
      expect(isArray([1, 2, 3])).toBe(true);
      expect(isArray({})).toBe(false);
      expect(isArray('array')).toBe(false);
    });

    it('should correctly identify UUIDs', () => {
      expect(isUuid('123e4567-e89b-12d3-a456-426614174000')).toBe(true);
      expect(isUuid('invalid-uuid')).toBe(false);
      expect(isUuid(123)).toBe(false);
    });

    it('should correctly identify emails', () => {
      expect(isEmail('test@example.com')).toBe(true);
      expect(isEmail('invalid-email')).toBe(false);
      expect(isEmail(123)).toBe(false);
    });
  });

  describe('Authentication Guards', () => {
    const mockUser: AuthUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      roles: [UserRole.USER],
      permissions: [Permission.USER_READ, Permission.USER_WRITE]
    };

    const mockAdmin: AuthUser = {
      id: '123e4567-e89b-12d3-a456-426614174001',
      email: 'admin@example.com',
      roles: [UserRole.ADMIN],
      permissions: [Permission.ADMIN_READ, Permission.ADMIN_WRITE]
    };

    it('should check user roles correctly', () => {
      expect(hasRole(mockUser, UserRole.USER)).toBe(true);
      expect(hasRole(mockUser, UserRole.ADMIN)).toBe(false);
      expect(hasRole(mockAdmin, UserRole.ADMIN)).toBe(true);
    });

    it('should check user permissions correctly', () => {
      expect(hasPermission(mockUser, Permission.USER_READ)).toBe(true);
      expect(hasPermission(mockUser, Permission.ADMIN_READ)).toBe(false);
      expect(hasPermission(mockAdmin, Permission.ADMIN_READ)).toBe(true);
    });

    it('should identify admin users correctly', () => {
      expect(isAdmin(mockUser)).toBe(false);
      expect(isAdmin(mockAdmin)).toBe(true);
    });
  });
});